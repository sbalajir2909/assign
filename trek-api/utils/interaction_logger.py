"""
Logs every explanation attempt to interaction_log.
Non-blocking — wrapped in try/except so it never crashes the teaching loop.
"""

import json

from db.client import supabase


async def log_interaction(
    user_id: str,
    kc_id: str,
    topic_id: str,
    attempt_number: int,
    explanation_text: str,
    scores: dict,
    bkt_before: float,
    bkt_after: float,
    passed: bool,
    force_advanced: bool,
):
    try:
        feedback_payload = json.dumps({
            "feedback": scores.get("feedback", ""),
            "what_was_right": scores.get("what_was_right", ""),
            "what_was_wrong": scores.get("what_was_wrong", ""),
        })
        await supabase.table("interaction_log").insert({
            "user_id": user_id,
            "kc_id": kc_id,
            "topic_id": topic_id,
            "attempt_number": attempt_number,
            "explanation_text": explanation_text,
            "score_core_idea": scores.get("core_accuracy", scores.get("core_idea")),
            "score_reasoning": scores.get("depth", scores.get("reasoning_quality")),
            "score_own_words": scores.get("own_words"),
            "score_edge_awareness": scores.get("edge_awareness"),
            "weighted_score": scores.get("weighted_score"),
            "bkt_before": bkt_before,
            "bkt_after": bkt_after,
            "passed": passed,
            "force_advanced": force_advanced,
            "quality_label": feedback_payload,
        }).execute()
    except Exception as e:
        # Never crash the teaching loop for a logging failure
        print(f"[interaction_logger] Failed to log: {e}")
