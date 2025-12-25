from __future__ import annotations

import binascii

from fastapi import APIRouter, Depends, HTTPException

from app.api.models import ConfirmTxRequest, TxLogRequest, WalletRequest
from app.core.config import get_settings
from app.core.db import conn_ctx
from app.core.qubic import asset_name_value, identity_to_public_key_bytes, normalize_identity
from app.core.security import require_admin
from app.services.assets import fetch_qearn_amount, fetch_portal_amount
from app.services.airdrop import build_legacy_res_rows, compute_estimate_for_wallet
from app.services.rpc import QubicRpcClient, RpcError

router = APIRouter()


def _resolve_role(conn, wallet: str, settings) -> str:
    # Admin is config-based allowlist
    if wallet in settings.admin_wallets:
        return "admin"
    # Snapshot-based roles
    if conn.execute("SELECT 1 FROM power_snapshot WHERE wallet_id = ?", (wallet,)).fetchone() is not None:
        return "power"
    if conn.execute("SELECT 1 FROM portal_snapshot WHERE wallet_id = ?", (wallet,)).fetchone() is not None:
        return "portal"
    return "user"


def _fetch_one_int(conn, sql: str, params: tuple) -> int:
    row = conn.execute(sql, params).fetchone()
    if row is None:
        return 0
    v = row[0]
    return int(v or 0)


@router.get("/v1/config")
def get_config():
    settings = get_settings()
    return {
        "total_supply_qdoge": settings.total_supply_qdoge,
        "pools": {
            "community": settings.community_pool,
            "portal": settings.portal_pool,
            "power": settings.power_pool,
            "tradein": settings.tradein_pool,
        },
        "registration_amount_qu": settings.registration_amount_qu,
        "funding_cap_qu": settings.funding_cap_qu,
        "min_wallet_balance_qu": settings.min_wallet_balance_qu,
        "reserve_balance_qu": settings.reserve_balance_qu,
        "addresses": {
            "registration": settings.registration_address,
            "funding": settings.funding_address,
            "burn": settings.burn_address,
        },
        "tradein_ratio_qdoge_per_qxmr": settings.tradein_ratio_qdoge_per_qxmr,
    }


@router.post("/v1/users/get-or-create")
def get_or_create_user(req: WalletRequest):
    settings = get_settings()
    wallet = normalize_identity(req.walletId)
    with conn_ctx() as conn:
        cur = conn.execute("SELECT wallet_id, access_info FROM users WHERE wallet_id = ?", (wallet,)).fetchone()
        created = False
        if cur is None:
            conn.execute("INSERT INTO users(wallet_id, access_info) VALUES (?, 0)", (wallet,))
            conn.commit()
            created = True
            cur = conn.execute("SELECT wallet_id, access_info FROM users WHERE wallet_id = ?", (wallet,)).fetchone()

        role = _resolve_role(conn, wallet, settings)

        return {
            "created": created,
            "user": {
                "wallet_id": cur["wallet_id"],
                "access_info": int(cur["access_info"]),
                "role": role,
            },
        }


