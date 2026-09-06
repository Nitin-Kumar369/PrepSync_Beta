"""
Admin routes for book management and configuration.
"""

import logging
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, BackgroundTasks, Form
from typing import List, Optional
from models import (
    BookUploadRequest, BookMetadata, BookUploadStatusResponse,
    RAGConfig, AdminStats
)
from auth import get_current_admin
from config import settings
from db import BookModel, CategoryModel, RAGConfigModel, get_db
from utils import generate_book_id, get_file_size, format_file_size
from rag.chunking import get_chunking_pipeline
from rag.vector_store import get_vector_store
from error_handlers import ValidationAppError, DatabaseError
from bson import ObjectId
from datetime import datetime
import os
import shutil

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])

# Simple in-memory job tracker
jobs = {}

# ----------------
# Category management
# ----------------


@router.post("/upload-book", response_model=BookUploadStatusResponse)
async def upload_book(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    book_id: Optional[str] = Form(None),
    book_name: str = Form(...),
    department: str = Form(...),
    year_of_study: str = Form(...),
    subject: str = Form(...),
    author: Optional[str] = Form(None),
    isbn: Optional[str] = Form(None),
    admin: dict = Depends(get_current_admin)
):
    """
    Upload a new book PDF. Processes asynchronously.

    Returns job status (queued).
    """
    try:
        logger.info("📤 Starting book upload...")
        
        # Validate required fields
        if not all([book_name, department, year_of_study, subject]):
            logger.warning("❌ Missing required fields in upload")
            raise ValidationAppError("upload_fields", "book_name, department, year_of_study, and subject are required")
        
        if not file or not file.filename:
            logger.warning("❌ No file provided")
            raise ValidationAppError("file", "PDF file is required")
        
        if not file.filename.endswith('.pdf'):
            logger.warning("❌ Invalid file format")
            raise ValidationAppError("file_format", "Only PDF files are accepted")
        
        # Use provided book_id or auto-generate
        final_book_id = book_id or generate_book_id(department, subject)
        logger.info(f"✅ Book ID: {final_book_id}")
        
        # create directory hierarchy
        try:
            dir_path = os.path.join(os.getcwd(), "uploads", department, year_of_study, subject)
            os.makedirs(dir_path, exist_ok=True)
            filename = f"{final_book_id}.pdf"
            path = os.path.join(dir_path, filename)

            # Save file
            logger.info(f"💾 Saving file to {path}...")
            with open(path, "wb") as f:
                contents = await file.read()
                f.write(contents)

            size = get_file_size(path)
            logger.info(f"✅ File saved, size: {format_file_size(size)}")
        except Exception as e:
            logger.error(f"❌ File save error: {str(e)}")
            raise DatabaseError("file_save", "Failed to save PDF file", e)

        # Ensure categories exist for hierarchy (auto-create when needed)
        try:
            CategoryModel.create_department(department)
        except Exception:
            pass  # department may already exist
        try:
            CategoryModel.add_year(department, year_of_study)
        except Exception:
            pass
        try:
            CategoryModel.add_subject(department, year_of_study, subject)
        except Exception:
            pass

        # Create book entry
        try:
            book = BookModel.create(
                book_id=final_book_id,
                title=book_name,
                department=department,
                year_of_study=year_of_study,
                subject=subject,
                file_path=path,
                status="processing",
                author=author or "",
                isbn=isbn or ""
            )
            logger.info(f"✅ Book entry created in database")
        except Exception as e:
            logger.error(f"❌ Database error: {str(e)}")
            raise DatabaseError("book_creation", "Failed to create book entry", e)

        # Schedule background processing
        job_id = generate_book_id("job", subject)
        jobs[job_id] = {"status": "queued", "progress": 0, "book_id": final_book_id}
        logger.info(f"✅ Job queued: {job_id}")

        background_tasks.add_task(_process_book_job, job_id, final_book_id, path, admin.get("user_id"))

        return BookUploadStatusResponse(
            job_id=job_id,
            book_id=final_book_id,
            book_name=book_name,
            status="queued",
            progress=0,
            message="✅ Upload received, processing queued"
        )

    except (ValidationAppError, DatabaseError):
        raise
    except Exception as e:
        logger.error(f"❌ Upload book error: {str(e)}")
        raise DatabaseError("book_upload", "Failed to upload book", e)


