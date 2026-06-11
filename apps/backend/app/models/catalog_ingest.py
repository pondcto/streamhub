from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


CatalogIngestSection = Literal["sport", "home", "movies", "tvshows", "kids"]


class CatalogIngestRequest(BaseModel):
    section: CatalogIngestSection = "sport"
    response_body: Dict[str, Any]
    captured_at: Optional[datetime] = None
    request_url: Optional[str] = Field(default=None, max_length=2048)
