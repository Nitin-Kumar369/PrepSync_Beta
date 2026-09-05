"""
Book browsing and discovery routes.
"""

import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from auth import get_current_user_optional_no_scheme
from db import BookModel, CategoryModel
from error_handlers import DatabaseError, ValidationAppError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("/departments")
async def get_departments(current_user: dict = Depends(get_current_user_optional_no_scheme)):
    """Get all available departments (from category hierarchy)."""
    try:
        logger.info("📋 Fetching departments...")
        depts = CategoryModel.list_departments()
        # return names only
        names = [d.get("name") for d in depts]
        logger.info(f"✅ Retrieved {len(names)} departments")
        return {"departments": sorted(names)}
    except Exception as e:
        logger.error(f"❌ Error fetching departments: {str(e)}")
        raise DatabaseError("departments_fetch", "Failed to retrieve departments", e)


@router.get("/departments/{department}/years")
async def get_years_by_department(department: str, current_user: dict = Depends(get_current_user_optional_no_scheme)):
    """Get all years for a given department."""
    try:
        if not department or not department.strip():
            logger.warning("❌ Empty department parameter")
            raise ValidationAppError("department", "Department cannot be empty")
        
        logger.info(f"📋 Fetching years for department: {department}")
        years = CategoryModel.list_years(department)
        year_list = sorted([y.get("year") for y in years])
        logger.info(f"✅ Retrieved {len(year_list)} years")
        return {"department": department, "years": year_list}
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching years: {str(e)}")
        raise DatabaseError("years_fetch", f"Failed to retrieve years for {department}", e)


@router.get("/departments/{department}/years/{year}/subjects")
async def get_subjects_by_department_and_year(
    department: str, year: str, current_user: dict = Depends(get_current_user_optional_no_scheme)
):
    """Get all subjects for a given department and year."""
    try:
        if not department or not department.strip() or not year or not year.strip():
            logger.warning("❌ Empty department or year parameter")
            raise ValidationAppError("filters", "Department and year cannot be empty")
        
        logger.info(f"📋 Fetching subjects for {department}/{year}...")
        subjects = CategoryModel.list_subjects(department, year)
        subject_list = sorted(subjects)
        logger.info(f"✅ Retrieved {len(subject_list)} subjects")
        return {
            "department": department,
            "year": year,
            "subjects": subject_list
        }
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching subjects: {str(e)}")
        raise DatabaseError("subjects_fetch", f"Failed to retrieve subjects for {department}/{year}", e)


@router.get("/departments/{department}/years/{year}/subjects/{subject}")
async def get_books_by_filters(
    department: str, year: str, subject: str, current_user: dict = Depends(get_current_user_optional_no_scheme)
):
    """Get all books for a given department, year, and subject."""
    try:
        if not all([department, year, subject]) or not all([department.strip(), year.strip(), subject.strip()]):
            logger.warning("❌ Empty filter parameters")
            raise ValidationAppError("filters", "Department, year, and subject cannot be empty")
        
        logger.info(f"📋 Fetching books: {department}/{year}/{subject}...")
        books = BookModel.find_by_filters(
            department=department,
            year_of_study=year,
            subject=subject
        )
        
        # Filter to only indexed books
        books = [b for b in books if b.get("status") == "indexed"]
        logger.info(f"✅ Retrieved {len(books)} indexed books")
        
        # Format response
        book_list = []
        for book in books:
            book_list.append({
                "book_id": book.get("book_id"),
                "title": book.get("title"),
                "author": book.get("author"),
                "total_pages": book.get("total_pages"),
                "total_chunks": book.get("total_chunks"),
                "department": book.get("department"),
                "year_of_study": book.get("year_of_study"),
                "subject": book.get("subject"),
                "status": book.get("status"),
                "indexed_date": book.get("indexed_date")
            })
        
        return {
            "department": department,
            "year": year,
            "subject": subject,
            "books": book_list,
            "count": len(book_list)
        }
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching books: {str(e)}")
        raise DatabaseError("books_fetch", f"Failed to retrieve books for {department}/{year}/{subject}", e)


@router.get("/{book_id}")
async def get_book_details(book_id: str, current_user: dict = Depends(get_current_user_optional_no_scheme)):
    """Get detailed information about a specific book."""
    try:
        if not book_id or not book_id.strip():
            logger.warning("❌ Empty book_id parameter")
            raise ValidationAppError("book_id", "Book ID cannot be empty")
        
        logger.info(f"📖 Fetching book details: {book_id}")
        book = BookModel.find_by_book_id(book_id)
        if not book:
            logger.warning(f"❌ Book not found: {book_id}")
            raise ValidationAppError("book_id", f"Book '{book_id}' not found")
        
        logger.info(f"✅ Retrieved book: {book.get('title', 'Unknown')}")
        return {
            "book_id": book.get("book_id"),
            "title": book.get("title"),
            "author": book.get("author"),
            "isbn": book.get("isbn"),
            "total_pages": book.get("total_pages"),
            "total_chunks": book.get("total_chunks"),
            "department": book.get("department"),
            "year_of_study": book.get("year_of_study"),
            "subject": book.get("subject"),
            "status": book.get("status"),
            "indexed_date": book.get("indexed_date"),
            "created_at": book.get("created_at")
        }
    except ValidationAppError:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching book details: {str(e)}")
        raise DatabaseError("book_details_fetch", f"Failed to retrieve book {book_id}", e)
