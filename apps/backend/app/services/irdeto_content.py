import re
from typing import List, Optional

STREAMING_CONTENT_ID_RE = re.compile(r"(SS\d+_[A-Z0-9_]+)", re.IGNORECASE)


def extract_content_id_from_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    match = STREAMING_CONTENT_ID_RE.search(url)
    return match.group(1).upper() if match else None


def license_content_id_candidates(
    *,
    entitlement_content_id: Optional[str],
    manifest_content_id: Optional[str],
    fallback_content_id: Optional[str] = None,
) -> List[str]:
    """Build ordered unique ContentId values for Widevine license requests."""
    candidates: List[str] = []

    def add(value: Optional[str]) -> None:
        if not value:
            return
        normalized = value.strip()
        if not normalized or normalized in candidates:
            return
        candidates.append(normalized)

    def add_variants(value: Optional[str]) -> None:
        if not value:
            return
        normalized = value.strip()
        base = normalized[:-4] if normalized.lower().endswith("_ext") else normalized
        add(base)
        if not base.lower().endswith("_ext"):
            add(f"{base}_ext")

    add_variants(entitlement_content_id)
    add_variants(manifest_content_id)
    add_variants(fallback_content_id)
    return candidates
