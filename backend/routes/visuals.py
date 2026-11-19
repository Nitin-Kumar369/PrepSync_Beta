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
    """Generates an interactive diagram or chart scoped to the active chat and textbook."""
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

        # Persist inside chat messages so it survives page refreshes
        if req.chat_id:
            chat_message = {
                "role": "visual",
                "visual_id": result["visual_id"],
                "mode": result["mode"],
                "visual": result["visual"],
                "timestamp": datetime.utcnow()
            }
            try:
                ChatModel.add_message(req.chat_id, chat_message)
            except Exception as ce:
                logger.warning(f"Could not link visual to chat {req.chat_id}: {ce}")

        return {
            "visual_id": result["visual_id"],
            "book_id": req.book_id,
            "chat_id": req.chat_id,
            "mode": result["mode"],
            "visual": result["visual"],
            "created_at": datetime.utcnow()
        }
    except Exception as e:
        logger.error(f"Failed to generate visual: {e}")
        raise HTTPException(status_code=500, detail="Unable to generate visual.")