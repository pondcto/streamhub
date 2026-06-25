"""APScheduler-driven auto start/stop for channel restreams.

The DB `schedules` table is the source of truth; on startup and after any CRUD
change we rebuild the in-memory cron jobs. Each schedule yields a start job (at
start_time) and a stop job (at end_time) on the given days_of_week.
"""

import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models.schedule import Schedule
from app.services import controller
from app.services.auth import get_stored_live_manifest_url
from app.services.channel_registry import find_test_item

logger = logging.getLogger(__name__)

_scheduler: Optional[AsyncIOScheduler] = None


def _tz() -> str:
    # APScheduler accepts an IANA timezone *string* in all 3.x versions (it
    # converts via pytz). Passing a zoneinfo.ZoneInfo object crashes on
    # APScheduler < 3.11 ("Only timezones from the pytz library are supported").
    return get_settings().scheduler_timezone or "UTC"


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone=_tz())
    return _scheduler


def _parse_hhmm(value: str) -> tuple[int, int]:
    hour, minute = value.strip().split(":")
    return int(hour), int(minute)


async def _fire_start(content_id: str) -> None:
    spec = find_test_item(content_id)
    if spec is None:
        logger.warning("Scheduled start: unknown channel %s", content_id)
        return
    manifest = get_stored_live_manifest_url(spec.channel_tag) if spec.channel_tag else None
    if not manifest:
        logger.warning("Scheduled start: no captured manifest for %s — skipping.", content_id)
        return
    try:
        await controller.start_channel(
            content_id=spec.id,
            manifest_url=manifest,
            content_type=spec.content_type,
            channel_tag=spec.channel_tag,
        )
        logger.info("Scheduled start fired for %s", content_id)
    except Exception as exc:  # noqa: BLE001 - never let a job crash the scheduler
        logger.error("Scheduled start failed for %s: %s", content_id, exc)


async def _fire_stop(content_id: str) -> None:
    controller.stop_channel(content_id)
    logger.info("Scheduled stop fired for %s", content_id)


def _register(schedule: Schedule) -> None:
    sched = get_scheduler()
    sh, sm = _parse_hhmm(schedule.start_time)
    eh, em = _parse_hhmm(schedule.end_time)
    dow = schedule.days_of_week or "*"
    sched.add_job(
        _fire_start,
        CronTrigger(day_of_week=dow, hour=sh, minute=sm, timezone=_tz()),
        args=[schedule.content_id],
        id=f"start-{schedule.id}",
        replace_existing=True,
        misfire_grace_time=300,
    )
    sched.add_job(
        _fire_stop,
        CronTrigger(day_of_week=dow, hour=eh, minute=em, timezone=_tz()),
        args=[schedule.content_id],
        id=f"stop-{schedule.id}",
        replace_existing=True,
        misfire_grace_time=300,
    )


async def reload_jobs() -> None:
    sched = get_scheduler()
    sched.remove_all_jobs()
    async with SessionLocal() as db:
        rows = (
            await db.execute(select(Schedule).where(Schedule.enabled.is_(True)))
        ).scalars().all()
        for schedule in rows:
            try:
                _register(schedule)
            except Exception as exc:  # noqa: BLE001
                logger.error("Failed to register schedule %s: %s", schedule.id, exc)
    logger.info("Scheduler: %d enabled schedule(s) registered", len(sched.get_jobs()) // 2)


async def start_scheduler() -> None:
    sched = get_scheduler()
    if not sched.running:
        sched.start()
    await reload_jobs()


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
