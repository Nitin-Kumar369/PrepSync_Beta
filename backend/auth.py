"""
Authentication utilities for JWT tokens and password hashing.
"""

import logging
from typing import Optional
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import settings

logger = logging.getLogger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer security scheme
security = HTTPBearer()
# an optional bearer scheme that doesn't raise when missing
security_optional = HTTPBearer(auto_error=False)


# ============================================
# Password Utilities
# ============================================

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ============================================
# JWT Token Utilities
# ============================================

class TokenPayload:
    """JWT token payload."""
    def __init__(
        self,
        user_id: str,
        email: str,
        full_name: str,
        role: str = "student"
    ):
        self.user_id = user_id
        self.email = email
        self.full_name = full_name
        self.role = role
        self.exp = datetime.utcnow() + timedelta(hours=settings.jwt_expiration_hours)
        self.iat = datetime.utcnow()

    def to_dict(self):
        """Convert to dictionary for JWT encoding."""
        return {
            "user_id": self.user_id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "exp": self.exp,
            "iat": self.iat
        }


def create_access_token(
    user_id: str,
    email: str,
    full_name: str,
    role: str = "student"
) -> str:
    """Create a JWT access token."""
    payload = TokenPayload(
        user_id=user_id,
        email=email,
        full_name=full_name,
        role=role
    )

    encoded_jwt = jwt.encode(
        payload.to_dict(),
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm
    )
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError as e:
        logger.warning(f"Invalid token: {str(e)}")
        return None


# ============================================
# Dependency Injection for FastAPI
# ============================================

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    FastAPI dependency to extract and validate current user from JWT token.
    Use as: @app.get("/protected") async def endpoint(user = Depends(get_current_user))
    """
    token = credentials.credentials
    payload = decode_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("user_id")
    email = payload.get("email")
    role = payload.get("role", "student")

    if not user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing required claims",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "user_id": user_id,
        "email": email,
        "full_name": payload.get("full_name"),
        "role": role
    }


async def get_current_admin(user: dict = Depends(get_current_user)) -> dict:
    """
    FastAPI dependency to ensure current user is an admin.
    Use as: @app.post("/admin/something") async def endpoint(user = Depends(get_current_admin))
    """
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user


# ============================================
# Additional Dependencies
# ============================================

async def get_current_user_optional_no_scheme(
    request: Request
) -> dict | None:
    """
    Optional authentication that truly allows public access (no Authorization header required).
    Extracts token from Authorization header if present, otherwise returns None.
    """
    auth_header = request.headers.get("Authorization")
    
    # No header provided - public access
    if not auth_header:
        return None
    
    # Header provided but invalid format
    if not auth_header.startswith("Bearer "):
        return None
    
    # Extract token
    token = auth_header.split(" ", 1)[1]
    payload = decode_token(token)
    
    if payload is None:
        # Invalid token - could be wrong creds, be lenient
        return None
    
    user_id = payload.get("user_id")
    email = payload.get("email")
    
    if not user_id or not email:
        return None
    
    return {
        "user_id": user_id,
        "email": email,
        "full_name": payload.get("full_name"),
        "role": payload.get("role", "student")
    }


# Keep old optional function for backward compatibility
async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security_optional)
) -> dict | None:
    """Like :func:`get_current_user` but returns None when no token provided.
    Useful for endpoints that can be accessed publicly.
    
    Note: HTTPBearer with auto_error=False still requires the Authorization header.
    To make endpoints truly public, don't use this dependency unless users might auth.
    """
    # If no credentials provided, return None (public access allowed)
    if credentials is None:
        return None
    
    # If credentials provided, validate the token
    token = credentials.credentials
    payload = decode_token(token)
    
    if payload is None:
        # Could be invalid token - but we're lenient for optional auth
        return None
    
    user_id = payload.get("user_id")
    email = payload.get("email")
    
    if not user_id or not email:
        return None
    
    return {
        "user_id": user_id,
        "email": email,
        "full_name": payload.get("full_name"),
        "role": payload.get("role", "student")
    }


# ============================================
# Testing Utilities (Development Only)
# ============================================

def create_test_token(user_id: str = "test_user_id", role: str = "student") -> str:
    """Create a test token (for development/testing)."""
    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@test.local",
        full_name="Test User",
        role=role
    )


if __name__ == "__main__":
    # Test password hashing
    test_password = "SecurePassword123"
    hashed = hash_password(test_password)
    print(f"Password: {test_password}")
    print(f"Hashed: {hashed}")
    print(f"Verify: {verify_password(test_password, hashed)}")

    # Test token creation and decoding
    token = create_test_token()
    print(f"\nTest Token: {token}")
    decoded = decode_token(token)
    print(f"Decoded: {decoded}")
