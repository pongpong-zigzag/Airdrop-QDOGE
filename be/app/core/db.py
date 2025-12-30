from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.core.config import get_settings


def _get_db_path() -> Path:
    settings = get_settings()
    path = Path(settings.db_path)
    if not path.is_absolute():
        # resolve relative to project root (where main.py is)
        path = (Path(__file__).resolve().parents[2] / path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_get_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn


@contextmanager
def conn_ctx() -> Iterator[sqlite3.Connection]:
    conn = get_conn()
    try:
        yield conn
    finally:
        conn.close()


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
        (name,),
    ).fetchone()
    return row is not None


def init_db() -> None:
    """Apply schema migrations (idempotent).

    The project previously shipped with legacy tables (fundings/snapshots/etc).
    Current production schema is defined by the user's spec:
      - users(wallet_id, role, access_info, created_at, updated_at)
      - transaction_log(wallet_id, from, to, txId, type, amount, created_at, updated_at)
      - res(wallet_id, qubic_bal, qearn_bal, portal_bal, qxmr_bal, airdrop_amt, created_at, updated_at)

    Trade-in table is preserved as-is to avoid changing its implementation.
    """
    with conn_ctx() as conn:
        current = int(conn.execute("PRAGMA user_version;").fetchone()[0] or 0)

        # Fresh install: create v3 schema directly.
        if current == 0:
            _migration_3(conn)
            conn.execute("PRAGMA user_version = 3;")
            return

        # Upgrade from any older schema to v3.
        if current < 3:
            _migration_3(conn)
            conn.execute("PRAGMA user_version = 3;")


def _migration_3(conn: sqlite3.Connection) -> None:
    """Schema v3: align DB with the new spec.

    - Adds/ensures users.role
    - Creates res
    - Rebuilds transaction_log to match spec and migrates legacy rows
    - Removes deprecated tables not used anymore
    """
    with conn:
        # ---- USERS ----
        if not _table_exists(conn, "users"):
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                  wallet_id TEXT PRIMARY KEY,
                  role TEXT NOT NULL DEFAULT 'community',
                  access_info INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                  CHECK (access_info IN (0,1))
                );
                """
            )
        else:
            # add role column if missing
            cols = {r[1] for r in conn.execute("PRAGMA table_info(users);").fetchall()}
            if "role" not in cols:
                conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'community';")
            if "access_info" not in cols:
                conn.execute("ALTER TABLE users ADD COLUMN access_info INTEGER NOT NULL DEFAULT 0;")

        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);")

        # ---- RES ----
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS res (
              wallet_id TEXT PRIMARY KEY,
              qubic_bal INTEGER NOT NULL DEFAULT 0,
              qearn_bal INTEGER NOT NULL DEFAULT 0,
              portal_bal INTEGER NOT NULL DEFAULT 0,
              qxmr_bal INTEGER NOT NULL DEFAULT 0,
              airdrop_amt INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY(wallet_id) REFERENCES users(wallet_id) ON DELETE CASCADE
            );
            """
        )

        # ---- TRANSACTION LOG ----
        if _table_exists(conn, "transaction_log"):
            cols = [r[1] for r in conn.execute("PRAGMA table_info(transaction_log);").fetchall()]
            legacy = set(cols) >= {"sender", "recipient", "tx_hash"}
            if legacy:
                # rename legacy table
                conn.execute("ALTER TABLE transaction_log RENAME TO transaction_log_legacy;")
            else:
                # already new schema-ish; keep
                legacy = False

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS transaction_log (
              no INTEGER PRIMARY KEY AUTOINCREMENT,
              wallet_id TEXT NOT NULL,
              "from" TEXT NOT NULL,
              "to" TEXT NOT NULL,
              txId TEXT NOT NULL UNIQUE,
              type TEXT NOT NULL,
              amount INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tx_wallet ON transaction_log(wallet_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tx_type ON transaction_log(type);")

        # migrate legacy transaction_log rows if present
        if _table_exists(conn, "transaction_log_legacy"):
            legacy_rows = conn.execute(
                "SELECT sender, recipient, tx_hash, created_at, updated_at FROM transaction_log_legacy"
            ).fetchall()
            for r in legacy_rows:
                sender = str(r[0] or "").upper()
                recipient = str(r[1] or "").upper()
                tx_hash = str(r[2] or "")
                if not tx_hash:
                    continue
                conn.execute(
                    """
                    INSERT OR IGNORE INTO transaction_log(wallet_id, "from", "to", txId, type, amount, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 'qubic', 0, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
                    """,
                    (sender, sender, recipient, tx_hash, r[3], r[4]),
                )
            conn.execute("DROP TABLE transaction_log_legacy;")

        # ---- KEEP tradeins for trade-in implementation ----
        if not _table_exists(conn, "tradeins"):
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS tradeins (
                  tx_id TEXT PRIMARY KEY,
                  wallet_id TEXT NOT NULL,
                  qxmr_amount INTEGER NOT NULL,
                  qdoge_amount INTEGER NOT NULL,
                  tick INTEGER NOT NULL,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  FOREIGN KEY(wallet_id) REFERENCES users(wallet_id) ON DELETE CASCADE
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tradein_wallet ON tradeins(wallet_id);")

        # ---- Drop deprecated tables (no longer used) ----
        for tbl in ("registrations", "fundings", "qearn_snapshot", "portal_snapshot", "power_snapshot"):
            if _table_exists(conn, tbl):
                conn.execute(f"DROP TABLE {tbl};")
