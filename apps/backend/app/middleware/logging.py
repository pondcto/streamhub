import logging
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.utils.redact import redact_sensitive

logger = logging.getLogger(__name__)


class RedactingAccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        log_line = f'{request.client.host if request.client else "unknown"} - "{request.method} {request.url.path}" {response.status_code}'
        logger.info(redact_sensitive(log_line))
        return response
