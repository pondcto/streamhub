from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class TestVideoCard(BaseModel):
    id: str
    title: str
    type: str = "vod"
    category: str = "Test"
    description: Optional[str] = None
    duration: Optional[str] = None
    image: Optional[str] = None
    channel_tag: Optional[str] = None
    channel_number: Optional[str] = None
    manifest_hint: Optional[str] = None
    playable: bool = True
    metadataStatus: Literal["ok", "fallback"] = "ok"


class TestVideosResponse(BaseModel):
    section: str = "Test"
    count: int
    items: List[TestVideoCard] = Field(default_factory=list)
