from sqlite3 import Connection
from typing import List, Set


import sqlite3
import re
from contextlib import closing
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, constr, confloat

from schema.db import get_conn

# from db import init_db

app = FastAPI(title="Airdrop API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_ENV_PATH = Path(__file__).with_name(".env")

COMMUNITY_AIRDROP = 21000000000 * 0.075
PORTAL_AIRDROP = 21000000000 * 0.01
POWER_AIRDROP = 21000000000 * 0.04
ADMIN_AIRDROP = 0.0
ROLE_AIRDROP_ALLOCATION = {
    "user": COMMUNITY_AIRDROP,
    "portal": PORTAL_AIRDROP,
    "power": POWER_AIRDROP,
    "admin": ADMIN_AIRDROP,
}

ADMIN_WALLET_ID = "KZFJRTYKJXVNPAYXQXUKMPKAHWWBWVWGLSFMEFOKPFJFWEDDXMCZVSPEOOZE"


@lru_cache(maxsize=1)
def _get_power_wallets() -> Set[str]:
    if not _ENV_PATH.exists():
        return set()
    try:
        content = _ENV_PATH.read_text(encoding="utf-8")
    except OSError:
        return set()

    match = re.search(r"powerusers\s*=\s*\{(?P<body>.*?)\}", content, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return set()

    body = match.group("body")
    wallets: Set[str] = set()
    for line in body.splitlines():
        cleaned = line.strip().strip(",")
        if not cleaned:
            continue
        wallets.add(cleaned.upper())
    return wallets


def _normalize_wallet(wallet_id: str) -> str:
    return wallet_id.strip().upper()


def _normalize_role_key(role: str | None) -> str:
    normalized = (role or "user").strip().lower()
    if normalized in ("portal", "power", "admin"):
        return normalized
    return "user"


def _is_admin_wallet(wallet_id: str) -> bool:
    if not wallet_id:
        return False
    return _normalize_wallet(wallet_id) == ADMIN_WALLET_ID


def _is_power_wallet(wallet_id: str) -> bool:
    if not wallet_id:
        return False
    return _normalize_wallet(wallet_id) in _get_power_wallets()


def _ensure_admin_role_for_wallet(conn: sqlite3.Connection, wallet_id: str) -> bool:
    normalized = _normalize_wallet(wallet_id)
    if not normalized or not _is_admin_wallet(normalized):
        return False

    with conn:
        cursor = conn.execute(
            """
            UPDATE "user"
            SET role = 'admin', updated_at = datetime('now')
            WHERE wallet_id = ?
              AND LOWER(COALESCE(role, 'user')) != 'admin'
            """,
            (normalized,),
        )
    return cursor.rowcount > 0


def _ensure_power_role_for_wallet(conn: sqlite3.Connection, wallet_id: str) -> bool:
    normalized = _normalize_wallet(wallet_id)
    if not normalized or normalized not in _get_power_wallets() or _is_admin_wallet(normalized):
        return False

    with conn:
        cursor = conn.execute(
            """
            UPDATE "user"
            SET role = 'power', updated_at = datetime('now')
            WHERE wallet_id = ?
              AND LOWER(COALESCE(role, 'user')) != 'power'
            """,
            (normalized,),
        )
    return cursor.rowcount > 0


def _ensure_special_role_for_wallet(conn: sqlite3.Connection, wallet_id: str) -> bool:
    if _ensure_admin_role_for_wallet(conn, wallet_id):
        return True
    return _ensure_power_role_for_wallet(conn, wallet_id)


def _maybe_refresh_wallet_role(conn: sqlite3.Connection, row: sqlite3.Row | None) -> sqlite3.Row | None:
    if row is None:
        return None
    wallet_id = row["wallet_id"]
    if not wallet_id:
        return row
    if not _ensure_special_role_for_wallet(conn, wallet_id):
        return row
    return conn.execute(
        'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE no = ?',
        (row["no"],),
    ).fetchone()


def _ensure_all_power_roles(conn: sqlite3.Connection) -> None:
    wallets = list(_get_power_wallets())
    if not wallets:
        return
    placeholders = ", ".join("?" for _ in wallets)
    with conn:
        conn.execute(
            f"""
            UPDATE "user"
            SET role = 'power', updated_at = datetime('now')
            WHERE UPPER(wallet_id) IN ({placeholders})
              AND LOWER(COALESCE(role, 'user')) != 'power'
            """,
            tuple(wallets),
        )


def _recalculate_airdrop_allocations(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        """
        SELECT
            res.no,
            res.qearn_bal,
            res.invest_bal,
            COALESCE(u.role, 'user') AS role
        FROM res
        LEFT JOIN "user" u ON res.wallet_id = u.wallet_id COLLATE NOCASE
        """
    ).fetchall()

    if not rows:
        return

    invest_totals = {key: 0.0 for key in ROLE_AIRDROP_ALLOCATION}
    for row in rows:
        role_key = _normalize_role_key(row["role"])
        invest_totals[role_key] += float(row["invest_bal"] or 0.0)

    for row in rows:
        role_key = _normalize_role_key(row["role"])
        allocation = ROLE_AIRDROP_ALLOCATION[role_key]
        denom = invest_totals[role_key]
        qearn_bal = float(row["qearn_bal"] or 0.0)
        invest_bal = float(row["invest_bal"] or 0.0)
        if denom <= 0:
            payout = 0.0
        else:
            payout = allocation * (qearn_bal + invest_bal) / denom
        conn.execute(
            "UPDATE res SET airdrop_amt = ?, updated_at = datetime('now') WHERE no = ?",
            (payout, row["no"]),
        )

#=============================User Response=============================
class WalletRequest(BaseModel):
    walletId: constr(strip_whitespace=True, min_length=60, max_length=60)

class UpdateRoleRequest(BaseModel):
    walletId: constr(strip_whitespace=True, min_length=60, max_length=60)
    role: constr(strip_whitespace=True, min_length=1, max_length=10)

class UserResponse(BaseModel):
    no: int
    wallet_id: str
    access_info: int
    role: str
    created_at: str
    updated_at: str

class GetUserResponse(BaseModel):
    user: UserResponse
    created: bool

class UpdateRoleResponse(BaseModel):
    user: UserResponse


class UpdateAccessInfoResponse(BaseModel):
    user: UserResponse

def _row_to_user(row: sqlite3.Row) -> UserResponse:
    if row is None:
        raise ValueError("Row is required")
    data = dict(row)
    # SQLite returns ints as int already, but be explicit for safety
    data["access_info"] = int(data["access_info"])
    data["role"] = (data.get("role") or "user").lower()
    return UserResponse(**data)
#=======================================================================

#=============================Res Response==============================
class ResResponse(BaseModel):
    no: int
    wallet_id: str
    qearn_bal: float
    invest_bal: float
    airdrop_amt: float
    role: str
    created_at: str
    updated_at: str


class GetAirdropResResponse(BaseModel):
    res: List[ResResponse]


class UpdateInvestBalanceRequest(BaseModel):
    walletId: constr(strip_whitespace=True, min_length=60, max_length=60)
    qearnAmount: confloat(ge=0)
    amount: confloat(gt=0)


def _row_to_res(row: sqlite3.Row) -> ResResponse:
    if row is None:
        raise ValueError("Row is required")
    data = dict(row)
    data["qearn_bal"] = float(data["qearn_bal"])
    data["invest_bal"] = float(data["invest_bal"])
    data["airdrop_amt"] = float(data["airdrop_amt"])
    data["role"] = (data.get("role") or "user").lower()
    return ResResponse(**data)
#=======================================================================

#=========================Transaction Response==========================
class TransactionRecord(BaseModel):
    no: int
    sender: str
    recipient: str
    tx_hash: str
    created_at: str
    updated_at: str


class TransactionCreateRequest(BaseModel):
    sender: constr(strip_whitespace=True, min_length=1, max_length=100)
    recipient: constr(strip_whitespace=True, min_length=1, max_length=100)
    tx_hash: constr(strip_whitespace=True, min_length=1, max_length=100)


class TransactionCreateResponse(BaseModel):
    success: bool
    transaction: TransactionRecord


def _row_to_transaction(row: sqlite3.Row) -> TransactionRecord:
    if row is None:
        raise ValueError("Row is required")
    return TransactionRecord(
        no=row["no"],
        sender=row["from"],
        recipient=row["to"],
        tx_hash=row["tx_hash"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
#=======================================================================

# @app.on_event("startup")
# def startup():
#     init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/get_user", response_model=GetUserResponse)
def get_user(payload: WalletRequest) -> GetUserResponse:
    wallet_id = _normalize_wallet(payload.walletId)

    with closing(get_conn()) as conn:
        conn: Connection
        existing = conn.execute(
            'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE wallet_id = ? COLLATE NOCASE',
            (wallet_id,),
        ).fetchone()
        existing = _maybe_refresh_wallet_role(conn, existing)

        if existing:
            if existing["wallet_id"] != wallet_id:
                with conn:
                    conn.execute(
                        'UPDATE "user" SET wallet_id = ?, updated_at = datetime("now") WHERE no = ?',
                        (wallet_id, existing["no"]),
                    )
                existing = conn.execute(
                    'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE wallet_id = ?',
                    (wallet_id,),
                ).fetchone()
                existing = _maybe_refresh_wallet_role(conn, existing)
            return GetUserResponse(user=_row_to_user(existing), created=False)

        try:
            with conn:
                cursor = conn.execute('INSERT INTO "user" (wallet_id) VALUES (?)', (wallet_id,))
                user_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            # Another request inserted concurrently, fetch and return
            existing = conn.execute(
                'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE wallet_id = ?',
                (wallet_id,),
            ).fetchone()
            if existing:
                existing = _maybe_refresh_wallet_role(conn, existing)
                return GetUserResponse(user=_row_to_user(existing), created=False)
            raise HTTPException(status_code=500, detail="Failed to create user record")

        new_row = conn.execute(
            'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE no = ?',
            (user_id,),
        ).fetchone()
        new_row = _maybe_refresh_wallet_role(conn, new_row)

        if not new_row:
            raise HTTPException(status_code=500, detail="User creation succeeded but record retrieval failed")

        return GetUserResponse(user=_row_to_user(new_row), created=True)


@app.post("/get_airdrop_res", response_model=GetAirdropResResponse)
def get_airdrop_res() -> GetAirdropResResponse:
    with closing(get_conn()) as conn:
        conn: Connection
        _ensure_all_power_roles(conn)
        _ensure_special_role_for_wallet(conn, ADMIN_WALLET_ID)
        with conn:
            _recalculate_airdrop_allocations(conn)
        rows = conn.execute(
            """
            SELECT
                res.no,
                res.wallet_id,
                res.qearn_bal,
                res.invest_bal,
                res.airdrop_amt,
                res.created_at,
                res.updated_at,
                COALESCE(u.role, 'user') AS role
            FROM res
            LEFT JOIN "user" u ON res.wallet_id = u.wallet_id COLLATE NOCASE
            ORDER BY res.no ASC
            """
        ).fetchall()

    res_entries = [_row_to_res(row) for row in rows]
    return GetAirdropResResponse(res=res_entries)


@app.post("/get_res", response_model=ResResponse)
def get_res(payload: WalletRequest) -> ResResponse:
    wallet_id = _normalize_wallet(payload.walletId)

    with closing(get_conn()) as conn:
        conn: Connection
        row = conn.execute(
            """
            SELECT
                res.no,
                res.wallet_id,
                res.qearn_bal,
                res.invest_bal,
                res.airdrop_amt,
                res.created_at,
                res.updated_at,
                COALESCE(u.role, 'user') AS role
            FROM res
            LEFT JOIN "user" u ON res.wallet_id = u.wallet_id COLLATE NOCASE
            WHERE res.wallet_id = ? COLLATE NOCASE
            """,
            (wallet_id,),
        ).fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="Invest balance not found")

    return _row_to_res(row)


@app.post("/update_access_info", response_model=UpdateAccessInfoResponse)
def update_access_info(payload: WalletRequest) -> UpdateAccessInfoResponse:
    wallet_id = _normalize_wallet(payload.walletId)

    with closing(get_conn()) as conn:
        conn: Connection
        row = conn.execute(
            'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE wallet_id = ? COLLATE NOCASE',
            (wallet_id,),
        ).fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="User not found")

        if row["wallet_id"] != wallet_id:
            with conn:
                conn.execute(
                    'UPDATE "user" SET wallet_id = ?, updated_at = datetime("now") WHERE no = ?',
                    (wallet_id, row["no"]),
                )
            row = conn.execute(
                'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE wallet_id = ?',
                (wallet_id,),
            ).fetchone()
            if row is None:
                raise HTTPException(status_code=500, detail="Failed to normalize user wallet id")

        with conn:
            if int(row["access_info"]) == 0:
                conn.execute(
                    'UPDATE "user" SET access_info = 1, updated_at = datetime("now") WHERE wallet_id = ?',
                    (wallet_id,),
                )

            # Ensure a matching entry exists in the res table so frontend/backend stay aligned
            conn.execute(
                "INSERT OR IGNORE INTO res (wallet_id) VALUES (?)",
                (wallet_id,),
            )

        with conn:
            _recalculate_airdrop_allocations(conn)

        updated_row = conn.execute(
            'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE wallet_id = ?',
            (wallet_id,),
        ).fetchone()

        if updated_row is None:
            raise HTTPException(status_code=500, detail="Failed to update user access info")

        updated_row = _maybe_refresh_wallet_role(conn, updated_row)

    return UpdateAccessInfoResponse(user=_row_to_user(updated_row))


@app.post("/update_role", response_model=UpdateRoleResponse)
def update_role(payload: UpdateRoleRequest) -> UpdateRoleResponse:
    wallet_id = _normalize_wallet(payload.walletId)
    role = (payload.role or "user").strip().lower()
    allowed_roles = {"user", "portal", "power"}

    if role not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid role value")

    with closing(get_conn()) as conn:
        conn: Connection
        row = conn.execute(
            'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE wallet_id = ? COLLATE NOCASE',
            (wallet_id,),
        ).fetchone()
        row = _maybe_refresh_wallet_role(conn, row)

        if row is None:
            raise HTTPException(status_code=404, detail="User not found")

        if _is_power_wallet(wallet_id) and role != "power":
            raise HTTPException(status_code=400, detail="Power users must keep the power role")

        current_role = (row["role"] or "user").lower()
        if current_role == role:
            return UpdateRoleResponse(user=_row_to_user(row))

        with conn:
            conn.execute(
                'UPDATE "user" SET role = ?, updated_at = datetime("now") WHERE wallet_id = ?',
                (role, wallet_id),
            )

        _ensure_special_role_for_wallet(conn, wallet_id)

        with conn:
            _recalculate_airdrop_allocations(conn)

        updated_row = conn.execute(
            'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE wallet_id = ?',
            (wallet_id,),
        ).fetchone()

        if updated_row is None:
            raise HTTPException(status_code=500, detail="Failed to update user role")

        updated_row = _maybe_refresh_wallet_role(conn, updated_row)

    return UpdateRoleResponse(user=_row_to_user(updated_row))


@app.post("/update_res", response_model=ResResponse)
def update_res(payload: UpdateInvestBalanceRequest) -> ResResponse:
    wallet_id = _normalize_wallet(payload.walletId)
    amount = float(payload.amount)
    qearnAmount = float(payload.qearnAmount)

    with closing(get_conn()) as conn:
        conn: Connection
        existing = conn.execute(
            "SELECT no, wallet_id, qearn_bal, invest_bal, airdrop_amt, created_at, updated_at FROM res WHERE wallet_id = ? COLLATE NOCASE",
            (wallet_id,),
        ).fetchone()

        with conn:
            if existing and existing["wallet_id"] != wallet_id:
                conn.execute(
                    "UPDATE res SET wallet_id = ?, updated_at = datetime('now') WHERE no = ?",
                    (wallet_id, existing["no"]),
                )
                existing = conn.execute(
                    "SELECT no, wallet_id, qearn_bal, invest_bal, airdrop_amt, created_at, updated_at FROM res WHERE wallet_id = ?",
                    (wallet_id,),
                ).fetchone()

            if existing:
                conn.execute(
                    "UPDATE res SET qearn_bal = ?, invest_bal = invest_bal + ?, updated_at = datetime('now') WHERE wallet_id = ?",
                    (qearnAmount, amount, wallet_id),
                )
            else:
                conn.execute(
                    "INSERT INTO res (wallet_id, qearn_bal, invest_bal) VALUES (?, ?, ?)",
                    (wallet_id, qearnAmount, amount),
                )

        _ensure_special_role_for_wallet(conn, wallet_id)

        with conn:
            _recalculate_airdrop_allocations(conn)

        updated_row = conn.execute(
            """
            SELECT
                res.no,
                res.wallet_id,
                res.qearn_bal,
                res.invest_bal,
                res.airdrop_amt,
                res.created_at,
                res.updated_at,
                COALESCE(u.role, 'user') AS role
            FROM res
            LEFT JOIN "user" u ON res.wallet_id = u.wallet_id COLLATE NOCASE
            WHERE res.wallet_id = ? COLLATE NOCASE
            """,
            (wallet_id,),
        ).fetchone()

        if updated_row is None:
            raise HTTPException(status_code=500, detail="Failed to upsert invest balance")

    return _row_to_res(updated_row)


@app.post("/transaction", response_model=TransactionCreateResponse)
def save_transaction(payload: TransactionCreateRequest) -> TransactionCreateResponse:
    with closing(get_conn()) as conn:
        conn: Connection
        try:
            with conn:
                conn.execute(
                    'INSERT INTO "transaction" ("from", "to", tx_hash) VALUES (?, ?, ?)',
                    (payload.sender, payload.recipient, payload.tx_hash),
                )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=400, detail="Transaction already recorded") from exc

        row = conn.execute(
            'SELECT no, "from", "to", tx_hash, created_at, updated_at FROM "transaction" WHERE tx_hash = ?',
            (payload.tx_hash,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=500, detail="Failed to persist transaction")

    return TransactionCreateResponse(success=True, transaction=_row_to_transaction(row))


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
