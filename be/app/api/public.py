from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.models import ConfirmTxRequest, TxLogRequest
from app.core.config import get_settings
from app.core.db import conn_ctx
from app.core.qubic import asset_name_value, identity_to_public_key_bytes, normalize_identity
from app.core.security import require_admin
from app.services.airdrop import airdrop_breakdown_for_wallet, airdrop_for_wallet, recompute_and_store
from app.services.assets import fetch_asset_units, fetch_portal_amount, fetch_qearn_amount, fetch_qxmr_amount
from app.services.rpc import QubicRpcClient, RpcError

router = APIRouter()

# Cache window for wallet summary snapshots. Keep short to reduce staleness on UI.
CACHE_TTL_SECONDS = 30  # seconds

# Role helpers
ROLE_ORDER = ["admin", "power", "portal", "community"]


def _normalize_roles(raw_roles) -> list[str]:
    """Normalize to a de-duplicated, ordered role list."""
    seen = []
    for r in raw_roles or []:
        r_norm = str(r or "").strip().lower()
        if not r_norm or r_norm in seen:
            continue
        seen.append(r_norm)
    # apply deterministic ordering
    ordered = [r for r in ROLE_ORDER if r in seen]
    extras = sorted([r for r in seen if r not in ROLE_ORDER])
    out = ordered + extras
    if "community" not in out:
        out.append("community")
    return out or ["community"]


def _parse_roles(role_field: str | None) -> list[str]:
    if role_field is None or str(role_field).strip() == "":
        return ["community"]
    parts = str(role_field).split(",")
    return _normalize_roles(parts)


def _format_roles(roles: list[str]) -> str:
    return ",".join(_normalize_roles(roles))


def _ensure_user(conn, wallet: str, settings) -> None:
    """Ensure users row exists; admins are always role=admin, access_info=1."""
    if wallet == settings.admin_wallet_id:
        conn.execute(
            """
            INSERT OR IGNORE INTO users(wallet_id, role, access_info)
            VALUES (?, 'admin', 1)
            """,
            (wallet,),
        )
        conn.execute(
            "UPDATE users SET role='admin', access_info=1, updated_at=datetime('now') WHERE wallet_id = ?",
            (wallet,),
        )
    else:
        conn.execute(
            "INSERT OR IGNORE INTO users(wallet_id, role, access_info) VALUES (?, 'community', 0)",
            (wallet,),
        )


def _resolve_roles(*, wallet: str, settings, portal_bal: int) -> list[str]:
    """Default role is community; add portal/power when eligible. Admin is exclusive."""
    if getattr(settings, "admin_wallet_id", "") and wallet == settings.admin_wallet_id:
        return ["admin"]
    roles: list[str] = ["community"]
    if int(portal_bal) > 0:
        roles.append("portal")
    if wallet in settings.power_users:
        roles.append("power")
    return _normalize_roles(roles)


@router.get("/v1/config")
def get_config():
    settings = get_settings()
    return {
        "total_QDOGE_supply": settings.total_supply_qdoge,
        "allocations": {
            "community": int(settings.community_pool),
            "portal": int(settings.portal_pool),
            "power": int(settings.power_pool),
            "trader": int(settings.total_supply_qdoge * 0.025),
        },
        "rules": {
            "registration_fee_qu": int(settings.registration_amount_qu),
            "qubic_cap": int(settings.qubic_cap),
            "portal_total_supply": int(settings.portal_total_supply),
        },
        "addresses": {
            "registration": settings.registration_address,
            "burn": settings.burn_address,
        },
        "tradein": {
            "qx_contract_id": settings.qx_contract_id,
            "qxmr_issuer_id": settings.qxmr_issuer_id,
            "tradein_ratio_qdoge_per_qxmr": settings.tradein_ratio_qdoge_per_qxmr,
            "tradein_pool": int(settings.tradein_pool),
        },
    }


