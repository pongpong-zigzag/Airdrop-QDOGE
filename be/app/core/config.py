import os
from dataclasses import dataclass, field
from functools import lru_cache


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw.strip().replace("_", ""))


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return float(raw.strip())


def _env_str(name: str, default: str) -> str:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip()


def _env_csv(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        raw = default
    return [x.strip() for x in raw.split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    # --- tokenomics ---
    total_supply_qdoge: int

    community_pct: float
    portal_pct: float
    power_pct: float
    tradein_pct: float

    # --- rules ---
    registration_amount_qu: int
    min_wallet_balance_qu: int
    reserve_balance_qu: int
    funding_cap_qu: int

    tradein_ratio_qdoge_per_qxmr: int

    # --- identities / addresses ---
    registration_address: str
    funding_address: str
    burn_address: str

    qx_contract_id: str
    qxmr_issuer_id: str

    # Portal token metadata (optional)
    portal_asset_name: str
    portal_asset_issuer: str

    # --- networking ---
    rpc_base_url: str
    api_base_url: str
    cors_allow_origins: list[str] = field(default_factory=list)

    # --- admin ---
    admin_api_key: str = ""
    admin_wallets: list[str] = field(default_factory=list)

    # --- db ---
    db_path: str = "schema/airdrop.db"

    @property
    def community_pool(self) -> int:
        return int(self.total_supply_qdoge * self.community_pct)

    @property
    def portal_pool(self) -> int:
        return int(self.total_supply_qdoge * self.portal_pct)

    @property
    def power_pool(self) -> int:
        return int(self.total_supply_qdoge * self.power_pct)

    @property
    def tradein_pool(self) -> int:
        return int(self.total_supply_qdoge * self.tradein_pct)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load settings from environment.

    Reads .env once if python-dotenv is installed.
    """
    try:
        from dotenv import load_dotenv  # type: ignore

        load_dotenv(override=False)
    except Exception:
        pass

    total_supply_qdoge = _env_int("TOTAL_SUPPLY_QDOGE", 21_000_000_000)

    community_pct = _env_float("COMMUNITY_PCT", 0.075)
    portal_pct = _env_float("PORTAL_PCT", 0.01)
    power_pct = _env_float("POWER_PCT", 0.04)
    tradein_pct = _env_float("TRADEIN_PCT", 0.025)

    registration_amount_qu = _env_int("REGISTRATION_AMOUNT_QU", 100)
    min_wallet_balance_qu = _env_int("MIN_WALLET_BALANCE_QU", 100_000_000)
    reserve_balance_qu = _env_int("RESERVE_BALANCE_QU", 100_000_000)
    funding_cap_qu = _env_int("FUNDING_CAP_QU", 10_000_000_000)

    tradein_ratio_qdoge_per_qxmr = _env_int("TRADEIN_RATIO_QDOGE_PER_QXMR", 100)

    registration_address = _env_str(
        "REGISTRATION_ADDRESS",
        "QDOGEEESKYPAICECHEAHOXPULEOADTKGEJHAVYPFKHLEWGXXZQUGIGMBUTZE",
    ).upper()

    funding_address = _env_str("FUNDING_ADDRESS", registration_address).upper()

    burn_address = _env_str(
        "BURN_ADDRESS",
        "BURNQCDXPUVMBGCTKXZMLRCQYUWBPZREUCDIPECZOAYKCQNGTIUSDXLDULQL",
    ).upper()

    qx_contract_id = _env_str(
        "QX_CONTRACT_ID",
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFXIB",
    ).upper()

    qxmr_issuer_id = _env_str(
        "QXMR_ISSUER_ID",
        "QXMRTKAIIGLUREPIQPCMHCKWSIPDTUYFCFNYXQLTECSUJVYEMMDELBMDOEYB",
    ).upper()

    qxmr_issuer_id = _env_str(
        "QDOGE_ISSUER_ID",
        "QDOGEEESKYPAICECHEAHOXPULEOADTKGEJHAVYPFKHLEWGXXZQUGIGMBUTZE",
    ).upper()

    portal_asset_name = _env_str("PORTAL_ASSET_NAME", "PORTAL").upper()
    portal_asset_issuer = _env_str("PORTAL_ASSET_ISSUER", "").upper()

    rpc_base_url = _env_str("RPC_BASE_URL", "https://rpc.qubic.org").rstrip("/")
    api_base_url = _env_str("API_BASE_URL", "https://dev01.qubic.org").rstrip("/")

    cors_allow_origins = _env_csv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )

    admin_api_key = _env_str("ADMIN_API_KEY", "")
    admin_wallets = [w.upper() for w in _env_csv("ADMIN_WALLETS", "")]

    db_path = _env_str("DB_PATH", "schema/airdrop.db")

    return Settings(
        total_supply_qdoge=total_supply_qdoge,
        community_pct=community_pct,
        portal_pct=portal_pct,
        power_pct=power_pct,
        tradein_pct=tradein_pct,
        registration_amount_qu=registration_amount_qu,
        min_wallet_balance_qu=min_wallet_balance_qu,
        reserve_balance_qu=reserve_balance_qu,
        funding_cap_qu=funding_cap_qu,
        tradein_ratio_qdoge_per_qxmr=tradein_ratio_qdoge_per_qxmr,
        registration_address=registration_address,
        funding_address=funding_address,
        burn_address=burn_address,
        qx_contract_id=qx_contract_id,
        qxmr_issuer_id=qxmr_issuer_id,
        portal_asset_name=portal_asset_name,
        portal_asset_issuer=portal_asset_issuer,
        rpc_base_url=rpc_base_url,
        api_base_url=api_base_url,
        cors_allow_origins=cors_allow_origins,
        admin_api_key=admin_api_key,
        admin_wallets=admin_wallets,
        db_path=db_path,
    )
