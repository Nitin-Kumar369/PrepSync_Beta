"""
Chat routes - core RAG chatbot functionality with book-specific endpoints.
Endpoints for querying, chat history, and message persistence.

Endpoint structure:
- POST /chat/{book_code} - Send query to RAG for specific book
- GET /chat/{book_code}/chats - List chats for a book
- GET /chat/{book_code}/chats/{chat_id} - Get specific chat
- DELETE /chat/{book_code}/chats/{chat_id} - Delete specific chat
- POST /chat/{book_code}/sessions - Create session for book
- GET /chat/{book_code}/sessions - List sessions for book
- GET /chat/{book_code}/sessions/{session_id} - Get specific session
- DELETE /chat/{book_code}/sessions/{session_id} - Delete session

Legacy endpoints (deprecated, for backward compatibility):
- POST /chat - Send query (book_id in payload)
- GET /chat/list - List all chats
- GET /chat/{chat_id} - Get chat
- DELETE /chat/{chat_id} - Delete chat
- POST /chat/sessions - Create session
- GET /chat/sessions - List sessions
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends, Query
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
# Core Chat Query Logic (Shared)
# ============================================

async def _process_chat_query(
    query: str,
    book_id: str,
    chat_id: Optional[str],
    session_id: Optional[str],
    book_filters: Optional[BookFilter],
    previous_messages: Optional[List] = None,
    current_user: dict = None
):
    """
    Core RAG chat query processing logic (used by both old and new endpoints).
    
    This function encapsulates all the RAG processing steps and can be called
    by both the legacy /chat endpoint and the new /{book_code} endpoints.
    """
    try:
        user_id = current_user.get("user_id")

        # Step 1: Validate query
        logger.info(f"Processing chat query from user {user_id}")
        if not query or len(query.strip()) < 3:
            logger.warning(f"Query too short: '{query}'")
            raise ValidationAppError("query", "Query must be at least 3 characters long")
        logger.info(f"Query validation passed: {query[:50]}...")

        # Step 2: Handle session tracking
        logger.info(f"Processing session management")
        if session_id:
            try:
                session = SessionModel.find_by_session_id(session_id)
                if not session:
                    logger.warning(f"Session not found: {session_id}")
                    raise NotFoundError("session", session_id)
                if str(session.get("user_id")) != user_id:
                    logger.warning(f"Unauthorized access to session: {session_id}")
                    raise UnauthorizedError("session")
                logger.info(f"Session found and authorized: {session_id}")
            except (NotFoundError, UnauthorizedError):
                raise
            except Exception as e:
                logger.error(f"Session lookup error: {str(e)}")
                raise DatabaseError("session_lookup", str(e), e)
        else:
            # automatically start a new session for a book if none specified
            if book_id:
                try:
                    logger.info(f"Creating new session for book: {book_id}")
                    session_id = generate_chat_id()
                    SessionModel.create(
                        session_id=session_id,
                        user_id=current_user["_id"],
                        book_id=book_id,
                        subject=(book_filters.subject if book_filters else ""),
                        department=(book_filters.department if book_filters else ""),
                        year_of_study=(book_filters.year_of_study if book_filters else ""),
                        title=query[:50]
                    )
                    logger.info(f"Session created: {session_id}")
                except Exception as e:
                    logger.error(f"Failed to create session: {str(e)}")
                    raise DatabaseError("session_creation", "Failed to create new session", e)

        # Step 3: Get or create chat
        logger.info(f"Processing chat management")
        final_chat_id = chat_id or session_id
        if not final_chat_id:
            final_chat_id = generate_chat_id()
        
        try:
            chat = ChatModel.find_by_chat_id(final_chat_id)
            if not chat:
                logger.info(f"Creating new chat: {final_chat_id}")
                chat = ChatModel.create(
                    chat_id=final_chat_id,
                    user_id=user_id,
                    title=query[:50],
                    book_id=book_id,
                    department=(book_filters.department if book_filters else None),
                    year_of_study=(book_filters.year_of_study if book_filters else None),
                    subject=(book_filters.subject if book_filters else None),
                    book_filters=(book_filters.dict() if book_filters else None)
                )
                logger.info(f"Chat created successfully: {final_chat_id}")
            else:
                if str(chat["user_id"]) != user_id:
                    logger.warning(f"Unauthorized chat access: {final_chat_id}")
                    raise UnauthorizedError("chat")
                logger.info(f"Existing chat loaded: {final_chat_id}")
        except UnauthorizedError:
            raise
        except Exception as e:
            logger.error(f"Chat creation/retrieval error: {str(e)}")
            raise DatabaseError("chat_creation", "Failed to create or load chat", e)

        # Build metadata filter for chunk retrieval
        where_filter = None
        if book_filters:
            where_filter = {}
            if book_filters.department:
                where_filter["department"] = book_filters.department
            if book_filters.year_of_study:
                where_filter["year_of_study"] = book_filters.year_of_study
            if book_filters.subject:
                where_filter["subject"] = book_filters.subject

        # Step 4: Retrieve relevant chunks from vector database
        logger.info(f"Retrieving chunks for query: {query[:50]}...")
        try:
            vector_store = get_vector_store()
            documents, metadatas, embeddings, similarity_scores = vector_store.query(
                query_text=query,
                n_results=5,
                where_filter=where_filter if where_filter else None,
                book_id=book_id
            )
            logger.info(f"Retrieved {len(documents)} relevant chunks")

            if not documents:
                logger.warning(f"No relevant chunks found for query")
        except Exception as e:
            logger.error(f"Vector store retrieval error: {str(e)}")
            raise DatabaseError("vector_store_retrieval", "Failed to retrieve relevant chunks", e)

        # Step 5: Load previous messages for context
        logger.info(f"Loading previous messages from conversation history")
        try:
            if previous_messages:
                context_messages = [
                    {"role": m.get("role", "user"), "content": m.get("content", "")} 
                    for m in previous_messages
                ]
            else:
                context_messages = [
                    {"role": m["role"], "content": m["content"]}
                    for m in chat.get("messages", [])[-settings.rag_context_window_messages:]
                ]
            logger.info(f"Loaded {len(context_messages)} previous messages")
        except Exception as e:
            logger.error(f"Failed to load message history: {str(e)}")
            raise DatabaseError("message_history_load", "Failed to load conversation history", e)

        # Step 6: Generate response using RAG pipeline
        logger.info(f"Generating RAG response using pipeline")
        try:
            rag_pipeline = get_rag_pipeline()
            rag_response = rag_pipeline.generate_rag_response(
                query=query,
                retrieved_chunks=documents,
                chunk_metadatas=metadatas,
                previous_messages=context_messages
            )
            logger.info(f"RAG response generated successfully")
        except Exception as e:
            logger.error(f"RAG pipeline error: {str(e)}")
            raise DatabaseError("rag_generation", "Failed to generate response from LLM", e)

        # Step 7: Build sources list from metadata
        logger.info(f"Building sources from metadata")
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
            logger.info(f"Built {len(sources)} source references")
        except Exception as e:
            logger.error(f"Failed to build sources: {str(e)}")
            raise DatabaseError("source_building", "Failed to format source metadata", e)

        # Step 8: Save messages to MongoDB
        logger.info(f"Saving messages to database")
        try:
            user_message = {
                "role": "user",
                "content": query,
                "timestamp": datetime.utcnow(),
                "sources": []
            }

            assistant_message = {
                "role": "assistant",
                "content": rag_response["response"],
                "timestamp": datetime.utcnow(),
                "sources": [s.dict() for s in sources]
            }

            ChatModel.add_message(final_chat_id, user_message)
            logger.info(f"User message saved to chat")
            ChatModel.add_message(final_chat_id, assistant_message)
            logger.info(f"Assistant message saved to chat")
            
            if session_id:
                try:
                    SessionModel.add_message(session_id, user_message)
                    SessionModel.add_message(session_id, assistant_message)
                    logger.info(f"Messages saved to session")
                except Exception as se:
                    logger.warning(f"Failed to save to session {session_id}: {se}")
        
        except Exception as e:
            logger.error(f"Failed to save messages to database: {str(e)}")
            raise DatabaseError("message_save", "Failed to save chat messages", e)

        logger.info(f"Chat response generated for {final_chat_id}. Sources: {len(sources)}")

        return ChatQueryResponse(
            chat_id=final_chat_id,
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
        logger.exception(f"Unexpected error in chat query processing: {str(e)}")
        raise DatabaseError("chat_query", "An unexpected error occurred while processing your query", e)


# ============================================
# NEW ENDPOINTS: Book-Specific Chat Routes
# ============================================

@router.post("/{book_code}", response_model=ChatQueryResponse, status_code=status.HTTP_200_OK)
async def send_chat_query_for_book(
    book_code: str,
    request: ChatQueryRequest,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    Send a query to the RAG chatbot for a specific book.
    
    NEW ENDPOINT: Chat queries must now specify the book_code in the URL path.
    This replaces the generic POST /chat endpoint.
    
    Args:
        book_code: The book ID to chat about (in URL path)
        request: ChatQueryRequest with query and optional session/chat IDs
        current_user: Authenticated user from JWT
        
    Returns:
        ChatQueryResponse with response and sources
    """
    try:
        # Use book_code from path, override request.book_id if provided
        request.book_id = book_code
        
        return await _process_chat_query(
            query=request.query,
            book_id=book_code,
            chat_id=request.chat_id,
            session_id=request.session_id,
            book_filters=request.book_filters,
            previous_messages=request.previous_messages,
            current_user=current_user
        )
    except (ValidationAppError, NotFoundError, UnauthorizedError, DatabaseError):
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in send_chat_query_for_book: {str(e)}")
        raise DatabaseError("chat_query", "An unexpected error occurred while processing your query", e)


