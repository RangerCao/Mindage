import bcrypt
import re

BCRYPT_PASSWORD_PREFIX = "{bcrypt}"

# Top 100 most common passwords — reject these on registration
COMMON_PASSWORDS = {
    "123456", "password", "12345678", "qwerty", "abc123",
    "123456789", "111111", "1234567", "iloveyou", "admin",
    "welcome", "monkey", "1234", "letmein", "football",
    "shadow", "master", "666666", "qwertyuiop", "123123",
    "000000", "password1", "12345", "1q2w3e4r", "sunshine",
    "princess", "qwerty123", "azerty", "starwars", "121212",
    "flower", "passw0rd", "hello123", "charlie", "donald",
    "password123", "admin123", "root", "toor", "changeme",
    "test", "guest", "pass", "1qaz2wsx", "asdfgh",
    "zxcvbn", "asdfghjkl", "123qwe", "qwe123", "p@ssw0rd",
    "p@ssword", "pass123", "pass1234", "abcdef", "abc123456",
    "a123456", "123321", "654321", "987654321", "147258369",
    "159357", "112233", "888888", "7777777", "0123456789",
    "asdf1234", "Aa123456", "aa123456", "woaini", "5201314",
    "520520", "iloveu", "love1314", "qazwsx", "zaq12wsx",
}

# Username pattern: alphanumeric, underscore, hyphen only
USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]+$")


def validate_username(username: str) -> tuple[bool, str]:
    """Validate username format.

    Returns (is_valid, error_message).
    """
    if not username or not username.strip():
        return False, "Username cannot be empty"
    name = username.strip()
    if len(name) < 2:
        return False, "Username must be at least 2 characters"
    if len(name) > 50:
        return False, "Username must be at most 50 characters"
    if not USERNAME_PATTERN.match(name):
        return False, "Username can only contain letters, digits, underscore and hyphen"
    return True, ""


def validate_password_strength(password: str) -> tuple[bool, str]:
    """Validate password strength.

    Returns (is_valid, error_message).
    """
    if not password:
        return False, "Password cannot be empty"
    if len(password) < 4:
        return False, "Password must be at least 4 characters"
    if len(password) > 128:
        return False, "Password must be at most 128 characters"
    if password.lower() in COMMON_PASSWORDS:
        return False, "This password is too common, please choose a stronger one"
    # Check for purely sequential digits
    if password.isdigit() and len(set(password)) <= 2:
        return False, "Password is too simple, please use a mix of letters and numbers"
    return True, ""


def is_common_password(password: str) -> bool:
    """Check if a password is in the common passwords list."""
    return password.lower() in COMMON_PASSWORDS


def hash_password(password: str) -> str:
    """Return an AUTH_ACCOUNTS-ready bcrypt password value."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")
    return f"{BCRYPT_PASSWORD_PREFIX}{hashed}"


def verify_password(plain_password: str, stored_password: str) -> bool:
    """Verify a plaintext password against a stored password spec."""
    if stored_password.startswith(BCRYPT_PASSWORD_PREFIX):
        hashed_password = stored_password[len(BCRYPT_PASSWORD_PREFIX) :]
        if not hashed_password:
            return False
        try:
            return bcrypt.checkpw(
                plain_password.encode("utf-8"), hashed_password.encode("utf-8")
            )
        except ValueError:
            return False

    return stored_password == plain_password
