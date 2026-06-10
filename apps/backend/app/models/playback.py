from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class WidevineConfig(BaseModel):
    licenseUrl: str


class DrmConfig(BaseModel):
    widevine: WidevineConfig


class PlaybackResponse(BaseModel):
    manifestUrl: str
    drm: DrmConfig
    expiresAt: datetime


class PlaybackRequest(BaseModel):
    contentType: Literal["vod", "live", "streaming"] = "vod"
    channelTag: Optional[str] = None
    manifestHint: Optional[str] = None


class StopPlaybackRequest(BaseModel):
    contentId: Optional[str] = None
    sessionId: Optional[str] = None


class ErrorDetail(BaseModel):
    code: str
    message: str
    detail: Optional[str] = None
