"""
In-chat Assessment Engine.
Generates topic-grounded quizzes scoped exclusively to the active chat history and book metadata.
"""

import logging
import uuid
import time
import re
import requests
from typing import List, Dict, Any, Optional
from config import settings
from db import ChatModel, BookModel, StudentAnalyticsModel

logger = logging.getLogger(__name__)

ACTIVE_MODELS = [
    "gemini-3.6-flash",
    "gemini-flash-latest"
]

def parse_text_quiz_to_objects(raw_text: str, default_topic: str, difficulty: str) -> List[Dict]:
    """
    Parses a structured line-based quiz format into question objects.
    Immune to JSON syntax errors, backslash collisions, and unescaped quotes.
    """
    questions = []
    raw_blocks = re.split(r'\n\s*---\s*\n|\n(?=QUESTION:)', raw_text.strip())

    for i, block in enumerate(raw_blocks):
        lines = [line.strip() for line in block.split('\n') if line.strip()]
        if not lines:
            continue

        q_data = {
            "id": f"q_{i + 1}_{uuid.uuid4().hex[:6]}",
            "question": "",
            "options": [],
            "correct_option_index": 0,
            "explanation": "Derived directly from session context.",
            "topic": default_topic,
            "difficulty": difficulty,
            "question_type": "single_choice"
        }

        current_key = None
        for line in lines:
            if line.startswith("QUESTION:"):
                q_data["question"] = line.replace("QUESTION:", "").strip()
                current_key = "question"
            elif line.startswith("OPTION_A:"):
                q_data["options"].append(line.replace("OPTION_A:", "").strip())
                current_key = "opt"
            elif line.startswith("OPTION_B:"):
                q_data["options"].append(line.replace("OPTION_B:", "").strip())
                current_key = "opt"
            elif line.startswith("OPTION_C:"):
                q_data["options"].append(line.replace("OPTION_C:", "").strip())
                current_key = "opt"
            elif line.startswith("OPTION_D:"):
                q_data["options"].append(line.replace("OPTION_D:", "").strip())
                current_key = "opt"
            elif line.startswith("ANSWER:"):
                ans_str = line.replace("ANSWER:", "").strip().upper()
                mapping = {"A": 0, "B": 1, "C": 2, "D": 3, "0": 0, "1": 1, "2": 2, "3": 3}
                for char in ans_str:
                    if char in mapping:
                        q_data["correct_option_index"] = mapping[char]
                        break
                current_key = "ans"
            elif line.startswith("EXPLANATION:"):
                q_data["explanation"] = line.replace("EXPLANATION:", "").strip()
                current_key = "exp"
            else:
                if current_key == "question" and len(q_data["options"]) == 0:
                    q_data["question"] += " " + line
                elif current_key == "exp":
                    q_data["explanation"] += " " + line

        if q_data["question"] and len(q_data["options"]) >= 2:
            while len(q_data["options"]) < 4:
                q_data["options"].append("None of the above")
            questions.append(q_data)

    return questions