@router.get("/{book_code}/chats", response_model=ChatHistoryResponse)
async def list_book_chats(
    book_code: str,
    limit: int = 10,
    offset: int = 0,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    List all chats for a specific book.
    
    NEW ENDPOINT: List chats scoped to a specific book.
    """
    try:
        user_id = current_user.get("user_id")
        logger.info(f"Listing chats for book {book_code}, user {user_id}")

        try:
            db = get_db()
            # Find chats for this user and book
            chats_cursor = db["chats"].find(
                {"user_id": ObjectId(user_id), "book_id": book_code}
            ).skip(offset).limit(limit).sort("updated_at", -1)
            
            chats_list = list(chats_cursor)
            total_count = db["chats"].count_documents({"user_id": ObjectId(user_id), "book_id": book_code})
            
            logger.info(f"Found {len(chats_list)} chats for book (total: {total_count})")

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
            logger.error(f"Error fetching chat list: {str(e)}")
            raise DatabaseError("chat_list_fetch", "Failed to retrieve chat history", e)

    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in list_book_chats: {str(e)}")
        raise DatabaseError("chat_list", "An unexpected error occurred while listing chats", e)


@router.get("/{book_code}/chats/{chat_id}", response_model=FullChatResponse)
async def get_book_chat(
    book_code: str,
    chat_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    Get full chat history for a specific book chat.
    
    NEW ENDPOINT: Get a specific chat within a book context.
    """
    try:
        user_id = current_user.get("user_id")
        logger.info(f"Retrieving chat {chat_id} for book {book_code}")

        try:
            chat = ChatModel.find_by_chat_id(chat_id)
            if not chat:
                logger.warning(f"Chat not found: {chat_id}")
                raise NotFoundError("chat", chat_id)

            if str(chat["user_id"]) != user_id:
                logger.warning(f"Unauthorized access to chat: {chat_id}")
                raise UnauthorizedError("chat")
            
            if chat.get("book_id") != book_code:
                logger.warning(f"Chat {chat_id} does not belong to book {book_code}")
                raise NotFoundError("chat", chat_id)
            
            logger.info(f"Chat found and authorized")

            messages = []
            for msg in chat.get("messages", []):
                messages.append({
                    "role": msg.get("role", ""),
                    "content": msg.get("content", ""),
                    "timestamp": msg.get("timestamp", datetime.utcnow()),
                    "sources": msg.get("sources", [])
                })

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
            logger.error(f"Error fetching chat: {str(e)}")
            raise DatabaseError("chat_retrieval", "Failed to retrieve chat history", e)

    except (NotFoundError, UnauthorizedError):
        raise
    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in get_book_chat: {str(e)}")
        raise DatabaseError("chat_history", "An unexpected error occurred while retrieving chat", e)


@router.delete("/{book_code}/chats/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book_chat(
    book_code: str,
    chat_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    Delete a specific book chat.
    
    NEW ENDPOINT: Delete a chat scoped to a book.
    """
    try:
        user_id = current_user.get("user_id")
        logger.info(f"Deleting chat {chat_id} for book {book_code}")

        try:
            chat = ChatModel.find_by_chat_id(chat_id)
            if not chat:
                logger.warning(f"Chat not found for deletion: {chat_id}")
                raise NotFoundError("chat", chat_id)

            if str(chat["user_id"]) != user_id:
                logger.warning(f"Unauthorized deletion attempt: {chat_id}")
                raise UnauthorizedError("chat")

            if chat.get("book_id") != book_code:
                logger.warning(f"Chat {chat_id} does not belong to book {book_code}")
                raise NotFoundError("chat", chat_id)

            ChatModel.delete_chat(chat_id)
            logger.info(f"Chat deleted successfully: {chat_id}")
        except (NotFoundError, UnauthorizedError):
            raise
        except Exception as e:
            logger.error(f"Error deleting chat: {str(e)}")
            raise DatabaseError("chat_deletion", "Failed to delete chat", e)

    except (NotFoundError, UnauthorizedError):
        raise
    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in delete_book_chat: {str(e)}")
        raise DatabaseError("chat_delete", "An unexpected error occurred while deleting chat", e)


@router.post("/{book_code}/sessions", status_code=status.HTTP_201_CREATED)
async def create_book_session(
    book_code: str,
    title: str = "",
    current_user: dict = Depends(get_current_user_dep)
):
    """
    Create a new chat session for a specific book.
    
    NEW ENDPOINT: Create a session scoped to a book.
    """
    try:
        logger.info(f"Creating new session for book: {book_code}")
        
        try:
            session_id = generate_chat_id()
            session = SessionModel.create(
                session_id=session_id,
                user_id=current_user.get("user_id"),
                book_id=book_code,
                subject="",
                department="",
                year_of_study="",
                title=title or f"Chat - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            )
            logger.info(f"Session created: {session_id}")
            
            return {
                "session_id": session_id,
                "book_id": book_code,
                "title": session.get("title"),
                "created_at": session.get("created_at").isoformat() if session.get("created_at") else None,
                "messages": []
            }
        except Exception as e:
            logger.error(f"Session creation error: {str(e)}")
            raise DatabaseError("session_creation", "Failed to create new session", e)
            
    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in create_book_session: {str(e)}")
        raise DatabaseError("session_create", "An unexpected error occurred while creating session", e)


@router.get("/{book_code}/sessions")
async def list_book_sessions(
    book_code: str,
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user_dep)
):
    """
    List sessions for a specific book.
    
    NEW ENDPOINT: List sessions scoped to a book.
    """
    try:
        logger.info(f"Listing sessions for book {book_code}")
        
        try:
            db = get_db()
            sessions_cursor = db["sessions"].find(
                {"user_id": ObjectId(current_user["_id"]), "book_id": book_code}
            ).skip(offset).limit(limit).sort("created_at", -1)
            
            result = []
            for session in sessions_cursor:
                result.append({
                    "session_id": session.get("session_id"),
                    "book_id": session.get("book_id"),
                    "title": session.get("title"),
                    "created_at": session.get("created_at").isoformat() if session.get("created_at") else None,
                    "last_message_at": session.get("last_message_at").isoformat() if session.get("last_message_at") else None,
                    "message_count": session.get("message_count", 0),
                    "messages": session.get("messages", [])
                })
            
            logger.info(f"Retrieved {len(result)} sessions")
            return result
        except Exception as e:
            logger.error(f"Error listing sessions: {str(e)}")
            raise DatabaseError("session_list", "Failed to retrieve sessions", e)
            
    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in list_book_sessions: {str(e)}")
        raise DatabaseError("session_list_fetch", "An unexpected error occurred while listing sessions", e)


@router.get("/{book_code}/sessions/{session_id}")
async def get_book_session(
    book_code: str,
    session_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    Get a specific session for a book.
    
    NEW ENDPOINT: Get session scoped to a book.
    """
    try:
        logger.info(f"Retrieving session {session_id} for book {book_code}")
        
        session = SessionModel.find_by_session_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if str(session.get("user_id")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        if session.get("book_id") != book_code:
            raise HTTPException(status_code=404, detail="Session not found for this book")
        
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


@router.delete("/{book_code}/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book_session(
    book_code: str,
    session_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    Delete a session for a book.
    
    NEW ENDPOINT: Delete session scoped to a book.
    """
    try:
        logger.info(f"Deleting session {session_id} for book {book_code}")
        
        session = SessionModel.find_by_session_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if str(session.get("user_id")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        if session.get("book_id") != book_code:
            raise HTTPException(status_code=404, detail="Session not found for this book")
        
        SessionModel.delete_session(session_id)
        logger.info(f"Session deleted: {session_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# LEGACY ENDPOINTS (Deprecated, for backward compatibility)
# ============================================

@router.post("", response_model=ChatQueryResponse, status_code=status.HTTP_200_OK)
async def send_chat_query_legacy(
    request: ChatQueryRequest,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    DEPRECATED: Send a query to the RAG chatbot (generic).
    
    This endpoint is deprecated. Use POST /chat/{book_code} instead.
    The book_id must be specified in the request body.
    """
    logger.warning(f"DEPRECATED: Using generic /chat endpoint. Use POST /chat/{{book_code}} instead.")
    
    if not request.book_id:
        raise ValidationAppError("book_id", "book_id is required in the request body")
    
    return await _process_chat_query(
        query=request.query,
        book_id=request.book_id,
        chat_id=request.chat_id,
        session_id=request.session_id,
        book_filters=request.book_filters,
        previous_messages=request.previous_messages,
        current_user=current_user
    )


@router.get("/list", response_model=ChatHistoryResponse)
async def list_user_chats_legacy(
    limit: int = 10,
    offset: int = 0,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    DEPRECATED: List all chats for current user (all books).
    
    This endpoint is deprecated. Use GET /chat/{book_code}/chats instead.
    """
    logger.warning(f"DEPRECATED: Using generic /chat/list endpoint. Use GET /chat/{{book_code}}/chats instead.")
    
    try:
        user_id = current_user.get("user_id")
        logger.info(f"Listing all chats for user {user_id}")

        try:
            db = get_db()
            chats_cursor = db["chats"].find(
                {"user_id": ObjectId(user_id)}
            ).skip(offset).limit(limit).sort("updated_at", -1)
            
            chats_list = list(chats_cursor)
            total_count = db["chats"].count_documents({"user_id": ObjectId(user_id)})
            
            logger.info(f"Found {len(chats_list)} chats (total: {total_count})")

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
            logger.error(f"Error fetching chat list: {str(e)}")
            raise DatabaseError("chat_list_fetch", "Failed to retrieve chat history", e)

    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in list_user_chats_legacy: {str(e)}")
        raise DatabaseError("chat_list", "An unexpected error occurred while listing chats", e)


@router.get("/{chat_id}", response_model=FullChatResponse)
async def get_chat_history_legacy(
    chat_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    DEPRECATED: Get chat history (without book context).
    
    This endpoint is deprecated. Use GET /chat/{book_code}/chats/{chat_id} instead.
    """
    logger.warning(f"DEPRECATED: Using generic /chat/{{chat_id}} endpoint. Use GET /chat/{{book_code}}/chats/{{chat_id}} instead.")
    
    try:
        user_id = current_user.get("user_id")
        logger.info(f"Retrieving chat history for {chat_id}")

        try:
            chat = ChatModel.find_by_chat_id(chat_id)
            if not chat:
                logger.warning(f"Chat not found: {chat_id}")
                raise NotFoundError("chat", chat_id)

            if str(chat["user_id"]) != user_id:
                logger.warning(f"Unauthorized access to chat: {chat_id}")
                raise UnauthorizedError("chat")
            
            logger.info(f"Chat found and authorized")

            messages = []
            for msg in chat.get("messages", []):
                messages.append({
                    "role": msg.get("role", ""),
                    "content": msg.get("content", ""),
                    "timestamp": msg.get("timestamp", datetime.utcnow()),
                    "sources": msg.get("sources", [])
                })

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
            logger.error(f"Error fetching chat: {str(e)}")
            raise DatabaseError("chat_retrieval", "Failed to retrieve chat history", e)

    except (NotFoundError, UnauthorizedError):
        raise
    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in get_chat_history_legacy: {str(e)}")
        raise DatabaseError("chat_history", "An unexpected error occurred while retrieving chat", e)


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_legacy(
    chat_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    DEPRECATED: Delete a chat (without book context).
    
    This endpoint is deprecated. Use DELETE /chat/{book_code}/chats/{chat_id} instead.
    """
    logger.warning(f"DEPRECATED: Using generic /chat/{{chat_id}} delete endpoint. Use DELETE /chat/{{book_code}}/chats/{{chat_id}} instead.")
    
    try:
        user_id = current_user.get("user_id")
        logger.info(f"Deleting chat: {chat_id}")

        try:
            chat = ChatModel.find_by_chat_id(chat_id)
            if not chat:
                logger.warning(f"Chat not found for deletion: {chat_id}")
                raise NotFoundError("chat", chat_id)

            if str(chat["user_id"]) != user_id:
                logger.warning(f"Unauthorized deletion attempt: {chat_id}")
                raise UnauthorizedError("chat")

            ChatModel.delete_chat(chat_id)
            logger.info(f"Chat deleted successfully: {chat_id}")
        except (NotFoundError, UnauthorizedError):
            raise
        except Exception as e:
            logger.error(f"Error deleting chat: {str(e)}")
            raise DatabaseError("chat_deletion", "Failed to delete chat", e)

    except (NotFoundError, UnauthorizedError):
        raise
    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in delete_chat_legacy: {str(e)}")
        raise DatabaseError("chat_delete", "An unexpected error occurred while deleting chat", e)


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session_legacy(
    book_id: Optional[str] = None,
    title: str = "",
    current_user: dict = Depends(get_current_user_dep)
):
    """
    DEPRECATED: Create a new chat session.
    
    This endpoint is deprecated. Use POST /chat/{book_code}/sessions instead.
    """
    logger.warning(f"DEPRECATED: Using generic /chat/sessions endpoint. Use POST /chat/{{book_code}}/sessions instead.")
    
    if not book_id:
        raise ValidationAppError("book_id", "book_id is required")
    
    try:
        logger.info(f"Creating new session for book: {book_id}")
        
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
            logger.info(f"Session created: {session_id}")
            
            return {
                "session_id": session_id,
                "book_id": book_id,
                "title": session.get("title"),
                "created_at": session.get("created_at").isoformat() if session.get("created_at") else None,
                "messages": []
            }
        except Exception as e:
            logger.error(f"Session creation error: {str(e)}")
            raise DatabaseError("session_creation", "Failed to create new session", e)
            
    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in create_session_legacy: {str(e)}")
        raise DatabaseError("session_create", "An unexpected error occurred while creating session", e)


@router.get("/sessions")
async def list_sessions_legacy(
    book_id: Optional[str] = None,
    limit: int = 10,
    offset: int = 0,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    DEPRECATED: List sessions for current user.
    
    This endpoint is deprecated. Use GET /chat/{book_code}/sessions instead.
    """
    logger.warning(f"DEPRECATED: Using generic /chat/sessions endpoint. Use GET /chat/{{book_code}}/sessions instead.")
    
    try:
        logger.info(f"Listing sessions for user")
        
        try:
            sessions = SessionModel.find_by_user_id(
                current_user["_id"],
                limit=limit,
                offset=offset
            )
            
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
            
            logger.info(f"Retrieved {len(result)} sessions")
            return result
        except Exception as e:
            logger.error(f"Error listing sessions: {str(e)}")
            raise DatabaseError("session_list", "Failed to retrieve sessions", e)
            
    except DatabaseError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in list_sessions_legacy: {str(e)}")
        raise DatabaseError("session_list_fetch", "An unexpected error occurred while listing sessions", e)


@router.get("/sessions/{session_id}")
async def get_session_legacy(
    session_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    DEPRECATED: Get a specific session.
    
    This endpoint is deprecated. Use GET /chat/{book_code}/sessions/{session_id} instead.
    """
    logger.warning(f"DEPRECATED: Using generic /chat/sessions/{{session_id}} endpoint.")
    
    try:
        session = SessionModel.find_by_session_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
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
async def delete_session_legacy(
    session_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    DEPRECATED: Delete a session.
    
    This endpoint is deprecated. Use DELETE /chat/{book_code}/sessions/{session_id} instead.
    """
    logger.warning(f"DEPRECATED: Using generic /chat/sessions/{{session_id}} delete endpoint.")
    
    try:
        session = SessionModel.find_by_session_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if str(session.get("user_id")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        SessionModel.delete_session(session_id)
        logger.info(f"Session deleted: {session_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
