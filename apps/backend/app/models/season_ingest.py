from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class SeasonIngestRequest(BaseModel):
    stack_id: str = Field(min_length=1)
    program_id: str = Field(min_length=1)
    season_id: str = Field(min_length=1)
    response_body: Dict[str, Any]
    captured_at: Optional[datetime] = None
    request_url: Optional[str] = Field(default=None, max_length=2048)
