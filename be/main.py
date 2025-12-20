from sqlite3 import Connection
from typing import List


import sqlite3
from contextlib import closing

from fastapi import FastAPI, HTTPException
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, constr

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
