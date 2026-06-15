from functools import lru_cache
from typing import List, Optional
from urllib.parse import quote

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    dstv_api_base_url: str = "https://dstv.stream"
    dstv_license_base_url: str = "https://licensev2.dstv.com"
    dstv_live_gtm_base_url: str = "https://i-live-gtm.dstv.com"
    dstv_live_cdn_base_url: str = "https://i-live-cache.akamaized.net"
    dstv_live_cdn_alt_base_url: str = "https://r-live-cache.akamaized.net"
    dstv_platform_id: str = "32faad53-5e7b-4cc0-9f33-000092e85950"
    dstv_country_code: str = "ZA"
    dstv_package_id: str = "PREMIUM"
    dstv_crm_id: str = "afl"
    dstv_account_id: str = "afl"
    dstv_client_ip: str = ""
    # Spoofing X-Forwarded-For breaks DStv Connect JWT verification on catalog APIs.
    dstv_send_client_ip_headers: bool = False

    backend_cors_origins: str = "http://localhost:3000,http://34.35.143.27:3000"
    backend_secret_key: str = "dev-secret-change-in-production"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    cache_ttl_navigation: int = 300
    cache_ttl_catalog: int = 120

    database_url: str = "sqlite+aiosqlite:///./streamhub.db"

    dstv_connect_token: str = ""
    dstv_cookie: str = ""
    dstv_profile_id: str = ""
    dstv_waf_token: str = ""

    dstv_proxy_type: str = "socks5"
    dstv_proxy_host: str = ""
    dstv_proxy_port: int = 0
    dstv_proxy_username: str = ""
    dstv_proxy_password: str = ""

    widevine_device_path: str = "../device/google_aosp_on_ia_emulator_14.0.0_b2d6507a_4464_l3.wvd"

    @property
    def dstv_proxy_url(self) -> Optional[str]:
        host = self.dstv_proxy_host.strip()
        if not host or self.dstv_proxy_port <= 0:
            return None
        scheme = (self.dstv_proxy_type or "socks5").strip().lower()
        username = self.dstv_proxy_username.strip()
        if username:
            user = quote(username, safe="")
            password = quote(self.dstv_proxy_password, safe="")
            auth = f"{user}:{password}@"
        else:
            auth = ""
        return f"{scheme}://{auth}{host}:{self.dstv_proxy_port}"

    @property
    def dstv_proxy_configured(self) -> bool:
        return self.dstv_proxy_url is not None

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.backend_cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
