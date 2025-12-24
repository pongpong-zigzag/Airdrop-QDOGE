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


def init_db() -> None:
    """Apply schema migrations (idempotent)."""
    with conn_ctx() as conn:
        current = conn.execute("PRAGMA user_version;").fetchone()[0]
        if current < 1:
            _migration_1(conn)
            conn.execute("PRAGMA user_version = 1;")
        if current < 2:
            _migration_2(conn)
            conn.execute("PRAGMA user_version = 2;")


def _migration_1(conn: sqlite3.Connection) -> None:
    with conn:
        # Core users
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              wallet_id TEXT PRIMARY KEY,
              access_info INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now')),
              CHECK (access_info IN (0,1))
            );
            """
        )

        # Registrations (100 QU)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS registrations (
              tx_id TEXT PRIMARY KEY,
              wallet_id TEXT NOT NULL,
              amount_qu INTEGER NOT NULL,
              tick INTEGER NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY(wallet_id) REFERENCES users(wallet_id) ON DELETE CASCADE
            );
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_reg_wallet ON registrations(wallet_id);")

        # Fundings (credited capped)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS fundings (
              tx_id TEXT PRIMARY KEY,
              wallet_id TEXT NOT NULL,
              amount_sent INTEGER NOT NULL,
              amount_credited INTEGER NOT NULL,
              tick INTEGER NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY(wallet_id) REFERENCES users(wallet_id) ON DELETE CASCADE
            );
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fund_wallet ON fundings(wallet_id);")

        # Qearn snapshot (optional)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS qearn_snapshot (
              wallet_id TEXT PRIMARY KEY,
              qearn_amount INTEGER NOT NULL,
              captured_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY(wallet_id) REFERENCES users(wallet_id) ON DELETE CASCADE
            );
            """
        )

        # Portal + Power snapshots (admin imported)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS portal_snapshot (
              wallet_id TEXT PRIMARY KEY,
              portal_amount INTEGER NOT NULL,
              imported_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS power_snapshot (
              wallet_id TEXT PRIMARY KEY,
              qxmr_amount INTEGER NOT NULL,
              imported_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )

        # Trade-ins (QXMR burn -> QDOGE at fixed ratio)
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


def _migration_2(conn: sqlite3.Connection) -> None:
    """Keep legacy tables for backwards compatibility (if older FE still calls them)."""
    with conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS transaction_log (
              no INTEGER PRIMARY KEY AUTOINCREMENT,
              sender TEXT NOT NULL,
              recipient TEXT NOT NULL,
              tx_hash TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )
