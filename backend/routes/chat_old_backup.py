"""
Chat routes - core RAG chatbot functionality.
Endpoints for querying, chat history, and message persistence.
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends
from uuid import uuid4
from datetime import datetime
from bson import ObjectId

from models import (
    ChatQueryRequest, ChatQueryResponse, ChatHistoryResponse,
    ChatHistoryItem, FullChatResponse, MessageSource, BookFilter
)
from db import ChatModel, UserModel, get_db, SessionModel, BookModel
from auth import get_current_user, HTTPBearer
from rag import get_vector_store, get_rag_pipeline
from utils import generate_chat_id, convert_objectid_to_string
from config import settings
from error_handlers import (
    NotFoundError, UnauthorizedError, DatabaseError, ValidationAppError
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])
security = HTTPBearer()


# ============================================
# Dependency Injection
# ============================================

async def get_current_user_dep(credentials: HTTPBearer = Depends(security)) -> dict:
    """Get current authenticated user from JWT token."""
    return await get_current_user(credentials)


# ============================================
# Routes
# ============================================

@router.post("", response_model=ChatQueryResponse, status_code=status.HTTP_200_OK)
async def send_chat_query(
    request: ChatQueryRequest,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    Send a query to the RAG chatbot and get a response.
    
    Creates a new chat if chat_id is not provided, or continues an existing chat.
    
    Args:
        request: ChatQueryRequest with query, optional chat_id, and book filters
        current_user: Authenticated user from JWT
        
    Returns:
        ChatQueryResponse with response, sources, and metadata
        
    Raises:
        HTTPException 400: Invalid request
        HTTPException 404: Chat not found
        HTTPException 500: Processing error
    """
    try:
        user_id = current_user.get("user_id")

        # Step 1: Validate query
        logger.info(f"📋 Processing chat query from user {user_id}")
        if not request.query or len(request.query.strip()) < 3:
            logger.warning(f"❌ Query too short: '{request.query}'")
            raise ValidationAppError("query", "Query must be at least 3 characters long")
        logger.info(f"✅ Query validation passed: {request.query[:50]}...")

        # Step 2: Handle session tracking if provided or necessary
        logger.info(f"📋 Processing session management")
        session_id = request.session_id
        if session_id:
            try:
                session = SessionModel.find_by_session_id(session_id)
                if not session:
                    logger.warning(f"❌ Session not found: {session_id}")
                    raise NotFoundError("session", session_id)
                if str(session.get("user_id")) != user_id:
                    logger.warning(f"❌ Unauthorized access to session: {session_id}")
                    raise UnauthorizedError("session")
                logger.info(f"✅ Session found and authorized: {session_id}")
            except (NotFoundError, UnauthorizedError):
                raise
            except Exception as e:
                logger.error(f"❌ Session lookup error: {str(e)}")
                raise DatabaseError("session_lookup", str(e), e)
        else:
            # automatically start a new session for a book if none specified
            if request.book_id:
                try:
                    logger.info(f"📋 Creating new session for book: {request.book_id}")
                    session_id = generate_chat_id()
                    SessionModel.create(
                        session_id=session_id,
                        user_id=current_user["_id"],
                        book_id=request.book_id,
                        subject=(request.book_filters.subject if request.book_filters else ""),
                        department=(request.book_filters.department if request.book_filters else ""),
                        year_of_study=(request.book_filters.year_of_study if request.book_filters else ""),
                        title=request.query[:50]
                    )
                    logger.info(f"✅ Session created: {session_id}")
                except Exception as e:
                    logger.error(f"❌ Failed to create session: {str(e)}")
                    raise DatabaseError("session_creation", "Failed to create new session", e)

        # Step 3: Get or create chat
        logger.info(f"📋 Processing chat management")
        chat_id = request.chat_id or session_id
        if not chat_id:
            chat_id = generate_chat_id()
        
        try:
            # Attempt to load existing chat or create if missing
            chat = ChatModel.find_by_chat_id(chat_id)
            if not chat:
                logger.info(f"📝 Creating new chat: {chat_id}")
                chat = ChatModel.create(
                    chat_id=chat_id,
                    user_id=user_id,
                    title=request.query[:50],  # First 50 chars as title
                    book_id=request.book_id,
                    department=(request.book_filters.department if request.book_filters else None),
                    year_of_study=(request.book_filters.year_of_study if request.book_filters else None),
                    subject=(request.book_filters.subject if request.book_filters else None),
                    book_filters=(request.book_filters.dict() if request.book_filters else None)
                )
                logger.info(f"✅ Chat created successfully: {chat_id}")
            else:
                # Verify chat belongs to user
                if str(chat["user_id"]) != user_id:
                    logger.warning(f"❌ Unauthorized chat access: {chat_id}")
                    raise UnauthorizedError("chat")
                logger.info(f"✅ Existing chat loaded: {chat_id}")
        except UnauthorizedError:
            raise
        except Exception as e:
            logger.error(f"❌ Chat creation/retrieval error: {str(e)}")
            raise DatabaseError("chat_creation", "Failed to create or load chat", e)

        # Build metadata filter for chunk retrieval
        where_filter = None
        if request.book_filters:
            where_filter = {}
            if request.book_filters.department:
                where_filter["department"] = request.book_filters.department
            if request.book_filters.year_of_study:
                where_filter["year_of_study"] = request.book_filters.year_of_study
            if request.book_filters.subject:
                where_filter["subject"] = request.book_filters.subject
            # book_ids are handled via book_id parameter below if present

        # Step 4: Retrieve relevant chunks from vector database
        logger.info(f"📋 Retrieving chunks for query: {request.query[:50]}...")
        try:
            vector_store = get_vector_store()
            documents, metadatas, embeddings, similarity_scores = vector_store.query(
                query_text=request.query,
                n_results=5,
                where_filter=where_filter if where_filter else None,
                book_id=request.book_id
            )
            logger.info(f"✅ Retrieved {len(documents)} relevant chunks")

            if not documents:
                logger.warning(f"⚠️ No relevant chunks found for query")
                # Still return a response (the LLM can acknowledge this)
        except Exception as e:
            logger.error(f"❌ Vector store retrieval error: {str(e)}")
            raise DatabaseError("vector_store_retrieval", "Failed to retrieve relevant chunks", e)

        # Step 5: Load previous messages for context
        logger.info(f"📋 Loading previous messages from conversation history")
        try:
            if getattr(request, 'previous_messages', None):
                previous_messages = [
                    {"role": m.get("role", "user"), "content": m.get("content", "")} 
                    for m in request.previous_messages
                ]
            else:
                previous_messages = [
                    {"role": m["role"], "content": m["content"]}
                    for m in chat.get("messages", [])[-settings.rag_context_window_messages:]
                ]
            logger.info(f"✅ Loaded {len(previous_messages)} previous messages")
        except Exception as e:
            logger.error(f"❌ Failed to load message history: {str(e)}")
            raise DatabaseError("message_history_load", "Failed to load conversation history", e)

        # Step 6: Generate response using RAG pipeline
        logger.info(f"🤖 Generating RAG response using pipeline")
        try:
            rag_pipeline = get_rag_pipeline()
            rag_response = rag_pipeline.generate_rag_response(
                query=request.query,
                retrieved_chunks=documents,
                chunk_metadatas=metadatas,
                previous_messages=previous_messages
            )
            logger.info(f"✅ RAG response generated successfully")
        except Exception as e:
            logger.error(f"❌ RAG pipeline error: {str(e)}")
            raise DatabaseError("rag_generation", "Failed to generate response from LLM", e)

        # Step 7: Build sources list from metadata
        logger.info(f"📋 Building sources from metadata")
        try:
            sources = []
            for i, metadata in enumerate(metadatas):
                sources.append(MessageSource(
                    chunk_id=f"chunk_{i}",
                    book_name=metadata.get("book_name", "Unknown"),
                    book_id=metadata.get("book_id", ""),
                    page_range=f"{metadata.get('page_start', '?')}-{metadata.get('page_end', '?')}",
                    chapter=metadata.get("chapter"),
                    section=metadata.get("section"),
                    relevance_score=similarity_scores[i] if i < len(similarity_scores) else 0.0,
                    formulas_cited=[f["latex"] for f in metadata.get("formulas", [])]
                ))
            logger.info(f"✅ Built {len(sources)} source references")
        except Exception as e:
            logger.error(f"❌ Failed to build sources: {str(e)}")
            raise DatabaseError("source_building", "Failed to format source metadata", e)

        # Step 8: Save messages to MongoDB
        logger.info(f"📝 Saving messages to database")
        try:
            user_message = {
                "role": "user",
                "content": request.query,
                "timestamp": datetime.utcnow(),
                "sources": []
            }

            assistant_message = {
                "role": "assistant",
                "content": rag_response["response"],
                "timestamp": datetime.utcnow(),
                "sources": [s.dict() for s in sources]
            }

            ChatModel.add_message(chat_id, user_message)
            logger.info(f"✅ User message saved to chat")
            ChatModel.add_message(chat_id, assistant_message)
            logger.info(f"✅ Assistant message saved to chat")
            
            # also record in session if applicable
            if session_id:
                try:
                    SessionModel.add_message(session_id, user_message)
                    SessionModel.add_message(session_id, assistant_message)
                    logger.info(f"✅ Messages saved to session")
                except Exception as se:
                    logger.warning(f"⚠️ Failed to save to session {session_id}: {se}")
                    # Don't raise - chat saving succeeded, session save is secondary
        
        except Exception as e:
            logger.error(f"❌ Failed to save messages to database: {str(e)}")
            raise DatabaseError("message_save", "Failed to save chat messages", e)

        logger.info(f"✅ Chat response generated for {chat_id}. Sources: {len(sources)}")

        return ChatQueryResponse(
            chat_id=chat_id,
            session_id=session_id,
            response=rag_response["response"],
            sources=sources,
            timestamp=datetime.utcnow(),
            token_usage=rag_response.get("token_usage"),
            error_source=rag_response.get("error_source")
        )

    except (ValidationAppError, NotFoundError, UnauthorizedError, DatabaseError):
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ Unexpected error in chat query processing: {str(e)}")
        raise DatabaseError("chat_query", "An unexpected error occurred while processing your query", e)


