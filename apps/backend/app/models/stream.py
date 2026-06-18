from typing import Optional

from pydantic import BaseModel


class StartStreamRequest(BaseModel):
    contentId: str
    manifestUrl: str
    contentType: str = "live"
    channelTag: Optional[str] = None
    deviceId: Optional[str] = None


class StopStreamRequest(BaseModel):
    contentId: str


class StreamInfo(BaseModel):
    contentId: str
    channelTag: Optional[str] = None
    pid: int
    status: str  # "playing" | "starting"
    hlsUrl: str
    startedAt: str


class StreamListResponse(BaseModel):
    running: list[StreamInfo]
