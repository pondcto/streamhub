import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.middleware.logging import RedactingAccessLogMiddleware
from app.routers import (
    auth_router,
    catalog,
    catalog_ingest,
    decryption,
    entitlement_ingest,
    health,
    live,
    navigation,
    playback,
    test_videos,
    tracked_session,
)
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
    initialize_session()
    logger.info("StreamHub backend started")
    yield
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
    app.include_router(live.router)
    app.include_router(playback.router)
    app.include_router(decryption.router)
    app.include_router(auth_router.router)
    app.include_router(tracked_session.router)
    app.include_router(catalog_ingest.router)
    app.include_router(entitlement_ingest.router)

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
