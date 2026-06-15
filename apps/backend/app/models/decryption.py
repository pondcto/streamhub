from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class DecryptionKeysRequest(BaseModel):
    contentId: str = Field(min_length=1)
    manifestUrl: str = Field(min_length=8)
    contentType: Literal["vod", "live", "streaming"] = "vod"
    channelTag: Optional[str] = None


class ContentKey(BaseModel):
    kid: str
    key: str


class DecryptionKeysResponse(BaseModel):
    assetId: str
    drmContentId: str
    manifestUrl: str
    pssh: str
    kid: str
    licenseUrl: str
    sessionExpiresAt: datetime
    streamingFilter: Optional[str] = None
    keys: List[ContentKey]
    joinedKeys: str
