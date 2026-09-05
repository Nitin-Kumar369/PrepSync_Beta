"""
User profile endpoints - get and update user profile information.
"""

import logging
from fastapi import APIRouter, HTTPException, status, Depends
from models import UserProfileResponse, UpdateProfileRequest
from db import UserModel
from auth import get_current_user, hash_password, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ============================================
# USER PROFILE ENDPOINTS
# ============================================

@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get current user's profile information."""
    try:
        user = UserModel.find_by_id(current_user.get("user_id"))
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return UserProfileResponse(
            user_id=str(user["_id"]),
            email=user["email"],
            full_name=user["full_name"],
            department=user.get("department", ""),
            role=user.get("role", "student"),
            active=user.get("active", True),
            created_at=user.get("created_at"),
            last_login=user.get("last_login")
        )
    except Exception as e:
        logger.error(f"Error fetching user profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch profile")


@router.put("/profile")
async def update_profile(
    request: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update current user's profile information."""
    try:
        user_id = current_user.get("user_id")
        user = UserModel.find_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        updates = {}
        
        # Update basic fields if provided
        if request.full_name is not None:
            updates["full_name"] = request.full_name
        if request.department is not None:
            updates["department"] = request.department
        
        # Handle email change
        if request.email is not None and request.email != user["email"]:
            if not request.current_password:
                raise HTTPException(
                    status_code=400,
                    detail="Current password required to change email"
                )
            # Verify current password
            if not verify_password(request.current_password, user["password_hash"]):
                raise HTTPException(
                    status_code=401,
                    detail="Invalid password"
                )
            # Check for duplicate emails
            existing = UserModel.find_by_email(request.email)
            if existing and str(existing["_id"]) != user_id:
                raise HTTPException(status_code=400, detail="Email already in use")
            updates["email"] = request.email
        
        # Handle password change
        if request.new_password is not None:
            if not request.current_password:
                raise HTTPException(
                    status_code=400,
                    detail="Current password required to change password"
                )
            # Verify current password
            if not verify_password(request.current_password, user["password_hash"]):
                raise HTTPException(
                    status_code=401,
                    detail="Invalid password"
                )
            # Hash and update new password
            new_password_hash = hash_password(request.new_password)
            UserModel.update_password(user_id, new_password_hash)
        
        # Apply other updates
        if updates:
            UserModel.update_user(user_id, **updates)
        
        return {"message": "Profile updated successfully", "user_id": user_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update profile")
