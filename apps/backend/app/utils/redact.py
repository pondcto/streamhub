import re
from typing import Any

SENSITIVE_PATTERNS = [
    (re.compile(r"(ls_session=)[^&\s\"']+", re.IGNORECASE), r"\1[REDACTED]"),
    (re.compile(r"(Authorization:\s*Bearer\s+)[^\s\"']+", re.IGNORECASE), r"\1[REDACTED]"),
    (re.compile(r"(\"access_token\"\s*:\s*\")[^\"]+", re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r"(\"refresh_token\"\s*:\s*\")[^\"]+", re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r"(\"session_token\"\s*:\s*\")[^\"]+", re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r"(Bearer\s+)[A-Za-z0-9\-_\.]+", re.IGNORECASE), r"\1[REDACTED]"),
    (re.compile(r"(eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)"), "[REDACTED_JWT]"),
]


def redact_sensitive(text: str) -> str:
    result = text
    for pattern, replacement in SENSITIVE_PATTERNS:
        result = pattern.sub(replacement, result)
    return result


def redact_dict(data: Any) -> Any:
    if isinstance(data, dict):
        return {k: redact_dict(v) for k, v in data.items()}
    if isinstance(data, list):
        return [redact_dict(item) for item in data]
    if isinstance(data, str):
        return redact_sensitive(data)
    return data
