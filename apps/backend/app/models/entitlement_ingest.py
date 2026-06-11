from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


class EntitlementIngestRequest(BaseModel):
    content_id: str = Field(min_length=1)
    content_type: Literal["vod", "live", "streaming"] = "streaming"
    response_body: Dict[str, Any]
    manifest_url: Optional[str] = Field(default=None, max_length=2048)
    captured_at: Optional[datetime] = None
    request_url: Optional[str] = Field(default=None, max_length=2048)
