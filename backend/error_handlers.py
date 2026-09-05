"""
Enhanced error handling utilities for better error messages and debugging.
"""

import logging
from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError, PyMongoError
from pydantic import ValidationError

logger = logging.getLogger(__name__)


class AppError(HTTPException):
    """Base application error with enhanced logging."""
    
    def __init__(self, detail: str, status_code: int = 500, error_code: str = "INTERNAL_ERROR"):
        super().__init__(status_code=status_code, detail=detail)
        self.error_code = error_code
        logger.error(f"[{error_code}] {detail}")


class ValidationAppError(AppError):
    """Validation error with field information."""
    
    def __init__(self, field: str, message: str):
        detail = f"Validation error in '{field}': {message}"
        super().__init__(detail, status_code=status.HTTP_400_BAD_REQUEST, error_code="VALIDATION_ERROR")
        self.field = field


class DatabaseError(AppError):
    """Database operation error."""
    
    def __init__(self, operation: str, reason: str, original_error: Exception = None):
        detail = f"Database {operation} failed: {reason}"
        super().__init__(detail, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, error_code="DATABASE_ERROR")
        if original_error:
            logger.exception(f"Original error: {str(original_error)}")


class DuplicateEmailError(AppError):
    """Email already exists error."""
    
    def __init__(self, email: str):
        detail = f"Email '{email}' is already registered. Please use login instead or try a different email."
        super().__init__(detail, status_code=status.HTTP_400_BAD_REQUEST, error_code="DUPLICATE_EMAIL")


class InvalidEmailError(AppError):
    """Invalid email format error."""
    
    def __init__(self, email: str):
        detail = f"Invalid email format: '{email}'. Please provide a valid email address."
        super().__init__(detail, status_code=status.HTTP_400_BAD_REQUEST, error_code="INVALID_EMAIL")


class WeakPasswordError(AppError):
    """Password too weak error."""
    
    def __init__(self):
        detail = "Password is too weak. Please use at least 8 characters including uppercase, lowercase, and numbers."
        super().__init__(detail, status_code=status.HTTP_400_BAD_REQUEST, error_code="WEAK_PASSWORD")


class AuthenticationError(AppError):
    """Authentication failed error."""
    
    def __init__(self, reason: str = "Invalid credentials"):
        detail = f"Authentication failed: {reason}"
        super().__init__(detail, status_code=status.HTTP_401_UNAUTHORIZED, error_code="AUTH_FAILED")


class NotFoundError(AppError):
    """Resource not found error."""
    
    def __init__(self, resource_type: str, identifier: str):
        detail = f"{resource_type} not found: {identifier}"
        super().__init__(detail, status_code=status.HTTP_404_NOT_FOUND, error_code="NOT_FOUND")


class UnauthorizedError(AppError):
    """User not authorized error."""
    
    def __init__(self, resource: str = "resource"):
        detail = f"You are not authorized to access this {resource}"
        super().__init__(detail, status_code=status.HTTP_403_FORBIDDEN, error_code="UNAUTHORIZED")


def handle_signup_error(error: Exception, email: str = None, operation: str = "signup"):
    """Handle signup-specific errors with detailed messages."""
    
    if isinstance(error, DuplicateKeyError):
        raise DuplicateEmailError(email or "unknown")
    
    elif isinstance(error, ValidationError):
        # Handle pydantic validation errors
        errors = error.errors()
        if errors:
            first_error = errors[0]
            field = first_error.get("loc", ["unknown"])[0]
            msg = first_error.get("msg", "Invalid value")
            raise ValidationAppError(str(field), msg)
    
    elif isinstance(error, ValueError) and "email" in str(error).lower():
        raise InvalidEmailError(email or "unknown")
    
    elif isinstance(error, ValueError) and "password" in str(error).lower():
        raise WeakPasswordError()
    
    elif isinstance(error, PyMongoError):
        raise DatabaseError(operation, str(error), error)
    
    else:
        # Generic database error
        logger.exception(f"Unexpected error during {operation}: {str(error)}")
        raise DatabaseError(operation, "An unexpected database error occurred", error)
