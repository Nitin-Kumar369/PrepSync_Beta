"""
Authentication routes - signup, login, token refresh.
"""

import logging
from fastapi import APIRouter, HTTPException, status, Depends
from models import (
    SignupRequest, LoginRequest, TokenResponse, UserRole
)
from db import UserModel, get_db
from auth import hash_password, verify_password, create_access_token, get_current_user
from pydantic import ValidationError
from error_handlers import (
    DuplicateEmailError, InvalidEmailError, WeakPasswordError, 
    DatabaseError, AuthenticationError
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: SignupRequest):
    """
    User signup endpoint with enhanced error handling.
    
    Creates a new user account and returns an access token.
    
    Args:
        request: SignupRequest with email, password, full_name, department
        
    Returns:
        TokenResponse with access token and user info
        
    Raises:
        HTTPException 400: Email already exists or validation error
        HTTPException 500: Database error
    """
    try:
        # Step 1: Validate email format
        import re
        email_pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        if not re.match(email_pattern, request.email):
            logger.warning(f"Invalid email format: {request.email}")
            raise InvalidEmailError(request.email)
        logger.info(f"✅ Email format validated: {request.email}")

        # Step 2: Check if user already exists
        existing_user = UserModel.find_by_email(request.email)
        if existing_user:
            logger.warning(f"Signup attempt with existing email: {request.email}")
            raise DuplicateEmailError(request.email)

        # Step 3: Validate password strength (8+ chars, uppercase, lowercase, numbers)
        if len(request.password) < 8:
            logger.warning(f"Weak password attempt (too short) for: {request.email}")
            raise WeakPasswordError()
        if not any(c.isupper() for c in request.password):
            logger.warning(f"Weak password attempt (no uppercase) for: {request.email}")
            raise WeakPasswordError()
        if not any(c.islower() for c in request.password):
            logger.warning(f"Weak password attempt (no lowercase) for: {request.email}")
            raise WeakPasswordError()
        if not any(c.isdigit() for c in request.password):
            logger.warning(f"Weak password attempt (no numbers) for: {request.email}")
            raise WeakPasswordError()
        logger.info(f"✅ Password strength validated")

        # Step 4: Hash password
        try:
            password_hash = hash_password(request.password)
        except Exception as e:
            logger.error(f"Password hashing failed: {str(e)}")
            raise DatabaseError("password_hashing", str(e), e)

        # Step 5: Create user in database
        try:
            user = UserModel.create(
                email=request.email,
                password_hash=password_hash,
                full_name=request.full_name,
                department=request.department,
                role=UserRole.STUDENT.value
            )
            logger.info(f"✅ User created successfully: {request.email}")
        except Exception as e:
            logger.error(f"User creation failed: {str(e)}")
            raise DatabaseError("user_creation", str(e), e)

        # Step 6: Create access token
        try:
            token = create_access_token(
                user_id=str(user["_id"]),
                email=user["email"],
                full_name=user["full_name"],
                role=user["role"]
            )
            logger.info(f"✅ Access token created for: {request.email}")
        except Exception as e:
            logger.error(f"Token creation failed: {str(e)}")
            raise DatabaseError("token_creation", str(e), e)

        logger.info(f"✅ User signup successful: {request.email}")

        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user_id=str(user["_id"]),
            email=user["email"],
            full_name=user["full_name"],
            role=user["role"]
        )

    except (DuplicateEmailError, InvalidEmailError, WeakPasswordError, DatabaseError, AuthenticationError):
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ Unexpected signup error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Signup failed: {str(e)}"
        )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """
    User login endpoint.
    
    Authenticates a user and returns an access token.
    
    Args:
        request: LoginRequest with email and password
        
    Returns:
        TokenResponse with access token and user info
        
    Raises:
        HTTPException 401: Invalid email or password
        HTTPException 500: Database error
    """
    try:
        # Find user by email
        user = UserModel.find_by_email(request.email)
        if not user:
            logger.warning(f"Login attempt with unknown email: {request.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Verify password
        if not verify_password(request.password, user["password_hash"]):
            logger.warning(f"Login attempt with wrong password: {request.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Check if user is active
        if not user.get("active", True):
            logger.warning(f"Login attempt for inactive user: {request.email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled. Contact support."
            )

        # Update last login
        UserModel.update_last_login(user["_id"])

        # Create access token
        token = create_access_token(
            user_id=str(user["_id"]),
            email=user["email"],
            full_name=user["full_name"],
            role=user.get("role", "student")
        )

        logger.info(f"✅ User login successful: {request.email}")

        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user_id=str(user["_id"]),
            email=user["email"],
            full_name=user["full_name"],
            role=user.get("role", "student")
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed. Please try again."
        )


@router.get("/me", response_model=TokenResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """
    Get current authenticated user's information.
    
    Args:
        current_user: Current user from JWT token (via dependency injection)
        
    Returns:
        TokenResponse with user info
    """
    try:
        # Fetch latest user info from database
        user_id = current_user.get("user_id")
        user = UserModel.find_by_id(user_id)

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        return TokenResponse(
            access_token="",  # Not returning token for this endpoint
            token_type="bearer",
            user_id=str(user["_id"]),
            email=user["email"],
            full_name=user["full_name"],
            role=user.get("role", "student")
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching user info: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch user information"
        )


# (Using `Depends(get_current_user)` directly for authentication dependencies)
