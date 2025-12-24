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