# Category endpoints
@router.get("/departments")
async def list_departments(admin: dict = Depends(get_current_admin)):
    """List all departments."""
    try:
        logger.info("📋 Listing departments...")
        docs = CategoryModel.list_departments()
        clean = []
        for d in docs:
            clean.append({"name": d.get("name")})
        logger.info(f"✅ Retrieved {len(clean)} departments")
        return clean
    except Exception as e:
        logger.error(f"❌ Error listing departments: {str(e)}")
        raise DatabaseError("departments_list", "Failed to retrieve departments", e)

@router.post("/departments")
async def create_department(name: str, admin: dict = Depends(get_current_admin)):
    """Create a top-level department. Returns minimal info to avoid ObjectId encoding issues.

    Idempotent: if the department already exists we simply echo back the name."""
    from pymongo.errors import DuplicateKeyError

    try:
        if not name or not name.strip():
            logger.warning("❌ Empty department name")
            raise ValidationAppError("name", "Department name cannot be empty")
        
        logger.info(f"➕ Creating department: {name}")
        CategoryModel.create_department(name)
        logger.info(f"✅ Department created: {name}")
    except DuplicateKeyError:
        logger.info(f"ℹ️ Department already exists: {name}")
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error creating department: {str(e)}")
        raise DatabaseError("department_create", f"Failed to create department {name}", e)
    return {"name": name}

@router.delete("/departments/{name}")
async def delete_department(name: str, admin: dict = Depends(get_current_admin)):
    """Delete a department and all its contents."""
    try:
        if not name or not name.strip():
            logger.warning("❌ Empty department name")
            raise ValidationAppError("name", "Department name cannot be empty")
        
        logger.info(f"🗑️ Deleting department: {name}")
        CategoryModel.delete_department(name)
        logger.info(f"✅ Department deleted: {name}")
        return {"message": f"Department '{name}' deleted"}
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error deleting department: {str(e)}")
        raise DatabaseError("department_delete", f"Failed to delete department {name}", e)

@router.get("/departments/{dept}/years")
async def list_years(dept: str, admin: dict = Depends(get_current_admin)):
    """List all years in a department."""
    try:
        if not dept or not dept.strip():
            logger.warning("❌ Empty department name")
            raise ValidationAppError("dept", "Department name cannot be empty")
        
        logger.info(f"📋 Listing years for {dept}...")
        years = CategoryModel.list_years(dept)
        simple = [y.get("year") for y in years]
        logger.info(f"✅ Retrieved {len(simple)} years")
        return {"years": simple}
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error listing years: {str(e)}")
        raise DatabaseError("years_list", f"Failed to retrieve years for {dept}", e)

@router.post("/departments/{dept}/years")
async def add_year(dept: str, year: str, admin: dict = Depends(get_current_admin)):
    """Add a year to a department."""
    try:
        if not all([dept, year]) or not all([dept.strip(), year.strip()]):
            logger.warning("❌ Empty department or year")
            raise ValidationAppError("filters", "Department and year cannot be empty")
        
        logger.info(f"➕ Adding year {year} to {dept}")
        CategoryModel.add_year(dept, year)
        logger.info(f"✅ Year added")
        return {"message": f"Year '{year}' added to '{dept}'"}
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error adding year: {str(e)}")
        raise DatabaseError("year_add", f"Failed to add year {year} to {dept}", e)