@router.get("/v1/wallet/{wallet_id}/summary")
def wallet_summary(wallet_id: str):
    """
    Public: returns ONLY the calling wallet's summary.
    (No global tables. Non-admins should never download the full dataset.)
    """
    settings = get_settings()
    wallet = normalize_identity(wallet_id)

    with conn_ctx() as conn:
        # ensure exists
        conn.execute("INSERT OR IGNORE INTO users(wallet_id, access_info) VALUES (?, 0)", (wallet,))
        u = conn.execute("SELECT wallet_id, access_info FROM users WHERE wallet_id = ?", (wallet,)).fetchone()

        role = _resolve_role(conn, wallet, settings)
        registered = int(u["access_info"]) == 1

        funded = _fetch_one_int(
            conn,
            "SELECT COALESCE(SUM(amount_credited),0) FROM fundings WHERE wallet_id = ?",
            (wallet,),
        )
        qearn = _fetch_one_int(
            conn,
            "SELECT COALESCE(qearn_amount,0) FROM qearn_snapshot WHERE wallet_id = ?",
            (wallet,),
        )
        portal_amt = _fetch_one_int(
            conn,
            "SELECT COALESCE(portal_amount,0) FROM portal_snapshot WHERE wallet_id = ?",
            (wallet,),
        )
        power_qxmr = _fetch_one_int(
            conn,
            "SELECT COALESCE(qxmr_amount,0) FROM power_snapshot WHERE wallet_id = ?",
            (wallet,),
        )

        tradein_qxmr = _fetch_one_int(
            conn,
            "SELECT COALESCE(SUM(qxmr_amount),0) FROM tradeins WHERE wallet_id = ?",
            (wallet,),
        )
        tradein_qdoge = _fetch_one_int(
            conn,
            "SELECT COALESCE(SUM(qdoge_amount),0) FROM tradeins WHERE wallet_id = ?",
            (wallet,),
        )

        breakdown = compute_estimate_for_wallet(conn, wallet, settings)
        total = int(sum(breakdown.values()))

    return {
        "wallet_id": wallet,
        "role": role,
        "registered": registered,
        "access_info": int(u["access_info"]),
        "funded_qu": int(funded),
        "funding_cap_qu": int(settings.funding_cap_qu),
        "funding_cap_remaining_qu": int(max(0, int(settings.funding_cap_qu) - int(funded))),
        "snapshots": {
            "qearn": int(qearn),
            "portal": int(portal_amt),
            "power_qxmr": int(power_qxmr),
        },
        "tradein": {
            "qxmr": int(tradein_qxmr),
            "qdoge": int(tradein_qdoge),
        },
        "airdrop": {
            "breakdown": breakdown,
            "total": total,
        },
    }


@router.get("/v1/airdrop/rows/{wallet_id}")
def airdrop_rows(wallet_id: str):
    """
    Public: returns ONLY the rows relevant to this wallet (legacy Res shape),
    so non-admins can display a table without receiving everyone else's data.
    """
    settings = get_settings()
    wallet = normalize_identity(wallet_id)

    with conn_ctx() as conn:
        # ensure exists
        conn.execute("INSERT OR IGNORE INTO users(wallet_id, access_info) VALUES (?, 0)", (wallet,))

        # balances used for legacy table columns
        funded = _fetch_one_int(
            conn,
            "SELECT COALESCE(SUM(amount_credited),0) FROM fundings WHERE wallet_id = ?",
            (wallet,),
        )
        qearn = _fetch_one_int(
            conn,
            "SELECT COALESCE(qearn_amount,0) FROM qearn_snapshot WHERE wallet_id = ?",
            (wallet,),
        )
        portal_amt = _fetch_one_int(
            conn,
            "SELECT COALESCE(portal_amount,0) FROM portal_snapshot WHERE wallet_id = ?",
            (wallet,),
        )
        power_qxmr = _fetch_one_int(
            conn,
            "SELECT COALESCE(qxmr_amount,0) FROM power_snapshot WHERE wallet_id = ?",
            (wallet,),
        )

        breakdown = compute_estimate_for_wallet(conn, wallet, settings)

    rows = []
    idx = 1

    # Community row (role=user)
    if (int(breakdown.get("community", 0)) > 0) or (int(funded) > 0) or (int(qearn) > 0):
        rows.append(
            {
                "no": idx,
                "wallet_id": wallet,
                "role": "user",
                "qearn_bal": int(qearn),
                "invest_bal": int(funded),
                "airdrop_amt": int(breakdown.get("community", 0)),
            }
        )
        idx += 1

    # Portal row
    if (int(breakdown.get("portal", 0)) > 0) or (int(portal_amt) > 0):
        rows.append(
            {
                "no": idx,
                "wallet_id": wallet,
                "role": "portal",
                "qearn_bal": int(portal_amt),
                "invest_bal": 0,
                "airdrop_amt": int(breakdown.get("portal", 0)),
            }
        )
        idx += 1

    # Power row
    if (int(breakdown.get("power", 0)) > 0) or (int(power_qxmr) > 0):
        rows.append(
            {
                "no": idx,
                "wallet_id": wallet,
                "role": "power",
                "qearn_bal": int(power_qxmr),
                "invest_bal": 0,
                "airdrop_amt": int(breakdown.get("power", 0)),
            }
        )
        idx += 1

    return {"res": rows}


