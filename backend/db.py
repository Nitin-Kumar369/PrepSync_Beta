"""
MongoDB connection and database utilities.
"""

import logging
import os
from typing import Optional
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from contextlib import contextmanager
from config import settings
from bson import ObjectId
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Global MongoDB client (singleton)
_db_client: Optional[MongoClient] = None
_db = None


def connect_mongodb():
    """Connect to MongoDB database."""
    global _db_client, _db

    try:
        logger.info(f"Connecting to MongoDB at {settings.mongodb_uri.split('/')[2] if '://' in settings.mongodb_uri else 'Unknown'}...")

        _db_client = MongoClient(
            settings.mongodb_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=10000,
            socketTimeoutMS=5000,
        )

        # Test connection
        _db_client.admin.command("ping")
        logger.info("✅ MongoDB connected successfully")

        # Get database
        _db = _db_client[settings.mongodb_uri.split("/")[-1] or "engineering_books_rag"]

        # Create indexes for better query performance
        create_indexes()

        return _db

    except (ConnectionFailure, ServerSelectionTimeoutError) as e:
        logger.error(f"❌ Failed to connect to MongoDB: {str(e)}")
        raise


def disconnect_mongodb():
    """Disconnect from MongoDB."""
    global _db_client
    if _db_client:
        _db_client.close()
        logger.info("✅ MongoDB disconnected")


def get_db():
    """Get the MongoDB database instance."""
    global _db
    if _db is None:
        _db = connect_mongodb()
    return _db


def create_indexes():
    """Create database indexes for common queries."""
    db = get_db()
    logger.info("Creating MongoDB indexes...")

    # Users collection indexes
    db["users"].create_index("email", unique=True)
    db["users"].create_index("created_at")
    db["users"].create_index("role")
    db["users"].create_index("department")

    # Chats collection indexes
    db["chats"].create_index("user_id")
    db["chats"].create_index("chat_id", unique=True)
    db["chats"].create_index("created_at")
    db["chats"].create_index([("user_id", 1), ("created_at", -1)])
    db["chats"].create_index("book_id")

    # Sessions collection indexes
    db["sessions"].create_index("session_id", unique=True)
    db["sessions"].create_index("user_id")
    db["sessions"].create_index([("user_id", 1), ("last_message_at", -1)])
    db["sessions"].create_index("book_id")

    # Books collection indexes
    db["books"].create_index("book_id", unique=True)
    db["books"].create_index("department")
    db["books"].create_index("year_of_study")
    db["books"].create_index("status")
    db["books"].create_index([("department", 1), ("year_of_study", 1), ("subject", 1)])
    db["books"].create_index("subject")

    # Categories collection index (departments/years/subjects hierarchy)
    db["categories"].create_index("name", unique=True)

    # Chunks collection indexes
    db["chunks"].create_index("metadata.book_id")
    db["chunks"].create_index([("metadata.department", 1), ("metadata.subject", 1)])
    db["chunks"].create_index("metadata.book_name")

    # RAG config collection
    db["rag_config"].create_index("config_version")

    logger.info("✅ Indexes created successfully")


# ============================================
# Database Models (Collections)
# ============================================

