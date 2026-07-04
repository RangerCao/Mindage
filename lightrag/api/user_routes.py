"""
User management API routes.

Provides admin-only endpoints for user administration:
- List users
- Change user role
- Delete users
- Change password
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from .auth import auth_handler
from .passwords import hash_password, verify_password
from .rbac import require_role
from .user_store import UserStore
from .utils_api import get_combined_auth_dependency

logger = logging.getLogger("lightrag")


class RoleChangeRequest(BaseModel):
    role: str = Field(..., description="New role: admin, user, or guest")


class PasswordChangeRequest(BaseModel):
    old_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=4, description="New password (min 4 chars)")


class AdminPasswordResetRequest(BaseModel):
    new_password: str = Field(..., min_length=4, description="New password for the user")


def create_user_routes(
    working_dir: str,
    api_key: Optional[str] = None,
) -> APIRouter:
    """Create user management routes."""
    router = APIRouter(prefix="/users", tags=["users"])
    auth = get_combined_auth_dependency(api_key)
    user_store = UserStore(working_dir)

    # ── List users (admin only) ─────────────────────────────────────

    @router.get("")
    async def list_users(request: Request, _=Depends(auth)):
        """List all registered users. Requires admin role."""
        username = getattr(request.state, "username", None)
        if not username:
            raise HTTPException(status_code=401, detail="Authentication required")

        role = auth_handler.get_dynamic_role(username)
        if role != "admin":
            raise HTTPException(status_code=403, detail="Admin role required")

        users = user_store.list_users()
        # Add current user indicator
        for u in users:
            u["is_current"] = u["username"] == username
        return {"users": users, "total": len(users)}

    # ── Change user role (admin only) ───────────────────────────────

    @router.put("/{username}/role")
    async def change_user_role(
        username: str,
        body: RoleChangeRequest,
        request: Request,
        _=Depends(auth),
    ):
        """Change a user's role. Requires admin role."""
        current_user = getattr(request.state, "username", None)
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")

        current_role = auth_handler.get_dynamic_role(current_user)
        if current_role != "admin":
            raise HTTPException(status_code=403, detail="Admin role required")

        if body.role not in ("admin", "user", "guest"):
            raise HTTPException(status_code=400, detail="Invalid role. Must be: admin, user, or guest")

        if not user_store.has_user(username):
            raise HTTPException(status_code=404, detail="User not found")

        # Update role in user store
        user_info = user_store._users.get(username)
        if user_info:
            user_info["role"] = body.role
            user_store._save()

        # Update in auth handler's dynamic roles
        auth_handler.dynamic_roles[username] = body.role

        logger.info("User '%s' role changed to '%s' by admin '%s'", username, body.role, current_user)
        return {"username": username, "role": body.role}

    # ── Delete user (admin only) ────────────────────────────────────

    @router.delete("/{username}")
    async def delete_user(
        username: str,
        request: Request,
        _=Depends(auth),
    ):
        """Delete a user. Requires admin role. Cannot delete yourself."""
        current_user = getattr(request.state, "username", None)
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")

        current_role = auth_handler.get_dynamic_role(current_user)
        if current_role != "admin":
            raise HTTPException(status_code=403, detail="Admin role required")

        if username == current_user:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")

        if not user_store.delete_user(username):
            raise HTTPException(status_code=404, detail="User not found")

        # Also remove from auth handler
        auth_handler.accounts.pop(username, None)
        auth_handler.dynamic_roles.pop(username, None)
        auth_handler.remove_session_version(username)

        logger.info("User '%s' deleted by admin '%s'", username, current_user)
        return {"status": "ok", "username": username}

    # ── Change own password ─────────────────────────────────────────

    @router.put("/me/password")
    async def change_own_password(
        body: PasswordChangeRequest,
        request: Request,
        _=Depends(auth),
    ):
        """Change the current user's password."""
        username = getattr(request.state, "username", None)
        if not username:
            raise HTTPException(status_code=401, detail="Authentication required")

        if not user_store.has_user(username):
            raise HTTPException(status_code=404, detail="User not found in store")

        # Verify old password
        user_info = user_store._users.get(username)
        if not user_info:
            raise HTTPException(status_code=404, detail="User not found")

        stored_pw = user_info.get("password", "")
        if not verify_password(body.old_password, stored_pw):
            raise HTTPException(status_code=400, detail="Current password is incorrect")

        # Update password
        user_info["password"] = hash_password(body.new_password)
        user_store._save()

        # Update in auth handler
        auth_handler.accounts[username] = hash_password(body.new_password)

        # Invalidate existing sessions by bumping session version
        new_version = user_store.increment_session_version(username)
        auth_handler.set_session_version(username, new_version)

        logger.info("User '%s' changed their password (session_version=%d)", username, new_version)
        return {"status": "ok", "message": "Password changed successfully"}

    # ── Admin reset user password ───────────────────────────────────

    @router.put("/{username}/password")
    async def admin_reset_password(
        username: str,
        body: AdminPasswordResetRequest,
        request: Request,
        _=Depends(auth),
    ):
        """Reset a user's password. Requires admin role."""
        current_user = getattr(request.state, "username", None)
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")

        current_role = auth_handler.get_dynamic_role(current_user)
        if current_role != "admin":
            raise HTTPException(status_code=403, detail="Admin role required")

        if not user_store.has_user(username):
            raise HTTPException(status_code=404, detail="User not found")

        user_info = user_store._users.get(username)
        if user_info:
            user_info["password"] = hash_password(body.new_password)
            user_store._save()

        auth_handler.accounts[username] = hash_password(body.new_password)

        # Invalidate existing sessions by bumping session version
        new_version = user_store.increment_session_version(username)
        auth_handler.set_session_version(username, new_version)

        logger.info("Admin '%s' reset password for user '%s' (session_version=%d)", current_user, username, new_version)
        return {"status": "ok", "username": username}

    return router
