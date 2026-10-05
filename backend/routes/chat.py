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
    ChatHistoryItem, FullChatResponse, MessageSource, BookFilter, ChatMessage
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


def _format_chat_messages(raw_messages: list) -> List[ChatMessage]:
    """Helper to safely format messages preserving both regular chats and assessments."""
    formatted = []
    for msg in raw_messages:
        role = msg.get("role", "")
        if role == "assessment":
            formatted.append(ChatMessage(
                role="assessment",
                content=msg.get("content", ""),
                timestamp=msg.get("timestamp", datetime.utcnow()),
                assessment_id=msg.get("assessment_id"),
                topic=msg.get("topic", "General"),
                difficulty=msg.get("difficulty", "intermediate"),
                mode=msg.get("mode", "topic"),
                questions=msg.get("questions", []),
                completed=msg.get("completed", False),
                result=msg.get("result", None)
            ))
        else:
            sources_raw = msg.get("sources", [])
            sources = []
            for s in sources_raw:
                if isinstance(s, dict):
                    sources.append(MessageSource(
                        chunk_id=str(s.get("chunk_id", "")),
                        book_name=str(s.get("book_name", "")),
                        book_id=str(s.get("book_id", "")),
                        page_range=str(s.get("page_range", "?-?")),
                        chapter=s.get("chapter"),
                        section=s.get("section"),
                        relevance_score=float(s.get("relevance_score", 0.0)),
                        formulas_cited=s.get("formulas_cited", [])
                    ))
            formatted.append(ChatMessage(
                role=role,
                content=msg.get("content", ""),
                timestamp=msg.get("timestamp", datetime.utcnow()),
                sources=sources
            ))
    return formatted


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
    Retains full assessment filtering and sources reconstruction.
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
            if book_id:
                try:
                    logger.info(f"Creating new session for book: {book_id}")
                    session_id = generate_chat_id()
                    SessionModel.create(
                        session_id=session_id,
                        user_id=current_user.get("_id") or ObjectId(user_id),
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

        # Step 4: Retrieve relevant chunks from ChromaDB
        logger.info(f"Retrieving chunks from ChromaDB for query: {query[:50]}...")
        try:
            vector_store = get_vector_store()
            top_k = getattr(settings, "rag_top_k_retrieval", 5)

            where_filter = {}
            if book_filters:
                if book_filters.department:
                    where_filter["department"] = book_filters.department
                if book_filters.year_of_study:
                    where_filter["year_of_study"] = book_filters.year_of_study
                if book_filters.subject:
                    where_filter["subject"] = book_filters.subject

            documents, metadatas, embeddings, similarity_scores = vector_store.query(
                query_text=query,
                n_results=top_k,
                where_filter=where_filter if where_filter else None,
                book_id=book_id
            )
            logger.info(f"Retrieved {len(documents)} relevant chunks from ChromaDB")

            if not documents:
                logger.warning(f"No relevant chunks found for query in ChromaDB")
        except Exception as e:
            logger.error(f"Vector store retrieval error: {str(e)}")
            raise DatabaseError("vector_store_retrieval", "Failed to retrieve relevant chunks", e)

        # Step 5: Load previous messages for context (filter out assessment items)
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
                    if m.get("role") in ["user", "assistant"] and m.get("content")
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
                p_start = metadata.get("page_start")
                p_end = metadata.get("page_end")
                if p_start is not None and p_end is not None:
                    page_range = f"{p_start}-{p_end}"
                else:
                    page_range = str(metadata.get("page", "?-?"))

                score = similarity_scores[i] if i < len(similarity_scores) else 0.0

                sources.append(MessageSource(
                    chunk_id=str(metadata.get("chunk_index", f"chunk_{i}")),
                    book_name=metadata.get("book_name") or metadata.get("title") or "Unknown Book",
                    book_id=metadata.get("book_id", book_id or ""),
                    page_range=page_range,
                    chapter=metadata.get("chapter"),
                    section=metadata.get("section"),
                    relevance_score=round(float(score), 4),
                    formulas_cited=[f["latex"] for f in metadata.get("formulas", [])] if isinstance(metadata.get("formulas"), list) else []
                ))
            logger.info(f"Built {len(sources)} source references")
        except Exception as e:
            logger.error(f"Failed to build sources: {str(e)}")
            raise DatabaseError("source_building", "Failed to format source metadata", e)

        # Step 8: Save messages to MongoDB
        logger.info(f"Saving messages to database")
        try:
            now = datetime.utcnow()
            user_message = {
                "role": "user",
                "content": query,
                "timestamp": now,
                "sources": []
            }

            assistant_message = {
                "role": "assistant",
                "content": rag_response["response"],
                "timestamp": now,
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
    """
    try:
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
    """
    try:
        user_id = current_user.get("user_id")
        logger.info(f"Listing chats for book {book_code}, user {user_id}")

        try:
            db = get_db()
            chats_cursor = db["chats"].find(
                {"user_id": ObjectId(user_id), "book_id": book_code}
            ).skip(offset).limit(limit).sort("updated_at", -1)
            
            chats_list = list(chats_cursor)
            total_count = db["chats"].count_documents({"user_id": ObjectId(user_id), "book_id": book_code})
            
            logger.info(f"Found {len(chats_list)} chats for book (total: {total_count})")

            chat_items = []
            for chat in chats_list:
                last_message = ""
                for m in reversed(chat.get("messages", [])):
                    if m.get("content"):
                        last_message = m.get("content", "")[:100]
                        break
                    elif m.get("role") == "assessment":
                        last_message = f"[Quiz: {m.get('topic', 'Topic Quiz')}]"
                        break

                chat_items.append(ChatHistoryItem(
                    chat_id=chat["chat_id"],
                    title=chat.get("title", "Untitled Chat"),
                    last_message=last_message,
                    created_at=chat["created_at"],
                    updated_at=chat.get("updated_at", chat["created_at"]),
                    message_count=len(chat.get("messages", [])),
                    book_id=chat.get("book_id")
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

            messages = _format_chat_messages(chat.get("messages", []))
            book_filters = BookFilter(**chat.get("book_filters", {}))

            return FullChatResponse(
                chat_id=chat["chat_id"],
                title=chat.get("title", ""),
                created_at=chat["created_at"],
                updated_at=chat.get("updated_at", chat["created_at"]),
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
    limit: int = 15,
    offset: int = 0,
    current_user: dict = Depends(get_current_user_dep)
):
    """
    List all chats for current user (all books).
    """
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
                for m in reversed(chat.get("messages", [])):
                    if m.get("content"):
                        last_message = m.get("content", "")[:100]
                        break
                    elif m.get("role") == "assessment":
                        last_message = f"[Quiz: {m.get('topic', 'Topic Quiz')}]"
                        break

                chat_items.append(ChatHistoryItem(
                    chat_id=chat["chat_id"],
                    title=chat.get("title", "Untitled Chat"),
                    last_message=last_message,
                    created_at=chat["created_at"],
                    updated_at=chat.get("updated_at", chat["created_at"]),
                    message_count=len(chat.get("messages", [])),
                    book_id=chat.get("book_id")
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

            messages = _format_chat_messages(chat.get("messages", []))
            book_filters = BookFilter(**chat.get("book_filters", {}))

            return FullChatResponse(
                chat_id=chat["chat_id"],
                title=chat.get("title", ""),
                created_at=chat["created_at"],
                updated_at=chat.get("updated_at", chat["created_at"]),
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


@router.delete("/{chat_id}", status_code=status.HTTP_200_OK)
async def delete_chat_legacy(
    chat_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
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
            return {"message": "Chat deleted successfully", "chat_id": chat_id}
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