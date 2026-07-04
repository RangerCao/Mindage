"""
Production observability for LightRAG API server.

Provides three complementary features, all opt-in via environment variables:

1. **Prometheus metrics** (`LIGHTRAG_METRICS_ENABLED=true`)
   - ``/metrics`` endpoint exposing Prometheus text format.
   - HTTP request duration histogram, request counter, in-progress gauge.
   - Pipeline busy / active gauges pulled from shared storage.

2. **Request tracing** (`LIGHTRAG_REQUEST_TRACING_ENABLED=true`)
   - Middleware that generates (or propagates) a ``X-Request-ID`` header.
   - Injects the ID into response headers and logging context.
   - Logs request method, path, status code, and duration at INFO level.

3. **Structured JSON logging** (`LIGHTRAG_LOG_FORMAT=json`)
   - Replaces the default human-readable formatter with one-json-object-per-line.
   - Includes timestamp, level, logger name, message, and any extra fields.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ---------------------------------------------------------------------------
# Optional Prometheus client — imported lazily so the dependency is not required
# ---------------------------------------------------------------------------

_PROMETHEUS_AVAILABLE = False
try:
    from prometheus_client import (
        Counter,
        Gauge,
        Histogram,
        generate_latest,
        CONTENT_TYPE_LATEST,
    )

    _PROMETHEUS_AVAILABLE = True
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Metrics registry — created only when prometheus_client is installed
# ---------------------------------------------------------------------------

_http_request_duration: Histogram | None = None
_http_requests_total: Counter | None = None
_http_requests_in_progress: Gauge | None = None
_pipeline_busy_gauge: Gauge | None = None
_pipeline_active_gauge: Gauge | None = None


def _ensure_metrics() -> None:
    """Initialise Prometheus metric objects (idempotent)."""
    global _http_request_duration, _http_requests_total
    global _http_requests_in_progress, _pipeline_busy_gauge, _pipeline_active_gauge

    if not _PROMETHEUS_AVAILABLE or _http_request_duration is not None:
        return

    _http_request_duration = Histogram(
        "lightrag_http_request_duration_seconds",
        "HTTP request duration in seconds",
        labelnames=["method", "endpoint", "status"],
        buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0),
    )
    _http_requests_total = Counter(
        "lightrag_http_requests_total",
        "Total HTTP requests",
        labelnames=["method", "endpoint", "status"],
    )
    _http_requests_in_progress = Gauge(
        "lightrag_http_requests_in_progress",
        "Number of HTTP requests currently being processed",
    )
    _pipeline_busy_gauge = Gauge(
        "lightrag_pipeline_busy",
        "Whether the document processing pipeline is busy (1) or idle (0)",
    )
    _pipeline_active_gauge = Gauge(
        "lightrag_pipeline_active",
        "Whether the document processing pipeline has active workers (1) or not (0)",
    )


def update_pipeline_gauges(busy: bool, active: bool) -> None:
    """Update pipeline gauges from the health-check loop."""
    _ensure_metrics()
    if _pipeline_busy_gauge is not None:
        _pipeline_busy_gauge.set(1 if busy else 0)
    if _pipeline_active_gauge is not None:
        _pipeline_active_gauge.set(1 if active else 0)


def generate_metrics() -> tuple[bytes, str]:
    """Return the current Prometheus metrics payload and its content type."""
    _ensure_metrics()
    if not _PROMETHEUS_AVAILABLE:
        return b"# prometheus_client not installed\n", "text/plain"
    return generate_latest(), CONTENT_TYPE_LATEST


# ---------------------------------------------------------------------------
# Request tracing & metrics middleware
# ---------------------------------------------------------------------------

def _normalise_path(path: str) -> str:
    """Collapse path-parameter segments into placeholders for metric labels."""
    import re
    # /documents/abc123 → /documents/{id}
    # /users/bob/role   → /users/{name}/role
    parts = path.strip("/").split("/")
    normalised = []
    for i, part in enumerate(parts):
        # Heuristic: UUIDs, hex strings, or known dynamic segments
        if re.match(r"^[0-9a-f]{8,}$", part) or (
            i > 0 and part not in {"role", "password", "me", "paginated", "scan", "clear", "stream"}
            and not part.startswith("documents") and not part.startswith("api")
        ):
            normalised.append("{id}")
        else:
            normalised.append(part)
    return "/" + "/".join(normalised)


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """
    Combined middleware for request tracing and Prometheus metrics.

    - Generates / propagates ``X-Request-ID``.
    - Records request duration and count for Prometheus.
    - Logs each request with method, path, status, and duration.
    """

    def __init__(
        self,
        app,  # type: ignore[no-untyped-def]
        *,
        tracing_enabled: bool = False,
        metrics_enabled: bool = False,
    ) -> None:
        super().__init__(app)
        self.tracing_enabled = tracing_enabled
        self.metrics_enabled = metrics_enabled
        if metrics_enabled:
            _ensure_metrics()

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # --- Request ID ---------------------------------------------------
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        # Store on request state so route handlers can access it
        request.state.request_id = request_id

        # Add request_id to logging context via a filter
        log_context = {"request_id": request_id}

        # --- Metrics: track in-progress -----------------------------------
        if self.metrics_enabled and _http_requests_in_progress is not None:
            _http_requests_in_progress.inc()

        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            # Echo request ID back to client
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception:
            status_code = 500
            raise
        finally:
            duration = time.perf_counter() - start
            endpoint = _normalise_path(request.url.path)
            method = request.method

            # --- Prometheus recording -------------------------------------
            if self.metrics_enabled:
                if _http_requests_in_progress is not None:
                    _http_requests_in_progress.dec()
                if _http_request_duration is not None:
                    _http_request_duration.labels(
                        method=method, endpoint=endpoint, status=str(status_code)
                    ).observe(duration)
                if _http_requests_total is not None:
                    _http_requests_total.labels(
                        method=method, endpoint=endpoint, status=str(status_code)
                    ).inc()

            # --- Request logging ------------------------------------------
            if self.tracing_enabled:
                _request_logger.info(
                    json.dumps({
                        "event": "http_request",
                        "request_id": request_id,
                        "method": method,
                        "path": request.url.path,
                        "status": status_code,
                        "duration_s": round(duration, 4),
                    })
                )


# Dedicated logger for request tracing (goes through the same handlers)
_request_logger = logging.getLogger("lightrag.access")


# ---------------------------------------------------------------------------
# Structured JSON log formatter
# ---------------------------------------------------------------------------

class JSONFormatter(logging.Formatter):
    """
    Emit each log record as a single JSON object.

    Fields: timestamp, level, logger, message, and any extra attributes
    attached to the record (e.g. request_id).
    """

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Include well-known extras
        if hasattr(record, "request_id"):
            payload["request_id"] = record.request_id  # type: ignore[attr-defined]
        if record.exc_info and record.exc_info[0] is not None:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)
