from typing import Optional

from pydantic import BaseModel


class AdminChannel(BaseModel):
    contentId: str
    channelTag: Optional[str] = None
    title: Optional[str] = None
    category: str
    contentType: str
    hasManifest: bool
    running: bool
    pid: Optional[int] = None
    hlsUrl: Optional[str] = None
    startedAt: Optional[str] = None
    directHlsUrl: Optional[str] = None


class AdminChannelList(BaseModel):
    channels: list[AdminChannel]


class LogChunk(BaseModel):
    content: str
    offset: int
    running: bool
