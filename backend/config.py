"""
Configuration management for RAG backend.
Loads environment variables and provides config throughout the app.
"""

import os
from datetime import datetime
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field
import logging

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # API Configuration
    fastapi_host: str = Field(default="0.0.0.0", alias="FASTAPI_HOST")
    fastapi_port: int = Field(default=8000, alias="FASTAPI_PORT")
    fastapi_debug: bool = Field(default=True, alias="FASTAPI_DEBUG")
    fastapi_reload: bool = Field(default=True, alias="FASTAPI_RELOAD")
    environment: str = Field(default="development", alias="ENVIRONMENT")

    # JWT & Security
    jwt_secret_key: str = Field(default="dev-secret-key-min-32-chars-long", alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expiration_hours: int = Field(default=24, alias="JWT_EXPIRATION_HOURS")

    # MongoDB
    mongodb_uri: str = Field(default="mongodb://localhost:27017/engineering_books_rag", alias="MONGODB_URI")

    # ChromaDB
    chroma_db_path: str = Field(default="./chroma_db", alias="CHROMA_DB_PATH")
    chroma_collection_name: str = Field(default="engineering_books", alias="CHROMA_COLLECTION_NAME")

    # RAG Parameters (Tunable)
    rag_chunk_size: int = Field(default=1000, alias="RAG_CHUNK_SIZE")
    rag_chunk_overlap: int = Field(default=200, alias="RAG_CHUNK_OVERLAP")
    rag_top_k_retrieval: int = Field(default=5, alias="RAG_TOP_K_RETRIEVAL")
    rag_temperature: float = Field(default=0.7, alias="RAG_TEMPERATURE")
    rag_context_window_messages: int = Field(default=3, alias="RAG_CONTEXT_WINDOW_MESSAGES")
    rag_max_context_length: int = Field(default=4000, alias="RAG_MAX_CONTEXT_LENGTH")

    # Embedding Model
    embedding_model: str = Field(default="all-MiniLM-L6-v2", alias="EMBEDDING_MODEL")
    embedding_dimension: int = Field(default=384, alias="EMBEDDING_DIMENSION")
    vector_db_type: str = Field(default="semantic", alias="VECTOR_DB_TYPE")  # "semantic" or "naive"

    # Gemini API
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")

    # File Upload
    max_upload_size_mb: int = Field(default=500, alias="MAX_UPLOAD_SIZE_MB")
    upload_folder: str = Field(default="./uploads", alias="UPLOAD_FOLDER")

    # CORS
    cors_origins: list = Field(default=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:8000"
    ], alias="CORS_ORIGINS")

    # Logging
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_file: str = Field(default="backend.log", alias="LOG_FILE")

    class Config:
        env_file = ".env"
        case_sensitive = False
        # Allow alias fields to be used when setting values
        populate_by_name = True


# Global settings instance
settings = Settings()


def validate_settings():
    """Validate critical settings on startup."""
    errors = []

    # Check API key
    # Gemini API key is optional in development; required only in production
    if settings.environment and settings.environment.lower() == "production":
        if not settings.gemini_api_key or settings.gemini_api_key == "your_api_key_here":
            errors.append("GEMINI_API_KEY is not set. Get it from https://makersuite.google.com/app/apikeys")
    else:
        if not settings.gemini_api_key or settings.gemini_api_key == "your_api_key_here":
            logger.warning("GEMINI_API_KEY not set — running in demo mode without external LLM")

    # Check JWT secret (should be changed from default in production)
    if settings.environment == "production" and len(settings.jwt_secret_key) < 32:
        errors.append("JWT_SECRET_KEY is too short. Use at least 32 characters.")

    # Check MongoDB connection string
    if not settings.mongodb_uri:
        errors.append("MONGODB_URI is not set.")

    if errors:
        logger.error("Configuration validation failed:")
        for error in errors:
            logger.error(f"  - {error}")
        raise ValueError("Configuration errors detected. Please check your .env file.")

    logger.info("✅ Configuration validated successfully")


def log_config_summary():
    """Log configuration summary (without sensitive info)."""
    logger.info("=== Configuration Summary ===")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"FastAPI: {settings.fastapi_host}:{settings.fastapi_port}")
    logger.info(f"MongoD URI: {settings.mongodb_uri.split('/')[2] if '://' in settings.mongodb_uri else 'Unknown'}")
    logger.info(f"ChromaDB: {settings.chroma_db_path}")
    logger.info(f"RAG Chunk Size: {settings.rag_chunk_size} words")
    logger.info(f"RAG Chunk Overlap: {settings.rag_chunk_overlap} words")
    logger.info(f"RAG Top-K: {settings.rag_top_k_retrieval}")
    logger.info(f"Embedding Model: {settings.embedding_model}")
    logger.info(f"Log Level: {settings.log_level}")
    logger.info("=" * 30)


# Create uploads folder if it doesn't exist
def init_folders():
    """Initialize required folders."""
    os.makedirs(settings.upload_folder, exist_ok=True)
    os.makedirs(settings.chroma_db_path, exist_ok=True)
    logger.info(f"✅ Folders initialized: uploads={settings.upload_folder}, chroma={settings.chroma_db_path}")


if __name__ == "__main__":
    # Test configuration loading
    import json

    print("Current Settings:")
    # pydantic v1 uses .dict(); keep this compatible with the pinned requirements
    print(json.dumps(settings.dict(), indent=2, default=str))
