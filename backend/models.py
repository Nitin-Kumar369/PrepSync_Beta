"""
Pydantic models for request/response validation.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============================================
# Authentication Models
# ============================================

class SignupRequest(BaseModel):
    """User signup request."""
    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    full_name: str
    department: str = Field(default="", description="e.g., Computer Science Engineering")

    class Config:
        json_schema_extra = {
            "example": {
                "email": "student@university.edu",
                "password": "SecurePassword123",
                "full_name": "John Doe",
                "department": "Computer Science Engineering"
            }
        }


class LoginRequest(BaseModel):
    """User login request."""
    email: EmailStr
    password: str

    class Config:
        json_schema_extra = {
            "example": {
                "email": "student@university.edu",
                "password": "SecurePassword123"
            }
        }


class TokenResponse(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    full_name: str
    role: str


class UserRole(str, Enum):
    """User roles for RBAC."""
    STUDENT = "student"
    ADMIN = "admin"


# ============================================
# Chat Models
# ============================================

class MessageSource(BaseModel):
    """Information about a source document."""
    chunk_id: str
    book_name: str
    book_id: str
    page_range: str
    chapter: Optional[int] = None
    section: Optional[str] = None
    relevance_score: float
    formulas_cited: List[str] = Field(default_factory=list)


class ChatMessage(BaseModel):
    """Single message in a chat."""
    role: str = Field(..., description="'user' or 'assistant'")
    content: str
    timestamp: datetime
    sources: List[MessageSource] = Field(default_factory=list)


class BookFilter(BaseModel):
    """Filter for book retrieval."""
    department: Optional[str] = None
    year_of_study: Optional[str] = None  # "1st", "2nd", "3rd", "4th"
    subject: Optional[str] = None
    book_ids: List[str] = Field(default_factory=list)  # Empty = all books


class ChatQueryRequest(BaseModel):
    """Request to query the RAG chatbot."""
    chat_id: Optional[str] = None  # If None, creates new chat
    session_id: Optional[str] = None  # Optional session for book-specific chats
    query: str
    book_id: Optional[str] = None  # If provided, restrict search to a specific book
    book_filters: Optional[BookFilter] = None
    previous_messages: Optional[List[Dict[str, str]]] = None

    class Config:
        json_schema_extra = {
            "example": {
                "chat_id": "550e8400-e29b-41d4-a716-446655440000",
                "session_id": "session_1234",
                "query": "What is the second law of thermodynamics?",
                "book_id": "mech_102_thermo",
                "book_filters": {
                    "department": "Mechanical Engineering",
                    "year_of_study": "2nd",
                    "subject": "Thermodynamics",
                    "book_ids": []
                }
            }
        }


class ChatQueryResponse(BaseModel):
    """Response from RAG chatbot."""
    chat_id: str
    session_id: Optional[str] = None
    response: str
    sources: List[MessageSource]
    timestamp: datetime
    token_usage: Optional[Dict[str, int]] = None  # {input_tokens, output_tokens}
    error_source: Optional[str] = None


class ChatHistoryItem(BaseModel):
    """Single item in chat history."""
    chat_id: str
    title: str
    last_message: str
    created_at: datetime
    updated_at: datetime
    message_count: int
    book_id: Optional[str] = None


class ChatHistoryResponse(BaseModel):
    """List of user's chats."""
    chats: List[ChatHistoryItem]
    total_count: int


class FullChatResponse(BaseModel):
    """Full chat with all messages."""
    chat_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    book_filters: BookFilter
    messages: List[ChatMessage]


# ============================================
# Book Management Models
# ============================================

class BookUploadRequest(BaseModel):
    """Request to upload a new book."""
    book_id: Optional[str] = None  # Custom book ID (optional, auto-generated if not provided)
    book_name: str
    department: str
    year_of_study: str = Field(..., description="'1st', '2nd', '3rd', or '4th'")
    subject: str
    author: Optional[str] = None
    isbn: Optional[str] = None


class BookMetadata(BaseModel):
    """Book metadata."""
    book_id: str
    title: str
    department: str
    year_of_study: str
    subject: str
    author: Optional[str] = None
    isbn: Optional[str] = None
    total_pages: Optional[int] = None
    total_chunks: int
    status: str = Field(..., description="'processing', 'indexed', or 'failed'")
    indexed_date: Optional[datetime] = None
    error_message: Optional[str] = None


class BookUploadStatusResponse(BaseModel):
    """Job status for book upload."""
    job_id: str
    book_id: str
    book_name: str
    status: str = Field(..., description="'queued', 'processing', 'completed', 'failed'")
    progress: float = Field(..., ge=0, le=100, description="0-100%")
    message: str
    estimated_time_remaining_seconds: Optional[int] = None


# ============================================
# Admin Panel Models
# ============================================

