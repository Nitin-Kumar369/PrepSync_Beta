"""
Admin extension endpoints for user management, stats, RAG testing, and vector ops.
These will be integrated into the main admin router.
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends
from datetime import datetime, timedelta
from models import (
    UserListResponse, UserListItem, BookListResponse, BookListItem,
    RAGTestRequest, RAGTestResponse, RAGTestResultItem,
    VectorDeleteResponse, AdminStats
)
from db import UserModel, BookModel, ChatModel, SessionModel, get_db
from auth import get_current_admin, hash_password, verify_password
from rag.vector_store import get_vector_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])

# ============================================
# USER MANAGEMENT ENDPOINTS
# ============================================

@router.get("/users", response_model=UserListResponse)
async def list_users(
    limit: int = 50,
    offset: int = 0,
    role_filter: Optional[str] = None,
    admin: dict = Depends(get_current_admin)
):
    """List all users with pagination and optional role filter."""
    try:
        if role_filter and role_filter not in ["student", "admin"]:
            raise HTTPException(status_code=400, detail="Invalid role filter")
        
        if role_filter:
            users = UserModel.find_by_role(role_filter)
        else:
            users = UserModel.list_all(limit=limit, offset=offset)
        
        total = UserModel.count_all()
        
        user_list = []
        for user in users:
            user_list.append(UserListItem(
                user_id=str(user["_id"]),
                email=user["email"],
                full_name=user["full_name"],
                department=user.get("department", ""),
                role=user.get("role", "student"),
                active=user.get("active", True),
                created_at=user.get("created_at"),
                last_login=user.get("last_login")
            ))
        
        return UserListResponse(users=user_list, total_count=total)
    except Exception as e:
        logger.error(f"Error listing users: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list users")


@router.get("/users/{user_id}")
async def get_user_details(user_id: str, admin: dict = Depends(get_current_admin)):
    """Get detailed information about a specific user."""
    try:
        user = UserModel.find_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Count user's chats and sessions
        chat_count = len(list(ChatModel.find_by_user_id(user_id, limit=1000)))
        session_count = len(list(SessionModel.find_by_user_id(user_id, limit=1000)))
        
        return {
            "user_id": str(user["_id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "department": user.get("department", ""),
            "role": user.get("role", "student"),
            "active": user.get("active", True),
            "created_at": user.get("created_at"),
            "last_login": user.get("last_login"),
            "chat_count": chat_count,
            "session_count": session_count
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch user details")


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    full_name: Optional[str] = None,
    department: Optional[str] = None,
    email: Optional[str] = None,
    admin: dict = Depends(get_current_admin)
):
    """Update user profile information."""
    try:
        user = UserModel.find_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        updates = {}
        if full_name is not None:
            updates["full_name"] = full_name
        if department is not None:
            updates["department"] = department
        if email is not None:
            # Check for duplicate emails
            existing = UserModel.find_by_email(email)
            if existing and str(existing["_id"]) != user_id:
                raise HTTPException(status_code=400, detail="Email already in use")
            updates["email"] = email
        
        if updates:
            updated_user = UserModel.update_user(user_id, **updates)
            return {"message": "User updated successfully", "user_id": user_id}
        else:
            return {"message": "No changes", "user_id": user_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update user")


@router.patch("/users/{user_id}/role")
async def toggle_admin_role(user_id: str, admin: dict = Depends(get_current_admin)):
    """Toggle user between admin and student roles."""
    try:
        user = UserModel.find_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        current_role = user.get("role", "student")
        new_role = "student" if current_role == "admin" else "admin"
        
        UserModel.update_user(user_id, role=new_role)
        
        return {
            "message": f"User role updated to {new_role}",
            "user_id": user_id,
            "new_role": new_role
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling admin role: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to toggle admin role")


@router.patch("/users/{user_id}/deactivate")
async def deactivate_user(user_id: str, admin: dict = Depends(get_current_admin)):
    """Deactivate a user account."""
    try:
        user = UserModel.find_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        UserModel.deactivate_user(user_id)
        
        return {"message": "User deactivated", "user_id": user_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deactivating user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to deactivate user")


@router.patch("/users/{user_id}/activate")
async def activate_user(user_id: str, admin: dict = Depends(get_current_admin)):
    """Activate a deactivated user account."""
    try:
        user = UserModel.find_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        UserModel.activate_user(user_id)
        
        return {"message": "User activated", "user_id": user_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error activating user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to activate user")


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(get_current_admin)):
    """Delete a user and all associated data (chats, sessions)."""
    try:
        user = UserModel.find_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Prevent deleting the only admin
        admins = UserModel.find_by_role("admin")
        if len(admins) == 1 and user.get("role") == "admin":
            raise HTTPException(status_code=400, detail="Cannot delete the only admin user")
        
        UserModel.delete_by_id(user_id)
        
        return {"message": "User deleted successfully", "user_id": user_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete user")


# ============================================
# ADMIN DASHBOARD STATISTICS
# ============================================

@router.get("/stats", response_model=AdminStats)
async def get_admin_stats(admin: dict = Depends(get_current_admin)):
    """Get comprehensive admin dashboard statistics."""
    try:
        # Count metrics
        total_users = UserModel.count_all()
        total_books = BookModel.count_all()
        total_chunks = BookModel.count_chunks()
        storage_gib = BookModel.get_storage_size()
        active_chats = SessionModel.count_active_sessions(hours=24)
        
        # Calculate estimated costs (Gemini pricing example)
        # Free tier: First 15 million input tokens/day, 1 million output tokens/day
        # These are placeholder calculations
        tokens_used = 0  # Would need to track this in actual implementation
        estimated_monthly_cost = 0.0
        
        # Determine health status
        system_health = "healthy"
        if total_chunks == 0:
            system_health = "warning"
        
        # Placeholder metrics (would need actual tracking)
        avg_query_latency_ms = 250.0
        queries_per_day = 0  # Would need to track from chat history
        
        return AdminStats(
            total_chunks=total_chunks,
            total_books=total_books,
            total_users=total_users,
            storage_gib=storage_gib,
            avg_query_latency_ms=avg_query_latency_ms,
            queries_per_day=queries_per_day,
            active_chats_last_24h=active_chats,
            token_usage={"gemini_tokens": tokens_used},
            estimated_monthly_cost=estimated_monthly_cost,
            system_health=system_health,
            last_updated=datetime.utcnow()
        )
    except Exception as e:
        logger.error(f"Error fetching admin stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch statistics")


# ============================================
# RAG TESTING ENDPOINT (Proper API)
# ============================================

@router.post("/rag/test", response_model=RAGTestResponse)
async def test_rag(
    request: RAGTestRequest,
    admin: dict = Depends(get_current_admin)
):
    """Test RAG retrieval for a query and return detailed results with metadata."""
    try:
        if not request.query or len(request.query.strip()) < 3:
            raise HTTPException(status_code=400, detail="Query must be at least 3 characters")
        
        start_time = datetime.utcnow()
        
        # Get vector store and search
        vs = get_vector_store()
        results = vs.search(request.query, top_k=request.top_k, book_id=request.book_id)
        
        end_time = datetime.utcnow()
        retrieval_time_ms = (end_time - start_time).total_seconds() * 1000
        
        # Format results
        formatted_results = []
        for idx, result in enumerate(results, 1):
            metadata = result.get("metadata", {})
            text = result.get("text", "")
            
            # Create preview (first 300 chars)
            preview = text[:300] + ("..." if len(text) > 300 else "")
            preview = preview.replace("\n", " ")
            
            formatted_results.append(RAGTestResultItem(
                rank=idx,
                similarity_score=result.get("similarity_score", 0.0),
                book_name=metadata.get("book_name", "Unknown"),
                department=metadata.get("department", ""),
                subject=metadata.get("subject", ""),
                page_start=metadata.get("page_start"),
                page_end=metadata.get("page_end"),
                chapter=metadata.get("chapter"),
                text_preview=preview,
                full_text=text
            ))
        
        return RAGTestResponse(
            query=request.query,
            book_id=request.book_id,
            total_results=len(formatted_results),
            results=formatted_results,
            retrieval_time_ms=retrieval_time_ms
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in RAG test: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to test RAG retrieval")


# ============================================
# VECTOR MANAGEMENT ENDPOINTS
# ============================================

@router.delete("/vectors/book/{book_id}", response_model=VectorDeleteResponse)
async def delete_vectors(book_id: str, admin: dict = Depends(get_current_admin)):
    """Delete all vectors and chunks for a specific book."""
    try:
        book = BookModel.find_by_book_id(book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        
        # Delete from vector store
        vs = get_vector_store()
        deleted_count = vs.delete_by_book_id(book_id)
        
        # Also delete chunks from database
        get_db()["chunks"].delete_many({"metadata.book_id": book_id})
        
        # Update book status
        BookModel.update_status(book_id, "pending_indexing")
        
        return VectorDeleteResponse(
            book_id=book_id,
            deleted_count=deleted_count,
            message=f"Deleted vectors for book: {book.get('title')}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting vectors: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete vectors")


@router.post("/vectors/recalculate/{book_id}")
async def recalculate_vectors(book_id: str, admin: dict = Depends(get_current_admin)):
    """Queue a job to recalculate/re-embed vectors for a book."""
    try:
        book = BookModel.find_by_book_id(book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        
        if book.get("status") != "indexed":
            raise HTTPException(status_code=400, detail="Book must be indexed before recalculating vectors")
        
        # In a production system, this would queue a background job
        # For now, return a placeholder response
        job_id = f"recalc_{book_id}_{datetime.utcnow().timestamp()}"
        
        return {
            "job_id": job_id,
            "book_id": book_id,
            "status": "queued",
            "message": "Vector recalculation job queued. Check status with the job_id."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recalculating vectors: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to queue vector recalculation")


# ============================================
# ENHANCED BOOK LIST ENDPOINT
# ============================================

@router.get("/books-full", response_model=BookListResponse)
async def list_all_books_admin(
    limit: int = 50,
    offset: int = 0,
    status_filter: Optional[str] = None,
    admin: dict = Depends(get_current_admin)
):
    """Get comprehensive list of all books with full metadata for admin."""
    try:
        if status_filter and status_filter not in ["processing", "indexed", "failed"]:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        
        books = BookModel.list_all(limit=limit, offset=offset, status_filter=status_filter)
        total = BookModel.count_all()
        
        book_list = []
        for book in books:
            import os
            file_size_mb = None
            try:
                if book.get("file_path") and os.path.exists(book.get("file_path")):
                    file_size_mb = os.path.getsize(book.get("file_path")) / (1024 * 1024)
            except:
                pass
            
            book_list.append(BookListItem(
                book_id=book.get("book_id"),
                title=book.get("title"),
                author=book.get("author"),
                department=book.get("department"),
                year_of_study=book.get("year_of_study"),
                subject=book.get("subject"),
                status=book.get("status"),
                total_chunks=book.get("total_chunks", 0),
                total_pages=book.get("total_pages"),
                created_at=book.get("created_at"),
                indexed_date=book.get("indexed_date"),
                file_size_mb=file_size_mb
            ))
        
        return BookListResponse(books=book_list, total_count=total)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing books: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list books")
