import os
import re
from dataclasses import dataclass, field
from functools import lru_cache


# ---------------------------------------------------------------------------
# Power Users (source of truth)
# ---------------------------------------------------------------------------
#
# Put one wallet_id per line in POWER_USERS_TEXT (or set POWER_USERS list below).
# If a wallet_id is in this list, its role is always "power".
#
# NOTE: Qubic identities are typically 60 uppercase A-Z chars (with a 4-char checksum).
# This code also tolerates 66-char uppercase IDs if your infra uses an extended format.
#
POWER_USERS: list[str] = []

POWER_USERS_TEXT: str = """
TRADECQBMAOXBESHFHOGHDMETSOAGOZURDDCOYMBIDQBWKTGVGQKBRICHPKC
QBCVQXRFSXGHZAIJBBCWCPYCJOCDCXMVRPFUZQYXHHPDTACRWDRYWQZENOGD
BFWYBPHCNERJHBBFVDVMQJBXOWSCZGWENFAZEFYFZERRWRMJDVURQJDCOQLB
KQRWTOWQNYKQDDOPXNSQBQEVCVICQQVZFFPCUOIVVCYVQAPUSMPEOMEEFXDA
DBFJMMSTRTWMMCFFWESYENHIRWRCVQLIJSOYICZUSDRRLLNSNMCJUFJGQJJF
ECOJBYGXMVXTRGIFQYKBAHZMOTHCKHTWNVGJSGULGBLLFWPHXSJMLOCFZQXE
LCXMWAQNLIEUSDDCVEITJAVGKGYCJHQSAKGFWOQVRBPLQKSECRMGVSGBOKBB
IRUSHJHMVXBYGESTUIYFPGHZWXRDPANTGVYARDZUIGHKNTICDWTMIBEHFRWN
ZEJCEZSNVRYHPAIWKZGJXTYSBPZCBOCYPSFILITCNAJJLOLELNLETDMAMQHK
UNQPYXRPRONXIGALVPEVRENGGHQAYMVYWIITIYEJOCETBWFGCJLNFTDBYYMD
ZFKOUZZXCKYQSGRONPMWTKUGJNQDKKWMGRTYWTTZADBBSKHUFXOMQXBCHNSG
RVHIFCRJCZLVKBVHIZDIXIESZKMANTFPVCRYTNXFXDGRGOSRRZVSAESFRHWE
RGYLAVQYSZMTPADQVIECIXKHXDZAWWYSCGROUTRWIFDJXMDEYWQJQWOEPGCN
WNKIAQMMEBJBNGOFSOKAQDHSGIQACYPXKENVGGUOEDLRQVGUOJRIFQJENCMI
NMWJMCCJPDTHBCRJGFZCIGZTRYKDAWXWKABAJUGURDBUBGAEVIIEBFRBWATA
RVTAAAGYDGLMCHLKFXMWXWCTSCFDITVABBDJKUHQKGODWYPPEAJPQBOAGRPB
MVLBHJXJIXZOUAAIOKAQZSWLJHMDXDHEHPOIQTJMWBWHOKAUPPJJJYTBAXFJ
HEXCPJUVKPKQYBUDCYTCHAZCPLOARAKJCOCBYZOKLFZVSWMIJJAUGIECAUDL
EYTRXMBHCDWUPCCCHMYYVPCQRNACBAMCLRQOFWLVHCNZAFBXYBWLXZXGMATN
ZJZDXAOYQTNQTDORFYXZQDVVXQJCSFILRTVEUQAZBFGWCKNWTHYNGENFJXJN
NINZOBTZZROKSCBBGIAWEKACCMNATDYLQWYIAVXSIAVNEAMSFVWLSLCAPOFA
VOZIVESECYFKYBCYIAOJOCWDZEQDNPLQEEXAYXMCNDTLJOGWHZRBKTUAJOFI
CXXTMNUELAHPFHHCCHDJMKDTMTGDIZBVSIZYVZZXJGIHQWYEBZLQBHWGLEYM
EQAGGNTPXMTYOENYSWKTMLAHXULATZHBIPJZNRSPPBQKFDEQPBLGQEMERGEC
IRTLNQNNWXQVADBYEMSFHZLHIGCBMJTCSOGRYSWVGHNNQCPOYSJORQVCUPVD
DBFJMMSTRTWMMCFFWESYENHIRWRCVQLIJSOYICZUSDRRLLNSNMCJUFJGQJJF
FTHFVJVMZWFOQEYAZPYSXASIRMXCPEUVCFQKZVTKXEXXLYKSYJRZQQEHGDPN
"""


def _env_str(name: str, default: str = "") -> str:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip()


def _env_int(name: str, default: int) -> int:
    raw = _env_str(name, str(default))
    try:
        return int(raw)
    except Exception:
        return default