@router.get("/v1/wallet/{wallet_id}/summary")
async def wallet_summary(wallet_id: str, fresh: bool = False):
    """Public: returns ONLY the requested wallet's status.

    Note: Without wallet auth, the server cannot cryptographically enforce that the
    caller owns the wallet. The frontend should only query the connected wallet.
    """
    settings = get_settings()
    wallet = normalize_identity(wallet_id)

    with conn_ctx() as conn:
        # Serve a fresh-enough cached snapshot to avoid slow RPC for typical requests, unless caller forces fresh.
        if not fresh:
            cached = conn.execute(
                """
                SELECT u.access_info,
                       u.role,
                       r.qubic_bal,
                       r.qearn_bal,
                       r.portal_bal,
                       r.qxmr_bal,
                       r.airdrop_amt,
                       r.updated_at
                FROM users u
                LEFT JOIN res r ON r.wallet_id = u.wallet_id
                WHERE u.wallet_id = ?
                """,
                (wallet,),
            ).fetchone()
            if cached and cached["updated_at"]:
                try:
                    updated_at = datetime.fromisoformat(str(cached["updated_at"])).replace(tzinfo=None)
                    age = (datetime.utcnow() - updated_at).total_seconds()
                except Exception:
                    age = CACHE_TTL_SECONDS + 1
                if age <= CACHE_TTL_SECONDS:
                    registered = bool(cached["access_info"] == 1)
                    roles = _parse_roles(cached["role"])
                    qubic_bal_raw = int(cached["qubic_bal"] or 0)
                    return {
                        "wallet_id": wallet,
                        "registered": registered,
                        "role": _format_roles(roles),
                        "roles": roles,
                        "balances": {
                            "qubic_bal": qubic_bal_raw,
                            "qubic_bal_capped": min(max(0, qubic_bal_raw), int(settings.qubic_cap)),
                            "qearn_bal": int(cached["qearn_bal"] or 0),
                            "portal_bal": int(cached["portal_bal"] or 0),
                            "qxmr_bal": int(cached["qxmr_bal"] or 0),
                            "qubic_cap": int(settings.qubic_cap),
                        },
                        "airdrop": {
                            "estimated": int(cached["airdrop_amt"] or 0),
                        },
                    }

    rpc = QubicRpcClient(settings)

    async def _safe_call(coro, default: int = 0) -> int:
        try:
            return await coro
        except Exception:
            return default

    # Fetch balances concurrently to reduce latency
    qubic_task = asyncio.create_task(_safe_call(rpc.get_balance(wallet)))
    qearn_task = asyncio.create_task(_safe_call(fetch_qearn_amount(rpc, wallet)))
    portal_task = asyncio.create_task(_safe_call(fetch_portal_amount(rpc, wallet)))
    qxmr_task = asyncio.create_task(_safe_call(fetch_qxmr_amount(rpc, wallet, issuer_id=settings.qxmr_issuer_id or None)))

    qubic_bal_raw, qearn_bal, portal_bal, qxmr_bal = await asyncio.gather(
        qubic_task, qearn_task, portal_task, qxmr_task
    )

    qubic_bal_raw = int(max(0, int(qubic_bal_raw)))
    qubic_bal_capped = int(min(qubic_bal_raw, int(settings.qubic_cap)))
    roles = _resolve_roles(wallet=wallet, settings=settings, portal_bal=int(portal_bal))
    roles_csv = _format_roles(roles)

    with conn_ctx() as conn:
        _ensure_user(conn, wallet, settings)
        u = conn.execute("SELECT access_info FROM users WHERE wallet_id = ?", (wallet,)).fetchone()
        registered = bool(u and int(u[0] or 0) == 1)

        # persist latest snapshot
        conn.execute(
            "UPDATE users SET role = ?, updated_at = datetime('now') WHERE wallet_id = ?",
            (roles_csv, wallet),
        )
        conn.execute(
            """
            INSERT INTO res(wallet_id, qubic_bal, qearn_bal, portal_bal, qxmr_bal, updated_at)
            VALUES(?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(wallet_id) DO UPDATE SET
              qubic_bal=excluded.qubic_bal,
              qearn_bal=excluded.qearn_bal,
              portal_bal=excluded.portal_bal,
              qxmr_bal=excluded.qxmr_bal,
              updated_at=datetime('now')
            """,
            (wallet, qubic_bal_raw, int(qearn_bal), int(portal_bal), int(qxmr_bal)),
        )

        # compute estimate based on current DB snapshots (registered wallets only)
        breakdown = airdrop_breakdown_for_wallet(conn, wallet, settings) if registered else {"community": 0, "portal": 0, "power": 0}
        est = int(sum(breakdown.values())) if registered else 0
        conn.execute(
            "UPDATE res SET airdrop_amt=?, updated_at=datetime('now') WHERE wallet_id = ?",
            (est, wallet),
        )
        conn.commit()

    return {
        "wallet_id": wallet,
        "registered": registered,
        "role": roles_csv,
        "roles": roles,
        "balances": {
            "qubic_bal": qubic_bal_raw,
            "qubic_bal_capped": qubic_bal_capped,
            "qearn_bal": int(qearn_bal),
            "portal_bal": int(portal_bal),
            "qxmr_bal": int(qxmr_bal),
            "qubic_cap": int(settings.qubic_cap),
        },
        "airdrop": {"estimated": est, "breakdown": breakdown},
    }


