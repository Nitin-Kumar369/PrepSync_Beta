"""
Routes for In-Chat Interactive Diagram and Chart Generation.
"""

import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from auth import get_current_user
from models import VisualGenerateRequest, VisualResponse
from db import ChatModel
from rag.visual_engine import get_visual_engine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/visual", tags=["Visuals"])


@router.post("/generate", response_model=VisualResponse)
async def generate_visual(req: VisualGenerateRequest, user: dict = Depends(get_current_user)):
    """Generates an interactive diagram/chart or returns a subject-scope refusal."""
    try:
        engine = get_visual_engine()
        result = engine.generate_visual(
            book_id=req.book_id,
            user_id=user["user_id"],
            query=req.query or "",
            chat_id=req.chat_id,
            mode=req.mode,
            visual_preference=req.visual_preference,
            context_text=req.context_text
        )

        visual_spec = result["visual"]
        is_refusal = visual_spec.get("kind") == "refusal"
        refusal_text = visual_spec.get("summary", "") if is_refusal else None

        if req.chat_id:
            if is_refusal:
                chat_message = {
                    "role": "assistant",
                    "content": refusal_text,
                    "timestamp": datetime.utcnow(),
                    "sources": []
                }
            else:
                chat_message = {
                    "role": "visual",
                    "visual_id": result["visual_id"],
                    "mode": result["mode"],
                    "visual": visual_spec,
                    "timestamp": datetime.utcnow()
                }
            try:
                ChatModel.add_message(req.chat_id, chat_message)
            except Exception as ce:
                logger.warning(f"Could not link visual response to chat {req.chat_id}: {ce}")

        return {
            "visual_id": result["visual_id"],
            "book_id": req.book_id,
            "chat_id": req.chat_id,
            "mode": result["mode"],
            "refused": is_refusal,
            "refusal_message": refusal_text,
            "visual": {} if is_refusal else visual_spec,
            "created_at": datetime.utcnow()
        }
    except Exception as e:
        logger.error(f"Failed to generate visual: {e}")
        raise HTTPException(status_code=500, detail="Unable to generate visual.")