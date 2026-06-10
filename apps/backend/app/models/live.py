from typing import List, Optional

from pydantic import BaseModel


class LiveChannel(BaseModel):
    id: str
    channelId: Optional[str] = None
    channelTag: Optional[str] = None
    manifestHint: Optional[str] = None
    title: str
    image: Optional[str] = None
    currentEvent: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    duration: Optional[str] = None
    category: Optional[str] = None


class LiveChannelsResponse(BaseModel):
    items: List[LiveChannel]
