# Upgrade Guide

This guide helps you upgrade your LightRAG installation to the latest version with all the new features enabled.

## Upgrading to Latest Version

### 1. Update Dependencies

```bash
# If using uv (recommended)
uv sync --extra api

# If using pip
pip install -e ".[api]"

# To enable Prometheus metrics
pip install prometheus-client
```

### 2. Update Environment Variables

Copy the new environment variables from `env.example` to your `.env` file:

```bash
# Observability Configuration
LIGHTRAG_LOG_FORMAT=default          # or 'json' for structured logging
LIGHTRAG_METRICS_ENABLED=false       # set to 'true' to enable /metrics endpoint
LIGHTRAG_REQUEST_TRACING_ENABLED=false  # set to 'true' to enable request tracing
```

### 3. Restart the Server

```bash
# Development
uvicorn lightrag.api.lightrag_server:app --reload

# Production
lightrag-server

# Or with gunicorn
lightrag-gunicorn
```

## Enabling New Features

### Production Observability

#### Prometheus Metrics

1. Install the optional dependency:
   ```bash
   pip install prometheus-client
   ```

2. Enable metrics in `.env`:
   ```bash
   LIGHTRAG_METRICS_ENABLED=true
   ```

3. Access metrics at `http://localhost:9621/metrics`

4. Configure Prometheus to scrape:
   ```yaml
   scrape_configs:
     - job_name: 'lightrag'
       static_configs:
         - targets: ['localhost:9621']
       metrics_path: '/metrics'
   ```

#### Request Tracing

Enable request tracing to get `X-Request-ID` headers and structured access logs:

```bash
LIGHTRAG_REQUEST_TRACING_ENABLED=true
```

Each request will now:
- Generate or propagate an `X-Request-ID` header
- Log request method, path, status code, and duration
- Include the request ID in response headers

#### Structured JSON Logging

Switch to JSON log format for log aggregation systems (ELK, Loki, etc.):

```bash
LIGHTRAG_LOG_FORMAT=json
```

Example log output:
```json
{"timestamp": "2024-01-15 10:30:45,123", "level": "INFO", "logger": "lightrag.access", "message": "{\"event\": \"http_request\", \"request_id\": \"abc123def456\", \"method\": \"GET\", \"path\": \"/health\", \"status\": 200, \"duration_s\": 0.0012}", "request_id": "abc123def456"}
```

### RBAC Permission Enforcement

The new RBAC system enforces role-based access control:

- **admin**: Full access including user management and system configuration
- **user**: Can upload documents, execute queries, manage own documents
- **guest**: Read-only access (when guest mode is enabled)

No configuration needed - the system automatically enforces permissions based on user roles.

### Password Management

New endpoints for password management:

```bash
# Change own password (authenticated users)
curl -X PUT http://localhost:9621/users/me/password \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"old_password": "oldpass", "new_password": "newpass"}'

# Admin reset user password
curl -X PUT http://localhost:9621/users/bob/password \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"new_password": "reset123"}'
```

## Breaking Changes

**None** - All new features are backward compatible and opt-in.

## Deprecated Features

No features have been deprecated in this release.

## Troubleshooting

### Metrics endpoint returns "Metrics are disabled"

Ensure `LIGHTRAG_METRICS_ENABLED=true` is set in your `.env` file and the server is restarted.

### Import error: `No module named 'prometheus_client'`

The `prometheus-client` package is optional. Install it with:
```bash
pip install prometheus-client
```

Or use the api extra:
```bash
pip install -e ".[api]"
```

### JSON logs not appearing

Ensure `LIGHTRAG_LOG_FORMAT=json` is set and the server is restarted. The JSON formatter applies to both console and file handlers.

### Request ID not appearing in response

Ensure `LIGHTRAG_REQUEST_TRACING_ENABLED=true` is set. The middleware adds `X-Request-ID` to response headers.

## Rollback Instructions

If you need to rollback to a previous version:

1. Disable new features in `.env`:
   ```bash
   LIGHTRAG_LOG_FORMAT=default
   LIGHTRAG_METRICS_ENABLED=false
   LIGHTRAG_REQUEST_TRACING_ENABLED=false
   ```

2. Restart the server - it will operate in the previous mode.

3. Optionally uninstall prometheus-client:
   ```bash
   pip uninstall prometheus-client
   ```

All changes are additive and do not modify existing behavior unless explicitly enabled.
