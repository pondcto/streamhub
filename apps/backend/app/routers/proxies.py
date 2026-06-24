"""Admin CRUD for proxy profiles and per-channel profile assignment.

A proxy profile = outbound user-agent + SOCKS/HTTP proxy (host/port/creds).
Admins manage them on the "Profiles" page and assign one to each channel from
the Channel Management table.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import require_admin
from app.db import get_db
from app.models.proxy import (
    ChannelProfileAssign,
    ProxyProfileCreate,
    ProxyProfilePublic,
    ProxyProfileUpdate,
)
from app.models.proxy_profile import ChannelProfile, ProxyProfile
from app.services.test_items import find_test_item

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api/admin",
    tags=["proxies"],
    dependencies=[Depends(require_admin)],
)

VALID_TYPES = {"socks5", "socks5h", "socks4", "http", "https"}


def _to_public(p: ProxyProfile) -> ProxyProfilePublic:
    return ProxyProfilePublic(
        id=p.id,
        name=p.name,
        userAgent=p.user_agent,
        proxyType=p.proxy_type,
        host=p.host,
        port=p.port,
        username=p.username,
        password=p.password,
        createdAt=p.created_at,
    )


def _validate_type(value: str) -> str:
    normalized = (value or "socks5").strip().lower()
    if normalized not in VALID_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_PROXY_TYPE",
                "message": f"Unsupported proxy type '{value}'. Use one of: {', '.join(sorted(VALID_TYPES))}.",
            },
        )
    return normalized


def _validate_port(value: int) -> None:
    if not (0 < value < 65536):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_PORT", "message": f"Port {value} is out of range (1-65535)."},
        )


@router.get("/proxies", response_model=list[ProxyProfilePublic])
async def list_proxies(db: AsyncSession = Depends(get_db)) -> list[ProxyProfilePublic]:
    rows = (
        await db.execute(select(ProxyProfile).order_by(ProxyProfile.created_at.desc()))
    ).scalars().all()
    return [_to_public(p) for p in rows]


@router.post("/proxies", response_model=ProxyProfilePublic, status_code=status.HTTP_201_CREATED)
async def create_proxy(
    body: ProxyProfileCreate, db: AsyncSession = Depends(get_db)
) -> ProxyProfilePublic:
    host = body.host.strip()
    if not host:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "MISSING_HOST", "message": "Host is required."},
        )
    proxy_type = _validate_type(body.proxyType)
    _validate_port(body.port)
    profile = ProxyProfile(
        name=body.name.strip() or f"{host}:{body.port}",
        user_agent=body.userAgent.strip(),
        proxy_type=proxy_type,
        host=host,
        port=body.port,
        username=body.username.strip(),
        password=body.password,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return _to_public(profile)


@router.patch("/proxies/{profile_id}", response_model=ProxyProfilePublic)
async def update_proxy(
    profile_id: int, body: ProxyProfileUpdate, db: AsyncSession = Depends(get_db)
) -> ProxyProfilePublic:
    profile = await db.get(ProxyProfile, profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Proxy profile not found."},
        )
    if body.name is not None:
        profile.name = body.name.strip()
    if body.userAgent is not None:
        profile.user_agent = body.userAgent.strip()
    if body.proxyType is not None:
        profile.proxy_type = _validate_type(body.proxyType)
    if body.host is not None:
        host = body.host.strip()
        if not host:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "MISSING_HOST", "message": "Host cannot be empty."},
            )
        profile.host = host
    if body.port is not None:
        _validate_port(body.port)
        profile.port = body.port
    if body.username is not None:
        profile.username = body.username.strip()
    if body.password is not None:
        profile.password = body.password
    if not profile.name:
        profile.name = f"{profile.host}:{profile.port}"
    await db.commit()
    await db.refresh(profile)
    return _to_public(profile)


@router.delete("/proxies/{profile_id}")
async def delete_proxy(profile_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    profile = await db.get(ProxyProfile, profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Proxy profile not found."},
        )
    # Clear any channel assignments that referenced this profile (SQLite does not
    # enforce ON DELETE CASCADE unless PRAGMA foreign_keys is on).
    assigned = (
        await db.execute(
            select(ChannelProfile).where(ChannelProfile.profile_id == profile_id)
        )
    ).scalars().all()
    for row in assigned:
        await db.delete(row)
    await db.delete(profile)
    await db.commit()
    return {"id": profile_id, "deleted": True}


@router.put("/channels/{content_id}/profile")
async def assign_channel_profile(
    content_id: str, body: ChannelProfileAssign, db: AsyncSession = Depends(get_db)
) -> dict:
    if find_test_item(content_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "UNKNOWN_CHANNEL", "message": f"Unknown channel: {content_id}"},
        )
    existing = await db.get(ChannelProfile, content_id)
    if body.profileId is None:
        # Clear the assignment.
        if existing is not None:
            await db.delete(existing)
            await db.commit()
        return {"contentId": content_id, "profileId": None}

    profile = await db.get(ProxyProfile, body.profileId)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Proxy profile not found."},
        )
    if existing is None:
        db.add(ChannelProfile(content_id=content_id, profile_id=body.profileId))
    else:
        existing.profile_id = body.profileId
    await db.commit()
    return {"contentId": content_id, "profileId": body.profileId}
