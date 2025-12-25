from __future__ import annotations

import sqlite3
from typing import Dict


def sync_power_snapshot(
    conn: sqlite3.Connection,
    power_users: Dict[str, int],
    mode: str = "replace",
) -> dict:
    """Synchronize the `power_snapshot` table from the POWER_USERS config.

    The power snapshot controls *two* things in this project:
      1) Allocation weights for the "power" pool (qxmr_amount is the weight)
      2) User role resolution in `/v1/users/get-or-create` (presence => role=power)

    Modes:
      - replace: DELETE all rows, then insert the config list
      - merge: UPSERT the config list, keep any existing rows not in the config

    Returns a small summary dict.
    """

    if not power_users:
        return {"mode": mode, "deleted": 0, "upserted": 0}

    mode = (mode or "replace").strip().lower()
    if mode not in ("replace", "merge"):
        raise ValueError("POWER_SNAPSHOT_SYNC_MODE must be 'replace' or 'merge'")

    deleted = 0
    upserted = 0

    with conn:
        if mode == "replace":
            deleted = conn.execute("SELECT COUNT(*) FROM power_snapshot").fetchone()[0]
            conn.execute("DELETE FROM power_snapshot")

        for wallet_id, amount in power_users.items():
            if int(amount) <= 0:
                raise ValueError(f"power_snapshot amount must be > 0 for {wallet_id}")

            conn.execute(
                "INSERT INTO power_snapshot(wallet_id, qxmr_amount) VALUES (?, ?) "
                "ON CONFLICT(wallet_id) DO UPDATE SET qxmr_amount=excluded.qxmr_amount, imported_at=datetime('now')",
                (wallet_id, int(amount)),
            )
            upserted += 1

    return {"mode": mode, "deleted": int(deleted), "upserted": int(upserted)}
