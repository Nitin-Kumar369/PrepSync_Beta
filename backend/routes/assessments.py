"""
Routes for Assessment Generation, Secure Zero-Leak Grading, and Analytics.
"""

import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from auth import get_current_user
from models import (
    AssessmentGenerateRequest, AssessmentResponse,
    AssessmentSubmitRequest, AssessmentResultResponse,
    StudentAnalyticsResponse
)
from db import AssessmentModel, StudentAnalyticsModel
from rag.assessment_engine import get_assessment_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assessment", tags=["Assessment & Analytics"])

@router.post("/generate", response_model=AssessmentResponse)
async def generate_assessment(req: AssessmentGenerateRequest, user: dict = Depends(get_current_user)):
    """Generates a test scoped strictly to active chat conversation and selected mode."""
    try:
        engine = get_assessment_engine()
        quiz_data = engine.generate_quiz(
            book_id=req.book_id,
            user_id=user["user_id"],
            chat_id=req.chat_id,
            mode=req.mode,
            topic=req.topic or "",
            context_text=req.context_text,
            num_questions=req.num_questions,
            difficulty=req.difficulty,
            question_type=req.question_type
        )

        # Store complete quiz with hidden keys in MongoDB
        AssessmentModel.create_assessment(
            assessment_id=quiz_data["assessment_id"],
            user_id=user["user_id"],
            book_id=req.book_id,
            topic=quiz_data["topic"],
            questions=quiz_data["questions"]
        )

        # Sanitize answer keys for client payload (Zero-leak validation)
        client_questions = [
            {
                "id": q["id"],
                "question": q["question"],
                "options": q["options"],
                "question_type": q.get("question_type", "single_choice"),
                "topic": q.get("topic", "General"),
                "difficulty": q.get("difficulty", req.difficulty)
            }
            for q in quiz_data["questions"]
        ]

        return {
            "assessment_id": quiz_data["assessment_id"],
            "book_id": req.book_id,
            "chat_id": req.chat_id,
            "topic": quiz_data["topic"],
            "mode": quiz_data.get("mode", req.mode),
            "difficulty": quiz_data.get("difficulty", req.difficulty),
            "questions": client_questions,
            "created_at": datetime.utcnow()
        }
    except Exception as e:
        logger.error(f"Failed to generate assessment: {str(e)}")
        raise HTTPException(status_code=500, detail="Unable to generate assessment.")

@router.post("/submit", response_model=AssessmentResultResponse)
async def submit_assessment(req: AssessmentSubmitRequest, user: dict = Depends(get_current_user)):
    """Grades test server-side, validates hidden answer keys, and persists scorecard."""
    assessment = AssessmentModel.get_assessment(req.assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment session expired or not found.")

    engine = get_assessment_engine()
    eval_result = engine.evaluate_submission(
        stored_questions=assessment["questions"],
        student_answers=[ans.dict() for ans in req.answers],
        time_taken_seconds=req.time_taken_seconds or 0
    )

    # Persist score and individual question metrics for student's Knowledge Matrix
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
        "time_taken_seconds": eval_result["time_taken_seconds"],
        "badge": eval_result["badge"],
        "feedback": eval_result["feedback"],
        "results": eval_result["results"],
        "submitted_at": datetime.utcnow()
    }

@router.get("/analytics/student", response_model=StudentAnalyticsResponse)
async def get_student_analytics(user: dict = Depends(get_current_user)):
    """Retrieves real-time analytics for the student account dashboard."""
    try:
        metrics = StudentAnalyticsModel.get_student_metrics(user["user_id"])
        return metrics
    except Exception as e:
        logger.error(f"Failed to retrieve student analytics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load analytics.")