@router.post("/v1/registration/confirm")
async def confirm_registration(req: ConfirmTxRequest):
    settings = get_settings()
    wallet = normalize_identity(req.walletId)
    tx_id = req.txId.strip()

    rpc = QubicRpcClient(settings)

    try:
        tx = await rpc.get_tx_details(wallet, tx_id)
        print(f"confirm_registration: tx={tx}")
    except RpcError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not tx.money_flew:
        raise HTTPException(status_code=400, detail="transaction not finalized (money did not fly)")

    if tx.source_id.upper() != wallet:
        raise HTTPException(status_code=400, detail="tx source does not match wallet")

    if tx.dest_id.upper() != settings.registration_address:
        raise HTTPException(status_code=400, detail="tx destination does not match registration address")

    if int(tx.amount) != int(settings.registration_amount_qu):
        raise HTTPException(status_code=400, detail=f"registration requires exactly {settings.registration_amount_qu} QU")

    with conn_ctx() as conn:
        conn.execute("INSERT OR IGNORE INTO users(wallet_id, access_info) VALUES (?, 0)", (wallet,))
        conn.execute(
            "INSERT OR IGNORE INTO registrations(tx_id, wallet_id, amount_qu, tick) VALUES (?, ?, ?, ?)",
            (tx_id, wallet, int(tx.amount), int(tx.tick_number)),
        )
        conn.execute(
            "UPDATE users SET access_info = 1, updated_at = datetime('now') WHERE wallet_id = ?",
            (wallet,),
        )
        conn.commit()

    return {"success": True}


@router.post("/v1/funding/confirm")
async def confirm_funding(req: ConfirmTxRequest):
    settings = get_settings()
    wallet = normalize_identity(req.walletId)
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

    if tx.dest_id.upper() != settings.funding_address:
        raise HTTPException(status_code=400, detail="tx destination does not match funding address")

    amount_sent = int(tx.amount)
    if amount_sent <= 0:
        raise HTTPException(status_code=400, detail="funding amount must be > 0")

    try:
        current_balance = await rpc.get_balance(wallet)
    except Exception:
        current_balance = -1

    if current_balance != -1 and current_balance < settings.reserve_balance_qu:
        raise HTTPException(status_code=400, detail=f"wallet must keep at least {settings.reserve_balance_qu} QU")

    if current_balance != -1 and current_balance < settings.min_wallet_balance_qu:
        raise HTTPException(status_code=400, detail=f"wallet must maintain at least {settings.min_wallet_balance_qu} QU")

    with conn_ctx() as conn:
        conn.execute("INSERT OR IGNORE INTO users(wallet_id, access_info) VALUES (?, 0)", (wallet,))
        u = conn.execute("SELECT access_info FROM users WHERE wallet_id = ?", (wallet,)).fetchone()
        if u is None or int(u["access_info"]) != 1:
            raise HTTPException(status_code=400, detail="wallet not registered for community drop")

        prev = conn.execute(
            "SELECT COALESCE(SUM(amount_credited),0) AS s FROM fundings WHERE wallet_id = ?",
            (wallet,),
        ).fetchone()[0]
        prev = int(prev or 0)
        remaining = max(0, settings.funding_cap_qu - prev)
        credited = min(amount_sent, remaining)

        conn.execute(
            "INSERT OR IGNORE INTO fundings(tx_id, wallet_id, amount_sent, amount_credited, tick) VALUES (?, ?, ?, ?, ?)",
            (tx_id, wallet, amount_sent, credited, int(tx.tick_number)),
        )

        try:
            qearn = await fetch_qearn_amount(rpc, wallet)
            portal = await fetch_portal_amount(rpc, wallet)

            conn.execute(
                "INSERT INTO qearn_snapshot(wallet_id, qearn_amount) VALUES (?, ?) "
                "ON CONFLICT(wallet_id) DO UPDATE SET qearn_amount=excluded.qearn_amount, captured_at=datetime('now')",
                (wallet, int(qearn)),
            )
            conn.execute(
                "INSERT INTO portal_snapshot(wallet_id, portal_amount) VALUES (?, ?) "
                "ON CONFLICT(wallet_id) DO UPDATE SET portal_amount=excluded.portal_amount, captured_at=datetime('now')",
                (wallet, int(portal)),
            )
        except Exception:
            pass

        conn.commit()

    return {
        "success": True,
        "amount_sent": amount_sent,
        "amount_credited": credited,
        "cap_remaining": remaining - credited,
    }


