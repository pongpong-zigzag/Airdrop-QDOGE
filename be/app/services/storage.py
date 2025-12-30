from __future__ import annotations

import sqlite3
from typing import Iterable, Tuple, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from app.core.config import Settings


def ensure_user(conn: sqlite3.Connection, wallet_id: str, settings: "Settings") -> bool:
    """Ensure `users` row exists; admins stay admin. Returns True if mutated."""
    wallet = wallet_id.upper()
    row = conn.execute(
        "SELECT role, access_info FROM users WHERE wallet_id = ?",
        (wallet,),
    ).fetchone()
    is_admin = wallet == settings.admin_wallet_id
    if row is None:
        conn.execute(
            "INSERT INTO users(wallet_id, role, access_info) VALUES (?, ?, ?)",
            (wallet, "admin" if is_admin else "community", 1 if is_admin else 0),
        )
        return True
    if is_admin:
        role = str(row["role"] or "").lower()
        access = int(row["access_info"] or 0)
        if role != "admin" or access != 1:
            conn.execute(
                "UPDATE users SET role='admin', access_info=1, updated_at=datetime('now') WHERE wallet_id = ?",
                (wallet,),
            )
            return True
    return False


def set_user_role(conn: sqlite3.Connection, wallet_id: str, role_csv: str) -> bool:
    """Update users.role when it meaningfully changes. Returns True if mutated."""
    wallet = wallet_id.upper()
    existing = conn.execute(
        "SELECT role FROM users WHERE wallet_id = ?",
        (wallet,),
    ).fetchone()
    if existing is None:
        conn.execute(
            "INSERT INTO users(wallet_id, role, access_info) VALUES (?, ?, 0)",
            (wallet, role_csv),
        )
        return True
    current = str(existing["role"] or "")
    if current == role_csv:
        return False
    if current.lower() == "admin" and role_csv != "admin":
        return False  # never downgrade admin
    conn.execute(
        "UPDATE users SET role = ?, updated_at = datetime('now') WHERE wallet_id = ?",
        (role_csv, wallet),
    )
    return True


def upsert_res_snapshot(
    conn: sqlite3.Connection,
    wallet_id: str,
    *,
    qubic_bal: int,
    qearn_bal: int,
    portal_bal: int,
    qxmr_bal: int,
) -> bool:
    """Persist the balance snapshot if it changed. Returns True when mutated."""
    wallet = wallet_id.upper()
    existing = conn.execute(
        """
        SELECT qubic_bal, qearn_bal, portal_bal, qxmr_bal
        FROM res
        WHERE wallet_id = ?
        """,
        (wallet,),
    ).fetchone()
    payload = (
        int(qubic_bal),
        int(qearn_bal),
        int(portal_bal),
        int(qxmr_bal),
    )
    if existing is None:
        conn.execute(
            """
            INSERT INTO res(wallet_id, qubic_bal, qearn_bal, portal_bal, qxmr_bal, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            """,
            (wallet, *payload),
        )
        return True

    stored = (
        int(existing["qubic_bal"] or 0),
        int(existing["qearn_bal"] or 0),
        int(existing["portal_bal"] or 0),
        int(existing["qxmr_bal"] or 0),
    )
    if stored == payload:
        return False

    conn.execute(
        """
        UPDATE res
        SET qubic_bal = ?, qearn_bal = ?, portal_bal = ?, qxmr_bal = ?, updated_at = datetime('now')
        WHERE wallet_id = ?
        """,
        (*payload, wallet),
    )
    return True


def update_airdrop_amount(conn: sqlite3.Connection, wallet_id: str, amount: int) -> bool:
    """Update res.airdrop_amt when it changes. Returns True if mutated."""
    wallet = wallet_id.upper()
    conn.execute("INSERT OR IGNORE INTO res(wallet_id) VALUES (?)", (wallet,))
    row = conn.execute(
        "SELECT airdrop_amt FROM res WHERE wallet_id = ?",
        (wallet,),
    ).fetchone()
    current = int(row["airdrop_amt"] or 0) if row else 0
    target = int(amount)
    if current == target:
        return False
    conn.execute(
        "UPDATE res SET airdrop_amt = ?, updated_at = datetime('now') WHERE wallet_id = ?",
        (target, wallet),
    )
    return True

