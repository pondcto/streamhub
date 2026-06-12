from pathlib import Path
from typing import List

import httpx
from pywidevine.cdm import Cdm
from pywidevine.device import Device
from pywidevine.pssh import PSSH

from app.config import Settings
from app.utils.http_client import browser_request_headers, httpx_sync_client


class WidevineKeyError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def resolve_device_path(settings: Settings) -> Path:
    raw = settings.widevine_device_path.strip()
    if not raw:
        raise WidevineKeyError(
            "Widevine device path is not configured (WIDEVINE_DEVICE_PATH).",
            status_code=500,
        )

    path = Path(raw)
    if not path.is_absolute():
        backend_root = Path(__file__).resolve().parents[2]
        path = (backend_root / raw).resolve()

    if not path.exists():
        raise WidevineKeyError(
            f"Widevine device file not found: {path}",
            status_code=500,
        )
    return path


def generate_widevine_keys(
    *,
    settings: Settings,
    pssh_b64: str,
    license_url: str,
) -> List[dict]:
    if not pssh_b64:
        raise WidevineKeyError("Manifest did not contain a Widevine PSSH.", status_code=502)

    device_path = resolve_device_path(settings)
    device = Device.load(str(device_path))
    cdm = Cdm.from_device(device)
    session_id = cdm.open()

    try:
        challenge = cdm.get_license_challenge(session_id, PSSH(pssh_b64))

        with httpx_sync_client(settings, log_label="license") as client:
            response = client.post(
                license_url,
                content=challenge,
                headers=browser_request_headers(settings),
            )

        if response.status_code >= 400:
            raise WidevineKeyError(
                f"License server rejected challenge ({response.status_code}).",
                status_code=response.status_code,
            )

        cdm.parse_license(session_id, response.content)
        keys = [
            {"kid": key.kid.hex, "key": key.key.hex()}
            for key in cdm.get_keys(session_id)
            if key.type == "CONTENT"
        ]
        if not keys:
            raise WidevineKeyError(
                "License response did not contain any CONTENT keys.",
                status_code=502,
            )
        return keys
    finally:
        cdm.close(session_id)