@router.post("/v1/tradein/confirm")
async def confirm_tradein(req: ConfirmTxRequest):
    settings = get_settings()
    wallet = normalize_identity(req.walletId)
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
        raise HTTPException(status_code=400, detail="trade-in tx must be QX TransferShareOwnershipAndPossession (inputType=2)")

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

    qdoge_amount = shares * settings.tradein_ratio_qdoge_per_qxmr

    with conn_ctx() as conn:
        conn.execute("INSERT OR IGNORE INTO users(wallet_id, access_info) VALUES (?, 0)", (wallet,))

        total_tradein = conn.execute("SELECT COALESCE(SUM(qdoge_amount),0) FROM tradeins").fetchone()[0]
        total_tradein = int(total_tradein or 0)
        if total_tradein + qdoge_amount > settings.tradein_pool:
            raise HTTPException(status_code=400, detail="trade-in pool exhausted")

        conn.execute(
            "INSERT OR IGNORE INTO tradeins(tx_id, wallet_id, qxmr_amount, qdoge_amount, tick) VALUES (?, ?, ?, ?, ?)",
            (tx_id, wallet, shares, qdoge_amount, int(tx.tick_number)),
        )
        conn.commit()

    return {"success": True, "qxmr_amount": shares, "qdoge_amount": qdoge_amount}


@router.get("/v1/estimate/{wallet_id}")
def estimate(wallet_id: str):
    wallet = normalize_identity(wallet_id)
    with conn_ctx() as conn:
        breakdown = compute_estimate_for_wallet(conn, wallet)
    return {
        "wallet_id": wallet,
        "breakdown": breakdown,
        "total": sum(breakdown.values()),
    }


# ---------------- legacy endpoints ----------------

@router.post("/get_user")
def legacy_get_user(req: WalletRequest):
    settings = get_settings()
    wallet = normalize_identity(req.walletId)
    with conn_ctx() as conn:
        cur = conn.execute("SELECT wallet_id, access_info FROM users WHERE wallet_id = ?", (wallet,)).fetchone()
        created = False
        if cur is None:
            conn.execute("INSERT INTO users(wallet_id, access_info) VALUES (?, 0)", (wallet,))
            conn.commit()
            created = True
            cur = conn.execute("SELECT wallet_id, access_info FROM users WHERE wallet_id = ?", (wallet,)).fetchone()

        role = _resolve_role(conn, wallet, settings)

        return {
            "created": created,
            "user": {"wallet_id": cur["wallet_id"], "access_info": int(cur["access_info"]), "role": role},
        }


@router.post("/update_access_info")
def legacy_update_access_info(req: WalletRequest):
    raise HTTPException(status_code=410, detail="/update_access_info deprecated; use /v1/registration/confirm")


@router.post("/get_airdrop_res", dependencies=[Depends(require_admin)])
def legacy_get_airdrop_res():
    # ✅ now ADMIN-ONLY (X-API-Key), so non-admins cannot download all wallets
    settings = get_settings()
    with conn_ctx() as conn:
        rows = build_legacy_res_rows(conn, settings)
    return {"res": rows}


@router.post("/transaction")
def legacy_log_transaction(req: TxLogRequest):
    with conn_ctx() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO transaction_log(sender, recipient, tx_hash) VALUES (?, ?, ?)",
            (req.sender.strip().upper(), req.recipient.strip().upper(), req.tx_hash.strip()),
        )
        conn.commit()
    return {"success": True, "transaction": {"tx_hash": req.tx_hash}}


@router.post("/get_res")
def legacy_get_res(req: WalletRequest):
    # ✅ prevent public enumeration
    raise HTTPException(status_code=410, detail="/get_res deprecated; use GET /v1/wallet/{wallet_id}/summary")


@router.post("/update_res")
def legacy_update_res(req: dict):
    raise HTTPException(status_code=410, detail="/update_res deprecated; use /v1/funding/confirm")


@router.post("/update_role")
def legacy_update_role(req: dict):
    raise HTTPException(status_code=410, detail="roles are snapshot-driven; use admin import endpoints")
