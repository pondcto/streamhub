"""Admin CRUD for playback schedules. Each change rebuilds the cron jobs."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import require_admin
from app.db import get_db
from app.models.schedule import Schedule
from app.models.schedules import ScheduleCreate, SchedulePublic, ScheduleUpdate
from app.services import scheduler
from app.services.channel_registry import find_test_item

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api/admin/schedules",
    tags=["schedules"],
    dependencies=[Depends(require_admin)],
)


def _to_public(s: Schedule) -> SchedulePublic:
    return SchedulePublic(
        id=s.id,
        contentId=s.content_id,
        startTime=s.start_time,
        endTime=s.end_time,
        daysOfWeek=s.days_of_week,
        enabled=s.enabled,
        createdAt=s.created_at,
    )


def _validate_time(value: str) -> None:
    try:
        hour, minute = value.split(":")
        if not (0 <= int(hour) < 24 and 0 <= int(minute) < 60):
            raise ValueError
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_TIME", "message": f"Invalid time '{value}' (expected HH:MM)."},
        )


@router.get("", response_model=list[SchedulePublic])
async def list_schedules(db: AsyncSession = Depends(get_db)) -> list[SchedulePublic]:
    rows = (
        await db.execute(select(Schedule).order_by(Schedule.content_id, Schedule.start_time))
    ).scalars().all()
    return [_to_public(s) for s in rows]


@router.post("", response_model=SchedulePublic, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    body: ScheduleCreate, db: AsyncSession = Depends(get_db)
) -> SchedulePublic:
    if find_test_item(body.contentId) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "UNKNOWN_CHANNEL", "message": f"Unknown channel: {body.contentId}"},
        )
    _validate_time(body.startTime)
    _validate_time(body.endTime)
    schedule = Schedule(
        content_id=body.contentId,
        start_time=body.startTime,
        end_time=body.endTime,
        days_of_week=body.daysOfWeek or "*",
        enabled=body.enabled,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    await scheduler.reload_jobs()
    return _to_public(schedule)


@router.patch("/{schedule_id}", response_model=SchedulePublic)
async def update_schedule(
    schedule_id: int, body: ScheduleUpdate, db: AsyncSession = Depends(get_db)
) -> SchedulePublic:
    schedule = await db.get(Schedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Schedule not found."})
    if body.startTime is not None:
        _validate_time(body.startTime)
        schedule.start_time = body.startTime
    if body.endTime is not None:
        _validate_time(body.endTime)
        schedule.end_time = body.endTime
    if body.daysOfWeek is not None:
        schedule.days_of_week = body.daysOfWeek or "*"
    if body.enabled is not None:
        schedule.enabled = body.enabled
    await db.commit()
    await db.refresh(schedule)
    await scheduler.reload_jobs()
    return _to_public(schedule)


@router.delete("/{schedule_id}")
async def delete_schedule(schedule_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    schedule = await db.get(Schedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Schedule not found."})
    await db.delete(schedule)
    await db.commit()
    await scheduler.reload_jobs()
    return {"id": schedule_id, "deleted": True}