@router.post("/v1/registration/confirm")
async def confirm_registration(req: ConfirmTxRequest):
    settings = get_settings()
    wallet = normalize_identity(req.walletId)
    if wallet == settings.admin_wallet_id:
        raise HTTPException(status_code=400, detail="admin wallet cannot register")
    tx_id = req.txId.strip()

    rpc = QubicRpcClient(settings)

    try:
        tx = await rpc.get_tx_details(wallet, tx_id)
    except RpcError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not tx.money_flew:
        raise HTTPException(status_code=400, detail="transaction not finalized (money did not fly)")

    if tx.source_id.upper() != wallet:
        raise HTTPException(status_code=400, detail="tx source does not match wallet")

    if tx.dest_id.upper() != settings.registration_address:
        raise HTTPException(status_code=400, detail="tx destination does not match registration address")

    if int(tx.amount) != int(settings.registration_amount_qu):
        raise HTTPException(
            status_code=400,
            detail=f"registration requires exactly {settings.registration_amount_qu} QU",
        )

    with conn_ctx() as conn:
        _ensure_user(conn, wallet, settings)
        u = conn.execute("SELECT access_info FROM users WHERE wallet_id = ?", (wallet,)).fetchone()
        if u is not None and int(u[0] or 0) == 1:
            raise HTTPException(status_code=409, detail="wallet already registered")

        # mark registered
        conn.execute(
            "UPDATE users SET access_info = 1, updated_at = datetime('now') WHERE wallet_id = ?",
            (wallet,),
        )

        # log tx
        conn.execute(
            """
            INSERT OR IGNORE INTO transaction_log(wallet_id, "from", "to", txId, type, amount)
            VALUES(?, ?, ?, ?, 'qubic', ?)
            """,
            (wallet, wallet, settings.registration_address, tx_id, int(tx.amount)),
        )
        conn.commit()

    return {"success": True}


