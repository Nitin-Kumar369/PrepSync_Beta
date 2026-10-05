#!/usr/bin/env python3
"""
Renames existing 'Concept Comprehension' assessments and submissions in MongoDB
to their true textbook/subject topic so the analytics matrix is organized correctly.
"""
import sys
import os
import re

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from db import get_db

def repair_topics():
    db = get_db()
    assessments_col = db["assessments"]
    submissions_col = db["assessment_submissions"]
    books_col = db["books"]
    chats_col = db["chats"]

    # Find all assessments saved with Concept Comprehension
    bad_assessments = list(assessments_col.find({"topic": "Concept Comprehension"}))
    print(f"Found {len(bad_assessments)} assessments titled 'Concept Comprehension'.")

    repaired = 0
    for a in bad_assessments:
        aid = a.get("assessment_id")
        book_id = a.get("book_id")
        
        # Determine real subject from BookModel or Question text
        book = books_col.find_one({"book_id": book_id}) or {}
        real_topic = book.get("subject") or book.get("title") or "Computer Networks"

        # Check first question to identify the specific domain (e.g., OSI Model)
        qs = a.get("questions", [])
        if qs and "osi" in qs[0].get("question", "").lower():
            real_topic = "OSI Model"
        elif qs and "tcp" in qs[0].get("question", "").lower():
            real_topic = "TCP/IP Protocol"

        # 1. Update Assessment document
        assessments_col.update_one(
            {"_id": a["_id"]},
            {
                "$set": {
                    "topic": real_topic,
                    "questions.$[].topic": real_topic
                }
            }
        )

        # 2. Update Submission document
        sub = submissions_col.find_one({"assessment_id": aid})
        if sub:
            updated_results = []
            for r in sub.get("results", []):
                r["topic"] = real_topic
                updated_results.append(r)

            submissions_col.update_one(
                {"_id": sub["_id"]},
                {
                    "$set": {
                        "topic": real_topic,
                        "results": updated_results
                    }
                }
            )

        # 3. Update embedded Chat messages
        chats_col.update_many(
            {"messages.assessment_id": aid},
            {
                "$set": {
                    "messages.$.topic": real_topic,
                    "messages.$.result.results.$[].topic": real_topic
                }
            }
        )
        repaired += 1

    print(f"Repaired {repaired} records. 'Concept Comprehension' has been mapped to real engineering subjects.")

if __name__ == "__main__":
    repair_topics()