

def csv_safe(value: str) -> str:
    """Stop spreadsheets from running text as a formula (CSV injection).
    Applies to free text only, never to amounts."""
    if value and value[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