def _env_float(name: str, default: float) -> float:
    raw = _env_str(name, str(default))
    try:
        return float(raw)
    except Exception:
        return default


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
    tradein_pct: float  # trade-in allocation (kept for existing trade-in implementation)

    # --- trade-in ---
    # NOTE: trade-in implementation must not be changed; keep its config.
    tradein_ratio_qdoge_per_qxmr: float

    # --- airdrop rules ---
    registration_amount_qu: int  # registration fee in QU
    qubic_cap: int  # max holding amount used in airdrop weight (min(balance, qubic_cap))
    portal_total_supply: int  # used as denominator for portal airdrop (default 500,000)

    # --- on-chain / API integration ---
    registration_address: str
    burn_address: str
    qx_contract_id: str
    qxmr_issuer_id: str
    portal_asset_name: str
    portal_asset_issuer: str
    qearn_asset_name: str

    rpc_base_url: str
    api_base_url: str

    # --- security / ops ---
    cors_allow_origins: list[str] = field(default_factory=list)
    admin_api_key: str = ""
    admin_wallet_id: str = ""

    # --- role config ---
    power_users: set[str] = field(default_factory=set)

    # --- storage ---
    db_path: str = "schema/airdrop.db"

    # ---- derived allocations (QDOGE units) ----
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

    # tokenomics
    total_supply_qdoge = _env_int("TOTAL_QDOGE_SUPPLY", 21_000_000_000)
    community_pct = _env_float("COMMUNITY_PCT", 0.075)
    portal_pct = _env_float("PORTAL_PCT", 0.01)
    power_pct = _env_float("POWER_PCT", 0.04)
    tradein_pct = _env_float("TRADEIN_PCT", 0.025)
    tradein_ratio_qdoge_per_qxmr = _env_float("TRADEIN_RATIO_QDOGE_PER_QXMR", 100.0)

    # airdrop rules
    registration_amount_qu = _env_int("REGISTRATION_AMOUNT_QU", 1_000_000)
    qubic_cap = _env_int("QUBIC_CAP", 20_000_000_000)
    portal_total_supply = _env_int("PORTAL_TOTAL_SUPPLY", 500_000)

    # addresses / contract info
    registration_address = _env_str(
        "REGISTRATION_ADDRESS",
        "QDOGEEESKYPAICECHEAHOXPULEOADTKGEJHAVYPFKHLEWGXXZQUGIGMBUTZE",
    ).upper()

    burn_address = _env_str(
        "BURN_ADDRESS",
        "BURNQCDXPUVMBGCTKXZMLRCQYUWBPZREUCDIPECZOAYKCQNGTIUSDXLDULQL",
    ).upper()

    qx_contract_id = _env_str("QX_CONTRACT_ID", "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARMID").upper()
    qxmr_issuer_id = _env_str("QXMR_ISSUER_ID", "QXMRTKAIIGLUREPIQPCMHCKWSIPDTUYFCFNYXQLTECSUJVYEMMDELBMDOEYB").upper()

    portal_asset_name = _env_str("PORTAL_ASSET_NAME", "PORTAL").upper()
    portal_asset_issuer = _env_str("PORTAL_ASSET_ISSUER", "IQUGNVFDQSLTXFJSIOPPNPZINSCDQTJVJWGRPWRTFFXMXSJIAASXOBFFBERK").upper()
    qearn_asset_name = _env_str("QEARN_ASSET_NAME", "QEARN").upper()
    qearn_asset_issuer = _env_str("QEARN_ASSET_ISSUER", "JAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVKHO").upper()

    rpc_base_url = _env_str("RPC_BASE_URL", "https://rpc.qubic.org").rstrip("/")
    api_base_url = _env_str("API_BASE_URL", "https://dev01.qubic.org").rstrip("/")

    cors_allow_origins = _env_csv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )

    admin_api_key = _env_str("ADMIN_API_KEY", "access_admin_api_key")
    admin_wallet_raw = _env_str(
        "ADMIN_WALLET_ID",
        "KZFJRTYKJXVNPAYXQXUKMPKAHWWBWVWGLSFMEFOKPFJFWEDDXMCZVSPEOOZE, ILNJXVHAUXDGGBTTUOITOQGPAYUCFTNCPXDKOCPUOCDOTPUWXBIGRVQDLIKC, QDOGEEESKYPAICECHEAHOXPULEOADTKGEJHAVYPFKHLEWGXXZQUGIGMBUTZE, QXMRTKAIIGLUREPIQPCMHCKWSIPDTUYFCFNYXQLTECSUJVYEMMDELBMDOEYB",
    )

    # power users from config.py
    from app.core.qubic import normalize_identity

    admin_wallet_id = ""
    raw_candidates = [admin_wallet_raw]
    if any(sep in admin_wallet_raw for sep in {",", " "}):
        parts = re.split(r"[,\s]+", admin_wallet_raw)
        raw_candidates = [part for part in (p.strip() for p in parts) if part]
    for candidate in raw_candidates:
        try:
            admin_wallet_id = normalize_identity(candidate)
            break
        except Exception:
            continue
    if not admin_wallet_id:
        admin_wallet_id = admin_wallet_raw.strip().upper()

    power_users: set[str] = set()
    if POWER_USERS:
        raw_ids = POWER_USERS
    else:
        lines = [ln.strip() for ln in POWER_USERS_TEXT.splitlines()]
        raw_ids = [ln for ln in lines if ln and not ln.startswith("#")]

    for raw in raw_ids:
        try:
            power_users.add(normalize_identity(str(raw)))
        except Exception:
            # ignore malformed entries to avoid crashing prod
            continue

    db_path = _env_str("DB_PATH", "schema/airdrop.db")

    return Settings(
        total_supply_qdoge=total_supply_qdoge,
        community_pct=community_pct,
        portal_pct=portal_pct,
        power_pct=power_pct,
        tradein_pct=tradein_pct,
        tradein_ratio_qdoge_per_qxmr=tradein_ratio_qdoge_per_qxmr,
        registration_amount_qu=registration_amount_qu,
        qubic_cap=qubic_cap,
        portal_total_supply=portal_total_supply,
        registration_address=registration_address,
        burn_address=burn_address,
        qx_contract_id=qx_contract_id,
        qxmr_issuer_id=qxmr_issuer_id,
        portal_asset_name=portal_asset_name,
        portal_asset_issuer=portal_asset_issuer,
        qearn_asset_name=qearn_asset_name,
        rpc_base_url=rpc_base_url,
        api_base_url=api_base_url,
        cors_allow_origins=cors_allow_origins,
        admin_api_key=admin_api_key,
        admin_wallet_id=admin_wallet_id,
        power_users=power_users,
        db_path=db_path,
    )
