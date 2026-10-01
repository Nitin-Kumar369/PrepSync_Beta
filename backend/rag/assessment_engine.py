"""
In-chat Assessment Engine.
Generates topic-grounded quizzes using RAG context and automatically evaluates submissions with explanations.
"""

import json
import logging
import uuid
import requests
from typing import List, Dict, Any
from config import settings
from rag.vector_store import get_vector_store

logger = logging.getLogger(__name__)

class AssessmentEngine:
    def __init__(self):
        self.api_key = settings.gemini_api_key

    def generate_quiz(self, book_id: str, topic: str = "", num_questions: int = 5, difficulty: str = "medium") -> Dict[str, Any]:
        """Generate structured questions based on book context."""
        vs = get_vector_store()
        search_query = topic if topic else "key concepts, definitions, formulas and principles"
        docs, metas, _, _ = vs.query(query_text=search_query, n_results=4, book_id=book_id)

        context_text = "\n---\n".join(docs) if docs else "General foundational engineering principles."

        prompt = f"""You are an expert engineering instructor creating a self-assessment quiz.
Based on the following textbook context, generate exactly {num_questions} multiple-choice questions.

Textbook Context:
{context_text[:3500]}

Topic: {topic or 'Core Concepts'}
Difficulty: {difficulty}

Strict Output Format:
Return a valid, raw JSON array of objects with NO markdown formatting, NO triple backticks (```json). Each object must have:
- "id": string unique identifier (e.g. "q1", "q2")
- "question": string question text
- "options": list of 4 distinct string choices
- "correct_option_index": integer (0, 1, 2, or 3) indicating the zero-indexed correct option
- "explanation": string explaining why the answer is correct with pedagogical reasoning
- "topic": string concise topic name (e.g., "{topic or 'Key Concepts'}")
"""

        # Call Gemini if API key is present; otherwise, supply fallback generated questions
        if self.api_key:
            try:
                url = "[https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent](https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent)"
                headers = {"Content-Type": "application/json", "x-goog-api-key": self.api_key}
                payload = {
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.3, "maxOutputTokens": 4096}
                }
                res = requests.post(url, headers=headers, json=payload, timeout=30)
                res.raise_for_status()
                data = res.json()
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()

                if raw_text.startswith("```"):
                    raw_text = raw_text.split("```")[1]
                    if raw_text.startswith("json"):
                        raw_text = raw_text[4:].strip()

                questions = json.loads(raw_text)
                return {"assessment_id": f"quiz_{uuid.uuid4().hex[:12]}", "questions": questions, "topic": topic or "General Concepts"}
            except Exception as e:
                logger.error(f"Gemini Quiz Generation failed, using rule-based fallback: {str(e)}")

        # Deterministic fallback quiz generator
        fallback_questions = [
            {
                "id": f"q_{i+1}",
                "question": f"Which statement best describes the fundamental principle of {topic or 'the current chapter'}?",
                "options": [
                    "It establishes systematic layering and modular data processing.",
                    "It eliminates physical-layer electrical constraints entirely.",
                    "It operates exclusively on unencrypted analog signals.",
                    "It bypasses standard error-checking routines for maximum bandwidth."
                ],
                "correct_option_index": 0,
                "explanation": "Standard engineering models prioritize modularity, standardization, and separation of concerns.",
                "topic": topic or "Core Principles"
            }
            for i in range(min(num_questions, 3))
        ]
        return {"assessment_id": f"quiz_{uuid.uuid4().hex[:12]}", "questions": fallback_questions, "topic": topic or "General Review"}

    def evaluate_submission(self, stored_questions: List[Dict], student_answers: List[Dict]) -> Dict[str, Any]:
        """Automatically evaluate student answers against stored assessment keys."""
        ans_map = {a.get("question_id"): a.get("selected_option_index") for a in student_answers}
        score = 0
        results = []

        for q in stored_questions:
            qid = q.get("id")
            selected = ans_map.get(qid, -1)
            correct = q.get("correct_option_index", 0)
            is_correct = (selected == correct)
            if is_correct:
                score += 1

            results.append({
                "question_id": qid,
                "question": q.get("question"),
                "options": q.get("options", []),
                "user_answer": selected,
                "correct_answer": correct,
                "is_correct": is_correct,
                "explanation": q.get("explanation", "Review the textbook section for more details."),
                "topic": q.get("topic", "General")
            })

        total = len(stored_questions)
        pct = (score / total * 100) if total > 0 else 0

        feedback = "Outstanding comprehension of the material!" if pct >= 80 else (
            "Good effort. Review the explanations below to solidify difficult areas." if pct >= 50 else
            "Consider re-reading this section and re-testing to improve understanding."
        )

        return {
            "score": score,
            "total_questions": total,
            "percentage": round(pct, 2),
            "results": results,
            "feedback": feedback
        }

_assessment_engine = None

def get_assessment_engine() -> AssessmentEngine:
    global _assessment_engine
    if _assessment_engine is None:
        _assessment_engine = AssessmentEngine()
    return _assessment_engine