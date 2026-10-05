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
    """Single message in a chat (supports regular text and embedded assessments)."""
    role: str = Field(..., description="'user', 'assistant', or 'assessment'")
    content: Optional[str] = Field(default="", description="Text content")
    timestamp: Optional[datetime] = None
    sources: List[MessageSource] = Field(default_factory=list)

    # Embedded assessment fields
    assessment_id: Optional[str] = None
    topic: Optional[str] = None
    difficulty: Optional[str] = None
    mode: Optional[str] = None
    questions: Optional[List[Dict[str, Any]]] = None
    completed: Optional[bool] = False
    result: Optional[Dict[str, Any]] = None


class BookFilter(BaseModel):
    """Filter for book retrieval."""
    department: Optional[str] = None
    year_of_study: Optional[str] = None
    subject: Optional[str] = None
    book_ids: List[str] = Field(default_factory=list)


class ChatQueryRequest(BaseModel):
    """Request to query the RAG chatbot."""
    chat_id: Optional[str] = None
    session_id: Optional[str] = None
    query: str
    book_id: Optional[str] = None
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
    token_usage: Optional[Dict[str, int]] = None
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
    book_id: Optional[str] = None
    book_name: str
    department: str
    year_of_study: str = Field(..., description="'1st', '2nd', '3rd', or '4th'")
    subject: str
    author: Optional[str] = None
    isbn: Optional[str] = None


class BookMetadata(BaseModel):
    book_id: str
    title: str
    department: str
    year_of_study: str
    subject: str
    author: Optional[str] = None
    isbn: Optional[str] = None
    total_pages: Optional[int] = None
    total_chunks: int
    status: str
    indexed_date: Optional[datetime] = None
    error_message: Optional[str] = None


class BookUploadStatusResponse(BaseModel):
    job_id: str
    book_id: str
    book_name: str
    status: str
    progress: float
    message: str
    estimated_time_remaining_seconds: Optional[int] = None


# ============================================
# Admin Panel Models
# ============================================

class RAGConfig(BaseModel):
    chunk_size: int = Field(..., ge=100, le=2000)
    chunk_overlap: int = Field(..., ge=0, le=500)
    top_k_retrieval: int = Field(..., ge=1, le=20)
    temperature: float = Field(..., ge=0, le=1)
    context_window_messages: int = Field(..., ge=1, le=10)
    embedding_model: str = Field(default="text-embedding-3-small")


class AdminStats(BaseModel):
    total_chunks: int
    total_books: int
    total_users: int
    storage_gib: float
    avg_query_latency_ms: float
    queries_per_day: int
    active_chats_last_24h: int
    token_usage: Dict[str, int] = Field(default_factory=dict)
    estimated_monthly_cost: float
    system_health: str = Field(default="healthy")
    last_updated: datetime


class AdminErrorLog(BaseModel):
    timestamp: datetime
    error_type: str
    message: str
    book_id: Optional[str] = None
    severity: str = Field(default="warning")


class Formula(BaseModel):
    latex: str
    description: str
    position: str = Field(default="inline")


class UserProfileResponse(BaseModel):
    user_id: str
    email: str
    full_name: str
    department: str
    role: str
    active: bool
    created_at: datetime
    last_login: Optional[datetime] = None


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = None
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(None, min_length=8)


class UserListItem(BaseModel):
    user_id: str
    email: str
    full_name: str
    department: str
    role: str
    active: bool
    created_at: datetime
    last_login: Optional[datetime] = None


class UserListResponse(BaseModel):
    users: List[UserListItem]
    total_count: int


class BookListItem(BaseModel):
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
    books: List[BookListItem]
    total_count: int


class RAGTestRequest(BaseModel):
    query: str
    book_id: Optional[str] = None
    top_k: int = Field(default=5, ge=1, le=20)


class RAGTestResultItem(BaseModel):
    rank: int
    similarity_score: float
    book_name: str
    department: str
    subject: str
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    chapter: Optional[str] = None
    text_preview: str
    full_text: str


class RAGTestResponse(BaseModel):
    query: str
    book_id: Optional[str] = None
    total_results: int
    results: List[RAGTestResultItem]
    retrieval_time_ms: float