@router.get("/list", response_model=ChatHistoryResponse)
async def list_user_chats(
    limit: int = 10,
    offset: int = 0,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    List all chats for the current user.
    
    Args:
        limit: Maximum number of chats to return (default 10)
        offset: Pagination offset (default 0)
        current_user: Authenticated user from JWT
        
    Returns:
        ChatHistoryResponse with list of chats and total count
    """
    try:
        user_id = current_user.get("user_id")
        logger.info(f"📋 Listing chats for user {user_id}")

        try:
            # Fetch chats from MongoDB
            chats_cursor = ChatModel.find_by_user_id(user_id, limit=limit, offset=offset)
            chats_list = list(chats_cursor)

            # Count total chats for pagination
            db = get_db()
            total_count = db["chats"].count_documents({"user_id": ObjectId(user_id)})
            logger.info(f"✅ Found {len(chats_list)} chats (total: {total_count})")

            # Convert to response format
            chat_items = []
            for chat in chats_list:
                last_message = ""
                if chat.get("messages"):
                    last_message = chat["messages"][-1].get("content", "")[:100]

                chat_items.append(ChatHistoryItem(
                    chat_id=chat["chat_id"],
                    title=chat.get("title", "Untitled Chat"),
                    last_message=last_message,
                    created_at=chat["created_at"],
                    updated_at=chat["updated_at"],
                    message_count=len(chat.get("messages", []))
                ))

            return ChatHistoryResponse(
                chats=chat_items,
                total_count=total_count
            )
        except Exception as e:
            logger.error(f"❌ Error fetching chat list: {str(e)}")
            raise DatabaseError("chat_list_fetch", "Failed to retrieve chat history", e)

    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ Unexpected error in list_user_chats: {str(e)}")
        raise DatabaseError("chat_list", "An unexpected error occurred while listing chats", e)


@router.get("/{chat_id}", response_model=FullChatResponse)
async def get_chat_history(
    chat_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    Get full chat history with all messages.
    
    Args:
        chat_id: Chat ID to retrieve
        current_user: Authenticated user from JWT
        
    Returns:
        FullChatResponse with all messages and metadata
        
    Raises:
        HTTPException 404: Chat not found
        HTTPException 403: Not authorized to view chat
    """
    try:
        user_id = current_user.get("user_id")
        logger.info(f"📋 Retrieving chat history for {chat_id}")

        try:
            # Find chat
            chat = ChatModel.find_by_chat_id(chat_id)
            if not chat:
                logger.warning(f"❌ Chat not found: {chat_id}")
                raise NotFoundError("chat", chat_id)

            # Verify authorization
            if str(chat["user_id"]) != user_id:
                logger.warning(f"❌ Unauthorized access to chat: {chat_id}")
                raise UnauthorizedError("chat")
            
            logger.info(f"✅ Chat found and authorized")

            # Convert messages
            messages = []
            for msg in chat.get("messages", []):
                messages.append({
                    "role": msg.get("role", ""),
                    "content": msg.get("content", ""),
                    "timestamp": msg.get("timestamp", datetime.utcnow()),
                    "sources": msg.get("sources", [])
                })

            # Convert book filters
            book_filters = BookFilter(**chat.get("book_filters", {}))

            return FullChatResponse(
                chat_id=chat["chat_id"],
                title=chat.get("title", ""),
                created_at=chat["created_at"],
                updated_at=chat["updated_at"],
                book_filters=book_filters,
                messages=messages
            )
        except (NotFoundError, UnauthorizedError):
            raise
        except Exception as e:
            logger.error(f"❌ Error fetching chat: {str(e)}")
            raise DatabaseError("chat_retrieval", "Failed to retrieve chat history", e)

    except (NotFoundError, UnauthorizedError):
        raise
    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ Unexpected error in get_chat_history: {str(e)}")
        raise DatabaseError("chat_history", "An unexpected error occurred while retrieving chat", e)


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    chat_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    Delete a chat (called by user).
    
    Args:
        chat_id: Chat ID to delete
        current_user: Authenticated user from JWT
        
    Raises:
        HTTPException 404: Chat not found
        HTTPException 403: Not authorized
    """
    try:
        user_id = current_user.get("user_id")
        logger.info(f"🗑️ Attempting to delete chat: {chat_id}")

        try:
            # Find and verify chat
            chat = ChatModel.find_by_chat_id(chat_id)
            if not chat:
                logger.warning(f"❌ Chat not found for deletion: {chat_id}")
                raise NotFoundError("chat", chat_id)

            if str(chat["user_id"]) != user_id:
                logger.warning(f"❌ Unauthorized deletion attempt: {chat_id}")
                raise UnauthorizedError("chat")

            # Delete chat
            ChatModel.delete_chat(chat_id)
            logger.info(f"✅ Chat deleted successfully: {chat_id}")
        except (NotFoundError, UnauthorizedError):
            raise
        except Exception as e:
            logger.error(f"❌ Error deleting chat: {str(e)}")
            raise DatabaseError("chat_deletion", "Failed to delete chat", e)

    except (NotFoundError, UnauthorizedError):
        raise
    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ Unexpected error in delete_chat: {str(e)}")
        raise DatabaseError("chat_delete", "An unexpected error occurred while deleting chat", e)


# ============================================
# Session Management Routes (for new UI)
# ============================================

@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(
    book_id: Optional[str] = None,
    title: str = "",
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a new chat session for a book."""
    try:
        logger.info(f"📝 Creating new session for book: {book_id}")
        
        # if a book_id is provided, ensure it exists (optional validation)
        if book_id:
            try:
                book = BookModel.find_by_book_id(book_id)
                if not book:
                    logger.warning(f"❌ Book not found: {book_id}")
                    raise NotFoundError("book", book_id)
                logger.info(f"✅ Book validation passed")
            except NotFoundError:
                raise
            except Exception as e:
                logger.error(f"❌ Book lookup error: {str(e)}")
                raise DatabaseError("book_lookup", "Failed to verify book", e)
        
        try:
            session_id = generate_chat_id()
            session = SessionModel.create(
                session_id=session_id,
                user_id=current_user.get("user_id"),
                book_id=book_id,
                subject="",
                department="",
                year_of_study="",
                title=title or f"Chat - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            )
            logger.info(f"✅ Session created: {session_id}")
            
            return {
                "session_id": session_id,
                "book_id": book_id,
                "title": session.get("title"),
                "created_at": session.get("created_at").isoformat() if session.get("created_at") else None,
                "messages": []
            }
        except Exception as e:
            logger.error(f"❌ Session creation error: {str(e)}")
            raise DatabaseError("session_creation", "Failed to create new session", e)
            
    except (NotFoundError, DatabaseError):
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ Unexpected error in create_session: {str(e)}")
        raise DatabaseError("session_create", "An unexpected error occurred while creating session", e)


@router.get("/sessions")
async def list_sessions(
    book_id: str = None,
    limit: int = 10,
    offset: int = 0,
    current_user: dict = Depends(get_current_user_dep)
):
    """List sessions for current user."""
    try:
        logger.info(f"📋 Listing sessions for user")
        
        try:
            sessions = SessionModel.find_by_user_id(
                current_user["_id"],
                limit=limit,
                offset=offset
            )
            
            # Convert to response format
            result = []
            for session in sessions:
                if book_id and session.get("book_id") != book_id:
                    continue
                
                result.append({
                    "session_id": session.get("session_id"),
                    "book_id": session.get("book_id"),
                    "title": session.get("title"),
                    "created_at": session.get("created_at").isoformat() if session.get("created_at") else None,
                    "last_message_at": session.get("last_message_at").isoformat() if session.get("last_message_at") else None,
                    "message_count": session.get("message_count", 0),
                    "messages": session.get("messages", [])
                })
            
            logger.info(f"✅ Retrieved {len(result)} sessions")
            return result
        except Exception as e:
            logger.error(f"❌ Error listing sessions: {str(e)}")
            raise DatabaseError("session_list", "Failed to retrieve sessions", e)
            
    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ Unexpected error in list_sessions: {str(e)}")
        raise DatabaseError("session_list_fetch", "An unexpected error occurred while listing sessions", e)
        
        return result
    except Exception as e:
        logger.error(f"Error listing sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get a specific session."""
    try:
        from db import SessionModel
        from bson import ObjectId
        
        session = SessionModel.find_by_session_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check authorization
        if str(session.get("user_id")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        return {
            "session_id": session.get("session_id"),
            "book_id": session.get("book_id"),
            "title": session.get("title"),
            "created_at": session.get("created_at").isoformat() if session.get("created_at") else None,
            "last_message_at": session.get("last_message_at").isoformat() if session.get("last_message_at") else None,
            "message_count": session.get("message_count", 0),
            "messages": session.get("messages", [])
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Delete a session."""
    try:
        from db import SessionModel
        
        session = SessionModel.find_by_session_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check authorization
        if str(session.get("user_id")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        SessionModel.delete_session(session_id)
        logger.info(f"Session deleted: {session_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Chat Deletion Endpoints
# ============================================

@router.delete("/{chat_id}", status_code=status.HTTP_200_OK)
async def delete_chat(
    chat_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    Delete a chat conversation.
    
    Args:
        chat_id: ID of the chat to delete
        current_user: Authenticated user from JWT
        
    Returns:
        Success message
        
    Raises:
        HTTPException 404: Chat not found
        HTTPException 403: Not authorized to delete this chat
    """
    try:
        # Find and verify ownership
        chat = ChatModel.find_by_chat_id(chat_id)
        if not chat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found"
            )
        
        # Verify user owns this chat
        if str(chat.get("user_id")) != str(current_user.get("user_id")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to delete this chat"
            )
        
        # Delete the chat
        ChatModel.delete_chat(chat_id)
        logger.info(f"Chat deleted: {chat_id} by user {current_user.get('user_id')}")
        
        return {"message": "Chat deleted successfully", "chat_id": chat_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting chat: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete chat"
        )


# ============================================
# Import ObjectId for MongoDB operations
# ============================================

from bson import ObjectId