class UserModel:
    """User document model."""

    collection_name = "users"

    @staticmethod
    def create(email: str, password_hash: str, full_name: str, department: str = "", role: str = "student"):
        """Create a new user."""
        db = get_db()
        user = {
            "email": email,
            "password_hash": password_hash,
            "full_name": full_name,
            "department": department,
            "role": role,
            "created_at": datetime.utcnow(),
            "last_login": None,
            "active": True,
            "book_access": []
        }
        result = db[UserModel.collection_name].insert_one(user)
        user["_id"] = result.inserted_id
        return user

    @staticmethod
    def find_by_email(email: str):
        """Find user by email."""
        db = get_db()
        return db[UserModel.collection_name].find_one({"email": email})

    @staticmethod
    def find_by_id(user_id):
        """Find user by ID."""
        db = get_db()
        return db[UserModel.collection_name].find_one({"_id": ObjectId(user_id) if isinstance(user_id, str) else user_id})

    @staticmethod
    def update_last_login(user_id):
        """Update user's last login timestamp."""
        db = get_db()
        db[UserModel.collection_name].update_one(
            {"_id": ObjectId(user_id) if isinstance(user_id, str) else user_id},
            {"$set": {"last_login": datetime.utcnow()}}
        )

    @staticmethod
    def list_all(limit: int = 50, offset: int = 0):
        """List all users with pagination."""
        db = get_db()
        return list(db[UserModel.collection_name].find().sort("created_at", -1).skip(offset).limit(limit))

    @staticmethod
    def count_all():
        """Get total count of users."""
        db = get_db()
        return db[UserModel.collection_name].count_documents({})

    @staticmethod
    def find_by_role(role: str):
        """Find all users with a specific role."""
        db = get_db()
        return list(db[UserModel.collection_name].find({"role": role}))

    @staticmethod
    def update_user(user_id, **kwargs):
        """Update user fields. Pass user_id and any fields to update."""
        db = get_db()
        update_fields = {}
        allowed_fields = ["full_name", "department", "email", "role", "active"]
        for field in allowed_fields:
            if field in kwargs:
                update_fields[field] = kwargs[field]
        
        if update_fields:
            db[UserModel.collection_name].update_one(
                {"_id": ObjectId(user_id) if isinstance(user_id, str) else user_id},
                {"$set": update_fields}
            )
        return UserModel.find_by_id(user_id)

    @staticmethod
    def update_password(user_id, password_hash: str):
        """Update user password."""
        from auth import hash_password
        db = get_db()
        db[UserModel.collection_name].update_one(
            {"_id": ObjectId(user_id) if isinstance(user_id, str) else user_id},
            {"$set": {"password_hash": password_hash}}
        )

    @staticmethod
    def delete_by_id(user_id):
        """Delete a user and cascade delete their chats and sessions."""
        db = get_db()
        user_obj_id = ObjectId(user_id) if isinstance(user_id, str) else user_id
        
        db["chats"].delete_many({"user_id": user_obj_id})
        db["sessions"].delete_many({"user_id": user_obj_id})
        db[UserModel.collection_name].delete_one({"_id": user_obj_id})

    @staticmethod
    def deactivate_user(user_id):
        """Deactivate a user account."""
        return UserModel.update_user(user_id, active=False)

    @staticmethod
    def activate_user(user_id):
        """Activate a user account."""
        return UserModel.update_user(user_id, active=True)

    @staticmethod
    def promote_to_admin(user_id):
        """Promote a user to admin role."""
        return UserModel.update_user(user_id, role="admin")

    @staticmethod
    def demote_to_student(user_id):
        """Demote an admin to student role."""
        return UserModel.update_user(user_id, role="student")


