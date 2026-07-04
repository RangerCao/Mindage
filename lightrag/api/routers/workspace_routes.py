"""
Workspace management routes for LightRAG.

Allows listing, creating, and switching between isolated data workspaces
at runtime without restarting the server.
"""

import asyncio
import os
from pathlib import Path
from typing import Any, Callable, Coroutine, Awaitable

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lightrag import LightRAG
from lightrag.base import DocStatus, DocProcessingStatus
from lightrag.utils import logger
from lightrag.api.utils_api import get_combined_auth_dependency


class _RAGProxy:
    """Mutable proxy that delegates all attribute access to a LightRAG instance.

    Route handlers receive this proxy instead of the raw `LightRAG` object.
    When ``WorkspaceManager.switch_to`` is called, the underlying instance
    is swapped and all subsequent method calls on the proxy target the new
    instance — no route re-registration needed.
    """

    def __init__(self, rag: LightRAG) -> None:
        object.__setattr__(self, "_rag", rag)

    # -- lifecycle helpers (called by WorkspaceManager, not by routes) ----------
    def _current(self) -> LightRAG:
        return object.__getattribute__(self, "_rag")

    def _swap(self, new_rag: LightRAG) -> None:
        object.__setattr__(self, "_rag", new_rag)

    # -- automatic delegation to the underlying LightRAG instance ---------------
    def __getattr__(self, name: str) -> Any:
        return getattr(self._current(), name)

    def __setattr__(self, name: str, value: Any) -> None:
        setattr(self._current(), name, value)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class WorkspaceInfo(BaseModel):
    name: str
    doc_count: int = 0
    is_active: bool = False


class WorkspaceListResponse(BaseModel):
    workspaces: list[WorkspaceInfo]
    current: str


class SetWorkspaceRequest(BaseModel):
    workspace: str


class SetWorkspaceResponse(BaseModel):
    status: str
    workspace: str
    message: str


class CreateWorkspaceRequest(BaseModel):
    workspace: str


class CreateWorkspaceResponse(BaseModel):
    status: str
    workspace: str
    message: str


class DeleteWorkspaceRequest(BaseModel):
    workspace: str


class DeleteWorkspaceResponse(BaseModel):
    status: str
    message: str


# ---------------------------------------------------------------------------
# WorkspaceManager — single point of control for workspace lifecycle
# ---------------------------------------------------------------------------
class WorkspaceManager:
    """Manages workspace lifecycle for the API server.

    Usage::

        manager = WorkspaceManager(
            initial_rag=rag,
            working_dir="/data/rag_storage",
            create_rag_func=lambda w: create_rag(w),
        )

        # All route handlers receive ``manager.rag`` (a ``_RAGProxy``)
        app.include_router(create_document_routes(manager.rag, ...))

        # At runtime, switch workspace without restarting:
        await manager.switch_to("project_x")
    """

    # Accept both sync and async create_rag_func
    def __init__(
        self,
        initial_rag: LightRAG,
        working_dir: str,
        create_rag_func: Callable[[str], LightRAG | Awaitable[LightRAG]],
    ) -> None:
        self._proxy = _RAGProxy(initial_rag)
        self._working_dir = working_dir
        self._create_rag = create_rag_func
        self._current_workspace = initial_rag.workspace or ""

    # -- public properties -----------------------------------------------------

    @property
    def rag(self) -> _RAGProxy:
        """The proxy that route handlers should use instead of a raw LightRAG."""
        return self._proxy

    @property
    def current_workspace(self) -> str:
        return self._current_workspace

    # -- public API ------------------------------------------------------------

    def list_workspaces(self) -> list[WorkspaceInfo]:
        """Scan the working directory for workspace sub-directories."""
        base = Path(self._working_dir)
        workspaces: list[WorkspaceInfo] = []
        seen: set[str] = set()
        if base.is_dir():
            for entry in sorted(base.iterdir()):
                if entry.is_dir() and not entry.name.startswith("."):
                    name = entry.name
                    if name not in seen:
                        seen.add(name)
                        workspaces.append(
                            WorkspaceInfo(
                                name=name,
                                is_active=(name == self._current_workspace),
                            )
                        )
        # Always include the default (empty) workspace
        if "" not in seen:
            workspaces.insert(
                0,
                WorkspaceInfo(
                    name="",
                    is_active=(self._current_workspace == ""),
                ),
            )
        return workspaces

    async def _create_rag_async(self, workspace: str) -> LightRAG:
        """Call create_rag_func, handling both sync and async variants."""
        result = self._create_rag(workspace)
        if isinstance(result, Awaitable):
            return await result
        return result

    async def switch_to(self, workspace: str) -> str:
        """Finalise the current RAG instance and create a new one for *workspace*.

        Returns the human-readable workspace label.
        """
        current = self._proxy._current()
        ws = workspace.strip()
        # If the target is the same as current, no-op
        if ws == self._current_workspace:
            return ws or "(default)"

        logger.info(
            "Switching workspace: '%s' -> '%s'", self._current_workspace, ws
        )

        # Finalise the old instance
        try:
            await current.finalize_storages()
        except Exception as exc:
            logger.warning("Error while finalising old RAG instance: %s", exc)

        # Create a new instance with the target workspace
        new_rag = await self._create_rag_async(ws)
        await new_rag.initialize_storages()

        self._proxy._swap(new_rag)
        self._current_workspace = ws
        logger.info("Switched to workspace '%s'", ws)
        return ws or "(default)"

    async def create_and_switch(self, workspace: str) -> str:
        """Create a new empty workspace and switch to it."""
        ws = workspace.strip()
        if not ws:
            raise ValueError("Workspace name must not be empty")

        base = Path(self._working_dir)
        ws_dir = base / ws
        ws_dir.mkdir(parents=True, exist_ok=True)
        # Let switch_to handle finalise + create + init
        return await self.switch_to(ws)

    async def delete_workspace(self, workspace: str) -> None:
        """Delete a workspace directory and all its data."""
        ws = workspace.strip()
        if not ws:
            raise ValueError("Workspace name must not be empty")
        if ws == self._current_workspace:
            raise ValueError("Cannot delete the currently active workspace")

        base = Path(self._working_dir)
        ws_dir = base / ws
        if ws_dir.is_dir():
            import shutil
            shutil.rmtree(ws_dir)
            logger.info("Deleted workspace '%s'", ws)
        else:
            logger.warning("Workspace '%s' does not exist", ws)


