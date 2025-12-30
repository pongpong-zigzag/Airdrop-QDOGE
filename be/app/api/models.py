from __future__ import annotations

from pydantic import BaseModel, Field


class WalletRequest(BaseModel):
    walletId: str = Field(..., description="Qubic identity (60 uppercase letters)")


class ConfirmTxRequest(BaseModel):
    walletId: str
    txId: str


class TxLogRequest(BaseModel):
    wallet_id: str
    from_id: str
    to_id: str
    txId: str
    type: str
    amount: int = 0
