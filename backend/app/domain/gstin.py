import re

CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_PATTERN = re.compile(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]")

STATE_CODES: dict[str, str] = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman & Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
    "99": "OIDAR / Centre Jurisdiction",
}


class InvalidGSTIN(ValueError):
    pass


def checksum_char(first_14: str) -> str:
    """Check character for the first 14 characters (weights alternate 1, 2)."""
    if len(first_14) != 14:
        raise ValueError("Expected 14 characters")
    total = 0
    for index, char in enumerate(first_14):
        product = CHARSET.index(char) * (1 if index % 2 == 0 else 2)
        total += product // 36 + product % 36
    return CHARSET[(36 - total % 36) % 36]


def validate_gstin(raw: str) -> str:
    """Return the normalised GSTIN, or raise InvalidGSTIN."""
    gstin = raw.strip().upper()
    if not _PATTERN.fullmatch(gstin):
        raise InvalidGSTIN("Invalid GSTIN format")
    if gstin[:2] not in STATE_CODES:
        raise InvalidGSTIN("Unknown state code")
    if checksum_char(gstin[:14]) != gstin[14]:
        raise InvalidGSTIN("Invalid GSTIN checksum")
    return gstin


def state_code(gstin: str) -> str:
    return validate_gstin(gstin)[:2]