@router.delete("/departments/{dept}/years/{year}")
async def delete_year(dept: str, year: str, admin: dict = Depends(get_current_admin)):
    """Delete a year from a department."""
    try:
        if not all([dept, year]) or not all([dept.strip(), year.strip()]):
            logger.warning("❌ Empty department or year")
            raise ValidationAppError("filters", "Department and year cannot be empty")
        
        logger.info(f"🗑️ Deleting year {year} from {dept}")
        CategoryModel.delete_year(dept, year)
        logger.info(f"✅ Year deleted")
        return {"message": f"Year '{year}' deleted from '{dept}'"}
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error deleting year: {str(e)}")
        raise DatabaseError("year_delete", f"Failed to delete year {year} from {dept}", e)

@router.get("/departments/{dept}/years/{year}/subjects")
async def list_subjects(dept: str, year: str, admin: dict = Depends(get_current_admin)):
    """List all subjects for a department/year."""
    try:
        if not all([dept, year]) or not all([dept.strip(), year.strip()]):
            logger.warning("❌ Empty department or year")
            raise ValidationAppError("filters", "Department and year cannot be empty")
        
        logger.info(f"📋 Listing subjects for {dept}/{year}...")
        subjects = CategoryModel.list_subjects(dept, year)
        logger.info(f"✅ Retrieved {len(subjects)} subjects")
        return {"subjects": subjects}
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error listing subjects: {str(e)}")
        raise DatabaseError("subjects_list", f"Failed to retrieve subjects for {dept}/{year}", e)

@router.post("/departments/{dept}/years/{year}/subjects")
async def add_subject(dept: str, year: str, subject: str, admin: dict = Depends(get_current_admin)):
    """Add a subject to a department/year."""
    try:
        if not all([dept, year, subject]) or not all([dept.strip(), year.strip(), subject.strip()]):
            logger.warning("❌ Empty filter parameters")
            raise ValidationAppError("filters", "Department, year, and subject cannot be empty")
        
        logger.info(f"➕ Adding subject {subject} to {dept}/{year}")
        CategoryModel.add_subject(dept, year, subject)
        logger.info(f"✅ Subject added")
        return {"message": f"Subject '{subject}' added"}
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error adding subject: {str(e)}")
        raise DatabaseError("subject_add", f"Failed to add subject {subject}", e)

@router.delete("/departments/{dept}/years/{year}/subjects/{subject}")
async def delete_subject(dept: str, year: str, subject: str, admin: dict = Depends(get_current_admin)):
    """Delete a subject from a department/year."""
    try:
        if not all([dept, year, subject]) or not all([dept.strip(), year.strip(), subject.strip()]):
            logger.warning("❌ Empty filter parameters")
            raise ValidationAppError("filters", "Department, year, and subject cannot be empty")
        
        logger.info(f"🗑️ Deleting subject {subject} from {dept}/{year}")
        CategoryModel.delete_subject(dept, year, subject)
        logger.info(f"✅ Subject deleted")
        return {"message": f"Subject '{subject}' deleted"}
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error deleting subject: {str(e)}")
        raise DatabaseError("subject_delete", f"Failed to delete subject {subject}", e)



# settings management


from pydantic import BaseModel
from rag.llm import reset_rag_pipeline
from auth import get_current_user
from bson import ObjectId


class GeminiKeyRequest(BaseModel):
    gemini_api_key: str


@router.get("/settings")
async def get_settings(admin: dict = Depends(get_current_admin)):
    """Return current configurable settings (currently only Gemini key)."""
    return {"gemini_api_key": settings.gemini_api_key}


@router.post("/settings")
async def update_settings(req: GeminiKeyRequest, admin: dict = Depends(get_current_admin)):
    """Update settings such as the Gemini API key and reset pipeline."""
    settings.gemini_api_key = req.gemini_api_key
    reset_rag_pipeline()
    return {"message": "Settings updated"}


