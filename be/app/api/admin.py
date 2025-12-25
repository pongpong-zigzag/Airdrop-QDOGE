from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.models import ImportSnapshotRequest
from app.core.db import conn_ctx
from app.core.qubic import normalize_identity
from app.core.security import require_admin
from app.services.airdrop import build_legacy_res_rows, compute_allocations

router = APIRouter(dependencies=[Depends(require_admin)])


@router.post("/admin/airdrop/res")
def admin_airdrop_res():
    """Admin-only: full airdrop table (legacy shape)."""
    with conn_ctx() as conn:
        rows = build_legacy_res_rows(conn)
    return {"res": rows}


@router.post("/admin/import/portal")
def import_portal_snapshot(req: ImportSnapshotRequest):
    rows = [(normalize_identity(r.walletId), int(r.amount)) for r in req.rows if int(r.amount) > 0]
    with conn_ctx() as conn:
        with conn:
            for wallet, amount in rows:
                conn.execute(
                    "INSERT INTO portal_snapshot(wallet_id, portal_amount) VALUES (?, ?) "
                    "ON CONFLICT(wallet_id) DO UPDATE SET portal_amount=excluded.portal_amount, imported_at=datetime('now')",
                    (wallet, amount),
                )
    return {"imported": len(rows)}


@router.post("/admin/import/power")
def import_power_snapshot(req: ImportSnapshotRequest):
    rows = [(normalize_identity(r.walletId), int(r.amount)) for r in req.rows if int(r.amount) > 0]
    with conn_ctx() as conn:
        with conn:
            for wallet, amount in rows:
                conn.execute(
                    "INSERT INTO power_snapshot(wallet_id, qxmr_amount) VALUES (?, ?) "
                    "ON CONFLICT(wallet_id) DO UPDATE SET qxmr_amount=excluded.qxmr_amount, imported_at=datetime('now')",
                    (wallet, amount),
                )
    return {"imported": len(rows)}


@router.get("/admin/allocations")
def get_allocations():
    with conn_ctx() as conn:
        allocations = compute_allocations(conn)
        trade_rows = conn.execute(
            "SELECT wallet_id, COALESCE(SUM(qdoge_amount),0) AS amt FROM tradeins GROUP BY wallet_id HAVING amt > 0"
        ).fetchall()
        trade_alloc = {str(r[0]).upper(): int(r[1] or 0) for r in trade_rows}

    def summarize(d: dict[str, int]):
        return {
            "wallets": len(d),
            "total": sum(d.values()),
            "top5": sorted(d.items(), key=lambda x: -x[1])[:5],
        }

    return {
        "community": summarize(allocations["community"]),
        "portal": summarize(allocations["portal"]),
        "power": summarize(allocations["power"]),
        "tradein": summarize(trade_alloc),
    }
