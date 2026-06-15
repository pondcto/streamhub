from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class CatalogLink(BaseModel):
    rel: List[str] = Field(default_factory=list)
    method: str = "GET"
    href: str


class CatalogCard(BaseModel):
    id: str
    title: str
    type: str
    description: Optional[str] = None
    image: Optional[str] = None
    category: str
    duration: Optional[str] = None
    channel_tag: Optional[str] = None
    channel_number: Optional[str] = None
    is_live: bool = False
    manifest_hint: Optional[str] = None
    stack_id: Optional[str] = None
    program_id: Optional[str] = None
    season_id: Optional[str] = None
    links: List[CatalogLink] = Field(default_factory=list)


class CatalogRail(BaseModel):
    id: str
    title: str
    layout: Literal["hero", "landscape", "portrait", "category"] = "landscape"
    items: List[CatalogCard] = Field(default_factory=list)


class CatalogPageResponse(BaseModel):
    section: str
    rails: List[CatalogRail] = Field(default_factory=list)
    source: str = "catalog"
    notice: Optional[str] = None


class SeasonVideoCard(BaseModel):
    id: str
    title: str
    synopsis: Optional[str] = None
    duration: Optional[str] = None
    image: Optional[str] = None
    manifest_hint: Optional[str] = None
    content_type: str = "streaming"


class SeasonDetailResponse(BaseModel):
    id: str
    title: str
    synopsis: Optional[str] = None
    image: Optional[str] = None
    channel_name: Optional[str] = None
    channel_tag: Optional[str] = None
    genre: Optional[str] = None
    stack_id: str
    program_id: str
    videos: List[SeasonVideoCard] = Field(default_factory=list)


class CatalogResponse(BaseModel):
    section: str
    items: List[CatalogCard]
    source: str = "catalog"
    notice: Optional[str] = None
