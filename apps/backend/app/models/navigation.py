from typing import List, Optional

from pydantic import BaseModel, Field


class NavLink(BaseModel):
    rel: List[str] = Field(default_factory=list)
    method: str = "GET"
    href: str


class NavigationSection(BaseModel):
    id: str
    title: str
    slug: str
    visible: bool = True
    endpoint: Optional[str] = None


class NavigationResponse(BaseModel):
    sections: List[NavigationSection]