class RAGConfig(BaseModel):
    """RAG configuration parameters."""
    chunk_size: int = Field(..., ge=100, le=2000, description="Words per chunk")
    chunk_overlap: int = Field(..., ge=0, le=500, description="Overlap in words")
    top_k_retrieval: int = Field(..., ge=1, le=20, description="Number of chunks to retrieve")
    temperature: float = Field(..., ge=0, le=1, description="LLM sampling temperature")
    context_window_messages: int = Field(..., ge=1, le=10, description="Last N messages to include")
    embedding_model: str = Field(default="text-embedding-3-small")

    class Config:
        json_schema_extra = {
            "example": {
                "chunk_size": 1000,
                "chunk_overlap": 200,
                "top_k_retrieval": 5,
                "temperature": 0.7,
                "context_window_messages": 3,
                "embedding_model": "text-embedding-3-small"
            }
        }


class AdminStats(BaseModel):
    """Admin dashboard statistics."""
    total_chunks: int
    total_books: int
    total_users: int
    storage_gib: float
    avg_query_latency_ms: float
    queries_per_day: int
    active_chats_last_24h: int
    token_usage: Dict[str, int] = Field(default_factory=dict)  # {gemini_tokens, embedding_tokens}
    estimated_monthly_cost: float
    system_health: str = Field(default="healthy", description="'healthy', 'warning', or 'critical'")
    last_updated: datetime


class AdminErrorLog(BaseModel):
    """Error log entry for admin."""
    timestamp: datetime
    error_type: str
    message: str
    book_id: Optional[str] = None
    severity: str = Field(default="warning", description="'info', 'warning', 'error', 'critical'")


# ============================================
# Formula Extraction Models
# ============================================

class Formula(BaseModel):
    """A mathematical formula."""
    latex: str
    description: str
    position: str = Field(default="inline", description="'inline', 'start', or 'end'")


# ============================================
# User Profile Models
# ============================================

class UserProfileResponse(BaseModel):
    """User profile data."""
    user_id: str
    email: str
    full_name: str
    department: str
    role: str
    active: bool
    created_at: datetime
    last_login: Optional[datetime] = None


class UpdateProfileRequest(BaseModel):
    """Request to update user profile."""
    full_name: Optional[str] = None
    department: Optional[str] = None
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None  # Required if changing email/password
    new_password: Optional[str] = Field(None, min_length=8)


class UserListItem(BaseModel):
    """User item in admin list."""
    user_id: str
    email: str
    full_name: str
    department: str
    role: str
    active: bool
    created_at: datetime
    last_login: Optional[datetime] = None


class UserListResponse(BaseModel):
    """List of users for admin."""
    users: List[UserListItem]
    total_count: int


class BookListItem(BaseModel):
    """Book item in admin list."""
    book_id: str
    title: str
    author: Optional[str] = None
    department: str
    year_of_study: str
    subject: str
    status: str
    total_chunks: int
    total_pages: Optional[int] = None
    created_at: datetime
    indexed_date: Optional[datetime] = None
    file_size_mb: Optional[float] = None


class BookListResponse(BaseModel):
    """List of books for admin."""
    books: List[BookListItem]
    total_count: int


# ============================================
# RAG Testing Models
# ============================================

class RAGTestRequest(BaseModel):
    """Request to test RAG retrieval."""
    query: str
    book_id: Optional[str] = None
    top_k: int = Field(default=5, ge=1, le=20)


class RAGTestResultItem(BaseModel):
    """Single result from RAG test."""
    rank: int
    similarity_score: float
    book_name: str
    department: str
    subject: str
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    chapter: Optional[str] = None
    text_preview: str  # First 300 chars of chunk
    full_text: str  # Complete chunk text


class RAGTestResponse(BaseModel):
    """Response from RAG test."""
    query: str
    book_id: Optional[str] = None
    total_results: int
    results: List[RAGTestResultItem]
    retrieval_time_ms: float


# ============================================
# Vector Management Models
# ============================================

class VectorDeleteResponse(BaseModel):
    """Response from vector deletion."""
    book_id: str
    deleted_count: int
    message: str


class VectorRecalculateRequest(BaseModel):
    """Request to recalculate vectors for a book."""
    book_id: str
    force: bool = Field(default=False, description="Force recalculation even if already indexed")


class VectorRecalculateResponse(BaseModel):
    """Response from vector recalculation."""
    job_id: str
    book_id: str
    status: str
    message: str


class ChunkMetadata(BaseModel):
    """Metadata about a chunk."""
    book_id: str
    book_name: str
    department: str
    year_of_study: str
    subject: str
    chapter: int
    section: str
    page_start: int
    page_end: int
    chunk_index: int
    formulas: List[Formula] = Field(default_factory=list)
    has_table: bool = False
    has_equation: bool = False
    symbol_density: float = 0.0
    processing_timestamp: datetime


class RetrievedChunk(BaseModel):
    """A retrieved chunk with metadata."""
    chunk_id: str
    text: str
    metadata: ChunkMetadata
    similarity_score: float


# ============================================
# Error Models
# ============================================

class ErrorResponse(BaseModel):
    """Standard error response."""
    detail: str
    error_code: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ValidationErrorResponse(BaseModel):
    """Validation error response."""
    detail: str
    errors: List[Dict[str, Any]]
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ============================================
# Utility Functions
# ============================================

def create_error_response(detail: str, code: str = None) -> ErrorResponse:
    """Helper to create consistent error responses."""
    return ErrorResponse(
        detail=detail,
        error_code=code,
        timestamp=datetime.utcnow()
    )