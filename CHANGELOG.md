# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### MCP Protocol Client Implementation
- Added MCP (Model Context Protocol) client support for tool integration
- New `lightrag/tools/mcp_client.py` module with async tool execution
- Environment variable `LIGHTRAG_MCP_ENABLED` to enable/disable MCP features
- Integration with existing tool execution pipeline

#### RBAC Permission Enforcement
- Implemented role-based access control with admin/user/guest roles
- New permission checks on document management endpoints
- Admin-only operations: user management, system configuration
- User operations: document upload, query execution
- Guest operations: read-only access when enabled

#### i18n Translation Completion
- Completed Chinese (zh-CN) translations for all UI strings
- Added Japanese (ja-JP) translation support
- New translation keys for error messages and validation
- Translation fallback mechanism for missing keys

#### Password Reset & Session Management
- Added password change endpoint for authenticated users
- Admin password reset capability for user management
- Session invalidation on password change
- New `/users/me/password` endpoint for self-service password change
- New `/users/:username/password` endpoint for admin reset

#### Production Observability
- New `lightrag/api/observability.py` module with three opt-in features:
  - **Prometheus metrics** (`LIGHTRAG_METRICS_ENABLED=true`): `/metrics` endpoint with request duration histogram, request counter, in-progress gauge, and pipeline status gauges
  - **Request tracing** (`LIGHTRAG_REQUEST_TRACING_ENABLED=true`): `X-Request-ID` header generation/propagation, structured access logging
  - **Structured JSON logging** (`LIGHTRAG_LOG_FORMAT=json`): One JSON object per line with timestamp, level, logger, message, and request context
- Middleware stack integration for request metering and tracing
- Optional `prometheus-client` dependency (lazy-imported)

#### Travel Planner Internationalization
- Added multi-language support for travel planner feature
- New translation keys for itinerary planning UI
- Localized date/time formatting

#### Test Coverage
- Added comprehensive frontend unit tests using Bun test runner
- New test files:
  - `lightrag_webui/src/api/userManagement.test.ts` (10 tests)
  - `lightrag_webui/src/stores/state.test.ts` (14 tests)
- Test isolation with `--isolate` flag to prevent module cache contamination
- Backend test improvements for storage migrations and pipeline concurrency

### Changed

#### Middleware Stack Order
- Observability middleware positioned between CORS and root-path normalization
- Request tracing now captures all non-preflight requests
- Metrics collection occurs after CORS handling

#### Logging Configuration
- `configure_logging()` now supports JSON format via `LIGHTRAG_LOG_FORMAT` environment variable
- Backward compatible: default format unchanged

#### Dependencies
- Added `prometheus-client>=0.20.0,<1.0.0` to `api` optional dependencies
- Added `--isolate` flag to frontend test scripts for proper test isolation

### Configuration

New environment variables for observability:

```bash
# Structured JSON logging format (default: human-readable)
LIGHTRAG_LOG_FORMAT=default  # or 'json'

# Prometheus metrics endpoint at /metrics (requires prometheus_client package)
LIGHTRAG_METRICS_ENABLED=false

# Request tracing with X-Request-ID header and access logging
LIGHTRAG_REQUEST_TRACING_ENABLED=false
```

### Migration Notes

- No breaking changes to existing APIs or configurations
- All new features are opt-in via environment variables
- Existing deployments will continue to work without modification
- To enable observability features, set the corresponding environment variables and restart the server

### Security

- Password change endpoints require authentication
- Admin password reset requires admin role
- Session tokens invalidated after password change
- `/metrics` endpoint is unauthenticated by design (exposes only operational metrics)
