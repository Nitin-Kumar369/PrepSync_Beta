"""
Routes for Assessment Generation, Grading, and Real-time Student Analytics.
"""

import logging
from fastapi import APIRouter, HTTPException, Depends, status
from auth import get_current_user
from models import (
    AssessmentGenerateRequest, AssessmentResponse,
    AssessmentSubmitRequest, AssessmentResultResponse,
    StudentAnalyticsResponse
)
from db import AssessmentModel, StudentAnalyticsModel
from rag.assessment_engine import get_assessment_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assessment", tags=["Assessment & Analytics"])

@router.post("/generate", response_model=AssessmentResponse)
async def generate_assessment(req: AssessmentGenerateRequest, user: dict = Depends(get_current_user)):
    """Generate a live, contextual assessment for the current book/topic."""
    try:
        engine = get_assessment_engine()
        quiz_data = engine.generate_quiz(
            book_id=req.book_id,
            topic=req.topic or "",
            num_questions=req.num_questions,
            difficulty=req.difficulty
        )

        # Store complete quiz with answer key in DB
        AssessmentModel.create_assessment(
            assessment_id=quiz_data["assessment_id"],
            user_id=user["user_id"],
            book_id=req.book_id,
            topic=quiz_data["topic"],
            questions=quiz_data["questions"]
        )

        # Sanitize answers before returning to client
        client_questions = [
            {"id": q["id"], "question": q["question"], "options": q["options"]}
            for q in quiz_data["questions"]
        ]

        return {
            "assessment_id": quiz_data["assessment_id"],
            "book_id": req.book_id,
            "topic": quiz_data["topic"],
            "questions": client_questions,
            "created_at": __import__("datetime").datetime.utcnow()
        }
    except Exception as e:
        logger.error(f"Failed to generate assessment: {str(e)}")
        raise HTTPException(status_code=500, detail="Unable to generate assessment.")

@router.post("/submit", response_model=AssessmentResultResponse)
async def submit_assessment(req: AssessmentSubmitRequest, user: dict = Depends(get_current_user)):
    """Grade submission and record analytics."""
    assessment = AssessmentModel.get_assessment(req.assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment session not found.")

    engine = get_assessment_engine()
    eval_result = engine.evaluate_submission(
        stored_questions=assessment["questions"],
        student_answers=[ans.dict() for ans in req.answers]
    )

    # Persist student test score and analytics
    AssessmentModel.record_submission(
        assessment_id=req.assessment_id,
        user_id=user["user_id"],
        book_id=req.book_id,
        topic=assessment.get("topic", "General"),
        score=eval_result["score"],
        total_questions=eval_result["total_questions"],
        results=eval_result["results"],
        feedback=eval_result["feedback"]
    )

    return {
        "assessment_id": req.assessment_id,
        "book_id": req.book_id,
        "score": eval_result["score"],
        "total_questions": eval_result["total_questions"],
        "percentage": eval_result["percentage"],
        "feedback": eval_result["feedback"],
        "results": eval_result["results"],
        "submitted_at": __import__("datetime").datetime.utcnow()
    }

@router.get("/analytics/student", response_model=StudentAnalyticsResponse)
async def get_student_analytics(user: dict = Depends(get_current_user)):
    """Fetch real-time analytics, accuracy trends, and topic mastery breakdown."""
    try:
        metrics = StudentAnalyticsModel.get_student_metrics(user["user_id"])
        return metrics
    except Exception as e:
        logger.error(f"Failed to retrieve student analytics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load analytics.")