from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UserPublic(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None


class SessionData(BaseModel):
    user_id: str
    email: str
    display_name: Optional[str] = None
    dstv_access_token: Optional[str] = None
    dstv_token_expires_at: Optional[datetime] = None
    created_at: datetime


class SessionSetRequest(BaseModel):
    token: Optional[str] = None
    catalog_token: Optional[str] = None
    catalog_cookie: Optional[str] = None
    profile_id: Optional[str] = None
    waf_token: Optional[str] = None
    irdeto_session: Optional[str] = None


class SessionInfo(BaseModel):
    issuer: Optional[str] = None
    subject: Optional[str] = None
    token_id: Optional[str] = None
    account_id: Optional[str] = None
    issued_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    remaining_seconds: int = 0
    entitlement: List[Dict[str, Any]] = Field(default_factory=list)
    device_type: Optional[str] = None
    active: bool = False
    catalog_auth_configured: bool = False
    catalog_auth_ready: bool = False
    catalog_auth_issue: Optional[str] = None
    profile_id_configured: bool = False
    waf_token_configured: bool = False
    irdeto_session_configured: bool = False
    irdeto_session_remaining_seconds: int = 0
    irdeto_session_expires_at: Optional[datetime] = None
    # Saved admin form values (local admin UI only).
    connect_token: Optional[str] = None
    profile_id: Optional[str] = None
    waf_token: Optional[str] = None
    catalog_cookie: Optional[str] = None
    irdeto_session: Optional[str] = None
    tracked_captured_at: Optional[datetime] = None
    tracked_source_url: Optional[str] = None
    tracked_request_url: Optional[str] = None
