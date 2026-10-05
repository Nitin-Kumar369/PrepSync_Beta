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
from auth import get_current_admin, get_current_user
from config import settings
from db import BookModel, CategoryModel, RAGConfigModel, get_db
from utils import generate_book_id, get_file_size, format_file_size
from rag.chunking import get_chunking_pipeline
from rag.vector_store import get_vector_store
from rag.llm import reset_rag_pipeline
from error_handlers import ValidationAppError, DatabaseError
from bson import ObjectId
from datetime import datetime
import os
import shutil
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["Admin"])

jobs = {}


def _process_book_job(job_id: str, book_id: str, path: str, admin_id: str):
    """Background task to extract, chunk, embed, and store into ChromaDB."""
    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 15

        book = BookModel.find_by_book_id(book_id)
        if not book:
            raise Exception(f"Book record {book_id} not found in database.")

        pipeline = get_chunking_pipeline()
        chunks = pipeline.process_book(
            pdf_path=path,
            book_id=book_id,
            book_name=book.get("title", ""),
            department=book.get("department", ""),
            year_of_study=book.get("year_of_study", ""),
            subject=book.get("subject", "")
        )
        jobs[job_id]["progress"] = 50

        # Store chunks and compute embeddings in ChromaDB
        vs = get_vector_store()
        vs.add_chunks(chunks)
        jobs[job_id]["progress"] = 90

        BookModel.update_status(book_id, status="indexed", total_chunks=len(chunks))
        jobs[job_id]["progress"] = 100
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["message"] = "Book indexed successfully"
        logger.info(f"Book {book_id} indexed into ChromaDB with {len(chunks)} chunks.")
    except Exception as e:
        logger.error(f"Book processing failed for {book_id}: {str(e)}", exc_info=True)
        BookModel.update_status(book_id, status="failed", error_message=str(e))
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["message"] = str(e)


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
    try:
        if not all([book_name, department, year_of_study, subject]):
            raise ValidationAppError("upload_fields", "book_name, department, year_of_study, and subject are required")

        if not file or not file.filename:
            raise ValidationAppError("file", "PDF file is required")

        if not file.filename.lower().endswith('.pdf'):
            raise ValidationAppError("file_format", "Only PDF files are accepted")

        final_book_id = book_id or generate_book_id(department, subject)

        dir_path = os.path.join(os.getcwd(), "uploads", department, year_of_study, subject)
        os.makedirs(dir_path, exist_ok=True)
        path = os.path.join(dir_path, f"{final_book_id}.pdf")

        try:
            with open(path, "wb") as f:
                contents = await file.read()
                f.write(contents)
        except Exception as e:
            raise DatabaseError("file_save", "Failed to save PDF file", e)

        try:
            CategoryModel.create_department(department)
        except Exception:
            pass
        try:
            CategoryModel.add_year(department, year_of_study)
        except Exception:
            pass
        try:
            CategoryModel.add_subject(department, year_of_study, subject)
        except Exception:
            pass

        try:
            BookModel.create(
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
        except Exception as e:
            raise DatabaseError("book_creation", "Failed to create book entry", e)

        job_id = generate_book_id("job", subject)
        jobs[job_id] = {"status": "queued", "progress": 0, "book_id": final_book_id}
        background_tasks.add_task(_process_book_job, job_id, final_book_id, path, admin.get("user_id"))

        return BookUploadStatusResponse(
            job_id=job_id,
            book_id=final_book_id,
            book_name=book_name,
            status="queued",
            progress=0,
            message="Upload received, indexing queued"
        )
    except (ValidationAppError, DatabaseError):
        raise
    except Exception as e:
        logger.error(f"Upload book error: {str(e)}")
        raise DatabaseError("book_upload", "Failed to upload book", e)


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


@router.get("/departments")
async def list_departments(admin: dict = Depends(get_current_admin)):
    docs = CategoryModel.list_departments()
    return [{"name": d.get("name")} for d in docs]


@router.post("/departments")
async def create_department(name: str, admin: dict = Depends(get_current_admin)):
    if not name or not name.strip():
        raise ValidationAppError("name", "Department name cannot be empty")
    CategoryModel.create_department(name.strip())
    return {"name": name.strip()}


@router.delete("/departments/{name}")
async def delete_department(name: str, admin: dict = Depends(get_current_admin)):
    CategoryModel.delete_department(name)
    return {"message": f"Department '{name}' deleted"}


@router.get("/departments/{dept}/years")
async def list_years(dept: str, admin: dict = Depends(get_current_admin)):
    years = CategoryModel.list_years(dept)
    return {"years": [y.get("year") for y in years]}


@router.post("/departments/{dept}/years")
async def add_year(dept: str, year: str, admin: dict = Depends(get_current_admin)):
    CategoryModel.add_year(dept, year)
    return {"message": f"Year '{year}' added to '{dept}'"}


@router.delete("/departments/{dept}/years/{year}")
async def delete_year(dept: str, year: str, admin: dict = Depends(get_current_admin)):
    CategoryModel.delete_year(dept, year)
    return {"message": f"Year '{year}' deleted from '{dept}'"}


@router.get("/departments/{dept}/years/{year}/subjects")
async def list_subjects(dept: str, year: str, admin: dict = Depends(get_current_admin)):
    subjects = CategoryModel.list_subjects(dept, year)
    return {"subjects": subjects}


@router.post("/departments/{dept}/years/{year}/subjects")
async def add_subject(dept: str, year: str, subject: str, admin: dict = Depends(get_current_admin)):
    CategoryModel.add_subject(dept, year, subject)
    return {"message": f"Subject '{subject}' added"}


@router.delete("/departments/{dept}/years/{year}/subjects/{subject}")
async def delete_subject(dept: str, year: str, subject: str, admin: dict = Depends(get_current_admin)):
    CategoryModel.delete_subject(dept, year, subject)
    return {"message": f"Subject '{subject}' deleted"}


class GeminiKeyRequest(BaseModel):
    gemini_api_key: str


@router.get("/settings")
async def get_settings(admin: dict = Depends(get_current_admin)):
    return {"gemini_api_key": settings.gemini_api_key}


@router.post("/settings")
async def update_settings(req: GeminiKeyRequest, admin: dict = Depends(get_current_admin)):
    settings.gemini_api_key = req.gemini_api_key
    reset_rag_pipeline()
    return {"message": "Settings updated"}


@router.post('/dev/make-admin')
async def make_current_user_admin(current_user: dict = Depends(get_current_user)):
    if settings.environment != 'development':
        raise HTTPException(status_code=403, detail="Not allowed in this environment")
    db = get_db()
    uid = current_user.get('user_id')
    db['users'].update_one({'_id': ObjectId(uid)}, {'$set': {'role': 'admin'}})
    return {"message": "User promoted to admin"}


@router.delete("/book/{book_id}")
async def delete_book(book_id: str, admin: dict = Depends(get_current_admin)):
    book = BookModel.find_by_book_id(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.get("file_path") and os.path.exists(book.get("file_path")):
        try:
            os.remove(book.get("file_path"))
        except OSError:
            pass

    vs = get_vector_store()
    vs.delete_by_book_id(book_id)
    BookModel.delete_book(book_id)
    return {"detail": "Book and ChromaDB vectors deleted"}


@router.post("/book/{book_id}/copy")
async def copy_book(
    book_id: str,
    background_tasks: BackgroundTasks,
    target_department: str = Form(...),
    target_year: str = Form(...),
    target_subject: str = Form(...),
    admin: dict = Depends(get_current_admin)
):
    book = BookModel.find_by_book_id(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Original book not found")

    new_book_id = generate_book_id(target_department, target_subject)
    orig_path = book.get("file_path")

    dir_path = os.path.join(os.getcwd(), "uploads", target_department, target_year, target_subject)
    os.makedirs(dir_path, exist_ok=True)
    new_path = os.path.join(dir_path, f"{new_book_id}.pdf")

    if orig_path and os.path.exists(orig_path):
        shutil.copy2(orig_path, new_path)
    else:
        raise HTTPException(status_code=404, detail="Original PDF file missing")

    BookModel.create(
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
    return {"message": "Book copy initiated", "job_id": job_id, "new_book_id": new_book_id}


@router.put("/book/{book_id}")
async def edit_book(
    book_id: str,
    title: str = Form(...),
    author: str = Form(""),
    admin: dict = Depends(get_current_admin)
):
    db = get_db()
    result = db[BookModel.collection_name].update_one(
        {"book_id": book_id},
        {"$set": {"title": title, "author": author}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Book not found")
    return {"message": "Book updated successfully"}


@router.get("/books")
async def list_all_books(admin: dict = Depends(get_current_admin)):
    books = BookModel.find_all()
    indexed = [
        {
            "book_id": b.get("book_id"),
            "title": b.get("title") or b.get("book_id"),
            "department": b.get("department"),
            "subject": b.get("subject"),
            "status": b.get("status")
        }
        for b in books if b.get("status") == "indexed"
    ]
    return {"books": indexed}


@router.get("/parameters", response_model=RAGConfig)
async def get_parameters(admin: dict = Depends(get_current_admin)):
    config = RAGConfigModel.get_current()
    if not config:
        raise HTTPException(status_code=404, detail="No RAG configuration found")
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
    RAGConfigModel.create(
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
    db = get_db()
    total_chunks = get_vector_store().get_collection_stats().get("total_chunks", 0)
    total_books = db["books"].count_documents({})
    total_users = db["users"].count_documents({})
    active_chats = db["chats"].count_documents({"updated_at": {"$gt": datetime.utcnow()}})

    return AdminStats(
        total_chunks=total_chunks,
        total_books=total_books,
        total_users=total_users,
        storage_gib=round(total_chunks * 0.0001, 3),
        avg_query_latency_ms=18.0,
        queries_per_day=0,
        active_chats_last_24h=active_chats,
        token_usage={},
        estimated_monthly_cost=0.0,
        system_health="healthy",
        last_updated=datetime.utcnow()
    )


def _rebuild_all_task(job_id: str):
    try:
        jobs[job_id]["status"] = "processing"
        vs = get_vector_store()
        vs.delete_all()
        books = BookModel.find_all()
        total_books = len(books)

        for i, book in enumerate(books):
            path = book.get("file_path")
            if path and os.path.exists(path):
                pipeline = get_chunking_pipeline()
                chunks = pipeline.process_book(
                    pdf_path=path,
                    book_id=book.get("book_id"),
                    book_name=book.get("title", ""),
                    department=book.get("department", ""),
                    year_of_study=book.get("year_of_study", ""),
                    subject=book.get("subject", "")
                )
                vs.add_chunks(chunks)
                BookModel.update_status(book.get("book_id"), status="indexed", total_chunks=len(chunks))
            jobs[job_id]["progress"] = int(((i + 1) / max(total_books, 1)) * 100)

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["message"] = "All books rebuilt successfully in ChromaDB"
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["message"] = str(e)


def _rebuild_book_task(job_id: str, book_id: str):
    try:
        jobs[job_id]["status"] = "processing"
        book = BookModel.find_by_book_id(book_id)
        if not book:
            raise Exception("Book not found")

        path = book.get("file_path")
        if not path or not os.path.exists(path):
            raise Exception("PDF file not found on disk")

        vs = get_vector_store()
        vs.delete_by_book_id(book_id)

        pipeline = get_chunking_pipeline()
        chunks = pipeline.process_book(
            pdf_path=path,
            book_id=book_id,
            book_name=book.get("title", ""),
            department=book.get("department", ""),
            year_of_study=book.get("year_of_study", ""),
            subject=book.get("subject", "")
        )
        vs.add_chunks(chunks)
        BookModel.update_status(book_id, status="indexed", total_chunks=len(chunks))

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["message"] = f"Book {book.get('title')} rebuilt successfully"
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["message"] = str(e)


@router.post("/vectors/rebuild")
async def rebuild_all_vectors(background_tasks: BackgroundTasks, admin: dict = Depends(get_current_admin)):
    job_id = generate_book_id("rebuild", "all")
    jobs[job_id] = {"status": "queued", "progress": 0, "message": "Starting rebuild..."}
    background_tasks.add_task(_rebuild_all_task, job_id)
    return {"job_id": job_id, "status": "queued", "message": "ChromaDB rebuild job queued"}


@router.post("/vectors/rebuild/{book_id}")
async def rebuild_book_vectors(book_id: str, background_tasks: BackgroundTasks, admin: dict = Depends(get_current_admin)):
    book = BookModel.find_by_book_id(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    job_id = generate_book_id("rebuild", book_id)
    jobs[job_id] = {"status": "queued", "progress": 0, "message": f"Rebuilding {book.get('title')}..."}
    background_tasks.add_task(_rebuild_book_task, job_id, book_id)
    return {"job_id": job_id, "status": "queued", "message": f"ChromaDB rebuild started for {book.get('title')}"}


@router.post("/vectors/clear")
async def clear_all_vectors(admin: dict = Depends(get_current_admin)):
    vs = get_vector_store()
    vs.delete_all()
    db = get_db()
    db[BookModel.collection_name].update_many({}, {"$set": {"status": "pending_indexing", "total_chunks": 0}})
    return {"status": "success", "message": "ChromaDB collections cleared"}


@router.post("/vectors/clear/{book_id}")
async def clear_book_vectors(book_id: str, admin: dict = Depends(get_current_admin)):
    vs = get_vector_store()
    vs.delete_by_book_id(book_id)
    BookModel.update_status(book_id, status="pending_indexing", total_chunks=0)
    return {"status": "success", "message": f"ChromaDB vectors cleared for book {book_id}"}


@router.post("/vectors/test-rag")
async def test_rag_retrieval(body: dict, admin: dict = Depends(get_current_admin)):
    query = body.get("query", "").strip()
    book_id = body.get("book_id") or None
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    vs = get_vector_store()
    results = vs.search(query, top_k=5, book_id=book_id)
    return {
        "query": query,
        "book_id": book_id,
        "results_count": len(results),
        "results": [
            {
                "book_id": r.get("metadata", {}).get("book_id"),
                "book_name": r.get("metadata", {}).get("book_name"),
                "subject": r.get("metadata", {}).get("subject"),
                "text": r.get("text", "")[:500],
                "metadata": r.get("metadata", {}),
                "similarity_score": r.get("similarity_score", 0)
            }
            for r in results
        ]
    }