from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import get_settings
from app.core.db import conn_ctx
from app.core.security import require_admin
from app.services.airdrop import compute_allocations, recompute_and_store

router = APIRouter(prefix="/v1/admin", dependencies=[Depends(require_admin)])


@router.get("/users")
def list_users():
    """Admin: list all users (wallet_id, role, access_info, timestamps)."""
    with conn_ctx() as conn:
        rows = conn.execute(
            "SELECT wallet_id, role, access_info, created_at, updated_at FROM users ORDER BY created_at DESC"
        ).fetchall()
    return {
        "users": [
            {
                "wallet_id": str(r[0]).upper(),
                "role": str(r[1] or "community").lower(),
                "access_info": int(r[2] or 0),
                "created_at": r[3],
                "updated_at": r[4],
            }
            for r in rows
        ]
    }


@router.get("/res")
def list_res():
    """Admin: full res table."""
    with conn_ctx() as conn:
        rows = conn.execute(
            """
            SELECT r.wallet_id, u.role, r.qubic_bal, r.qearn_bal, r.portal_bal, r.qxmr_bal, r.airdrop_amt,
                   r.created_at, r.updated_at
            FROM res r
            LEFT JOIN users u ON u.wallet_id = r.wallet_id
            ORDER BY r.airdrop_amt DESC, r.wallet_id ASC
            """
        ).fetchall()
    out = []
    for idx, r in enumerate(rows, start=1):
        out.append(
            {
                "no": idx,
                "wallet_id": str(r[0]).upper(),
                "role": str(r[1] or "community").lower(),
                "qubic_bal": int(r[2] or 0),
                "qearn_bal": int(r[3] or 0),
                "portal_bal": int(r[4] or 0),
                "qxmr_bal": int(r[5] or 0),
                "airdrop_amt": int(r[6] or 0),
                "created_at": r[7],
                "updated_at": r[8],
            }
        )
    return {"res": out}


@router.get("/allocations")
def allocations():
    """Admin: summarize allocations per role based on current snapshots."""
    settings = get_settings()
    with conn_ctx() as conn:
        allocs = compute_allocations(conn, settings)

    def summarize(d: dict[str, int]):
        items = sorted(d.items(), key=lambda x: (-x[1], x[0]))
        return {
            "wallets": len(items),
            "total": sum(v for _, v in items),
            "top10": items[:10],
        }

    return {
        "pools": {
            "community": int(settings.community_pool),
            "portal": int(settings.portal_pool),
            "power": int(settings.power_pool),
        },
        "community": summarize(allocs.get("community", {})),
        "portal": summarize(allocs.get("portal", {})),
        "power": summarize(allocs.get("power", {})),
    }


@router.post("/recompute")
def recompute():
    """Admin: recompute allocations and persist res.airdrop_amt for registered wallets."""
    settings = get_settings()
    with conn_ctx() as conn:
        recompute_and_store(conn, settings)
        conn.commit()
    return {"success": True}
