from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.core.config import Settings, get_settings


class RpcError(RuntimeError):
    pass


@dataclass
class TxDetails:
    tx_id: str
    source_id: str
    dest_id: str
    amount: int
    tick_number: int
    input_type: int
    input_size: int
    input_hex: str
    money_flew: bool


class QubicRpcClient:
    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()

    async def _get_json(self, url: str, *, params: dict[str, Any] | None = None, timeout: float = 30) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(url, params=params)
                r.raise_for_status()
                data = r.json()
                if not isinstance(data, dict):
                    raise RpcError("RPC returned non-object JSON")
                return data
        except httpx.HTTPStatusError as e:
            raise RpcError(f"RPC HTTP {e.response.status_code} for {url}") from e
        except httpx.RequestError as e:
            raise RpcError(f"RPC request error for {url}: {e}") from e
        except ValueError as e:
            raise RpcError(f"RPC JSON parse error for {url}") from e

    async def get_tick(self) -> int:
        data = await self._get_json(f"{self.settings.rpc_base_url}/v1/tick-info", timeout=20)
        tick_info = data.get("tickInfo") or {}
        tick = tick_info.get("tick")
        if tick is None:
            raise RpcError("tick-info missing tick")
        return int(tick)

    async def get_balance(self, identity: str) -> int:
        data = await self._get_json(f"{self.settings.rpc_base_url}/v1/balances/{identity}", timeout=20)
        bal = (data.get("balance") or {}).get("balance")
        if bal is None:
            raise RpcError("balances response missing balance")
        return int(bal)

    async def get_owned_assets(self, identity: str) -> list[dict[str, Any]]:
        data = await self._get_json(f"{self.settings.api_base_url}/v1/assets/{identity}/owned", timeout=30)
        owned = data.get("ownedAssets")
        if owned is None:
            owned = (data.get("data") or {}).get("ownedAssets")
        return list(owned or [])

    def _parse_tx(self, tx: dict[str, Any], *, money_flew: bool) -> TxDetails:
        tx_id = str(tx.get("txId") or tx.get("tx_id") or "")
        if not tx_id:
            raise RpcError("transaction missing txId")

        return TxDetails(
            tx_id=tx_id,
            source_id=str(tx.get("sourceId") or tx.get("from") or ""),
            dest_id=str(tx.get("destId") or tx.get("to") or ""),
            amount=int(tx.get("amount") or 0),
            tick_number=int(tx.get("tickNumber") or tx.get("tick") or 0),
            input_type=int(tx.get("inputType") or 0),
            input_size=int(tx.get("inputSize") or 0),
            input_hex=str(tx.get("inputHex") or tx.get("input") or ""),
            money_flew=bool(money_flew),
        )

    async def get_tx_details(
        self,
        identity: str,
        tx_id: str,
        *,
        lookback_ticks: int = 5000,
        lookahead_ticks: int = 50,
        max_retries: int = 8,
        retry_delay_seconds: float = 2.5,
    ) -> TxDetails:
        """
        Reliable tx lookup:
        - Poll identity transfer history until the tx appears and is finalized.
        - This avoids “tx not found” right after broadcast.
        """
        # Some RPC nodes use different paths; try a small set.
        transfer_paths = [
            f"{self.settings.rpc_base_url}/v2/identities/{identity}/transfers",
            f"{self.settings.rpc_base_url}/v1/identities/{identity}/transfers",
        ]

        last_err: Optional[Exception] = None

        for attempt in range(1, max_retries + 1):
            try:
                tick = await self.get_tick()
                start = max(0, tick - (lookback_ticks * attempt))  # widen window each retry
                end = tick + lookahead_ticks

                params = {"startTick": start, "endTick": end}

                for url in transfer_paths:
                    data = await self._get_json(url, params=params, timeout=45)

                    tx_groups = (
                        (data.get("data") or {}).get("transactions")
                        or data.get("transactions")
                        or []
                    )

                    for group in tx_groups:
                        # group can be dict-like: {"transactions": [...]}
                        entries = group.get("transactions", []) if isinstance(group, dict) else []
                        for entry in entries:
                            tx = entry.get("transaction") or {}
                            if tx.get("txId") == tx_id:
                                money_flew = bool(entry.get("moneyFlew", False))
                                # If tx is found but not finalized yet, keep polling.
                                if not money_flew:
                                    last_err = RpcError("transaction found but not finalized yet (moneyFlew=false)")
                                    break
                                return self._parse_tx(tx, money_flew=money_flew)

                # not found yet
                last_err = RpcError("transaction not found yet")
            except Exception as e:
                last_err = e

            if attempt < max_retries:
                await asyncio.sleep(retry_delay_seconds)

        raise RpcError(str(last_err) if last_err else "transaction lookup failed")
