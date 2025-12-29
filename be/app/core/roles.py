from __future__ import annotations

from typing import Iterable, Tuple, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from app.core.config import Settings

ROLE_ORDER: Tuple[str, ...] = ("admin", "power", "portal", "community")


def normalize_roles(raw_roles: Iterable[str] | None) -> tuple[str, ...]:
    """Return a normalized, de-duplicated, deterministic role tuple."""
    seen: list[str] = []
    for role in raw_roles or []:
        value = str(role or "").strip().lower()
        if not value or value in seen:
            continue
        seen.append(value)
    if "admin" in seen:
        return ("admin",)
    ordered = tuple(r for r in ROLE_ORDER if r in seen)
    extras = tuple(sorted(r for r in seen if r not in ROLE_ORDER))
    out = ordered + extras
    return out if out else ("community",)


def parse_roles(value: str | None) -> tuple[str, ...]:
    if value is None or str(value).strip() == "":
        return ("community",)
    parts = (part.strip() for part in str(value).split(","))
    return normalize_roles(parts)


def format_roles(roles: Iterable[str] | None) -> str:
    return ",".join(normalize_roles(roles))


def resolve_roles(*, wallet_id: str, settings: "Settings", portal_bal: int) -> tuple[str, ...]:
    """Resolve a wallet role set based on balances and static config."""
    if getattr(settings, "admin_wallet_id", "") and wallet_id == settings.admin_wallet_id:
        return ("admin",)
    roles: list[str] = ["community"]
    if int(portal_bal) > 0:
        roles.append("portal")
    if wallet_id in settings.power_users:
        roles.append("power")
    return normalize_roles(roles)

