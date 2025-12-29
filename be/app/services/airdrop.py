from __future__ import annotations

import sqlite3
import threading
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Tuple

from app.core.config import Settings, get_settings
from app.core.roles import resolve_roles
from app.services.storage import update_airdrop_amount


@dataclass(frozen=True)
class WalletSnapshot:
    wallet_id: str
    roles: tuple[str, ...]
    qubic_bal: int  # raw wallet balance
    qearn_bal: int
    portal_bal: int
    qxmr_bal: int


_ALLOC_CACHE_LOCK = threading.Lock()
_ALLOC_CACHE: dict[str, Any] = {"version": None, "settings": None, "value": None}


def _settings_signature(settings: Settings) -> tuple[Any, ...]:
    return (
        int(settings.community_pool),
        int(settings.portal_pool),
        int(settings.power_pool),
        int(settings.portal_total_supply),
        int(settings.qubic_cap),
        tuple(sorted(settings.power_users)),
    )


def _allocation_version(conn: sqlite3.Connection) -> tuple[Any, ...]:
    users_meta = conn.execute(
        "SELECT COUNT(*), COALESCE(MAX(updated_at), '') FROM users WHERE access_info = 1"
    ).fetchone()
    res_meta = conn.execute("SELECT COUNT(*), COALESCE(MAX(updated_at), '') FROM res").fetchone()
    return (
        int(users_meta[0] or 0),
        str(users_meta[1] or ""),
        int(res_meta[0] or 0),
        str(res_meta[1] or ""),
    )


def _clone_allocations(data: dict[str, dict[str, int]]) -> dict[str, dict[str, int]]:
    return {role: dict(wallets) for role, wallets in data.items()}


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


def _fetch_registered_snapshots(conn: sqlite3.Connection, settings: Settings) -> list[WalletSnapshot]:
    rows = conn.execute(
        """
        SELECT u.wallet_id,
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
        wallet_id = str(r["wallet_id"]).upper()
        if wallet_id == settings.admin_wallet_id:
            # admins cannot participate in airdrops
            continue
        portal_bal = int(r["portal_bal"] or 0)
        out.append(
            WalletSnapshot(
                wallet_id=wallet_id,
                roles=resolve_roles(wallet_id=wallet_id, settings=settings, portal_bal=portal_bal),
                qubic_bal=int(r["qubic_bal"] or 0),
                qearn_bal=int(r["qearn_bal"] or 0),
                portal_bal=portal_bal,
                qxmr_bal=int(r["qxmr_bal"] or 0),
            )
        )
    return out


def _compute_allocations_internal(conn: sqlite3.Connection, settings: Settings) -> dict[str, dict[str, int]]:
    """Compute airdrop allocation maps per role.

    Roles:
      - community: weight = min(qubic_bal, qubic_cap) + qearn_bal
      - power:     weight = qxmr_bal
      - portal:    allocation = floor(portal_pool * portal_bal / portal_total_supply)

    Note: portal pool uses the fixed denominator (portal_total_supply) per spec.
    This can leave some tokens undistributed if not all portal units are held by registered users.
    """
    snaps = _fetch_registered_snapshots(conn, settings)

    community_weights: Dict[str, int] = {}
    power_weights: Dict[str, int] = {}
    portal_balances: Dict[str, int] = {}

    for s in snaps:
        if "community" in s.roles:
            w = int(min(max(0, s.qubic_bal), settings.qubic_cap) + max(0, s.qearn_bal))
            if w > 0:
                community_weights[s.wallet_id] = w
        if "power" in s.roles and s.qxmr_bal > 0:
            power_weights[s.wallet_id] = int(s.qxmr_bal)
        if "portal" in s.roles and s.portal_bal > 0:
            portal_balances[s.wallet_id] = int(s.portal_bal)

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


def compute_allocations(conn: sqlite3.Connection, settings: Settings | None = None) -> dict[str, dict[str, int]]:
    settings = settings or get_settings()
    version_before = _allocation_version(conn)
    settings_sig = _settings_signature(settings)

    with _ALLOC_CACHE_LOCK:
        cached = _ALLOC_CACHE
        if cached["version"] == version_before and cached["settings"] == settings_sig and cached["value"] is not None:
            return _clone_allocations(cached["value"])

    allocs = _compute_allocations_internal(conn, settings)
    version_after = _allocation_version(conn)
    if version_before != version_after:
        return allocs

    allocs_copy = _clone_allocations(allocs)
    with _ALLOC_CACHE_LOCK:
        _ALLOC_CACHE["version"] = version_after
        _ALLOC_CACHE["settings"] = settings_sig
        _ALLOC_CACHE["value"] = allocs_copy
    return _clone_allocations(allocs_copy)


def airdrop_for_wallet(conn: sqlite3.Connection, wallet_id: str, settings: Settings | None = None) -> int:
    settings = settings or get_settings()
    if wallet_id == settings.admin_wallet_id:
        return 0
    allocs = compute_allocations(conn, settings)
    wallet = wallet_id.upper()
    # Wallets may qualify for multiple roles; add all allocations together.
    return int(allocs.get("community", {}).get(wallet, 0) + allocs.get("power", {}).get(wallet, 0) + allocs.get("portal", {}).get(wallet, 0))


def airdrop_breakdown_for_wallet(conn: sqlite3.Connection, wallet_id: str, settings: Settings | None = None) -> dict[str, int]:
    """Return per-role airdrop amounts for the given wallet (admin gets zeros)."""
    settings = settings or get_settings()
    wallet = wallet_id.upper()
    if wallet == settings.admin_wallet_id:
        return {"community": 0, "portal": 0, "power": 0}
    allocs = compute_allocations(conn, settings)
    return {
        "community": int(allocs.get("community", {}).get(wallet, 0)),
        "portal": int(allocs.get("portal", {}).get(wallet, 0)),
        "power": int(allocs.get("power", {}).get(wallet, 0)),
    }


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
            update_airdrop_amount(conn, wallet, amt)
