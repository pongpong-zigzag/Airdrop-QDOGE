from sqlite3 import Connection
from typing import List


import sqlite3
from contextlib import closing

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

#=============================User Response=============================
class WalletRequest(BaseModel):
    walletId: constr(strip_whitespace=True, min_length=60, max_length=60)

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


class UpdateAccessInfoResponse(BaseModel):
    user: UserResponse

def _row_to_user(row: sqlite3.Row) -> UserResponse:
    if row is None:
        raise ValueError("Row is required")
    data = dict(row)
    # SQLite returns ints as int already, but be explicit for safety
    data["access_info"] = int(data["access_info"])
    return UserResponse(**data)
#=======================================================================

#=============================Res Response==============================
class ResResponse(BaseModel):
    no: int
    wallet_id: str
    qearn_bal: float
    invest_bal: float
    airdrop_amt: float
    created_at: str
    updated_at: str


class GetAirdropResResponse(BaseModel):
    res: List[ResResponse]


class UpdateInvestBalanceRequest(BaseModel):
    walletId: constr(strip_whitespace=True, min_length=60, max_length=60)
    amount: confloat(gt=0)


def _row_to_res(row: sqlite3.Row) -> ResResponse:
    if row is None:
        raise ValueError("Row is required")
    data = dict(row)
    data["qearn_bal"] = float(data["qearn_bal"])
    data["invest_bal"] = float(data["invest_bal"])
    data["airdrop_amt"] = float(data["airdrop_amt"])
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
    wallet_id = payload.walletId

    with closing(get_conn()) as conn:
        conn: Connection
        existing = conn.execute(
            'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE wallet_id = ?',
            (wallet_id,),
        ).fetchone()

        if existing:
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
                return GetUserResponse(user=_row_to_user(existing), created=False)
            raise HTTPException(status_code=500, detail="Failed to create user record")

        new_row = conn.execute(
            'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE no = ?',
            (user_id,),
        ).fetchone()

        if not new_row:
            raise HTTPException(status_code=500, detail="User creation succeeded but record retrieval failed")

        return GetUserResponse(user=_row_to_user(new_row), created=True)


@app.post("/get_airdrop_res", response_model=GetAirdropResResponse)
def get_airdrop_res() -> GetAirdropResResponse:
    with closing(get_conn()) as conn:
        conn: Connection
        rows = conn.execute(
            "SELECT no, wallet_id, qearn_bal, invest_bal, airdrop_amt, created_at, updated_at FROM res ORDER BY no ASC"
        ).fetchall()

    res_entries = [_row_to_res(row) for row in rows]
    return GetAirdropResResponse(res=res_entries)


@app.post("/update_access_info", response_model=UpdateAccessInfoResponse)
def update_access_info(payload: WalletRequest) -> UpdateAccessInfoResponse:
    wallet_id = payload.walletId

    with closing(get_conn()) as conn:
        conn: Connection
        row = conn.execute(
            'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE wallet_id = ?',
            (wallet_id,),
        ).fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="User not found")

        if int(row["access_info"]) == 0:
            with conn:
                conn.execute(
                    'UPDATE "user" SET access_info = 1, updated_at = datetime("now") WHERE wallet_id = ?',
                    (wallet_id,),
                )

        updated_row = conn.execute(
            'SELECT no, wallet_id, access_info, role, created_at, updated_at FROM "user" WHERE wallet_id = ?',
            (wallet_id,),
        ).fetchone()

        if updated_row is None:
            raise HTTPException(status_code=500, detail="Failed to update user access info")

    return UpdateAccessInfoResponse(user=_row_to_user(updated_row))


@app.post("/update_invest_balance", response_model=ResResponse)
def update_invest_balance(payload: UpdateInvestBalanceRequest) -> ResResponse:
    wallet_id = payload.walletId
    amount = float(payload.amount)

    with closing(get_conn()) as conn:
        conn: Connection
        existing = conn.execute(
            "SELECT no, wallet_id, qearn_bal, invest_bal, airdrop_amt, created_at, updated_at FROM res WHERE wallet_id = ?",
            (wallet_id,),
        ).fetchone()

        with conn:
            if existing:
                conn.execute(
                    "UPDATE res SET invest_bal = invest_bal + ?, updated_at = datetime('now') WHERE wallet_id = ?",
                    (amount, wallet_id),
                )
            else:
                conn.execute(
                    "INSERT INTO res (wallet_id, invest_bal) VALUES (?, ?)",
                    (wallet_id, amount),
                )

        updated_row = conn.execute(
            "SELECT no, wallet_id, qearn_bal, invest_bal, airdrop_amt, created_at, updated_at FROM res WHERE wallet_id = ?",
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
