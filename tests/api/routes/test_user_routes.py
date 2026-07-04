"""
Tests for user management routes and session invalidation.

Covers:
- User CRUD (list, role change, delete)
- Password change (own + admin reset)
- Session version increment on password change
- Token invalidation after password change
"""

import importlib
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

pytestmark = pytest.mark.offline


def _reimport(module_name: str):
    """Force-reimport a module, clearing cached copies."""
    sys.modules.pop(module_name, None)
    package_name, _, child_name = module_name.rpartition(".")
    package = sys.modules.get(package_name)
    if package is not None and hasattr(package, child_name):
        delattr(package, child_name)
    return importlib.import_module(module_name)


@pytest.fixture
def auth_module(monkeypatch):
    """Import auth module with test config."""
    config = _reimport("lightrag.api.config")
    mock_global_args = SimpleNamespace(
        token_secret="test-jwt-secret-that-is-long-enough",
        jwt_algorithm="HS256",
        token_expire_hours=48,
        guest_token_expire_hours=24,
        auth_accounts="",
        token_auto_renew=False,
        token_renew_threshold=0.5,
        whitelist_paths="/health",
    )
    monkeypatch.setattr(config, "global_args", mock_global_args)
    module = _reimport("lightrag.api.auth")
    module = importlib.reload(module)
    # Also reimport utils_api so whitelist_paths picks up mock config
    _reimport("lightrag.api.utils_api")
    yield module
    sys.modules.pop("lightrag.api.auth", None)


@pytest.fixture
def user_store(tmp_path):
    """Create a UserStore backed by a temp directory."""
    from lightrag.api.user_store import UserStore
    return UserStore(str(tmp_path))


@pytest.fixture
def app_and_client(auth_module, user_store, tmp_path, monkeypatch):
    """Build a minimal FastAPI app with user routes."""
    auth_handler = auth_module.auth_handler

    # Register a test admin user
    from lightrag.api.passwords import hash_password
    admin_hashed = hash_password("admin_pass")
    user_store._users["testadmin"] = {
        "password": admin_hashed,
        "role": "admin",
        "created_at": 1000000,
        "session_version": 0,
    }
    user_store._save()
    auth_handler.add_dynamic_user("testadmin", admin_hashed, "admin")

    # Register a regular user
    user_hashed = hash_password("user_pass")
    user_store._users["testuser"] = {
        "password": user_hashed,
        "role": "user",
        "created_at": 1000001,
        "session_version": 0,
    }
    user_store._save()
    auth_handler.add_dynamic_user("testuser", user_hashed, "user")

    # Monkeypatch UserStore to use our temp instance
    import lightrag.api.user_routes as user_routes_mod
    monkeypatch.setattr(user_routes_mod, "UserStore", lambda _: user_store)
    # Ensure route module uses the SAME auth_handler as the test
    monkeypatch.setattr(user_routes_mod, "auth_handler", auth_handler)

    # Also patch utils_api's auth_handler reference
    import lightrag.api.utils_api as utils_api_mod
    monkeypatch.setattr(utils_api_mod, "auth_handler", auth_handler)

    from lightrag.api.user_routes import create_user_routes
    router = create_user_routes(str(tmp_path), api_key=None)

    _app = FastAPI()
    _app.include_router(router)

    client = TestClient(_app)
    return _app, client, auth_handler, user_store


def _login_token(client, auth_module, username, password):
    """Helper: create a JWT token for a user."""
    handler = auth_module.auth_handler
    role = handler.get_dynamic_role(username)
    sv = handler.get_session_version(username)
    return handler.create_token(
        username=username,
        role=role,
        metadata={"auth_mode": "enabled", "session_version": sv},
    )


