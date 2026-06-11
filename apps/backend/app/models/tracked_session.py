from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TrackedSessionRequest(BaseModel):
    authorization: Optional[str] = None
    profile_id: Optional[str] = None
    waf_token: Optional[str] = None
    catalog_cookie: Optional[str] = None
    irdeto_session_jwt: Optional[str] = None
    captured_at: Optional[datetime] = None
    source_url: Optional[str] = Field(default=None, max_length=2048)
    request_url: Optional[str] = Field(default=None, max_length=2048)
