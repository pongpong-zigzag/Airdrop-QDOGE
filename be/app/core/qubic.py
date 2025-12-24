import re


_ID_RE = re.compile(r"^[A-Z]{60}$")


def normalize_identity(identity: str) -> str:
    if identity is None:
        raise ValueError("identity is required")
    val = identity.strip().upper()
    if not _ID_RE.match(val):
        raise ValueError("invalid identity format")
    return val


def identity_to_public_key_bytes(identity: str) -> bytes:
    """Decode Qubic identity string to its 32-byte public key.

    This implementation intentionally ignores the trailing 4-char checksum and
    simply decodes the first 56 chars (4 chunks * 14 base-26 digits) into 32 bytes.

    That is sufficient for comparing IDs inside payloads.
    """
    val = normalize_identity(identity)
    core = val[:56]
    out = bytearray()
    for i in range(4):
        chunk = core[i * 14 : (i + 1) * 14]
        n = 0
        mul = 1
        for ch in chunk:
            digit = ord(ch) - 65
            if digit < 0 or digit > 25:
                raise ValueError("invalid base26 digit")
            n += digit * mul
            mul *= 26
        out += int(n).to_bytes(8, byteorder="little", signed=False)
    return bytes(out)


def asset_name_value(asset: str) -> int:
    """Python equivalent of FE's valueOfAssetName() (little-endian int64)."""
    name = asset.strip().upper()
    if not name or len(name) > 8:
        raise ValueError("asset name must be 1..8 chars")
    raw = name.encode("utf-8")
    b = raw + b"\x00" * (8 - len(raw))
    return int.from_bytes(b, byteorder="little", signed=True)
