from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProxyProfileCreate(BaseModel):
    name: str = ""
    userAgent: str = ""
    proxyType: str = "socks5"
    host: str
    port: int
    username: str = ""
    password: str = ""


class ProxyProfileUpdate(BaseModel):
    name: Optional[str] = None
    userAgent: Optional[str] = None
    proxyType: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None


class ProxyProfilePublic(BaseModel):
    id: int
    name: str
    userAgent: str
    proxyType: str
    host: str
    port: int
    username: str
    password: str
    createdAt: datetime


class ChannelProfileAssign(BaseModel):
    # null clears the assignment.
    profileId: Optional[int] = None