class VectorDeleteResponse(BaseModel):
    book_id: str
    deleted_count: int
    message: str


class VectorRecalculateRequest(BaseModel):
    book_id: str
    force: bool = Field(default=False)


class VectorRecalculateResponse(BaseModel):
    job_id: str
    book_id: str
    status: str
    message: str


class ChunkMetadata(BaseModel):
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
    chunk_id: str
    text: str
    metadata: ChunkMetadata
    similarity_score: float


class ErrorResponse(BaseModel):
    detail: str
    error_code: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ValidationErrorResponse(BaseModel):
    detail: str
    errors: List[Dict[str, Any]]
    timestamp: datetime = Field(default_factory=datetime.utcnow)


def create_error_response(detail: str, code: str = None) -> ErrorResponse:
    return ErrorResponse(detail=detail, error_code=code, timestamp=datetime.utcnow())


# ============================================
# Assessment & Analytics Models
# ============================================

class QuizQuestion(BaseModel):
    id: str
    question: str
    options: List[str]
    correct_option_index: int
    explanation: str
    topic: str
    difficulty: str = "medium"


class AssessmentGenerateRequest(BaseModel):
    book_id: str
    chat_id: Optional[str] = None
    session_id: Optional[str] = None
    mode: str = Field(default="topic")
    topic: Optional[str] = None
    context_text: Optional[str] = None
    num_questions: int = Field(default=5, ge=1, le=10)
    difficulty: str = Field(default="intermediate")
    question_type: str = Field(default="single_choice")


class AssessmentQuestionClient(BaseModel):
    id: str
    question: str
    options: List[str]
    question_type: str = "single_choice"
    topic: str
    difficulty: str


class AssessmentResponse(BaseModel):
    assessment_id: str
    book_id: str
    chat_id: Optional[str] = None
    topic: str
    mode: str
    difficulty: str
    questions: List[AssessmentQuestionClient]
    created_at: datetime


class QuestionSubmission(BaseModel):
    question_id: str
    selected_option_index: Optional[int] = None
    selected_option_indices: Optional[List[int]] = None


class AssessmentSubmitRequest(BaseModel):
    assessment_id: str
    book_id: str
    time_taken_seconds: Optional[int] = 0
    answers: List[QuestionSubmission]


class QuestionResult(BaseModel):
    question_id: str
    question: str
    options: List[str]
    user_answer: Any
    correct_answer: Any
    is_correct: bool
    explanation: str
    topic: str
    remediation_prompt: str


class AssessmentResultResponse(BaseModel):
    assessment_id: str
    book_id: str
    score: int
    total_questions: int
    percentage: float
    time_taken_seconds: int
    badge: str
    feedback: str
    results: List[QuestionResult]
    submitted_at: datetime


class TopicMastery(BaseModel):
    topic: str
    accuracy_percentage: float
    total_attempts: int
    tier: Optional[str] = "Developing"
    badge: Optional[str] = "Review Needed"


class SubjectAnalytics(BaseModel):
    subject: str
    total_tests_taken: int
    total_questions: int
    total_correct: int
    accuracy_percentage: float
    pass_rate_percentage: float
    tier: Optional[str] = "Developing"
    badge: Optional[str] = "Review Needed"
    topics: List[TopicMastery] = Field(default_factory=list)


class AdaptiveRecommendation(BaseModel):
    topic: str
    status: str
    message: str
    suggested_query: str


class StudentAnalyticsResponse(BaseModel):
    user_id: str
    total_tests_taken: int
    average_score_percentage: float
    pass_rate_percentage: float
    total_questions_attempted: int
    total_questions_correct: int
    book_coverage_percentage: float
    learning_streak_days: int
    recent_assessments: List[Dict[str, Any]]
    topic_breakdown: List[TopicMastery]  # Legacy flat list preserved for backward compatibility
    subjects_breakdown: List[SubjectAnalytics] = Field(default_factory=list)
    adaptive_recommendations: List[AdaptiveRecommendation]
    top_explored_tags: List[str]
    last_active: Optional[datetime] = None