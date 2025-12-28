from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import get_settings
from app.core.db import conn_ctx
from app.core.security import require_admin
from app.services.airdrop import compute_allocations, recompute_and_store

router = APIRouter(prefix="/v1/admin", dependencies=[Depends(require_admin)])

ROLE_ORDER = ["admin", "power", "portal", "community"]


def _parse_roles(role_field: str | None) -> list[str]:
    if role_field is None or str(role_field).strip() == "":
        return ["community"]
    parts = [p.strip().lower() for p in str(role_field).split(",") if p.strip()]
    ordered = [r for r in ROLE_ORDER if r in parts]
    extras = sorted([r for r in parts if r not in ROLE_ORDER])
    out = ordered + extras
    if "community" not in out:
        out.append("community")
    return out or ["community"]


def _format_roles(role_field: str | None) -> str:
    return ",".join(_parse_roles(role_field))


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
                "role": _format_roles(r[1]),
                "roles": _parse_roles(r[1]),
                "access_info": int(r[2] or 0),
                "created_at": r[3],
                "updated_at": r[4],
            }
            for r in rows
        ]
    }


@router.get("/res")
def list_res():
    """Admin: full res table with per-role airdrop breakdown."""
    settings = get_settings()
    with conn_ctx() as conn:
        allocs = compute_allocations(conn, settings)
        rows = conn.execute(
            """
            SELECT r.wallet_id, u.role, r.qubic_bal, r.qearn_bal, r.portal_bal, r.qxmr_bal, r.created_at, r.updated_at
            FROM res r
            LEFT JOIN users u ON u.wallet_id = r.wallet_id
            ORDER BY r.wallet_id ASC
            """
        ).fetchall()

    def amt(wallet: str, role: str) -> int:
        return int(allocs.get(role, {}).get(wallet, 0))

    out = []
    for idx, r in enumerate(rows, start=1):
        wallet_id = str(r[0]).upper()
        roles = _parse_roles(r[1])
        community_amt = amt(wallet_id, "community")
        portal_amt = amt(wallet_id, "portal")
        power_amt = amt(wallet_id, "power")
        total_amt = community_amt + portal_amt + power_amt
        out.append(
            {
                "no": idx,
                "wallet_id": wallet_id,
                "role": _format_roles(roles),
                "roles": roles,
                "qubic_bal": int(r[2] or 0),
                "qearn_bal": int(r[3] or 0),
                "portal_bal": int(r[4] or 0),
                "qxmr_bal": int(r[5] or 0),
                "community_amt": community_amt,
                "portal_amt": portal_amt,
                "power_amt": power_amt,
                "airdrop_amt": total_amt,
                "created_at": r[6],
                "updated_at": r[7],
            }
        )
    # sort by total desc then wallet
    out.sort(key=lambda x: (-x["airdrop_amt"], x["wallet_id"]))
    # renumber after sort
    for i, r in enumerate(out, start=1):
        r["no"] = i
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