class TestListUsers:
    def test_admin_can_list(self, app_and_client):
        _, client, _, _ = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]
        token = _login_token(client, auth_mod, "testadmin", "admin_pass")

        resp = client.get("/users", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        usernames = {u["username"] for u in data["users"]}
        assert "testadmin" in usernames
        assert "testuser" in usernames

    def test_non_admin_rejected(self, app_and_client):
        _, client, _, _ = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]
        token = _login_token(client, auth_mod, "testuser", "user_pass")

        resp = client.get("/users", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_unauthenticated_rejected(self, app_and_client):
        _, client, _, _ = app_and_client
        resp = client.get("/users")
        assert resp.status_code in (401, 403)


class TestChangeUserRole:
    def test_admin_can_change_role(self, app_and_client):
        _, client, auth_handler, _ = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]
        token = _login_token(client, auth_mod, "testadmin", "admin_pass")

        resp = client.put(
            "/users/testuser/role",
            json={"role": "guest"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "guest"
        assert auth_handler.dynamic_roles["testuser"] == "guest"

    def test_invalid_role_rejected(self, app_and_client):
        _, client, _, _ = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]
        token = _login_token(client, auth_mod, "testadmin", "admin_pass")

        resp = client.put(
            "/users/testuser/role",
            json={"role": "superadmin"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400


class TestDeleteUser:
    def test_admin_can_delete(self, app_and_client):
        _, client, auth_handler, user_store = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]
        token = _login_token(client, auth_mod, "testadmin", "admin_pass")

        resp = client.delete(
            "/users/testuser",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert not user_store.has_user("testuser")
        assert "testuser" not in auth_handler.accounts

    def test_cannot_delete_self(self, app_and_client):
        _, client, _, _ = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]
        token = _login_token(client, auth_mod, "testadmin", "admin_pass")

        resp = client.delete(
            "/users/testadmin",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400


class TestPasswordChange:
    def test_own_password_change(self, app_and_client):
        _, client, _, user_store = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]
        token = _login_token(client, auth_mod, "testuser", "user_pass")

        resp = client.put(
            "/users/me/password",
            json={"old_password": "user_pass", "new_password": "new_user_pass"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        # Session version should have been incremented
        assert user_store.get_session_version("testuser") == 1

    def test_wrong_old_password_rejected(self, app_and_client):
        _, client, _, _ = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]
        token = _login_token(client, auth_mod, "testuser", "user_pass")

        resp = client.put(
            "/users/me/password",
            json={"old_password": "wrong_old_pass", "new_password": "new_pass"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400

    def test_admin_reset_password(self, app_and_client):
        _, client, _, user_store = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]
        token = _login_token(client, auth_mod, "testadmin", "admin_pass")

        resp = client.put(
            "/users/testuser/password",
            json={"new_password": "reset_pass"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert user_store.get_session_version("testuser") == 1


class TestSessionInvalidation:
    def test_old_token_rejected_after_password_change(self, app_and_client):
        """After password change, tokens with old session_version should be rejected."""
        _, client, auth_handler, _ = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]

        # Create a token with current session version
        old_token = _login_token(client, auth_mod, "testuser", "user_pass")

        # Change password (this bumps session_version)
        resp = client.put(
            "/users/me/password",
            json={"old_password": "user_pass", "new_password": "new_user_pass"},
            headers={"Authorization": f"Bearer {old_token}"},
        )
        assert resp.status_code == 200

        # The old token should now be rejected by validate_token
        with pytest.raises(Exception) as exc_info:
            auth_handler.validate_token(old_token)
        assert "401" in str(exc_info.value) or "Session invalidated" in str(exc_info.value)

    def test_new_token_works_after_password_change(self, app_and_client):
        """After password change, a fresh token should work."""
        _, client, auth_handler, _ = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]

        # Change password
        old_token = _login_token(client, auth_mod, "testuser", "user_pass")
        client.put(
            "/users/me/password",
            json={"old_password": "user_pass", "new_password": "new_user_pass"},
            headers={"Authorization": f"Bearer {old_token}"},
        )

        # Create a new token (will pick up the bumped session_version)
        new_token = _login_token(client, auth_mod, "testuser", "new_user_pass")
        result = auth_handler.validate_token(new_token)
        assert result["username"] == "testuser"

    def test_session_version_persisted(self, user_store):
        """Session version should survive save/load cycles."""
        user_store._users["persist_user"] = {
            "password": "fake_hash",
            "role": "user",
            "created_at": 0,
            "session_version": 0,
        }
        user_store._save()

        # Increment twice
        user_store.increment_session_version("persist_user")
        user_store.increment_session_version("persist_user")
        assert user_store.get_session_version("persist_user") == 2

        # Reload from disk
        from lightrag.api.user_store import UserStore
        reloaded = UserStore(user_store._path.parent)
        assert reloaded.get_session_version("persist_user") == 2

    def test_delete_cleans_session_version(self, app_and_client):
        """Deleting a user should remove their session version tracking."""
        _, client, auth_handler, _ = app_and_client
        auth_mod = sys.modules["lightrag.api.auth"]

        # Set a session version
        auth_handler.set_session_version("testuser", 5)
        assert auth_handler.get_session_version("testuser") == 5

        # Delete the user
        token = _login_token(client, auth_mod, "testadmin", "admin_pass")
        client.delete("/users/testuser", headers={"Authorization": f"Bearer {token}"})

        assert auth_handler.get_session_version("testuser") == 0
