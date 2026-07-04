"""
MCP (Model Context Protocol) client manager.

Manages persistent connections to MCP servers and provides tool discovery
and invocation capabilities for integration with the LLM query pipeline.
"""

import asyncio
import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger("lightrag")

# Check if MCP SDK is available
try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    from mcp.client.sse import sse_client
    from mcp.client.streamable_http import streamablehttp_client

    MCP_SDK_AVAILABLE = True
except ImportError:
    MCP_SDK_AVAILABLE = False
    logger.info(
        "MCP SDK not installed. Install with: pip install mcp. "
        "MCP tool invocation will be unavailable."
    )


class McpToolInfo:
    """Information about a single MCP tool."""

    def __init__(
        self,
        name: str,
        description: str,
        input_schema: dict,
        server_id: str,
        server_name: str,
    ):
        self.name = name
        self.description = description
        self.input_schema = input_schema
        self.server_id = server_id
        self.server_name = server_name

    def to_openai_function(self) -> dict:
        """Convert to OpenAI function calling format."""
        return {
            "type": "function",
            "function": {
                "name": f"mcp_{self.server_id}_{self.name}",
                "description": f"[{self.server_name}] {self.description}",
                "parameters": self.input_schema,
            },
        }

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
            "server_id": self.server_id,
            "server_name": self.server_name,
            "full_name": f"mcp_{self.server_id}_{self.name}",
        }


class McpClientConnection:
    """Manages a single MCP server connection."""

    def __init__(self, server_config: dict):
        self.config = server_config
        self.server_id = server_config.get("id", "")
        self.server_name = server_config.get("name", self.server_id)
        self.transport = server_config.get("transport", "stdio")
        self.session: Optional[Any] = None
        self.tools: list[McpToolInfo] = []
        self._cleanup_func: Optional[Any] = None
        self._context_manager: Optional[Any] = None
        self._connected = False

    @property
    def connected(self) -> bool:
        return self._connected and self.session is not None

    async def connect(self) -> bool:
        """Establish connection to the MCP server and discover tools."""
        if not MCP_SDK_AVAILABLE:
            logger.warning("MCP SDK not available, cannot connect to server '%s'", self.server_name)
            return False

        try:
            if self.transport == "stdio":
                await self._connect_stdio()
            elif self.transport == "sse":
                await self._connect_sse()
            elif self.transport == "streamable-http":
                await self._connect_streamable_http()
            else:
                logger.error("Unknown transport '%s' for server '%s'", self.transport, self.server_name)
                return False

            # Discover tools
            if self.session:
                result = await self.session.list_tools()
                self.tools = [
                    McpToolInfo(
                        name=tool.name,
                        description=tool.description or "",
                        input_schema=tool.inputSchema if hasattr(tool, "inputSchema") else {},
                        server_id=self.server_id,
                        server_name=self.server_name,
                    )
                    for tool in result.tools
                ]
                logger.info(
                    "Connected to MCP server '%s', discovered %d tools",
                    self.server_name,
                    len(self.tools),
                )
                self._connected = True
                return True

        except Exception as e:
            logger.error("Failed to connect to MCP server '%s': %s", self.server_name, e)
            self._connected = False
            return False

        return False

    async def _connect_stdio(self):
        """Connect via stdio transport."""
        command = self.config.get("command", "")
        args = self.config.get("args", [])
        env = {**os.environ, **self.config.get("env", {})}

        server_params = StdioServerParameters(
            command=command,
            args=args,
            env=env,
        )

        read, write = await asyncio.get_event_loop().run_in_executor(
            None, lambda: None
        )
        # Use async context manager
        self._context_manager = stdio_client(server_params)
        read_stream, write_stream = await self._context_manager.__aenter__()
        self._cleanup_func = lambda: asyncio.create_task(self._context_manager.__aexit__(None, None, None))

        self.session = ClientSession(read_stream, write_stream)
        await self.session.__aenter__()
        await self.session.initialize()

    async def _connect_sse(self):
        """Connect via SSE transport."""
        url = self.config.get("url", "").strip()
        if not url:
            raise ValueError("URL is required for SSE transport")

        self._context_manager = sse_client(url)
        read_stream, write_stream = await self._context_manager.__aenter__()
        self._cleanup_func = lambda: asyncio.create_task(self._context_manager.__aexit__(None, None, None))

        self.session = ClientSession(read_stream, write_stream)
        await self.session.__aenter__()
        await self.session.initialize()

    async def _connect_streamable_http(self):
        """Connect via streamable HTTP transport."""
        url = self.config.get("url", "").strip()
        if not url:
            raise ValueError("URL is required for streamable-http transport")

        self._context_manager = streamablehttp_client(url)
        read_stream, write_stream = await self._context_manager.__aenter__()
        self._cleanup_func = lambda: asyncio.create_task(self._context_manager.__aexit__(None, None, None))

        self.session = ClientSession(read_stream, write_stream)
        await self.session.__aenter__()
        await self.session.initialize()

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        """Call a tool on this MCP server."""
        if not self.connected:
            raise RuntimeError(f"Not connected to MCP server '{self.server_name}'")

        result = await self.session.call_tool(tool_name, arguments)
        # Extract text content from result
        if hasattr(result, "content"):
            texts = []
            for item in result.content:
                if hasattr(item, "text"):
                    texts.append(item.text)
            return "\n".join(texts) if texts else str(result)
        return str(result)

    async def disconnect(self):
        """Close the connection."""
        try:
            if self.session:
                await self.session.__aexit__(None, None, None)
                self.session = None
            if self._cleanup_func:
                await self._cleanup_func()
                self._cleanup_func = None
            self._context_manager = None
            self._connected = False
            self.tools = []
            logger.info("Disconnected from MCP server '%s'", self.server_name)
        except Exception as e:
            logger.warning("Error disconnecting from MCP server '%s': %s", self.server_name, e)


