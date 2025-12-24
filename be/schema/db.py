import sqlite3
from pathlib import Path
from typing import Callable, List

DB_PATH = Path(__file__).with_name("airdrop.db")

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row

    # Good defaults for backend usage
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn


def init_db() -> None:
    """
    Ensures migration tables exist and applies any pending migrations.
    Safe to call on every startup.
    """
    conn = get_conn()
    try:
        _ensure_migration_table(conn)
        _apply_migrations(conn)
    finally:
        conn.close()


def _ensure_migration_table(conn: sqlite3.Connection) -> None:
    with conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_version (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL
        );
        """)
        row = conn.execute("SELECT version FROM schema_version WHERE id = 1;").fetchone()
        if row is None:
            conn.execute("INSERT INTO schema_version (id, version) VALUES (1, 0);")


def _get_version(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT version FROM schema_version WHERE id = 1;").fetchone()
    return int(row["version"]) if row else 0


def _set_version(conn: sqlite3.Connection, version: int) -> None:
    with conn:
        conn.execute("UPDATE schema_version SET version = ? WHERE id = 1;", (version,))


# ---- Migration functions (versioned) ----

def migration_001_create_base_schema(conn: sqlite3.Connection) -> None:
    with conn:
        # Table: user
        conn.execute("""
        CREATE TABLE IF NOT EXISTS "user" (
            no INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_id TEXT NOT NULL,
            access_info INTEGER NOT NULL DEFAULT 0,   -- bool: 0/1
            role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),

            CHECK (length(wallet_id) <= 60),
            CHECK (length(role) <= 10),
            CHECK (access_info IN (0, 1))
        );
        """)
        conn.execute("""CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallet_id ON "user"(wallet_id);""")

        # Table: res
        conn.execute("""
        CREATE TABLE IF NOT EXISTS res (
            no INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_id TEXT NOT NULL,
            qearn_bal REAL NOT NULL DEFAULT 0,
            invest_bal REAL NOT NULL DEFAULT 0,
            airdrop_amt REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),

            CHECK (length(wallet_id) <= 60)
        );
        """)
        conn.execute("""CREATE UNIQUE INDEX IF NOT EXISTS idx_res_wallet_id ON res(wallet_id);""")

        # Table: transaction
        # NOTE: "from" and "to" are keywords → quoted.
        # Also: your field says "timstamp" (typo). I use "timestamp" here.
        conn.execute("""
        CREATE TABLE IF NOT EXISTS "transaction" (
            no INTEGER PRIMARY KEY AUTOINCREMENT,
            "from" TEXT NOT NULL,
            "to" TEXT NOT NULL,
            tx_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),

            CHECK (length("from") <= 60),
            CHECK (length("to") <= 60),
            CHECK (length(tx_hash) <= 100)
        );
        """)
        conn.execute("""CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_hash ON "transaction"(tx_hash);""")
        conn.execute("""CREATE INDEX IF NOT EXISTS idx_tx_from ON "transaction"("from");""")
        conn.execute("""CREATE INDEX IF NOT EXISTS idx_tx_to ON "transaction"("to");""")


# Add future migrations like:
# def migration_002_add_something(conn): ...
# def migration_003_fix_column(conn): ...


MIGRATIONS: List[Callable[[sqlite3.Connection], None]] = [
    migration_001_create_base_schema,   # version 1
]


def _apply_migrations(conn: sqlite3.Connection) -> None:
    current = _get_version(conn)
    target = len(MIGRATIONS)

    if current > target:
        raise RuntimeError(f"DB schema_version={current} is newer than code supports={target}")

    while current < target:
        next_version = current + 1
        MIGRATIONS[current](conn)   # apply migration N (0-based list)
        _set_version(conn, next_version)
        current = next_version
