from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Dict, Tuple

from app.core.config import Settings, get_settings

STATE_ROW_ID = 1


@dataclass(frozen=True)
class WalletSnapshot:
    wallet_id: str
    roles: tuple[str, ...]
    qubic_bal: int  # raw wallet balance
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


def _derive_roles(*, wallet_id: str, portal_bal: int, settings: Settings) -> tuple[str, ...]:
    # Admin is exclusive: cannot have other roles or receive airdrops.
    if wallet_id == settings.admin_wallet_id:
        return ("admin",)

    roles: list[str] = ["community"]
    if int(portal_bal) > 0:
        roles.append("portal")
    if wallet_id in settings.power_users:
        roles.append("power")

    order = ["admin", "power", "portal", "community"]
    deduped = []
    for r in roles:
        r_norm = str(r or "").strip().lower()
        if not r_norm or r_norm in deduped:
            continue
        deduped.append(r_norm)
    ordered = [r for r in order if r in deduped]
    extras = sorted([r for r in deduped if r not in order])
    final = tuple(ordered + extras)
    return final if final else ("community",)


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
                roles=_derive_roles(wallet_id=wallet_id, portal_bal=portal_bal, settings=settings),
                qubic_bal=int(r["qubic_bal"] or 0),
                qearn_bal=int(r["qearn_bal"] or 0),
                portal_bal=portal_bal,
                qxmr_bal=int(r["qxmr_bal"] or 0),
            )
        )
    return out


def _compute_allocations_from_snapshots(
    snaps: list[WalletSnapshot], settings: Settings
) -> dict[str, dict[str, int]]:
    """Helper that derives allocation maps from a prepared snapshot list."""
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
    """Compute airdrop allocation maps per role."""
    settings = settings or get_settings()
    snaps = _fetch_registered_snapshots(conn, settings)
    return _compute_allocations_from_snapshots(snaps, settings)


def airdrop_for_wallet(conn: sqlite3.Connection, wallet_id: str, settings: Settings | None = None) -> int:
    breakdown = airdrop_breakdown_for_wallet(conn, wallet_id, settings)
    return int(sum(breakdown.values()))


def airdrop_breakdown_for_wallet(conn: sqlite3.Connection, wallet_id: str, settings: Settings | None = None) -> dict[str, int]:
    """Return per-role airdrop amounts for the given wallet (admin gets zeros)."""
    settings = settings or get_settings()
    wallet = wallet_id.upper()
    if wallet == settings.admin_wallet_id:
        return {"community": 0, "portal": 0, "power": 0}
    ensure_airdrop_allocations_current(conn, settings)
    row = conn.execute(
        """
        SELECT COALESCE(community_amt, 0) AS community_amt,
               COALESCE(portal_amt, 0) AS portal_amt,
               COALESCE(power_amt, 0) AS power_amt
        FROM airdrop_allocations
        WHERE wallet_id = ?
        """,
        (wallet,),
    ).fetchone()
    if not row:
        return {"community": 0, "portal": 0, "power": 0}
    return {
        "community": int(row["community_amt"] or 0),
        "portal": int(row["portal_amt"] or 0),
        "power": int(row["power_amt"] or 0),
    }


def recompute_and_store(conn: sqlite3.Connection, settings: Settings | None = None) -> None:
    """Recompute allocations and persist res.airdrop_amt for registered wallets."""
    settings = settings or get_settings()
    snaps = _fetch_registered_snapshots(conn, settings)
    allocs = _compute_allocations_from_snapshots(snaps, settings)
    registered_wallets = [snap.wallet_id for snap in snaps]

    with conn:
        for wallet in registered_wallets:
            community = int(allocs.get("community", {}).get(wallet, 0))
            portal = int(allocs.get("portal", {}).get(wallet, 0))
            power = int(allocs.get("power", {}).get(wallet, 0))
            total = community + portal + power

            conn.execute(
                """
                INSERT INTO airdrop_allocations(wallet_id, community_amt, portal_amt, power_amt, updated_at)
                VALUES(?, ?, ?, ?, datetime('now'))
                ON CONFLICT(wallet_id) DO UPDATE SET
                  community_amt=excluded.community_amt,
                  portal_amt=excluded.portal_amt,
                  power_amt=excluded.power_amt,
                  updated_at=datetime('now')
                """,
                (wallet, community, portal, power),
            )

            conn.execute("INSERT OR IGNORE INTO res(wallet_id) VALUES (?)", (wallet,))
            conn.execute(
                """
                UPDATE res
                SET airdrop_amt = ?
                WHERE wallet_id = ?
                """,
                (total, wallet),
            )

        if registered_wallets:
            placeholders = ",".join("?" for _ in registered_wallets)
            conn.execute(
                f"DELETE FROM airdrop_allocations WHERE wallet_id NOT IN ({placeholders})",
                registered_wallets,
            )
        else:
            conn.execute("DELETE FROM airdrop_allocations")

        _ensure_airdrop_state_row(conn)
        conn.execute(
            """
            UPDATE airdrop_state
            SET alloc_version = res_version, updated_at = datetime('now')
            WHERE id = ?
            """,
            (STATE_ROW_ID,),
        )


def _ensure_airdrop_state_row(conn: sqlite3.Connection) -> None:
    conn.execute("INSERT OR IGNORE INTO airdrop_state(id) VALUES (?)", (STATE_ROW_ID,))


def mark_airdrop_dirty(conn: sqlite3.Connection) -> None:
    """Mark allocation cache as stale after snapshot changes."""
    _ensure_airdrop_state_row(conn)
    conn.execute(
        """
        UPDATE airdrop_state
        SET res_version = res_version + 1, updated_at = datetime('now')
        WHERE id = ?
        """,
        (STATE_ROW_ID,),
    )


def ensure_airdrop_allocations_current(conn: sqlite3.Connection, settings: Settings | None = None) -> None:
    """Recompute allocations only when snapshot data changed."""
    _ensure_airdrop_state_row(conn)
    row = conn.execute(
        "SELECT res_version, alloc_version FROM airdrop_state WHERE id = ?",
        (STATE_ROW_ID,),
    ).fetchone()
    res_version = int(row["res_version"] or 0) if row else 0
    alloc_version = int(row["alloc_version"] or 0) if row else 0
    if alloc_version >= res_version:
        return
    recompute_and_store(conn, settings or get_settings())