class McpClientManager:
    """Manages connections to all configured MCP servers.

    Provides unified tool discovery and invocation across multiple servers.
    """

    def __init__(self, server_manager):
        """Initialize with a McpServerManager (from mcp_routes) for config."""
        self._server_manager = server_manager
        self._connections: dict[str, McpClientConnection] = {}
        self._initialized = False

    async def initialize(self):
        """Connect to all enabled servers."""
        if not MCP_SDK_AVAILABLE:
            logger.warning("MCP SDK not available, skipping client initialization")
            return

        servers = self._server_manager.list_servers()
        for server in servers:
            if server.get("enabled", False):
                conn = McpClientConnection(server)
                success = await conn.connect()
                if success:
                    self._connections[server["id"]] = conn
                else:
                    logger.warning("Failed to connect to enabled MCP server '%s'", server.get("name"))

        self._initialized = True
        total_tools = sum(len(c.tools) for c in self._connections.values())
        logger.info(
            "MCP client manager initialized: %d servers, %d tools",
            len(self._connections),
            total_tools,
        )

    async def shutdown(self):
        """Disconnect from all servers."""
        for conn in self._connections.values():
            await conn.disconnect()
        self._connections.clear()
        self._initialized = False
        logger.info("MCP client manager shut down")

    async def refresh_connection(self, server_id: str) -> bool:
        """Reconnect to a specific server."""
        # Disconnect existing
        if server_id in self._connections:
            await self._connections[server_id].disconnect()
            del self._connections[server_id]

        # Find server config
        server = self._server_manager.get_server(server_id)
        if not server or not server.get("enabled", False):
            return False

        conn = McpClientConnection(server)
        success = await conn.connect()
        if success:
            self._connections[server_id] = conn
        return success

    def list_all_tools(self) -> list[dict]:
        """List all available tools from all connected servers."""
        tools = []
        for conn in self._connections.values():
            for tool in conn.tools:
                tools.append(tool.to_dict())
        return tools

    def get_openai_tools(self) -> list[dict]:
        """Get tools in OpenAI function calling format."""
        tools = []
        for conn in self._connections.values():
            for tool in conn.tools:
                tools.append(tool.to_openai_function())
        return tools

    async def call_tool(self, full_tool_name: str, arguments: dict) -> dict:
        """Call a tool by its full name (mcp_{server_id}_{tool_name}).

        Returns dict with 'success', 'result' or 'error' keys.
        """
        # Parse full name: mcp_{server_id}_{tool_name}
        if not full_tool_name.startswith("mcp_"):
            return {"success": False, "error": f"Invalid tool name format: {full_tool_name}"}

        remainder = full_tool_name[4:]  # strip "mcp_"
        # Find matching connection and tool
        for server_id, conn in self._connections.items():
            prefix = f"{server_id}_"
            if remainder.startswith(prefix):
                tool_name = remainder[len(prefix):]
                try:
                    result = await conn.call_tool(tool_name, arguments)
                    return {"success": True, "result": result}
                except Exception as e:
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": f"Tool not found: {full_tool_name}"}

    def get_connection_status(self) -> dict[str, str]:
        """Get connection status for all managed servers."""
        status = {}
        for server_id, conn in self._connections.items():
            status[server_id] = "connected" if conn.connected else "disconnected"
        # Also include servers we manage but aren't connected
        for server in self._server_manager.list_servers():
            sid = server.get("id", "")
            if sid not in status:
                status[sid] = "disabled" if not server.get("enabled") else "not_connected"
        return status

    @property
    def available(self) -> bool:
        """Whether the MCP SDK is available and manager is initialized."""
        return MCP_SDK_AVAILABLE and self._initialized
