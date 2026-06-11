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

    add(entitlement_content_id)
    add(manifest_content_id)
    if manifest_content_id and not manifest_content_id.endswith("_ext"):
        add(f"{manifest_content_id}_ext")
    if entitlement_content_id and not entitlement_content_id.endswith("_ext"):
        add(f"{entitlement_content_id}_ext")
    add(fallback_content_id)
    return candidates
