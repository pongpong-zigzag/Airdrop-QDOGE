from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import sqlite3

from app.core.config import Settings, get_settings


@dataclass
class AllocationRow:
    wallet_id: str
    amount: int


def _largest_remainder_allocation(pool: int, weights: Dict[str, int]) -> Dict[str, int]:
    """Allocate an integer pool proportionally using Hamilton / largest remainder.

    Returns per-wallet allocation; sum equals pool (unless weights empty).
    """
    if pool <= 0 or not weights:
        return {k: 0 for k in weights.keys()}

    total_w = sum(max(0, int(w)) for w in weights.values())
    if total_w <= 0:
        return {k: 0 for k in weights.keys()}

    # floor allocations
    floors: Dict[str, int] = {}
    remainders: List[Tuple[str, float]] = []
    allocated = 0
    for k, w in weights.items():
        w_i = max(0, int(w))
        exact = pool * (w_i / total_w)
        fl = int(exact)
        floors[k] = fl
        allocated += fl
        remainders.append((k, exact - fl))

    remaining = pool - allocated
    if remaining <= 0:
        return floors

    # distribute remaining by largest fractional remainder, then deterministic tie-breaker
    remainders.sort(key=lambda x: (-x[1], x[0]))
    for i in range(remaining):
        k = remainders[i % len(remainders)][0]
        floors[k] += 1
    return floors


def get_weights_community(conn: sqlite3.Connection, settings: Settings | None = None) -> Dict[str, int]:
    settings = settings or get_settings()

    # eligible = registered users (access_info=1)
    rows = conn.execute(
        """
        SELECT u.wallet_id,
               COALESCE((SELECT SUM(amount_credited) FROM fundings f WHERE f.wallet_id = u.wallet_id), 0) AS funded,
               COALESCE(q.qearn_amount, 0) AS qearn
        FROM users u
        LEFT JOIN qearn_snapshot q ON q.wallet_id = u.wallet_id
        WHERE u.access_info = 1
        """
    ).fetchall()

    weights: Dict[str, int] = {}
    for r in rows:
        funded = int(r["funded"] or 0)
        qearn = int(r["qearn"] or 0)
        weight = min(funded, settings.funding_cap_qu) + max(0, qearn)
        if weight > 0:
            weights[str(r["wallet_id"]).upper()] = weight
    return weights


def get_weights_portal(conn: sqlite3.Connection) -> Dict[str, int]:
    rows = conn.execute("SELECT wallet_id, portal_amount FROM portal_snapshot WHERE portal_amount > 0").fetchall()
    return {str(r["wallet_id"]).upper(): int(r["portal_amount"]) for r in rows}


def get_weights_power(conn: sqlite3.Connection) -> Dict[str, int]:
    rows = conn.execute("SELECT wallet_id, qxmr_amount FROM power_snapshot WHERE qxmr_amount > 0").fetchall()
    return {str(r["wallet_id"]).upper(): int(r["qxmr_amount"]) for r in rows}


def compute_allocations(conn: sqlite3.Connection, settings: Settings | None = None) -> Dict[str, Dict[str, int]]:
    """Compute per-category allocations.

    Returns: {"community": {wallet: amt}, "portal": {...}, "power": {...}}
    """
    settings = settings or get_settings()

    community_weights = get_weights_community(conn, settings)
    portal_weights = get_weights_portal(conn)
    power_weights = get_weights_power(conn)

    return {
        "community": _largest_remainder_allocation(settings.community_pool, community_weights),
        "portal": _largest_remainder_allocation(settings.portal_pool, portal_weights),
        "power": _largest_remainder_allocation(settings.power_pool, power_weights),
    }


def compute_estimate_for_wallet(conn: sqlite3.Connection, wallet_id: str, settings: Settings | None = None) -> Dict[str, int]:
    settings = settings or get_settings()
    w = wallet_id.upper()

    allocations = compute_allocations(conn, settings)

    # trade-in is direct
    tradein = conn.execute(
        "SELECT COALESCE(SUM(qdoge_amount), 0) AS amt FROM tradeins WHERE wallet_id = ?",
        (w,),
    ).fetchone()[0]

    return {
        "community": int(allocations["community"].get(w, 0)),
        "portal": int(allocations["portal"].get(w, 0)),
        "power": int(allocations["power"].get(w, 0)),
        "tradein": int(tradein or 0),
    }


def build_legacy_res_rows(conn: sqlite3.Connection, settings: Settings | None = None) -> List[dict]:
    """Return rows compatible with the existing FE table."""
    settings = settings or get_settings()
    allocations = compute_allocations(conn, settings)

    rows: List[dict] = []

    # Community rows
    comm_weights = get_weights_community(conn, settings)
    for wallet, alloc in allocations["community"].items():
        funded = conn.execute(
            "SELECT COALESCE(SUM(amount_credited),0) FROM fundings WHERE wallet_id = ?",
            (wallet,),
        ).fetchone()[0]
        qearn = conn.execute(
            "SELECT COALESCE(qearn_amount,0) FROM qearn_snapshot WHERE wallet_id = ?",
            (wallet,),
        ).fetchone()[0]
        rows.append(
            {
                "wallet_id": wallet,
                "role": "user",
                "qearn_bal": int(qearn or 0),
                "invest_bal": int(funded or 0),
                "airdrop_amt": int(alloc or 0),
            }
        )

    # Portal rows
    for wallet, alloc in allocations["portal"].items():
        portal_amt = conn.execute(
            "SELECT portal_amount FROM portal_snapshot WHERE wallet_id = ?",
            (wallet,),
        ).fetchone()[0]
        rows.append(
            {
                "wallet_id": wallet,
                "role": "portal",
                "qearn_bal": int(portal_amt or 0),
                "invest_bal": 0,
                "airdrop_amt": int(alloc or 0),
            }
        )

    # Power rows
    for wallet, alloc in allocations["power"].items():
        qxmr_amt = conn.execute(
            "SELECT qxmr_amount FROM power_snapshot WHERE wallet_id = ?",
            (wallet,),
        ).fetchone()[0]
        rows.append(
            {
                "wallet_id": wallet,
                "role": "power",
                "qearn_bal": int(qxmr_amt or 0),
                "invest_bal": 0,
                "airdrop_amt": int(alloc or 0),
            }
        )

    # Stable ordering: airdrop desc
    rows.sort(key=lambda r: (-int(r["airdrop_amt"]), r["wallet_id"], r["role"]))

    # add `no` like legacy table
    for idx, r in enumerate(rows, start=1):
        r["no"] = idx
    return rows
