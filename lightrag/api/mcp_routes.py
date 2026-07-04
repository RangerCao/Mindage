"""
API routes for MCP (Model Context Protocol) server management.

Provides CRUD endpoints for configuring MCP servers that can be used
for tool integration within the LightRAG ecosystem.
"""

import json
import os
import logging
import subprocess
import shlex
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from lightrag.api.utils_api import get_combined_auth_dependency

logger = logging.getLogger("lightrag")

# ── Types ──────────────────────────────────────────────────────────────────

MCP_SERVERS_FILENAME = "mcp_servers.json"


class McpServerManager:
    """Manages MCP server configurations stored in a JSON file."""

    def __init__(self, working_dir: str):
        self._working_dir = working_dir
        self._file_path = os.path.join(working_dir, MCP_SERVERS_FILENAME)
        self._servers: list[dict] = []
        self._load()
        self._auto_discover()

    # ── persistence ──

    def _load(self):
        if os.path.isfile(self._file_path):
            try:
                with open(self._file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        self._servers = data
                    elif isinstance(data, dict):
                        self._servers = data.get("servers", [])
                    else:
                        self._servers = []
            except Exception as e:
                logger.error("Failed to load MCP servers: %s", e)
                self._servers = []
        else:
            self._servers = []

    # ── auto-discover from .env ──

    def _auto_discover(self):
        """Auto-discover MCP servers from environment configuration.

        Currently detects PageIndex when ENABLE_PAGEINDEX=true is set.
        """
        # Check if PageIndex is enabled
        enable_pageindex = os.getenv("ENABLE_PAGEINDEX", "false").lower() == "true"
        if not enable_pageindex:
            # Also try loading from .env file directly
            env_paths = [".env"]
            if self._working_dir:
                env_paths.append(os.path.join(self._working_dir, ".env"))
                # Try parent of working_dir (project root)
                env_paths.append(os.path.join(os.path.dirname(self._working_dir.rstrip("\\/")), ".env"))
            env_path = next((p for p in env_paths if os.path.isfile(p)), ".env")
            if os.path.isfile(env_path):
                try:
                    with open(env_path, "r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if line.startswith("ENABLE_PAGEINDEX="):
                                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                                if val.lower() == "true":
                                    enable_pageindex = True
                                    break
                except Exception:
                    pass

        if not enable_pageindex:
            return

        # Check if PageIndex is already configured
        already_configured = any(
            s.get("name", "").lower() == "pageindex"
            or "pageindex" in s.get("command", "").lower()
            for s in self._servers
        )
        if already_configured:
            return

        # Resolve PageIndex MCP server path (same logic as tree_index.py)
        from pathlib import Path as _Path

        here = _Path(__file__).resolve().parent
        mcp_path = None
        candidates = [
            here.parent.parent / "PageIndex-main" / "mcp_server.py",
            here.parent.parent.parent / "PageIndex-main" / "mcp_server.py",
            _Path("D:/PageIndex-main/mcp_server.py"),
        ]
        for p in candidates:
            if p.is_file():
                mcp_path = str(p)
                break

        if not mcp_path:
            logger.warning("PageIndex: mcp_server.py not found, skipping auto-discovery")
            return

        # Auto-add the PageIndex server
        server = {
            "id": uuid.uuid4().hex[:12],
            "name": "PageIndex",
            "command": "python",
            "args": [mcp_path],
            "env": {},
            "enabled": True,
            "tools": ["build_tree", "build_pdf_tree", "build_md_tree"],
            "auto_discovered": True,
            "created_at": datetime.utcnow().isoformat(),
        }
        self._servers.append(server)
        self._save()
        logger.info("PageIndex: auto-discovered and added to MCP servers")

    def _save(self):
        dir_path = os.path.dirname(self._file_path)
        if dir_path and not os.path.isdir(dir_path):
            os.makedirs(dir_path, exist_ok=True)
        with open(self._file_path, "w", encoding="utf-8") as f:
            json.dump({"servers": self._servers}, f, ensure_ascii=False, indent=2)

    # ── CRUD ──

    def list_servers(self) -> list[dict]:
        return self._servers

    def get_server(self, server_id: str) -> Optional[dict]:
        for s in self._servers:
            if s.get("id") == server_id:
                return s
        return None

    def add_server(self, server: dict) -> dict:
        if not server.get("id"):
            server["id"] = uuid.uuid4().hex[:12]
        server.setdefault("name", "")
        server.setdefault("transport", "stdio")  # "stdio" | "sse" | "streamable-http"
        server.setdefault("command", "")
        server.setdefault("args", [])
        server.setdefault("env", {})
        server.setdefault("url", "")  # Required for sse / streamable-http
        server.setdefault("enabled", True)
        server.setdefault("tools", [])
        server.setdefault("created_at", datetime.utcnow().isoformat())
        self._servers.append(server)
        self._save()
        return server

    def update_server(self, server_id: str, update: dict) -> Optional[dict]:
        for i, s in enumerate(self._servers):
            if s.get("id") == server_id:
                # Merge update, preserving id
                update.pop("id", None)
                self._servers[i] = {**s, **update}
                self._servers[i]["updated_at"] = datetime.utcnow().isoformat()
                self._save()
                return self._servers[i]
        return None

    def delete_server(self, server_id: str) -> bool:
        for i, s in enumerate(self._servers):
            if s.get("id") == server_id:
                self._servers.pop(i)
                self._save()
                return True
        return False

    def toggle_server(self, server_id: str) -> Optional[dict]:
        for s in self._servers:
            if s.get("id") == server_id:
                s["enabled"] = not s.get("enabled", True)
                s["updated_at"] = datetime.utcnow().isoformat()
                self._save()
                return s
        return None

    def check_status(self, server_id: str) -> str:
        """Check if an MCP server is currently reachable.

        For stdio transport: tries to start the process briefly to verify the command is valid.
        For sse / streamable-http: sends a lightweight HTTP request to the server URL.
        Returns 'connected', 'disconnected', or 'error'.
        """
        server = self.get_server(server_id)
        if server is None:
            return "error"

        if not server.get("enabled", False):
            return "disconnected"

        transport = server.get("transport", "stdio")

        # ── HTTP-based transports ──
        if transport in ("sse", "streamable-http"):
            url = server.get("url", "").strip()
            if not url:
                return "error"
            try:
                import urllib.request
                import urllib.error
                req = urllib.request.Request(url, method="GET")
                req.add_header("Accept", "text/event-stream" if transport == "sse" else "application/json")
                resp = urllib.request.urlopen(req, timeout=5)
                # Any HTTP response (even 4xx) means the server is alive
                return "connected" if resp.status < 500 else "disconnected"
            except urllib.error.HTTPError as e:
                # 4xx means server is alive but rejected us → still connected
                return "connected" if e.code < 500 else "disconnected"
            except Exception as e:
                logger.warning("Status check failed for HTTP MCP server '%s': %s", server.get("name"), e)
                return "disconnected"

        # ── stdio transport (original logic) ──
        command = server.get("command", "")
        args = server.get("args", [])

        if not command:
            return "error"

        try:
            full_args = [command] + list(args)
            result = subprocess.run(
                full_args,
                capture_output=True,
                timeout=5,
                env={**os.environ, **server.get("env", {})},
            )
            return "disconnected"
        except subprocess.TimeoutExpired:
            return "connected"
        except FileNotFoundError:
            return "error"
        except Exception as e:
            logger.warning("Status check failed for MCP server '%s': %s", server.get("name"), e)
            return "error"


# ── Global client manager reference ────────────────────────────────────────
# Set by lightrag_server.py after creating routes, so other modules can access it.
_client_manager = None


def get_mcp_client_manager():
    """Return the global McpClientManager instance (may be None if SDK unavailable)."""
    return _client_manager


def set_mcp_client_manager(mgr):
    """Set the global McpClientManager instance."""
    global _client_manager
    _client_manager = mgr


# ── Router factory ─────────────────────────────────────────────────────────

def create_mcp_routes(
    working_dir: str,
    api_key: Optional[str] = None,
) -> APIRouter:
    """Create the MCP server management router.

    Args:
        working_dir: The LightRAG working directory for storing config.
        api_key: Optional API key for auth.

    Returns:
        An ``APIRouter`` instance with MCP management endpoints.
    """
    router = APIRouter(prefix="/mcp", tags=["mcp"])
    auth = get_combined_auth_dependency(api_key)
    manager = McpServerManager(working_dir)

    # ── List all servers ──────────────────────────────────────────────

    @router.get("/servers")
    async def list_servers(_=Depends(auth)):
        """List all configured MCP servers."""
        return {"servers": manager.list_servers()}

    # ── Get one server ────────────────────────────────────────────────

    @router.get("/servers/{server_id}")
    async def get_server(server_id: str, _=Depends(auth)):
        """Get a specific MCP server configuration."""
        server = manager.get_server(server_id)
        if server is None:
            raise HTTPException(status_code=404, detail="MCP server not found")
        return server

    # ── Add a server ──────────────────────────────────────────────────

    @router.post("/servers")
    async def add_server(server: dict, _=Depends(auth)):
        """Add a new MCP server configuration."""
        return manager.add_server(server)

    # ── Update a server ───────────────────────────────────────────────

    @router.put("/servers/{server_id}")
    async def update_server(server_id: str, update: dict, _=Depends(auth)):
        """Update an existing MCP server configuration."""
        result = manager.update_server(server_id, update)
        if result is None:
            raise HTTPException(status_code=404, detail="MCP server not found")
        return result

    # ── Delete a server ───────────────────────────────────────────────

    @router.delete("/servers/{server_id}")
    async def delete_server(server_id: str, _=Depends(auth)):
        """Delete an MCP server configuration."""
        if not manager.delete_server(server_id):
            raise HTTPException(status_code=404, detail="MCP server not found")
        return {"status": "ok", "server_id": server_id}

    # ── Toggle enabled/disabled ───────────────────────────────────────

    @router.put("/servers/{server_id}/toggle")
    async def toggle_server(server_id: str, _=Depends(auth)):
        """Toggle an MCP server's enabled state."""
        result = manager.toggle_server(server_id)
        if result is None:
            raise HTTPException(status_code=404, detail="MCP server not found")
        return result

    # ── Check server status ───────────────────────────────────────────

    @router.get("/servers/{server_id}/status")
    async def check_server_status(server_id: str, _=Depends(auth)):
        """Check if an MCP server process is currently reachable."""
        server = manager.get_server(server_id)
        if server is None:
            raise HTTPException(status_code=404, detail="MCP server not found")
        status = manager.check_status(server_id)
        return {"server_id": server_id, "status": status}

    # ── Tool discovery (via MCP client manager) ───────────────────────

    @router.get("/tools")
    async def list_mcp_tools(_=Depends(auth)):
        """List all available MCP tools from connected servers."""
        mgr = get_mcp_client_manager()
        if mgr is None or not mgr.available:
            return {"tools": [], "available": False, "message": "MCP SDK not available or not initialized"}
        tools = mgr.list_all_tools()
        return {"tools": tools, "available": True}

    # ── Tool invocation ───────────────────────────────────────────────

    @router.post("/tools/call")
    async def call_mcp_tool(request: dict, _=Depends(auth)):
        """Call an MCP tool by its full name.

        Request body: {"tool_name": "mcp_{server_id}_{tool}", "arguments": {...}}
        """
        mgr = get_mcp_client_manager()
        if mgr is None or not mgr.available:
            raise HTTPException(status_code=503, detail="MCP SDK not available or not initialized")

        tool_name = request.get("tool_name", "")
        arguments = request.get("arguments", {})
        if not tool_name:
            raise HTTPException(status_code=400, detail="tool_name is required")

        result = await mgr.call_tool(tool_name, arguments)
        return result

    # ── Connection management ─────────────────────────────────────────

    @router.post("/connect")
    async def connect_all(_=Depends(auth)):
        """Connect to all enabled MCP servers."""
        mgr = get_mcp_client_manager()
        if mgr is None:
            raise HTTPException(status_code=503, detail="MCP client manager not initialized")
        await mgr.initialize()
        return {"status": "ok", "tools": mgr.list_all_tools()}

    @router.post("/servers/{server_id}/reconnect")
    async def reconnect_server(server_id: str, _=Depends(auth)):
        """Reconnect to a specific MCP server."""
        mgr = get_mcp_client_manager()
        if mgr is None:
            raise HTTPException(status_code=503, detail="MCP client manager not initialized")
        success = await mgr.refresh_connection(server_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to reconnect")
        return {"status": "ok", "server_id": server_id}

    @router.get("/connections")
    async def get_connections(_=Depends(auth)):
        """Get connection status for all MCP servers."""
        mgr = get_mcp_client_manager()
        if mgr is None:
            return {"connections": {}, "available": False}
        return {"connections": mgr.get_connection_status(), "available": True}

    return manager, router
