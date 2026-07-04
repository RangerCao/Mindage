"""
Role-Based Access Control (RBAC) for LightRAG API.

Provides FastAPI dependencies for enforcing role-based permissions on routes.
Roles: admin > user > guest.
"""

import logging
from typing import Optional, Set

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

from .auth import auth_handler

logger = logging.getLogger("lightrag")

# Role hierarchy: higher number = more privilege
ROLE_HIERARCHY = {
    "guest": 0,
    "user": 1,
    "admin": 2,
}


def _role_level(role: str) -> int:
    """Get numeric level for a role."""
    return ROLE_HIERARCHY.get(role, 0)


def require_role(
    *allowed_roles: str,
    api_key: Optional[str] = None,
):
    """Create a FastAPI dependency that enforces role-based access.

    Usage:
        @router.get("/admin-only")
        async def admin_endpoint(_=Depends(require_role("admin", api_key=api_key))):
            ...

        @router.get("/staff")
        async def staff_endpoint(_=Depends(require_role("admin", "user", api_key=api_key))):
            ...

    Args:
        *allowed_roles: Role names that are permitted.
        api_key: Optional API key (if set, API key auth also bypasses role check).

    Returns:
        A FastAPI dependency function.
    """
    oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

    async def role_dependency(
        request: Request,
        token: Optional[str] = Depends(oauth2_scheme),
    ):
        # If no auth is configured, allow all access
        if not auth_handler.has_any_accounts():
            return {"username": "anonymous", "role": "admin"}

        # Extract username from request.state (set by combined_auth_dependency)
        username = getattr(request.state, "username", None)
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )

        # Get role from token or user store
        role = "user"
        if token:
            try:
                token_info = auth_handler.validate_token(token)
                role = token_info.get("role", "user")
            except HTTPException:
                raise

        # Check if role is allowed
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' is not permitted. Required: {', '.join(allowed_roles)}",
            )

        return {"username": username, "role": role}

    return role_dependency


def get_current_user(request: Request) -> dict:
    """FastAPI dependency to get the current authenticated user.

    Returns dict with 'username' and 'role'.
    Does NOT enforce any specific role — just extracts identity.
    """
    username = getattr(request.state, "username", None)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    # Try to get role from dynamic roles
    role = auth_handler.get_dynamic_role(username)
    return {"username": username, "role": role}


def is_admin(request: Request) -> bool:
    """Check if the current request is from an admin user."""
    username = getattr(request.state, "username", None)
    if not username:
        return False
    role = auth_handler.get_dynamic_role(username)
    return _role_level(role) >= _role_level("admin")
