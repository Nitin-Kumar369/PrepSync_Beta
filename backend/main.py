"""
FastAPI application entry point for RAG backend.
Initializes all components and sets up routes.
"""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import configuration and initialization functions
from config import settings, validate_settings, log_config_summary, init_folders
from db import init_db, disconnect_mongodb
from rag import init_vector_store, init_chunking_pipeline, init_rag_pipeline, init_embedding_manager

# ============================================
# Lifecycle Management
# ============================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application startup and shutdown.
    """
    # Startup
    logger.info("=" * 50)
    logger.info("🚀 RAG Engineering Textbook API Starting Up")
    logger.info("=" * 50)

    try:
        # Validate settings
        validate_settings()

        # Initialize folders
        init_folders()

        # Initialize database
        init_db()

        # Initialize RAG components
        init_embedding_manager()
        init_vector_store()
        init_chunking_pipeline()
        init_rag_pipeline()

        # Log configuration summary
        log_config_summary()

        logger.info("✅ All components initialized successfully")
        logger.info("=" * 50)

    except Exception as e:
        logger.error(f"❌ Startup failed: {str(e)}")
        raise

    yield  # Application is running

    # Shutdown
    logger.info("=" * 50)
    logger.info("🛑 RAG Engineering Textbook API Shutting Down")
    logger.info("=" * 50)

    try:
        disconnect_mongodb()
        logger.info("✅ Shutdown complete")
    except Exception as e:
        logger.error(f"❌ Shutdown error: {str(e)}")


# ============================================
# FastAPI Application
# ============================================

app = FastAPI(
    title="Engineering Textbook RAG API",
    description="Retrieval Augmented Generation chatbot for engineering textbooks",
    version="0.1.0",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# Routes
# ============================================

@app.get("/", tags=["Health"])
async def root():
    """Root endpoint."""
    return {
        "message": "Engineering Textbook RAG API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    from rag import get_vector_store
    from db import get_db

    try:
        # Check vector store
        vs = get_vector_store()
        vs_healthy = vs.health_check()

        # Check database (simple ping through get_db)
        db = get_db()
        db_healthy = True

        return {
            "status": "healthy" if (vs_healthy and db_healthy) else "degraded",
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
            "components": {
                "vector_store": "✅ healthy" if vs_healthy else "❌ unhealthy",
                "database": "✅ healthy" if db_healthy else "❌ unhealthy",
                "api": "✅ running"
            }
        }

    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }


# Import and include routers
from routes import auth, chat, admin, books, profile
from routes import admin_extensions

app.include_router(auth.router)
# Provide `/api` aliases for frontend convenience (frontend prefixes requests with `/api`)
app.include_router(auth.router, prefix="/api")

app.include_router(profile.router)
app.include_router(profile.router, prefix="/api")

app.include_router(chat.router)
app.include_router(chat.router, prefix="/api")

app.include_router(admin.router)
app.include_router(admin_extensions.router)
app.include_router(books.router)
# Also expose admin and books under `/api` for the frontend (frontend uses baseURL '/api')
app.include_router(admin.router, prefix="/api")
app.include_router(admin_extensions.router, prefix="/api")
app.include_router(books.router, prefix="/api")

# ============================================
# Error Handlers
# ============================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return {
        "detail": "Internal server error",
        "error_type": type(exc).__name__
    }


# ============================================
# Development Server
# ============================================

if __name__ == "__main__":
    import uvicorn

    host = settings.fastapi_host
    port = settings.fastapi_port
    reload = settings.fastapi_reload and settings.environment == "development"

    logger.info(f"Starting server at {host}:{port}")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=reload,
        log_level=settings.log_level.lower()
    )