# ---------------------------------------------------------------------------
# FastAPI routes
# ---------------------------------------------------------------------------

def create_workspace_routes(
    manager: WorkspaceManager,
    api_key: str | None = None,
) -> APIRouter:
    """Create the workspace management router.

    Args:
        manager: The workspace manager.
        api_key: Optional API key for auth.

    Returns:
        An ``APIRouter`` instance with workspace endpoints.
    """
    router = APIRouter(prefix="/workspace", tags=["workspace"])
    auth = get_combined_auth_dependency(api_key)

    @router.get("/list", response_model=WorkspaceListResponse)
    async def list_workspaces(_=Depends(auth)):
        """List all available workspaces."""
        workspaces = manager.list_workspaces()
        # Try to get document counts (best-effort)
        for ws in workspaces:
            if ws.name == manager.current_workspace:
                ws.is_active = True
            else:
                ws.is_active = False
        return WorkspaceListResponse(
            workspaces=workspaces,
            current=manager.current_workspace,
        )

    @router.get("/current")
    async def current_workspace(_=Depends(auth)):
        """Get the currently active workspace."""
        return {"workspace": manager.current_workspace}

    @router.post("/set", response_model=SetWorkspaceResponse)
    async def set_workspace(req: SetWorkspaceRequest, _=Depends(auth)):
        """Switch to an existing workspace."""
        ws = req.workspace.strip()
        if not ws:
            raise HTTPException(status_code=400, detail="Workspace name required")
        try:
            label = await manager.switch_to(ws)
            return SetWorkspaceResponse(
                status="ok",
                workspace=ws,
                message=f"Switched to workspace '{label}'",
            )
        except Exception as e:
            logger.error("Failed to switch workspace: %s", e)
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/create", response_model=CreateWorkspaceResponse)
    async def create_workspace(req: CreateWorkspaceRequest, _=Depends(auth)):
        """Create a new workspace and switch to it."""
        ws = req.workspace.strip()
        if not ws:
            raise HTTPException(status_code=400, detail="Workspace name required")
        if not ws.replace("_", "").isalnum():
            raise HTTPException(
                status_code=400,
                detail="Workspace name may only contain letters, digits, and underscores",
            )
        try:
            label = await manager.create_and_switch(ws)
            return CreateWorkspaceResponse(
                status="ok",
                workspace=ws,
                message=f"Created and switched to workspace '{label}'",
            )
        except Exception as e:
            logger.error("Failed to create workspace: %s", e)
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/delete", response_model=DeleteWorkspaceResponse)
    async def delete_workspace(req: DeleteWorkspaceRequest, _=Depends(auth)):
        """Delete a workspace and all its data."""
        ws = req.workspace.strip()
        if not ws:
            raise HTTPException(status_code=400, detail="Workspace name required")
        try:
            await manager.delete_workspace(ws)
            return DeleteWorkspaceResponse(
                status="ok",
                message=f"Workspace '{ws}' deleted",
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error("Failed to delete workspace: %s", e)
            raise HTTPException(status_code=500, detail=str(e))

    return router
