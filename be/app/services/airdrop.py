from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Dict, Iterable, Tuple

from app.core.config import Settings, get_settings


@dataclass(frozen=True)
class WalletSnapshot:
    wallet_id: str
    role: str
    qubic_bal: int
    qearn_bal: int
    portal_bal: int
    qxmr_bal: int


def _alloc_proportional(pool: int, weights: Dict[str, int]) -> Dict[str, int]:
    """Deterministic proportional integer allocation using largest remainder.

    - Returns 0 allocations if weights are empty or total weight is 0.
    - Sum of returned allocations equals `pool` (when total weight > 0).
    """
    if pool <= 0 or not weights:
        return {k: 0 for k in weights}
    total = sum(max(0, int(w)) for w in weights.values())
    if total <= 0:
        return {k: 0 for k in weights}

    floors: Dict[str, int] = {}
    remainders: list[Tuple[int, str]] = []  # (remainder_numerator, wallet_id)
    allocated = 0
    for wallet, w in weights.items():
        w_i = max(0, int(w))
        prod = pool * w_i
        fl = prod // total
        rem = prod % total
        floors[wallet] = int(fl)
        allocated += int(fl)
        remainders.append((int(rem), wallet))

    remaining = pool - allocated
    if remaining <= 0:
        return floors

    # largest remainder, deterministic tie-break by wallet_id
    remainders.sort(key=lambda x: (-x[0], x[1]))
    for i in range(remaining):
        floors[remainders[i % len(remainders)][1]] += 1
    return floors


def _fetch_registered_snapshots(conn: sqlite3.Connection) -> list[WalletSnapshot]:
    rows = conn.execute(
        """
        SELECT u.wallet_id,
               COALESCE(u.role, 'community') AS role,
               COALESCE(r.qubic_bal, 0) AS qubic_bal,
               COALESCE(r.qearn_bal, 0) AS qearn_bal,
               COALESCE(r.portal_bal, 0) AS portal_bal,
               COALESCE(r.qxmr_bal, 0) AS qxmr_bal
        FROM users u
        LEFT JOIN res r ON r.wallet_id = u.wallet_id
        WHERE u.access_info = 1
        ORDER BY u.wallet_id ASC
        """
    ).fetchall()
    out: list[WalletSnapshot] = []
    for r in rows:
        out.append(
            WalletSnapshot(
                wallet_id=str(r["wallet_id"]).upper(),
                role=str(r["role"] or "community").lower(),
                qubic_bal=int(r["qubic_bal"] or 0),
                qearn_bal=int(r["qearn_bal"] or 0),
                portal_bal=int(r["portal_bal"] or 0),
                qxmr_bal=int(r["qxmr_bal"] or 0),
            )
        )
    return out


def compute_allocations(conn: sqlite3.Connection, settings: Settings | None = None) -> dict[str, dict[str, int]]:
    """Compute airdrop allocation maps per role.

    Roles:
      - community: weight = min(qubic_bal, qubic_cap) + qearn_bal
      - power:     weight = qxmr_bal
      - portal:    allocation = floor(portal_pool * portal_bal / portal_total_supply)

    Note: portal pool uses the fixed denominator (portal_total_supply) per spec.
    This can leave some tokens undistributed if not all portal units are held by registered users.
    """
    settings = settings or get_settings()
    snaps = _fetch_registered_snapshots(conn)

    community_weights: Dict[str, int] = {}
    power_weights: Dict[str, int] = {}
    portal_balances: Dict[str, int] = {}

    for s in snaps:
        if s.role == "power":
            if s.qxmr_bal > 0:
                power_weights[s.wallet_id] = int(s.qxmr_bal)
        elif s.role == "portal":
            if s.portal_bal > 0:
                portal_balances[s.wallet_id] = int(s.portal_bal)
        else:
            # community
            w = int(min(max(0, s.qubic_bal), settings.qubic_cap) + max(0, s.qearn_bal))
            if w > 0:
                community_weights[s.wallet_id] = w

    community_alloc = _alloc_proportional(int(settings.community_pool), community_weights)
    power_alloc = _alloc_proportional(int(settings.power_pool), power_weights)

    # portal: fixed denominator
    portal_alloc: Dict[str, int] = {}
    denom = max(1, int(settings.portal_total_supply))
    pool = max(0, int(settings.portal_pool))
    for wallet, bal in portal_balances.items():
        bal_i = max(0, int(bal))
        portal_alloc[wallet] = int((pool * bal_i) // denom)

    return {"community": community_alloc, "power": power_alloc, "portal": portal_alloc}


def airdrop_for_wallet(conn: sqlite3.Connection, wallet_id: str, settings: Settings | None = None) -> int:
    settings = settings or get_settings()
    allocs = compute_allocations(conn, settings)
    wallet = wallet_id.upper()
    # wallet has exactly one role, but allocation maps are disjoint by role.
    return int(allocs.get("community", {}).get(wallet, 0) + allocs.get("power", {}).get(wallet, 0) + allocs.get("portal", {}).get(wallet, 0))


def recompute_and_store(conn: sqlite3.Connection, settings: Settings | None = None) -> None:
    """Recompute allocations and persist res.airdrop_amt for registered wallets."""
    settings = settings or get_settings()
    allocs = compute_allocations(conn, settings)
    all_wallets = set(allocs.get("community", {}).keys()) | set(allocs.get("power", {}).keys()) | set(allocs.get("portal", {}).keys())

    with conn:
        for wallet in all_wallets:
            amt = int(
                allocs.get("community", {}).get(wallet, 0)
                + allocs.get("power", {}).get(wallet, 0)
                + allocs.get("portal", {}).get(wallet, 0)
            )
            conn.execute(
                """
                INSERT INTO res(wallet_id, airdrop_amt) VALUES(?, ?)
                ON CONFLICT(wallet_id) DO UPDATE SET airdrop_amt=excluded.airdrop_amt, updated_at=datetime('now')
                """,
                (wallet, amt),
            )
