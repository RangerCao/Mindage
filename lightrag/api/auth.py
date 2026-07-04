from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import HTTPException, status
from pydantic import BaseModel

from ..utils import logger
from .config import DEFAULT_TOKEN_SECRET, global_args
from .passwords import verify_password

# use the .env that is inside the current folder
# allows to use different .env file for each lightrag instance
# the OS environment variables take precedence over the .env file
load_dotenv(dotenv_path=".env", override=False)


class TokenPayload(BaseModel):
    sub: str  # Username
    exp: datetime  # Expiration time
    role: str = "user"  # User role, default is regular user
    metadata: dict = {}  # Additional metadata


class AuthHandler:
    def __init__(self):
        auth_accounts = global_args.auth_accounts
        self.secret = global_args.token_secret
        if not self.secret:
            if auth_accounts:
                raise ValueError(
                    "TOKEN_SECRET must be explicitly set to a non-default value when AUTH_ACCOUNTS is configured."
                )
            self.secret = DEFAULT_TOKEN_SECRET
            logger.warning(
                "TOKEN_SECRET not set and AUTH_ACCOUNTS is not configured. "
                "Falling back to the default guest-mode JWT secret. "
            )
        algorithm = global_args.jwt_algorithm
        if not algorithm or algorithm.lower() == "none":
            raise ValueError(
                "JWT_ALGORITHM must be set to a secure algorithm (e.g. HS256). "
                "The 'none' algorithm is not permitted."
            )
        self.algorithm = algorithm
        self.expire_hours = global_args.token_expire_hours
        self.guest_expire_hours = global_args.guest_token_expire_hours
        self.accounts = {}
        invalid_accounts = []
        if auth_accounts:
            for account in auth_accounts.split(","):
                try:
                    username, password = account.split(":", 1)
                    if not username or not password:
                        raise ValueError
                    self.accounts[username] = password
                except ValueError:
                    invalid_accounts.append(account)
        if invalid_accounts:
            invalid_entries = ", ".join(invalid_accounts)
            logger.error(f"Invalid account format in AUTH_ACCOUNTS: {invalid_entries}")
            raise ValueError(
                "AUTH_ACCOUNTS must use comma-separated user:password pairs."
            )
        self._static_accounts = set(self.accounts.keys())
        self.dynamic_roles: dict[str, str] = {}  # username -> role for registered users
        self.session_versions: dict[str, int] = {}  # username -> current session version
        self._has_static_accounts = bool(self.accounts)

    # ── Dynamic user helpers (used by UserStore / registration) ──────────

    def add_dynamic_user(self, username: str, hashed_password: str, role: str = "user"):
        """Register a dynamic user so that verify_password / token creation work."""
        self.accounts[username] = hashed_password
        self.dynamic_roles[username] = role

    def get_dynamic_role(self, username: str) -> str:
        """Return the role for a dynamic user, default 'user'."""
        return self.dynamic_roles.get(username, "user")

    def has_any_accounts(self) -> bool:
        """True if there are static OR dynamic accounts."""
        return self._has_static_accounts or bool(self.dynamic_roles)

    def get_session_version(self, username: str) -> int:
        """Return the current session version for a user, default 0."""
        return self.session_versions.get(username, 0)

    def set_session_version(self, username: str, version: int):
        """Set the session version for a user (in-memory mirror of UserStore)."""
        self.session_versions[username] = version

    def remove_session_version(self, username: str):
        """Remove session version tracking for a user (on delete)."""
        self.session_versions.pop(username, None)

    def is_static_user(self, username: str) -> bool:
        """True if the username was in the original static accounts."""
        return self._has_static_accounts and username in self._static_accounts

    def verify_password(self, username: str, plain_password: str) -> bool:
        """
        Verify password for a user. Supports explicit bcrypt values and plaintext.

        Args:
            username: Username to verify
            plain_password: Plaintext password to check

        Returns:
            bool: True if password is correct, False otherwise
        """
        if username not in self.accounts:
            return False

        stored_password = self.accounts[username]
        return verify_password(plain_password, stored_password)

    def create_token(
        self,
        username: str,
        role: str = "user",
        custom_expire_hours: int = None,
        metadata: dict = None,
    ) -> str:
        """
        Create JWT token

        Args:
            username: Username
            role: User role, default is "user", guest is "guest"
            custom_expire_hours: Custom expiration time (hours), if None use default value
            metadata: Additional metadata

        Returns:
            str: Encoded JWT token
        """
        # Choose default expiration time based on role
        if custom_expire_hours is None:
            if role == "guest":
                expire_hours = self.guest_expire_hours
            else:
                expire_hours = self.expire_hours
        else:
            expire_hours = custom_expire_hours

        expire = datetime.now(timezone.utc) + timedelta(hours=expire_hours)

        # Create payload
        payload = TokenPayload(
            sub=username, exp=expire, role=role, metadata=metadata or {}
        )

        return jwt.encode(payload.model_dump(), self.secret, algorithm=self.algorithm)

    def validate_token(self, token: str) -> dict:
        """
        Validate JWT token

        Args:
            token: JWT token

        Returns:
            dict: Dictionary containing user information

        Raises:
            HTTPException: If token is invalid or expired
        """
        try:
            # Explicitly exclude 'none' to prevent algorithm confusion attacks
            allowed_algorithms = [self.algorithm]
            if "none" in (a.lower() for a in allowed_algorithms):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Insecure JWT algorithm configuration",
                )
            payload = jwt.decode(token, self.secret, algorithms=allowed_algorithms)
            expire_timestamp = payload["exp"]
            expire_time = datetime.fromtimestamp(expire_timestamp, timezone.utc)

            if datetime.now(timezone.utc) > expire_time:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired"
                )

            # Check session version invalidation
            username = payload["sub"]
            token_session_version = payload.get("metadata", {}).get("session_version")
            current_session_version = self.session_versions.get(username)
            if (
                current_session_version is not None
                and token_session_version is not None
                and token_session_version != current_session_version
            ):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session invalidated. Please login again.",
                )

            # Return complete payload instead of just username
            return {
                "username": payload["sub"],
                "role": payload.get("role", "user"),
                "metadata": payload.get("metadata", {}),
                "exp": expire_time,
            }
        except jwt.PyJWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
            )


auth_handler = AuthHandler()
