from __future__ import annotations

from pydantic import BaseModel, Field


class WalletRequest(BaseModel):
    walletId: str = Field(..., description="Qubic identity (60 uppercase letters)")


class ConfirmTxRequest(BaseModel):
    walletId: str
    txId: str


class TxLogRequest(BaseModel):
    sender: str
    recipient: str
    tx_hash: str


class ImportRow(BaseModel):
    walletId: str
    amount: int


class ImportSnapshotRequest(BaseModel):
    rows: list[ImportRow]
