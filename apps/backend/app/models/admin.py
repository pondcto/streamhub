from typing import Optional

from pydantic import BaseModel, Field


class AdminChannel(BaseModel):
    contentId: str
    channelTag: Optional[str] = None
    channelNumber: Optional[str] = None
    title: Optional[str] = None
    category: str
    contentType: str
    manifestHint: Optional[str] = None
    liveCdnHost: Optional[str] = None
    liveManifestCdn: Optional[str] = None
    hasManifest: bool
    running: bool
    pid: Optional[int] = None
    hlsUrl: Optional[str] = None
    startedAt: Optional[str] = None
    directHlsUrl: Optional[str] = None
    imageUrl: Optional[str] = None
    profileId: Optional[int] = None
    profileName: Optional[str] = None


class AdminChannelUpdate(BaseModel):
    channelTag: Optional[str] = Field(default=None, min_length=1, max_length=32)
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    manifestHint: Optional[str] = Field(default=None, min_length=1, max_length=2048)
    liveCdnHost: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=64)
    channelNumber: Optional[str] = Field(default=None, max_length=16)
    imageUrl: Optional[str] = Field(default=None, max_length=2048)
    liveManifestCdn: Optional[str] = Field(default=None, max_length=16)


class AdminChannelCreate(BaseModel):
    contentId: str = Field(..., min_length=1, max_length=128)
    channelTag: str = Field(..., min_length=1, max_length=32)
    title: str = Field(..., min_length=1, max_length=255)
    manifestHint: str = Field(..., min_length=1, max_length=2048)
    liveCdnHost: str = Field(..., min_length=1, max_length=255)
    category: str = Field(default="Live", max_length=64)
    channelNumber: Optional[str] = Field(default=None, max_length=16)
    imageUrl: Optional[str] = Field(default=None, max_length=2048)
    directHlsUrl: Optional[str] = Field(default=None, max_length=2048)
    liveManifestCdn: str = Field(default="akamai", max_length=16)


class AdminChannelList(BaseModel):
    channels: list[AdminChannel]


class LogChunk(BaseModel):
    content: str
    offset: int
    running: bool