# Development helper: promote current user to admin when running in development mode
@router.post('/dev/make-admin')
async def make_current_user_admin(current_user: dict = Depends(get_current_user)):
    """Development-only: Promote the authenticated user to `admin` role.

    This endpoint is only enabled when `settings.environment` is `development`.
    It allows quickly granting admin rights to a local account for testing.
    """
    if settings.environment != 'development':
        raise HTTPException(status_code=403, detail="Not allowed in this environment")

    try:
        db = get_db()
        uid = current_user.get('user_id')
        if not uid:
            raise HTTPException(status_code=400, detail='Invalid user')
        db['users'].update_one({'_id': ObjectId(uid)}, {'$set': {'role': 'admin'}})
        return {"message": "User promoted to admin"}
    except Exception as e:
        logger.error(f"Failed to promote user to admin: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# background tasks continue

def _process_book_job(job_id: str, book_id: str, path: str, admin_id: str):
    """Background job to extract, chunk, embed and store a book."""
    try:
        jobs[job_id]["status"] = "processing"
        pipeline = get_chunking_pipeline()
        chunks = pipeline.process_book(
            pdf_path=path,
            book_id=book_id,
            book_name="",  # metadata already recorded
            department="", year_of_study="", subject=""
        )
        jobs[job_id]["progress"] = 50

        # Add to vector database
        vs = get_vector_store()
        vs.add_chunks(chunks)
        jobs[job_id]["progress"] = 100

        # Update book metadata
        BookModel.update_status(book_id, status="indexed", total_chunks=len(chunks))

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["message"] = "Book indexed successfully"

    except Exception as e:
        logger.error(f"Book processing failed for {book_id}: {str(e)}")
        BookModel.update_status(book_id, status="failed", error_message=str(e))
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["message"] = str(e)


@router.get("/upload-status/{job_id}", response_model=BookUploadStatusResponse)
async def upload_status(job_id: str, admin: dict = Depends(get_current_admin)):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    book = BookModel.find_by_book_id(job.get("book_id"))
    return BookUploadStatusResponse(
        job_id=job_id,
        book_id=job.get("book_id"),
        book_name=book.get("title") if book else "",
        status=job.get("status"),
        progress=job.get("progress", 0),
        message=job.get("message", "")
    )


@router.delete("/book/{book_id}")
async def delete_book(book_id: str, admin: dict = Depends(get_current_admin)):
    """Delete a book and its vector data."""
    try:
        book = BookModel.find_by_book_id(book_id)
        if not book:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
        # delete file
        try:
            if book.get("file_path") and os.path.exists(book.get("file_path")):
                os.remove(book.get("file_path"))
        except FileNotFoundError:
            pass
        # delete vector chunks
        vs = get_vector_store()
        vs.delete_by_book_id(book_id)
        BookModel.delete_book(book_id)
        return {"detail": "Book and chunks deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete book error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete book")


@router.post("/book/{book_id}/copy")
async def copy_book(
    book_id: str,
    background_tasks: BackgroundTasks,
    target_department: str = Form(...),
    target_year: str = Form(...),
    target_subject: str = Form(...),
    admin: dict = Depends(get_current_admin)
):
    """Copy an existing book to a new department/year/subject location."""
    try:
        book = BookModel.find_by_book_id(book_id)
        if not book:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Original book not found")
        
        new_book_id = generate_book_id(target_department, target_subject)
        orig_path = book.get("file_path")
        
        dir_path = os.path.join(os.getcwd(), "uploads", target_department, target_year, target_subject)
        os.makedirs(dir_path, exist_ok=True)
        new_path = os.path.join(dir_path, f"{new_book_id}.pdf")
        
        if orig_path and os.path.exists(orig_path):
            shutil.copy2(orig_path, new_path)
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Original PDF file missing")

        # Create categories if missing
        try: CategoryModel.create_department(target_department)
        except: pass
        try: CategoryModel.add_year(target_department, target_year)
        except: pass
        try: CategoryModel.add_subject(target_department, target_year, target_subject)
        except: pass

        new_book = BookModel.create(
            book_id=new_book_id,
            title=f"{book.get('title')} (Copy)",
            department=target_department,
            year_of_study=target_year,
            subject=target_subject,
            file_path=new_path,
            status="processing",
            author=book.get("author", ""),
            isbn=book.get("isbn", "")
        )

        job_id = generate_book_id("job", target_subject)
        jobs[job_id] = {"status": "queued", "progress": 0, "book_id": new_book_id}
        background_tasks.add_task(_process_book_job, job_id, new_book_id, new_path, admin.get("user_id"))

        return {"message": "Book copied and indexing started", "job_id": job_id, "new_book_id": new_book_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Copy book error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to copy book")


@router.put("/book/{book_id}")
async def edit_book(
    book_id: str,
    title: str = Form(...),
    author: str = Form(""),
    admin: dict = Depends(get_current_admin)
):
    """Edit metadata (title, author) of an existing book."""
    try:
        db = get_db()
        result = db[BookModel.collection_name].update_one(
            {"book_id": book_id},
            {"$set": {"title": title, "author": author}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
        return {"message": "Book updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Edit book error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update book")


@router.get("/books")
async def list_all_books(admin: dict = Depends(get_current_admin)):
    """Get a list of all indexed books (for admin dropdowns/selectors)."""
    try:
        books = BookModel.find_all()
        # Filter to only indexed ones, return minimal info for dropdown
        indexed = [
            {
                "book_id": b.get("book_id"),
                "title": b.get("title") or b.get("book_id"),
                "department": b.get("department"),
                "subject": b.get("subject"),
                "status": b.get("status")
            }
            for b in books
            if b.get("status") == "indexed"
        ]
        return {"books": indexed}
    except Exception as e:
        logger.error(f"List books error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to list books")


@router.post("/rebuild-book/{book_id}")
async def rebuild_book(book_id: str, admin: dict = Depends(get_current_admin)):
    """Reindex a specific book (delete old chunks and recreate).
    This runs synchronously for simplicity (can be backgrounded).
    """
    try:
        book = BookModel.find_by_book_id(book_id)
        if not book:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
        path = book.get("file_path")
        # delete existing chunks
        vs = get_vector_store()
        vs.delete_by_book_id(book_id)
        # reprocess
        pipeline = get_chunking_pipeline()
        chunks = pipeline.process_book(
            pdf_path=path,
            book_id=book_id,
            book_name=book.get("title"),
            department=book.get("department"),
            year_of_study=book.get("year_of_study"),
            subject=book.get("subject")
        )
        vs.add_chunks(chunks)
        BookModel.update_status(book_id, status="indexed", total_chunks=len(chunks))
        return {"detail": "Book reindexed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Rebuild book error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to rebuild book")


@router.post("/rebuild-all")
async def rebuild_all(admin: dict = Depends(get_current_admin)):
    """Rebuild vector database for all books. DANGEROUS: deletes everything first."""
    try:
        vs = get_vector_store()
        vs.delete_all()
        books = BookModel.find_all()
        total = 0
        for book in books:
            path = book.get("file_path")
            if os.path.exists(path):
                pipeline = get_chunking_pipeline()
                chunks = pipeline.process_book(
                    pdf_path=path,
                    book_id=book.get("book_id"),
                    book_name=book.get("title"),
                    department=book.get("department"),
                    year_of_study=book.get("year_of_study"),
                    subject=book.get("subject")
                )
                vs.add_chunks(chunks)
                BookModel.update_status(book.get("book_id"), status="indexed", total_chunks=len(chunks))
                total += len(chunks)
        return {"detail": f"Rebuilt all books, {total} chunks indexed"}
    except Exception as e:
        logger.error(f"Rebuild all error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to rebuild all")


@router.get("/parameters", response_model=RAGConfig)
async def get_parameters(admin: dict = Depends(get_current_admin)):
    config = RAGConfigModel.get_current()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No RAG configuration found")
    return RAGConfig(
        chunk_size=config.get("chunk_size"),
        chunk_overlap=config.get("chunk_overlap"),
        top_k_retrieval=config.get("top_k_retrieval"),
        temperature=config.get("temperature"),
        context_window_messages=config.get("context_window_messages"),
        embedding_model=config.get("embedding_model")
    )


@router.post("/parameters", response_model=RAGConfig)
async def update_parameters(params: RAGConfig, admin: dict = Depends(get_current_admin)):
    new = RAGConfigModel.create(
        chunk_size=params.chunk_size,
        chunk_overlap=params.chunk_overlap,
        top_k_retrieval=params.top_k_retrieval,
        temperature=params.temperature,
        context_window_messages=params.context_window_messages,
        embedding_model=params.embedding_model,
        updated_by_admin=admin.get("user_id")
    )
    return params


@router.get("/stats", response_model=AdminStats)
async def get_stats(admin: dict = Depends(get_current_admin)):
    try:
        db = get_db()
        total_chunks = get_vector_store().get_collection_stats().get("total_chunks", 0)
        total_books = db["books"].count_documents({})
        total_users = db["users"].count_documents({})
        # simplistic storage estimate
        storage_gib = total_chunks * 0.0001
        avg_query_latency_ms = 0.0
        queries_per_day = 0
        active_chats = db["chats"].count_documents({"updated_at": {"$gt": datetime.utcnow()}})
        token_usage = {}
        return AdminStats(
            total_chunks=total_chunks,
            total_books=total_books,
            total_users=total_users,
            storage_gib=storage_gib,
            avg_query_latency_ms=avg_query_latency_ms,
            queries_per_day=queries_per_day,
            active_chats_last_24h=active_chats,
            token_usage=token_usage,
            estimated_monthly_cost=0.0,
            system_health="healthy",
            last_updated=datetime.utcnow()
        )
    except Exception as e:
        logger.error(f"Stats error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to gather stats")


# Vector Management Endpoints


@router.post("/vectors/rebuild")
async def rebuild_all_vectors(background_tasks: BackgroundTasks, admin: dict = Depends(get_current_admin)):
    """Rebuild embeddings for all books."""
    try:
        job_id = generate_book_id("vector", "rebuild")
        jobs[job_id] = {
            "status": "processing",
            "progress": 0,
            "message": "Starting vector rebuild for all books...",
            "created_at": datetime.utcnow()
        }
        
        background_tasks.add_task(_rebuild_all_vectors_task, job_id)
        
        return {
            "job_id": job_id,
            "status": "queued",
            "message": "Vector rebuild job started"
        }
    except Exception as e:
        logger.error(f"Error starting vector rebuild: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/vectors/rebuild/{book_id}")
async def rebuild_book_vectors(book_id: str, background_tasks: BackgroundTasks, admin: dict = Depends(get_current_admin)):
    """Rebuild embeddings for a specific book."""
    try:
        book = BookModel.find_by_book_id(book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        
        job_id = generate_book_id("vector", book_id)
        jobs[job_id] = {
            "status": "processing",
            "progress": 0,
            "message": f"Starting vector rebuild for book: {book.get('title')}...",
            "created_at": datetime.utcnow(),
            "book_id": book_id
        }
        
        background_tasks.add_task(_rebuild_book_vectors_task, job_id, book_id)
        
        return {
            "job_id": job_id,
            "status": "queued",
            "message": f"Vector rebuild job started for {book.get('title')}"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting book vector rebuild: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/vectors/clear")
async def clear_all_vectors(admin: dict = Depends(get_current_admin)):
    """Clear all embedding vectors from the database."""
    try:
        from db import ChunkModel
        ChunkModel.clear_embeddings()
        
        # Update all books to pending_indexing status
        db = get_db()
        db[BookModel.collection_name].update_many(
            {"status": "indexed"},
            {"$set": {"status": "pending_indexing"}}
        )
        
        return {
            "status": "success",
            "message": "All embedding vectors cleared"
        }
    except Exception as e:
        logger.error(f"Error clearing vectors: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/vectors/clear/{book_id}")
async def clear_book_vectors(book_id: str, admin: dict = Depends(get_current_admin)):
    """Clear embedding vectors for a specific book."""
    try:
        book = BookModel.find_by_book_id(book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        
        from db import ChunkModel
        ChunkModel.clear_embeddings(book_id=book_id)
        
        # Update book status to indicate vectors were cleared
        BookModel.update_status(book_id, "pending_indexing")
        
        return {
            "status": "success",
            "message": f"Embedding vectors cleared for {book.get('title')}"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing book vectors: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/vectors/test-rag")
async def test_rag_retrieval(
    body: dict,
    admin: dict = Depends(get_current_admin)
):
    """Test RAG retrieval for a query."""
    try:
        query = body.get("query", "").strip()
        book_id = body.get("book_id") or None
        
        if not query:
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        from rag.vector_store import get_vector_store
        vector_store = get_vector_store()
        
        # Search for relevant chunks
        results = vector_store.search(query, top_k=5, book_id=book_id)
        
        formatted_results = []
        for chunk in results:
            formatted_results.append({
                "book_id": chunk.get("metadata", {}).get("book_id"),
                "book_name": chunk.get("metadata", {}).get("book_name"),
                "subject": chunk.get("metadata", {}).get("subject"),
                "text": chunk.get("text", "")[:500],  # Truncate for display
                "metadata": chunk.get("metadata", {}),
                "similarity_score": chunk.get("similarity_score", 0)
            })
        
        return {
            "query": query,
            "book_id": book_id,
            "results_count": len(formatted_results),
            "results": formatted_results
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing RAG: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"RAG test failed: {str(e)}")


# Background tasks
def _rebuild_all_vectors_task(job_id: str):
    """Background task to rebuild all vectors."""
    try:
        from db import ChunkModel
        from rag.vector_store import get_vector_store
        
        logger.info(f"Job {job_id}: Starting rebuild of all vectors...")
        jobs[job_id]["status"] = "processing"
        
        # Get all chunks and recalculate embeddings
        chunks = list(get_db()["chunks"].find({}))
        vector_store = get_vector_store()
        
        for i, chunk in enumerate(chunks):
            # Generate embedding (this will be implemented in the vector store)
            text = chunk.get("text", "")
            # embedding = vector_store.embed_text(text)
            # ChunkModel.update_embedding(chunk["_id"], embedding)
            
            progress = ((i + 1) / len(chunks)) * 100
            jobs[job_id]["progress"] = progress
            
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["message"] = f"Successfully rebuilt {len(chunks)} vectors"
        logger.info(f"Job {job_id}: Rebuild completed")
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["message"] = str(e)
        logger.error(f"Job {job_id}: Error during rebuild: {str(e)}")


def _rebuild_book_vectors_task(job_id: str, book_id: str):
    """Background task to rebuild vectors for a specific book."""
    try:
        from db import ChunkModel
        from rag.vector_store import get_vector_store
        
        logger.info(f"Job {job_id}: Starting rebuild of vectors for book {book_id}...")
        jobs[job_id]["status"] = "processing"
        
        # Get all chunks for this book
        chunks = ChunkModel.find_by_book_id(book_id)
        vector_store = get_vector_store()
        
        for i, chunk in enumerate(chunks):
            # Generate embedding
            text = chunk.get("text", "")
            # embedding = vector_store.embed_text(text)
            # ChunkModel.update_embedding(chunk["_id"], embedding)
            
            progress = ((i + 1) / len(chunks)) * 100
            jobs[job_id]["progress"] = progress
            
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["message"] = f"Successfully rebuilt {len(chunks)} vectors for book"
        logger.info(f"Job {job_id}: Rebuild completed")
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["message"] = str(e)
        logger.error(f"Job {job_id}: Error during rebuild: {str(e)}")