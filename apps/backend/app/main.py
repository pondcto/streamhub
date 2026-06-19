import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.config import get_settings
from app.db import init_db
from app.middleware.logging import RedactingAccessLogMiddleware
from app.routers import (
    accounts,
    admin,
    auth_router,
    catalog,
    decryption,
    health,
    navigation,
    playback,
    schedules,
    stream,
    test_videos,
    tracked_session,
)
from app.services import controller, scheduler
from app.services.accounts import seed_admin
from app.services.auth import initialize_session
from app.services.entitlement import EntitlementError
from app.utils.redact import redact_sensitive

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_admin()
    initialize_session()
    await scheduler.start_scheduler()
    logger.info("StreamHub backend started")
    yield
    scheduler.shutdown_scheduler()
    controller.stop_all()  # terminate any running wv-mpd-streaming processes
    logger.info("StreamHub backend shutting down")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="StreamHub API",
        description="Authorized streaming dashboard backend",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RedactingAccessLogMiddleware)

    app.include_router(health.router)
    app.include_router(navigation.router)
    app.include_router(catalog.router)
    app.include_router(test_videos.router)
    app.include_router(playback.router)
    app.include_router(decryption.router)
    app.include_router(auth_router.router)
    app.include_router(accounts.router)
    app.include_router(stream.router)
    app.include_router(admin.router)
    app.include_router(admin.download_router)
    app.include_router(schedules.router)
    app.include_router(tracked_session.router)

    # Serve the restreamer's HLS output (/tmp/hls/files) at /hls/<contentId>/...
    # Explicit route (not StaticFiles mount) so the full middleware stack —
    # including CORSMiddleware — wraps every request. StaticFiles handles its own
    # OPTIONS responses before CORSMiddleware can intercept them, which breaks
    # CORS preflight for Range-header requests (audio init segments).
    os.makedirs(settings.hls_output_dir, exist_ok=True)
    _hls_base = Path(settings.hls_output_dir).resolve()

    @app.get("/hls/{path:path}")
    async def serve_hls(path: str) -> FileResponse:
        target = (_hls_base / path).resolve()
        if not target.is_relative_to(_hls_base):
            raise HTTPException(status_code=403)
        if not target.is_file():
            raise HTTPException(status_code=404)
        return FileResponse(target)

    @app.exception_handler(EntitlementError)
    async def entitlement_error_handler(request: Request, exc: EntitlementError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": str(exc)},
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception):
        logger.error("Unhandled error: %s", redact_sensitive(str(exc)))
        return JSONResponse(
            status_code=500,
            content={"code": "INTERNAL_ERROR", "message": "An unexpected error occurred."},
        )

    return app


app = create_app()