@router.post("/v1/tradein/confirm")
async def confirm_tradein(req: ConfirmTxRequest):
    """Trade-in endpoint (implementation preserved)."""
    settings = get_settings()
    wallet = normalize_identity(req.walletId)
    if wallet == settings.admin_wallet_id:
        raise HTTPException(status_code=400, detail="admin wallet cannot trade-in")
    tx_id = req.txId.strip()

    rpc = QubicRpcClient(settings)

    try:
        tx = await rpc.get_tx_details(wallet, tx_id)
    except RpcError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not tx.money_flew:
        raise HTTPException(status_code=400, detail="transaction not finalized (money did not fly)")

    if tx.source_id.upper() != wallet:
        raise HTTPException(status_code=400, detail="tx source does not match wallet")

    if tx.dest_id.upper() != settings.qx_contract_id:
        raise HTTPException(status_code=400, detail="trade-in must be a QX smart contract transaction")

    if int(tx.input_type) != 2:
        raise HTTPException(
            status_code=400,
            detail="trade-in tx must be QX TransferShareOwnershipAndPossession (inputType=2)",
        )

    try:
        payload = bytes.fromhex(tx.input_hex)
    except ValueError:
        raise HTTPException(status_code=400, detail="unable to parse tx inputHex")

    if len(payload) < 80:
        raise HTTPException(status_code=400, detail="trade-in payload too short")

    issuer_pk = payload[0:32]
    new_owner_pk = payload[32:64]
    asset_val = int.from_bytes(payload[64:72], byteorder="little", signed=True)
    shares = int.from_bytes(payload[72:80], byteorder="little", signed=True)

    exp_issuer_pk = identity_to_public_key_bytes(settings.qxmr_issuer_id)
    exp_burn_pk = identity_to_public_key_bytes(settings.burn_address)

    if issuer_pk != exp_issuer_pk:
        raise HTTPException(status_code=400, detail="issuer does not match QXMR issuer")

    if new_owner_pk != exp_burn_pk:
        raise HTTPException(status_code=400, detail="newOwner does not match burn address")

    if asset_val != asset_name_value("QXMR"):
        raise HTTPException(status_code=400, detail="assetName is not QXMR")

    if shares <= 0:
        raise HTTPException(status_code=400, detail="numberOfShares must be > 0")

    qdoge_amount = shares // int(settings.tradein_ratio_qdoge_per_qxmr)

    with conn_ctx() as conn:
        _ensure_user(conn, wallet, settings)

        total_tradein = conn.execute("SELECT COALESCE(SUM(qdoge_amount),0) FROM tradeins").fetchone()[0]
        total_tradein = int(total_tradein or 0)
        if total_tradein + qdoge_amount > settings.tradein_pool:
            raise HTTPException(status_code=400, detail="trade-in pool exhausted")

        conn.execute(
            "INSERT OR IGNORE INTO tradeins(tx_id, wallet_id, qxmr_amount, qdoge_amount, tick) VALUES (?, ?, ?, ?, ?)",
            (tx_id, wallet, shares, qdoge_amount, int(tx.tick_number)),
        )

        # also log into transaction_log (type=qxmr)
        conn.execute(
            """
            INSERT OR IGNORE INTO transaction_log(wallet_id, "from", "to", txId, type, amount)
            VALUES(?, ?, ?, ?, 'qxmr', ?)
            """,
            (wallet, wallet, settings.burn_address, tx_id, int(shares)),
        )
        conn.commit()

    return {"success": True, "qxmr_amount": shares, "qdoge_amount": qdoge_amount}


@router.post("/v1/transaction/log", dependencies=[Depends(require_admin)])
def log_transaction(req: TxLogRequest):
    """Admin-only transaction logger (used by admin QDOGE send UI)."""
    wallet_id = normalize_identity(req.wallet_id)
    from_id = normalize_identity(req.from_id)
    to_id = normalize_identity(req.to_id)
    tx_id = req.txId.strip()
    if not tx_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="txId required")
    tx_type = (req.type or "").strip().lower()
    if tx_type not in {"qubic", "qxmr", "qdoge"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid type")

    with conn_ctx() as conn:
        _ensure_user(conn, wallet_id, get_settings())
        conn.execute(
            """
            INSERT OR IGNORE INTO transaction_log(wallet_id, "from", "to", txId, type, amount)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (wallet_id, from_id, to_id, tx_id, tx_type, int(req.amount or 0)),
        )
        conn.commit()
    return {"success": True}
