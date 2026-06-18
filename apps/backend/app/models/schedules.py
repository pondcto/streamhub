from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ScheduleCreate(BaseModel):
    contentId: str
    startTime: str  # "HH:MM"
    endTime: str
    daysOfWeek: str = "*"
    enabled: bool = True


class ScheduleUpdate(BaseModel):
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    daysOfWeek: Optional[str] = None
    enabled: Optional[bool] = None


class SchedulePublic(BaseModel):
    id: int
    contentId: str
    startTime: str
    endTime: str
    daysOfWeek: str
    enabled: bool
    createdAt: datetime
