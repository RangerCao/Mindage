"""
API routes for the Travel Planner agent.

Provides endpoints for multi-modal route planning and comparison
between two points within a city.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from lightrag.api.utils_api import get_combined_auth_dependency
from lightrag.travel_planner import TravelPlanner


# ── Request / Response models ─────────────────────────────────────────────

class PlanRequest(BaseModel):
    origin: str
    destination: str
    city: str = ""
    force_refresh: bool = False


class PlanResponse(BaseModel):
    city: str = ""
    origin: str = ""
    destination: str = ""
    modes: list[dict] = []
    recommendation: str = ""
    error: str = ""
    from_cache: bool = False


# ── Router factory ────────────────────────────────────────────────────────

def create_travel_routes(
    working_dir: str,
    api_key: str | None = None,
) -> APIRouter:
    """Create the travel planning router.

    Args:
        working_dir: The LightRAG working directory (for cache).
        api_key: Optional API key for auth.

    Returns:
        An ``APIRouter`` instance with travel planning endpoints.
    """
    router = APIRouter(prefix="/travel", tags=["travel"])
    auth = get_combined_auth_dependency(api_key)
    planner = TravelPlanner(working_dir)

    @router.post("/plan")
    async def plan_trip(req: PlanRequest, _=Depends(auth)):
        """Plan a trip from origin to destination within a city."""
        if not req.origin or not req.destination:
            raise HTTPException(status_code=400, detail="起点和目的地不能为空")

        result = await planner.plan(
            origin=req.origin,
            destination=req.destination,
            city=req.city,
            force_refresh=req.force_refresh,
        )

        return result

    @router.get("/history")
    async def list_history(_=Depends(auth)):
        """List cached travel plan history."""
        return {"entries": planner.get_history()}

    @router.delete("/cache")
    async def clear_cache(_=Depends(auth)):
        """Clear all cached travel plans."""
        planner.clear_cache()
        return {"status": "ok", "message": "Travel cache cleared"}

    return router
