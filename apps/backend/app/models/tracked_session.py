from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.models.auth import SessionInfo


class TrackedSessionRequest(BaseModel):
    authorization: Optional[str] = None
    profile_id: Optional[str] = None
    waf_token: Optional[str] = None
    catalog_cookie: Optional[str] = None
    irdeto_session_jwt: Optional[str] = None
    captured_at: Optional[datetime] = None
    source_url: Optional[str] = Field(default=None, max_length=2048)
    request_url: Optional[str] = Field(default=None, max_length=2048)
    channel_tag: Optional[str] = None
    live_manifest_url: Optional[str] = Field(default=None, max_length=4096)


class TestKeyRefreshStatus(BaseModel):
    item_id: str
    title: Optional[str] = None
    status: Literal["ok", "error", "skipped", "missing", "expired"]
    message: Optional[str] = None
    manifest_url: Optional[str] = None
    license_url: Optional[str] = None
    kid: Optional[str] = None
    decryption_key: Optional[str] = None
    generated_at: Optional[datetime] = None


class TrackedSessionResponse(BaseModel):
    session: SessionInfo
    test_keys: List[TestKeyRefreshStatus] = Field(default_factory=list)
    keys_updated_at: Optional[datetime] = None


class TestKeysStatusResponse(BaseModel):
    session: Optional[SessionInfo] = None
    keys_updated_at: Optional[datetime] = None
    test_keys: List[TestKeyRefreshStatus] = Field(default_factory=list)
