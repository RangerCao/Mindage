"""
Persistent user management for dynamic registration.

Stores user accounts in a JSON file alongside the server's working directory.
Supports roles (admin / user) and integrates with the existing AuthHandler
for password hashing / verification.
"""

import json
import time
from pathlib import Path
from typing import Optional

from ..utils import logger
from .passwords import hash_password, verify_password, validate_username, validate_password_strength


# Default user store path: {working_dir}/users.json
_USER_STORE_FILENAME = "users.json"


class UserStore:
    """JSON-file-backed user store with role support."""

    def __init__(self, working_dir: str):
        self._path = Path(working_dir) / _USER_STORE_FILENAME
        self._users: dict[str, dict] = {}  # username -> {password, role, created_at}
        self._load()

    # ── Persistence ──────────────────────────────────────────────────────

    def _load(self):
        """Load users from disk."""
        if self._path.exists():
            try:
                data = json.loads(self._path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    self._users = data
            except Exception as exc:
                logger.warning("Failed to load user store from %s: %s", self._path, exc)
                self._users = {}

    def _save(self):
        """Persist users to disk."""
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                json.dumps(self._users, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as exc:
            logger.error("Failed to save user store to %s: %s", self._path, exc)

    # ── Public API ───────────────────────────────────────────────────────

    def register(
        self,
        username: str,
        password: str,
        role: str = "user",
    ) -> tuple[bool, str]:
        """Register a new user.

        Returns (success, message).
        """
        if not username or not password:
            return False, "Username and password are required"

        # Validate username format
        valid, error = validate_username(username)
        if not valid:
            return False, error

        safe_name = username.strip()

        # Validate password strength
        valid, error = validate_password_strength(password)
        if not valid:
            return False, error

        if safe_name in self._users:
            return False, "Username already exists"

        self._users[safe_name] = {
            "password": hash_password(password),
            "role": role,
            "created_at": time.time(),
            "session_version": 0,
        }
        self._save()
        logger.info("New user registered: %s (role=%s)", safe_name, role)
        return True, "Registration successful"

    def verify(self, username: str, password: str) -> tuple[bool, str]:
        """Verify credentials for a dynamic user.

        Returns (success, role).
        """
        user = self._users.get(username)
        if not user:
            return False, ""
        stored_pw = user.get("password", "")
        if verify_password(password, stored_pw):
            return True, user.get("role", "user")
        return False, ""

    def get_role(self, username: str) -> Optional[str]:
        """Return the role for a dynamic user, or None if not found."""
        user = self._users.get(username)
        if user:
            return user.get("role", "user")
        return None

    def has_user(self, username: str) -> bool:
        return username in self._users

    def list_users(self) -> list[dict]:
        """Return metadata for all dynamic users (no passwords)."""
        result = []
        for uname, info in self._users.items():
            result.append({
                "username": uname,
                "role": info.get("role", "user"),
                "created_at": info.get("created_at", 0),
                "session_version": info.get("session_version", 0),
            })
        return result

    def delete_user(self, username: str) -> bool:
        """Remove a user. Returns True if deleted."""
        if username in self._users:
            del self._users[username]
            self._save()
            logger.info("User deleted: %s", username)
            return True
        return False

    def get_session_version(self, username: str) -> int:
        """Return the session version for a user, default 0."""
        user = self._users.get(username)
        if user:
            return user.get("session_version", 0)
        return 0

    def increment_session_version(self, username: str) -> int:
        """Increment and persist the session version for a user.

        This invalidates all existing tokens for the user.
        Returns the new session version.
        """
        user = self._users.get(username)
        if user:
            new_version = user.get("session_version", 0) + 1
            user["session_version"] = new_version
            self._save()
            return new_version
        return 0

    @property
    def user_count(self) -> int:
        return len(self._users)