class ChatModel:
    """Chat document model."""

    collection_name = "chats"

    @staticmethod
    def create(chat_id: str, user_id, title: str = "", book_id: str = None, 
               department: str = None, year_of_study: str = None, subject: str = None,
               book_filters: dict = None):
        """Create a new chat."""
        db = get_db()
        chat = {
            "chat_id": chat_id,
            "user_id": ObjectId(user_id) if isinstance(user_id, str) else user_id,
            "title": title,
            "book_id": book_id,
            "department": department,
            "year_of_study": year_of_study,
            "subject": subject,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "book_filters": book_filters or {"department": None, "year_of_study": None, "subject": None, "book_ids": []},
            "messages": []
        }
        result = db[ChatModel.collection_name].insert_one(chat)
        chat["_id"] = result.inserted_id
        return chat

    @staticmethod
    def find_by_chat_id(chat_id: str):
        """Find chat by chat_id."""
        db = get_db()
        return db[ChatModel.collection_name].find_one({"chat_id": chat_id})

    @staticmethod
    def find_by_user_id(user_id, limit: int = 10, offset: int = 0):
        """Find all chats for a user."""
        db = get_db()
        return db[ChatModel.collection_name].find(
            {"user_id": ObjectId(user_id) if isinstance(user_id, str) else user_id}
        ).sort("updated_at", -1).skip(offset).limit(limit)

    @staticmethod
    def add_message(chat_id: str, message: dict):
        """Add a message to a chat."""
        db = get_db()
        db[ChatModel.collection_name].update_one(
            {"chat_id": chat_id},
            {
                "$push": {"messages": message},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )

    @staticmethod
    def delete_chat(chat_id: str):
        """Delete a chat."""
        db = get_db()
        db[ChatModel.collection_name].delete_one({"chat_id": chat_id})


class CategoryModel:
    """Hierarchical department → year → subject storage."""

    collection_name = "categories"

    @staticmethod
    def create_department(name: str):
        db = get_db()
        existing = db[CategoryModel.collection_name].find_one({"name": name})
        if existing:
            return existing
        doc = {"name": name, "years": []}
        result = db[CategoryModel.collection_name].insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    @staticmethod
    def list_departments():
        db = get_db()
        return list(db[CategoryModel.collection_name].find({}, {"years": 0}))

    @staticmethod
    def delete_department(name: str):
        db = get_db()
        from rag.vector_store import get_vector_store

        books = list(db["books"].find({"department": name}))
        vs = get_vector_store()
        for b in books:
            book_id = b.get("book_id")
            try:
                path = b.get("file_path")
                if path and os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass
            try:
                vs.delete_by_book_id(book_id)
            except Exception:
                pass
            try:
                db["chunks"].delete_many({"metadata.book_id": book_id})
            except Exception:
                pass
            try:
                db[BookModel.collection_name].delete_one({"book_id": book_id})
            except Exception:
                pass

        db[CategoryModel.collection_name].delete_one({"name": name})

    @staticmethod
    def add_year(dept: str, year: str):
        db = get_db()
        return db[CategoryModel.collection_name].update_one(
            {"name": dept, "years.year": {"$ne": year}},
            {"$push": {"years": {"year": year, "subjects": []}}}
        )

    @staticmethod
    def list_years(dept: str):
        db = get_db()
        doc = db[CategoryModel.collection_name].find_one({"name": dept}, {"years": 1})
        return doc.get("years", []) if doc else []

    @staticmethod
    def delete_year(dept: str, year: str):
        db = get_db()
        from rag.vector_store import get_vector_store

        books = list(db["books"].find({"department": dept, "year_of_study": year}))
        vs = get_vector_store()
        for b in books:
            book_id = b.get("book_id")
            try:
                path = b.get("file_path")
                if path and os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass
            try:
                vs.delete_by_book_id(book_id)
            except Exception:
                pass
            try:
                db["chunks"].delete_many({"metadata.book_id": book_id})
            except Exception:
                pass
            try:
                db[BookModel.collection_name].delete_one({"book_id": book_id})
            except Exception:
                pass

        return db[CategoryModel.collection_name].update_one(
            {"name": dept},
            {"$pull": {"years": {"year": year}}}
        )

    @staticmethod
    def add_subject(dept: str, year: str, subject: str):
        db = get_db()
        return db[CategoryModel.collection_name].update_one(
            {"name": dept, "years.year": year, "years.subjects": {"$ne": subject}},
            {"$push": {"years.$.subjects": subject}}
        )

    @staticmethod
    def list_subjects(dept: str, year: str):
        db = get_db()
        doc = db[CategoryModel.collection_name].find_one({"name": dept, "years.year": year}, {"years.$": 1})
        if not doc or "years" not in doc:
            return []
        return doc["years"][0].get("subjects", [])

    @staticmethod
    def delete_subject(dept: str, year: str, subject: str):
        db = get_db()
        from rag.vector_store import get_vector_store

        books = list(db["books"].find({"department": dept, "year_of_study": year, "subject": subject}))
        vs = get_vector_store()
        for b in books:
            book_id = b.get("book_id")
            try:
                path = b.get("file_path")
                if path and os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass
            try:
                vs.delete_by_book_id(book_id)
            except Exception:
                pass
            try:
                db["chunks"].delete_many({"metadata.book_id": book_id})
            except Exception:
                pass
            try:
                db[BookModel.collection_name].delete_one({"book_id": book_id})
            except Exception:
                pass

        return db[CategoryModel.collection_name].update_one(
            {"name": dept, "years.year": year},
            {"$pull": {"years.$.subjects": subject}}
        )


class BookModel:
    """Book metadata document model."""

    collection_name = "books"

    @staticmethod
    def create(book_id: str, title: str, department: str, year_of_study: str, subject: str,
               file_path: str, status: str = "processing", author: str = "", isbn: str = ""):
        """Create a new book entry."""
        db = get_db()
        book = {
            "book_id": book_id,
            "title": title,
            "department": department,
            "year_of_study": year_of_study,
            "subject": subject,
            "file_path": file_path,
            "status": status,
            "author": author,
            "isbn": isbn,
            "total_pages": None,
            "total_chunks": 0,
            "indexed_date": None,
            "error_message": None,
            "created_at": datetime.utcnow()
        }
        result = db[BookModel.collection_name].insert_one(book)
        book["_id"] = result.inserted_id
        return book

    @staticmethod
    def find_by_book_id(book_id: str):
        """Find book by book_id."""
        db = get_db()
        return db[BookModel.collection_name].find_one({"book_id": book_id})

    @staticmethod
    def find_all():
        """Find all books."""
        db = get_db()
        return list(db[BookModel.collection_name].find())

    @staticmethod
    def find_by_department(department: str):
        """Find books by department."""
        db = get_db()
        return list(db[BookModel.collection_name].find({"department": department}))

    @staticmethod
    def find_by_year(year_of_study: str):
        """Find books by year of study."""
        db = get_db()
        return list(db[BookModel.collection_name].find({"year_of_study": year_of_study}))

    @staticmethod
    def find_by_subject(subject: str):
        """Find books by subject."""
        db = get_db()
        return list(db[BookModel.collection_name].find({"subject": subject}))

    @staticmethod
    def find_by_filters(department: str = None, year_of_study: str = None, subject: str = None):
        """Find books by multiple filters."""
        db = get_db()
        query = {}
        if department:
            query["department"] = department
        if year_of_study:
            query["year_of_study"] = year_of_study
        if subject:
            query["subject"] = subject
        return list(db[BookModel.collection_name].find(query))

    @staticmethod
    def get_unique_departments():
        """Get all unique departments."""
        db = get_db()
        return db[BookModel.collection_name].distinct("department")

    @staticmethod
    def get_unique_years(department: str = None):
        """Get all unique years, optionally filtered by department."""
        db = get_db()
        query = {"year_of_study": {"$exists": True, "$ne": None}}
        if department:
            query["department"] = department
        return db[BookModel.collection_name].distinct("year_of_study", query)

    @staticmethod
    def get_unique_subjects(department: str = None, year_of_study: str = None):
        """Get all unique subjects for given filters."""
        db = get_db()
        query = {"subject": {"$exists": True, "$ne": None}}
        if department:
            query["department"] = department
        if year_of_study:
            query["year_of_study"] = year_of_study
        return db[BookModel.collection_name].distinct("subject", query)

    @staticmethod
    def update_status(book_id: str, status: str, error_message: str = None, total_chunks: int = None):
        """Update book status."""
        db = get_db()
        update_data = {
            "status": status,
            "indexed_date": datetime.utcnow() if status == "indexed" else None
        }
        if error_message:
            update_data["error_message"] = error_message
        if total_chunks is not None:
            update_data["total_chunks"] = total_chunks

        db[BookModel.collection_name].update_one(
            {"book_id": book_id},
            {"$set": update_data}
        )

    @staticmethod
    def delete_book(book_id: str):
        """Delete a book."""
        db = get_db()
        db[BookModel.collection_name].delete_one({"book_id": book_id})

    @staticmethod
    def delete_book_complete(book_id: str):
        """Delete a book and cascade delete vectors, chunks, and file."""
        db = get_db()
        from rag.vector_store import get_vector_store
        
        book = BookModel.find_by_book_id(book_id)
        if not book:
            return False
        
        try:
            file_path = book.get("file_path")
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Deleted file for book {book_id}")
        except Exception as e:
            logger.warning(f"Failed to delete file for book {book_id}: {e}")
        
        try:
            vs = get_vector_store()
            vs.delete_by_book_id(book_id)
            logger.info(f"Deleted vectors for book {book_id}")
        except Exception as e:
            logger.warning(f"Failed to delete vectors for book {book_id}: {e}")
        
        try:
            db["chunks"].delete_many({"metadata.book_id": book_id})
            logger.info(f"Deleted chunks for book {book_id}")
        except Exception as e:
            logger.warning(f"Failed to delete chunks for book {book_id}: {e}")
        
        db[BookModel.collection_name].delete_one({"book_id": book_id})
        logger.info(f"Deleted book record: {book_id}")
        return True

    @staticmethod
    def list_all(limit: int = 50, offset: int = 0, status_filter: str = None):
        """List all books with optional status filter."""
        db = get_db()
        query = {}
        if status_filter:
            query["status"] = status_filter
        return list(db[BookModel.collection_name].find(query).sort("created_at", -1).skip(offset).limit(limit))

    @staticmethod
    def count_all():
        """Get total count of books."""
        db = get_db()
        return db[BookModel.collection_name].count_documents({})

    @staticmethod
    def count_chunks():
        """Get total count of chunks (across all books)."""
        db = get_db()
        return db["chunks"].count_documents({})

    @staticmethod
    def get_storage_size():
        """Get approximate storage size in GB."""
        db = get_db()
        books = db[BookModel.collection_name].find({}, {"file_path": 1})
        total_size = 0
        for book in books:
            try:
                path = book.get("file_path")
                if path and os.path.exists(path):
                    total_size += os.path.getsize(path)
            except Exception:
                pass
        return total_size / (1024 ** 3)


class ChunkModel:
    """Text chunk document model for RAG retrieval."""

    collection_name = "chunks"

    @staticmethod
    def create(text: str, metadata: dict, embedding_vector: list = None):
        """Create a new chunk."""
        db = get_db()
        chunk = {
            "text": text,
            "metadata": metadata,
            "embedding_vector": embedding_vector,
            "created_at": datetime.utcnow()
        }
        result = db[ChunkModel.collection_name].insert_one(chunk)
        chunk["_id"] = result.inserted_id
        return chunk

    @staticmethod
    def find_by_book_id(book_id: str):
        """Find all chunks for a book."""
        db = get_db()
        return list(db[ChunkModel.collection_name].find({"metadata.book_id": book_id}))

    @staticmethod
    def find_by_filters(book_id: str = None, department: str = None, subject: str = None):
        """Find chunks by multiple filters."""
        db = get_db()
        query = {}
        if book_id:
            query["metadata.book_id"] = book_id
        if department:
            query["metadata.department"] = department
        if subject:
            query["metadata.subject"] = subject
        return list(db[ChunkModel.collection_name].find(query))

    @staticmethod
    def update_embedding(chunk_id, embedding_vector: list):
        """Update embedding vector for a chunk."""
        db = get_db()
        db[ChunkModel.collection_name].update_one(
            {"_id": ObjectId(chunk_id) if isinstance(chunk_id, str) else chunk_id},
            {"$set": {"embedding_vector": embedding_vector}}
        )

    @staticmethod
    def delete_by_book_id(book_id: str):
        """Delete all chunks for a book."""
        db = get_db()
        db[ChunkModel.collection_name].delete_many({"metadata.book_id": book_id})

    @staticmethod
    def clear_embeddings(book_id: str = None):
        """Clear embedding vectors (set to null)."""
        db = get_db()
        query = {} if book_id is None else {"metadata.book_id": book_id}
        db[ChunkModel.collection_name].update_many(query, {"$set": {"embedding_vector": None}})


class SessionModel:
    """Chat session tracking model."""

    collection_name = "sessions"

    @staticmethod
    def create(session_id: str, user_id, book_id: str, subject: str, 
               department: str, year_of_study: str, title: str = ""):
        """Create a new chat session."""
        db = get_db()
        session = {
            "session_id": session_id,
            "user_id": ObjectId(user_id) if isinstance(user_id, str) else user_id,
            "book_id": book_id,
            "subject": subject,
            "department": department,
            "year_of_study": year_of_study,
            "title": title,
            "created_at": datetime.utcnow(),
            "last_message_at": datetime.utcnow(),
            "message_count": 0,
            "messages": []
        }
        result = db[SessionModel.collection_name].insert_one(session)
        session["_id"] = result.inserted_id
        return session

    @staticmethod
    def find_by_session_id(session_id: str):
        """Find session by session_id."""
        db = get_db()
        return db[SessionModel.collection_name].find_one({"session_id": session_id})

    @staticmethod
    def find_by_user_id(user_id, limit: int = 10, offset: int = 0):
        """Find all sessions for a user."""
        db = get_db()
        return list(db[SessionModel.collection_name].find(
            {"user_id": ObjectId(user_id) if isinstance(user_id, str) else user_id}
        ).sort("last_message_at", -1).skip(offset).limit(limit))

    @staticmethod
    def add_message(session_id: str, message: dict):
        """Add a message to a session."""
        db = get_db()
        db[SessionModel.collection_name].update_one(
            {"session_id": session_id},
            {
                "$push": {"messages": message},
                "$set": {"last_message_at": datetime.utcnow()},
                "$inc": {"message_count": 1}
            }
        )

    @staticmethod
    def delete_session(session_id: str):
        """Delete a session."""
        db = get_db()
        db[SessionModel.collection_name].delete_one({"session_id": session_id})

    @staticmethod
    def count_active_sessions(hours: int = 24):
        """Count sessions with messages in the last N hours."""
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        return db[SessionModel.collection_name].count_documents({"last_message_at": {"$gte": cutoff_time}})


class RAGConfigModel:
    """RAG configuration document model."""

    collection_name = "rag_config"

    @staticmethod
    def get_current():
        """Get current RAG configuration."""
        db = get_db()
        config = db[RAGConfigModel.collection_name].find_one(sort=[("config_version", -1)])
        return config

    @staticmethod
    def create(chunk_size: int, chunk_overlap: int, top_k_retrieval: int,
               temperature: float, context_window_messages: int, embedding_model: str,
               updated_by_admin: str):
        """Create a new RAG configuration."""
        db = get_db()
        last_config = RAGConfigModel.get_current()
        next_version = (last_config["config_version"] + 1) if last_config else 1

        config = {
            "config_version": next_version,
            "chunk_size": chunk_size,
            "chunk_overlap": chunk_overlap,
            "top_k_retrieval": top_k_retrieval,
            "temperature": temperature,
            "context_window_messages": context_window_messages,
            "embedding_model": embedding_model,
            "updated_at": datetime.utcnow(),
            "updated_by_admin": ObjectId(updated_by_admin) if isinstance(updated_by_admin, str) else updated_by_admin
        }
        result = db[RAGConfigModel.collection_name].insert_one(config)
        config["_id"] = result.inserted_id
        return config


class AssessmentModel:
    """Model for AI-generated assessments and student submissions."""
    collection_assessments = "assessments"
    collection_submissions = "assessment_submissions"

    @staticmethod
    def create_assessment(assessment_id: str, user_id: str, book_id: str, topic: str, questions: list):
        db = get_db()
        doc = {
            "assessment_id": assessment_id,
            "user_id": ObjectId(user_id) if isinstance(user_id, str) else user_id,
            "book_id": book_id,
            "topic": topic,
            "questions": questions,
            "created_at": datetime.utcnow()
        }
        db[AssessmentModel.collection_assessments].insert_one(doc)
        return doc

    @staticmethod
    def get_assessment(assessment_id: str):
        db = get_db()
        return db[AssessmentModel.collection_assessments].find_one({"assessment_id": assessment_id})

    @staticmethod
    def record_submission(assessment_id: str, user_id: str, book_id: str, topic: str, score: int, total_questions: int, results: list, feedback: str):
        db = get_db()
        submission = {
            "assessment_id": assessment_id,
            "user_id": ObjectId(user_id) if isinstance(user_id, str) else user_id,
            "book_id": book_id,
            "topic": topic,
            "score": score,
            "total_questions": total_questions,
            "percentage": round((score / total_questions) * 100, 2) if total_questions > 0 else 0.0,
            "results": results,
            "feedback": feedback,
            "submitted_at": datetime.utcnow()
        }
        db[AssessmentModel.collection_submissions].insert_one(submission)
        return submission

    @staticmethod
    def list_student_submissions(user_id: str, limit: int = 20):
        db = get_db()
        uid = ObjectId(user_id) if isinstance(user_id, str) else user_id
        return list(db[AssessmentModel.collection_submissions].find({"user_id": uid}).sort("submitted_at", -1).limit(limit))


class StudentAnalyticsModel:
    """Aggregates comprehensive analytics, knowledge matrix, and adaptive recommendations."""

    @staticmethod
    def get_student_metrics(user_id: str):
        db = get_db()
        query = {"$or": [{"user_id": str(user_id)}]}
        try:
            query["$or"].append({"user_id": ObjectId(user_id)})
        except Exception:
            pass

        submissions = list(db[AssessmentModel.collection_submissions].find(query).sort("submitted_at", -1))
        user_chats = list(db["chats"].find(query).sort("created_at", -1))
        total_library_books = db["books"].count_documents({"status": "indexed"}) or 1

        # Track unique books queried in chat & collect activity dates
        queried_book_ids = set()
        chat_keywords = []
        active_dates = set()

        for c in user_chats:
            if c.get("book_id"):
                queried_book_ids.add(c.get("book_id"))
            
            # Record chat timestamps for streak calculation
            for ts in [c.get("created_at"), c.get("updated_at")]:
                if isinstance(ts, datetime):
                    active_dates.add(ts.date())

            for m in c.get("messages", []):
                if m.get("role") == "user":
                    words = [w.strip("?,.!") for w in m.get("content", "").split() if len(w) > 4]
                    chat_keywords.extend(words[:3])

        # Record assessment timestamps for streak calculation
        for s in submissions:
            sub_date = s.get("submitted_at")
            if isinstance(sub_date, datetime):
                active_dates.add(sub_date.date())

        # -------------------------------------------------------------
        # ACCURATE CONSECUTIVE CALENDAR-DAY STREAK CALCULATION (NO 7-DAY CAP)
        # -------------------------------------------------------------
        current_streak = 0
        if active_dates:
            today = datetime.utcnow().date()
            yesterday = today - timedelta(days=1)
            
            # Start streak check from today if active, else from yesterday
            cursor_day = today if today in active_dates else (yesterday if yesterday in active_dates else None)
            
            if cursor_day:
                while cursor_day in active_dates:
                    current_streak += 1
                    cursor_day -= timedelta(days=1)

        book_coverage_pct = round((len(queried_book_ids) / total_library_books) * 100, 1)

        book_cache = {}
        for b in db["books"].find({}, {"book_id": 1, "subject": 1, "title": 1}):
            book_cache[b.get("book_id")] = b

        if not submissions:
            return {
                "user_id": str(user_id),
                "total_tests_taken": 0,
                "average_score_percentage": 0.0,
                "pass_rate_percentage": 0.0,
                "total_questions_attempted": 0,
                "total_questions_correct": 0,
                "book_coverage_percentage": book_coverage_pct,
                "learning_streak_days": current_streak,
                "recent_assessments": [],
                "topic_breakdown": [],
                "subjects_breakdown": [],
                "adaptive_recommendations": [
                    {
                        "topic": "Getting Started",
                        "status": "initial",
                        "message": "Take your first live assessment from any textbook chat to unlock your personalized diagnostics matrix.",
                        "suggested_query": "Explain the fundamental principles of this textbook."
                    }
                ],
                "top_explored_tags": list(set(chat_keywords[:8])),
                "last_active": user_chats[0].get("created_at") if user_chats else None
            }

        total_tests = len(submissions)
        total_questions = sum(s.get("total_questions", 0) for s in submissions)
        total_correct = sum(s.get("score", 0) for s in submissions)
        avg_score = round((total_correct / total_questions * 100), 1) if total_questions > 0 else 0.0
        passed_tests = sum(1 for s in submissions if s.get("percentage", 0) >= 70.0)
        pass_rate = round((passed_tests / total_tests * 100), 1)

        # -------------------------------------------------------------
        # HIERARCHICAL SUBJECT & TOPIC AGGREGATION
        # Group metrics strictly by Subject -> Sub-Topics
        # -------------------------------------------------------------
        subjects_data = {}

        for s in submissions:
            b_info = book_cache.get(s.get("book_id"), {})
            subject_name = b_info.get("subject") or b_info.get("title") or "General"
            
            if subject_name not in subjects_data:
                subjects_data[subject_name] = {
                    "total_tests": 0,
                    "passed_tests": 0,
                    "total_questions": 0,
                    "total_correct": 0,
                    "topics": {}
                }

            subjects_data[subject_name]["total_tests"] += 1
            if s.get("percentage", 0) >= 70.0:
                subjects_data[subject_name]["passed_tests"] += 1

            for item in s.get("results", []):
                sub_topic = item.get("topic") or s.get("topic") or subject_name
                if sub_topic.strip().lower() == subject_name.strip().lower():
                    sub_topic = "Core Fundamentals"

                topic_dict = subjects_data[subject_name]["topics"]
                if sub_topic not in topic_dict:
                    topic_dict[sub_topic] = {"correct": 0, "total": 0}

                topic_dict[sub_topic]["total"] += 1
                subjects_data[subject_name]["total_questions"] += 1

                if item.get("is_correct"):
                    topic_dict[sub_topic]["correct"] += 1
                    subjects_data[subject_name]["total_correct"] += 1

        subjects_breakdown = []
        all_topics_flat = []
        recommendations = []

        for subj_name, data in subjects_data.items():
            s_acc = round((data["total_correct"] / data["total_questions"] * 100), 1) if data["total_questions"] > 0 else 0.0
            s_pass_rate = round((data["passed_tests"] / data["total_tests"] * 100), 1) if data["total_tests"] > 0 else 0.0

            if s_acc >= 80.0:
                s_tier = "Mastered"
                s_badge = "Exam Ready"
            elif s_acc >= 50.0:
                s_tier = "Developing"
                s_badge = "Review Needed"
            else:
                s_tier = "Critical Gap"
                s_badge = "Urgent Focus"

            topic_list = []
            for t_name, t_stat in data["topics"].items():
                t_acc = round((t_stat["correct"] / t_stat["total"] * 100), 1) if t_stat["total"] > 0 else 0.0
                if t_acc >= 80.0:
                    t_tier = "Mastered"
                    t_badge = "Exam Ready"
                elif t_acc >= 50.0:
                    t_tier = "Developing"
                    t_badge = "Review Needed"
                    recommendations.append({
                        "topic": f"{subj_name}: {t_name}",
                        "status": "developing",
                        "message": f"Solidify your understanding of {t_name} in {subj_name}.",
                        "suggested_query": f"Explain key design trade-offs and edge cases in {t_name}."
                    })
                else:
                    t_tier = "Critical Gap"
                    t_badge = "Urgent Focus"
                    recommendations.append({
                        "topic": f"{subj_name}: {t_name}",
                        "status": "critical",
                        "message": f"Accuracy is {t_acc}% in {t_name}. Re-evaluate fundamentals before proceeding.",
                        "suggested_query": f"Give a step-by-step beginner walkthrough of {t_name}."
                    })

                item_obj = {
                    "topic": t_name,
                    "accuracy_percentage": t_acc,
                    "total_attempts": t_stat["total"],
                    "tier": t_tier,
                    "badge": t_badge
                }
                topic_list.append(item_obj)
                all_topics_flat.append(item_obj)

            topic_list.sort(key=lambda x: x["accuracy_percentage"])

            subjects_breakdown.append({
                "subject": subj_name,
                "total_tests_taken": data["total_tests"],
                "total_questions": data["total_questions"],
                "total_correct": data["total_correct"],
                "accuracy_percentage": s_acc,
                "pass_rate_percentage": s_pass_rate,
                "tier": s_tier,
                "badge": s_badge,
                "topics": topic_list
            })

        subjects_breakdown.sort(key=lambda x: x["accuracy_percentage"])

        if not recommendations:
            recommendations.append({
                "topic": "Comprehensive Revision",
                "status": "mastered",
                "message": "All evaluated topics are above 80%! Advance to complex applied architectural scenarios.",
                "suggested_query": "Test my advanced problem-solving skills on real-world engineering failures."
            })

        recent = []
        for s in submissions[:30]:
            b_info = book_cache.get(s.get("book_id"), {})
            subject_name = b_info.get("subject") or b_info.get("title") or ""
            recent.append({
                "assessment_id": s.get("assessment_id"),
                "book_id": s.get("book_id"),
                "subject": subject_name,
                "topic": s.get("topic", "Topic Quiz"),
                "score": s.get("score"),
                "total_questions": s.get("total_questions"),
                "percentage": s.get("percentage"),
                "feedback": s.get("feedback", ""),
                "results": s.get("results", []),
                "submitted_at": s.get("submitted_at")
            })

        return {
            "user_id": str(user_id),
            "total_tests_taken": total_tests,
            "average_score_percentage": avg_score,
            "pass_rate_percentage": pass_rate,
            "total_questions_attempted": total_questions,
            "total_questions_correct": total_correct,
            "book_coverage_percentage": book_coverage_pct,
            "learning_streak_days": current_streak,
            "recent_assessments": recent,
            "topic_breakdown": all_topics_flat,
            "subjects_breakdown": subjects_breakdown,
            "adaptive_recommendations": recommendations[:3],
            "top_explored_tags": list(set(chat_keywords[:10])),
            "last_active": submissions[0].get("submitted_at")
        }


# ============================================
# Context Manager for Database Operations
# ============================================

@contextmanager
def get_db_session():
    """Context manager for database sessions."""
    try:
        db = get_db()
        yield db
    except Exception as e:
        logger.error(f"Database session error: {str(e)}")
        raise
    finally:
        pass  # MongoDB driver handles connection pooling


# ============================================
# Initialization
# ============================================

def init_db():
    """Initialize database connection on startup."""
    try:
        connect_mongodb()
        logger.info("✅ Database initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize database: {str(e)}")
        raise


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    init_db()
    print("Database connection test successful!")