class AssessmentEngine:
    def __init__(self):
        self.api_key = settings.gemini_api_key

    def _call_gemini_raw(self, prompt: str, target_tokens: int = 4096) -> str:
        """Calls Gemini API with dynamic token budget based on question volume."""
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key
        }

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": target_tokens,
                "thinkingConfig": {
                    "thinkingBudget": 0
                }
            }
        }

        last_error = None
        for model_name in ACTIVE_MODELS:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
            for attempt in range(1, 3):
                try:
                    logger.info(f"Generating quiz ({target_tokens} token ceiling) using {model_name}...")
                    res = requests.post(url, headers=headers, json=payload, timeout=75)
                    
                    if res.status_code in [500, 503, 429]:
                        time.sleep(2)
                        continue
                    
                    res.raise_for_status()
                    data = res.json()
                    
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            return parts[0]["text"].strip()

                except Exception as e:
                    last_error = e
                    logger.warning(f"Quiz call error on {model_name}: {str(e)}")
                    time.sleep(1.5)

        raise last_error or Exception("Failed to query Gemini model.")

    def generate_quiz(
        self,
        book_id: str,
        user_id: str,
        chat_id: Optional[str] = None,
        mode: str = "topic",
        topic: str = "",
        context_text: Optional[str] = None,
        num_questions: int = 5,
        difficulty: str = "intermediate",
        question_type: str = "single_choice"
    ) -> Dict[str, Any]:
        """
        Generates quizzes using ONLY active chat history and book/subject titles.
        NO vector store chunks are queried.
        """
        book_info = BookModel.find_by_book_id(book_id) or {}
        book_title = book_info.get("title", "Engineering Textbook")
        book_subject = book_info.get("subject", "Engineering Discipline")
        resolved_topic = topic or book_subject or "Core Concepts"

        scoped_context = ""

        # MODE 1: Post-response check (Scoped strictly to the assistant's previous message)
        if mode == "post_response" and context_text:
            scoped_context = f"Relevant Assistant Response:\n{context_text.strip()}"
            resolved_topic = "Concept Comprehension"

        # MODE 2: Weakness Mode
        elif mode == "weakness":
            metrics = StudentAnalyticsModel.get_student_metrics(user_id)
            weak_topics = [t["topic"] for t in metrics.get("topic_breakdown", []) if t.get("accuracy_percentage", 100) < 60]
            if weak_topics:
                resolved_topic = weak_topics[0]
            scoped_context = f"Book: {book_title}\nSubject: {book_subject}\nFocus Topic: {resolved_topic}"

        # MODE 3: Chapter / Thread Quiz (Scoped strictly to conversation history in this chat)
        else:
            chat_history_lines = []
            if chat_id:
                chat = ChatModel.find_by_chat_id(chat_id)
                if chat and chat.get("messages"):
                    # Use up to the last 10 messages for rich conversational context
                    for m in chat["messages"][-10:]:
                        role = m.get("role", "user").upper()
                        content = m.get("content", "").strip()
                        if content:
                            chat_history_lines.append(f"{role}: {content}")

            if chat_history_lines:
                scoped_context = f"Active Chat Discussion:\n" + "\n".join(chat_history_lines)
            else:
                # If there is no chat history yet, use book metadata only (zero chunk retrieval)
                scoped_context = f"Textbook: {book_title}\nSubject Area: {book_subject}\nCore Topic: {resolved_topic}"

        # Dynamic output token budget: ~500 tokens per question to prevent early cutoff
        calculated_tokens = min(max(num_questions * 550, 2048), 6144)

        prompt = f"""You are an engineering examiner creating a test for topic '{resolved_topic}'.
Textbook Title: {book_title}
Subject: {book_subject}

CRITICAL REQUIREMENT:
You MUST generate EXACTLY {num_questions} questions (numbered 1 through {num_questions}). Do not stop until all {num_questions} questions are fully written.
Difficulty: {difficulty}.

Context to base questions on:
{scoped_context}

Format your output using this exact plain-text template for every single question. Output all {num_questions} blocks separated by '---':

QUESTION: Question text here?
OPTION_A: Choice 1
OPTION_B: Choice 2
OPTION_C: Choice 3
OPTION_D: Choice 4
ANSWER: A
EXPLANATION: Pedagogical explanation of why this choice is correct.
---"""

        if self.api_key:
            try:
                raw_response = self._call_gemini_raw(prompt, target_tokens=calculated_tokens)
                parsed_questions = parse_text_quiz_to_objects(raw_response, resolved_topic, difficulty)

                if parsed_questions:
                    # Guarantee we deliver up to the requested count
                    final_questions = parsed_questions[:num_questions]
                    return {
                        "assessment_id": f"quiz_{uuid.uuid4().hex[:12]}",
                        "questions": final_questions,
                        "topic": resolved_topic,
                        "mode": mode,
                        "difficulty": difficulty
                    }
                else:
                    logger.warning("Parser extracted 0 questions. Dropping to deterministic fallback.")
            except Exception as e:
                logger.error(f"Gemini Quiz Generation failed, using rule-based fallback: {str(e)}")

        # Fallback generator providing the full requested count
        fallback = [
            {
                "id": f"q_{i+1}",
                "question": f"Question {i+1}: What is a foundational principle of {resolved_topic} covered in {book_subject}?",
                "options": [
                    "It enforces modular abstraction and separation of system concerns.",
                    "It bypasses all logical constraints to increase processing speed.",
                    "It relies strictly on unstructured, unverified communication states.",
                    "It removes boundary conditions across architecture layers."
                ],
                "correct_option_index": 0,
                "explanation": "Standard engineering models prioritize modularity, standardization, and separation of concerns.",
                "topic": resolved_topic,
                "difficulty": difficulty,
                "question_type": question_type
            }
            for i in range(num_questions)
        ]
        return {
            "assessment_id": f"quiz_{uuid.uuid4().hex[:12]}",
            "questions": fallback,
            "topic": resolved_topic,
            "mode": mode,
            "difficulty": difficulty
        }

    def evaluate_submission(self, stored_questions: List[Dict], student_answers: List[Dict], time_taken_seconds: int = 0) -> Dict[str, Any]:
        """Auto-evaluates submissions and builds step-by-step remediation cues."""
        ans_map = {}
        for a in student_answers:
            if a.get("selected_option_indices") is not None:
                ans_map[a.get("question_id")] = a.get("selected_option_indices")
            else:
                ans_map[a.get("question_id")] = a.get("selected_option_index")

        score = 0
        results = []

        for q in stored_questions:
            qid = q.get("id")
            selected = ans_map.get(qid)
            correct = q.get("correct_option_index", 0)
            is_correct = (selected == correct)
            if is_correct:
                score += 1

            remediation = f"Can you explain why '{q.get('options', [''])[correct]}' is the correct answer for: '{q.get('question')}' using an analogy?"

            results.append({
                "question_id": qid,
                "question": q.get("question"),
                "options": q.get("options", []),
                "user_answer": selected if selected is not None else -1,
                "correct_answer": correct,
                "is_correct": is_correct,
                "explanation": q.get("explanation", "Verified against session context."),
                "topic": q.get("topic", "General"),
                "remediation_prompt": remediation
            })

        total = len(stored_questions)
        pct = round((score / total * 100), 1) if total > 0 else 0.0

        if pct >= 80:
            badge = "Mastered"
            feedback = "Exam Ready! Excellent command over these concepts."
        elif pct >= 60:
            badge = "Proficient"
            feedback = "Solid understanding. Review the explanations for full clarity."
        else:
            badge = "Needs Remediation"
            feedback = "Critical gaps detected. Use the explanation buttons below to discuss missed items."

        return {
            "score": score,
            "total_questions": total,
            "percentage": pct,
            "time_taken_seconds": time_taken_seconds,
            "badge": badge,
            "feedback": feedback,
            "results": results
        }


_assessment_engine = None

def get_assessment_engine() -> AssessmentEngine:
    global _assessment_engine
    if _assessment_engine is None:
        _assessment_engine = AssessmentEngine()
    return _assessment_engine