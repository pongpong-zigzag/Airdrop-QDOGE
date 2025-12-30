from __future__ import annotations

from typing import Any

from app.services.rpc import QubicRpcClient


async def fetch_qearn_amount(rpc: QubicRpcClient, identity: str) -> int:
    """Fetch QEARN token units for a given identity.

    Uses the public assets API; returns 0 if not found.
    """
    owned = await rpc.get_owned_assets(identity)
    best = 0
    for item in owned:
        data = item.get("data") or {}
        issued = data.get("issuedAsset") or {}
        name = (issued.get("name") or "").upper()
        if name != "QEARN":
            continue
        # QX managing contract index is typically 1
        mci = data.get("managingContractIndex")
        try:
            if mci is not None and int(mci) != 1:
                continue
        except Exception:
            pass
        units = data.get("numberOfUnits")
        try:
            best = max(best, int(units))
        except Exception:
            continue
    return best

async def fetch_portal_amount(rpc: QubicRpcClient, identity: str) -> int:
    """Fetch PORTAL token units for a given identity.

    Uses the public assets API; returns 0 if not found.
    """
    owned = await rpc.get_owned_assets(identity)
    best = 0
    for item in owned:
        data = item.get("data") or {}
        issued = data.get("issuedAsset") or {}
        name = (issued.get("name") or "").upper()
        if name != "PORTAL":
            continue
        # QX managing contract index is typically 1
        mci = data.get("managingContractIndex")
        try:
            if mci is not None and int(mci) != 1:
                continue
        except Exception:
            pass
        units = data.get("numberOfUnits")
        try:
            best = max(best, int(units))
        except Exception:
            continue
    return best


async def fetch_asset_units(
    rpc: QubicRpcClient,
    identity: str,
    *,
    asset_name: str,
    issuer_id: str | None = None,
    managing_contract_index: int | None = 1,
) -> int:
    """Fetch an issued asset's numberOfUnits for a given identity.

    The public assets API may return multiple entries; we return the max units for safety.
    """
    owned = await rpc.get_owned_assets(identity)
    best = 0
    target_name = (asset_name or "").strip().upper()
    target_issuer = (issuer_id or "").strip().upper()
    for item in owned:
        data = item.get("data") or {}
        issued = data.get("issuedAsset") or {}
        name = (issued.get("name") or "").upper()
        if name != target_name:
            continue
        if target_issuer:
            issuer = (issued.get("issuerIdentity") or issued.get("issuerId") or "").upper()
            if issuer and issuer != target_issuer:
                continue
        if managing_contract_index is not None:
            mci = data.get("managingContractIndex")
            try:
                if mci is not None and int(mci) != int(managing_contract_index):
                    continue
            except Exception:
                pass
        units = data.get("numberOfUnits")
        try:
            best = max(best, int(units))
        except Exception:
            continue
    return best


async def fetch_qxmr_amount(rpc: QubicRpcClient, identity: str, *, issuer_id: str | None = None) -> int:
    """Fetch QXMR units for a given identity (used for power pool weights)."""
    return await fetch_asset_units(rpc, identity, asset_name="QXMR", issuer_id=issuer_id)
