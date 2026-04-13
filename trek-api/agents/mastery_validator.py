"""
Mastery gate — controls whether a student advances past a KC.

Rules (NON-NEGOTIABLE):
- Attempt 1: threshold 0.65. Pass → advance. Fail → re-teach.
- Attempt 2: threshold 0.65. Pass → advance. Fail → re-teach.
- Attempt 3: threshold 0.50. Pass → advance. Fail → re-teach.
- Attempt 4: FORCE ADVANCE regardless of score. flag='struggling'.
- Student can NEVER self-advance. The validator always gates.

Rubric weights (sum to 1.0):
- core_idea:        0.40
- reasoning_quality: 0.30
- own_words:         0.20
- edge_awareness:    0.10

Flag rules:
- score_core_idea < 0.30 on ANY attempt → flag='misconception' immediately
- 4 attempts without passing → flag='struggling' (force advance on attempt 4)
- attempt 1 weighted_score >= 0.85 → flag='strong'
"""

import json
from utils.model_router import get_model_name
from utils.interaction_logger import log_interaction
from models.student_model import update_bkt

VALIDATOR_SYSTEM_PROMPT = """You are an expert educational assessor for the Assign learning platform.

Your job is to score a student's explanation of a concept using a strict 4-dimension rubric.
Be honest. Do not inflate scores. A student who just echoes back the teaching word-for-word
should score LOW on own_words. A student who gets the central concept wrong should score
VERY LOW on core_idea — this is a misconception, not a gap.

You MUST return valid JSON and nothing else. No preamble. No markdown. No explanation.

JSON format:
{
  "core_idea": <float 0.0-1.0>,
  "reasoning_quality": <float 0.0-1.0>,
  "own_words": <float 0.0-1.0>,
  "edge_awareness": <float 0.0-1.0>,
  "feedback": "<one sentence of honest feedback to show the student>",
  "what_was_right": "<one sentence — what did they get correct? Be specific.>",
  "what_was_wrong": "<one sentence — what was missing or incorrect? Be specific. Empty string if nothing.>"
}"""

ATTEMPT_THRESHOLDS = {1: 0.65, 2: 0.65, 3: 0.50, 4: None}  # None = force advance
RUBRIC_WEIGHTS = {
    "core_idea": 0.40,
    "reasoning_quality": 0.30,
    "own_words": 0.20,
    "edge_awareness": 0.10,
}


async def validate_explanation(state: dict, client) -> tuple[dict, dict, str | None]:
    """
    Validates the student's explanation.
    Returns (state_patch, scores, flag_type).
    Never modifies state directly.

    state: TrekStateB2C dict
    client: AsyncOpenAI-compatible client
    """
    kc = next(k for k in state["kc_graph"] if k.id == state["current_kc_id"])
    attempt_num = state["current_attempt_number"]
    explanation = state["last_explanation"]

    # Score via LLM (small model — structured output, not generation)
    response = await client.chat.completions.create(
        model=get_model_name("small"),
        temperature=0.1,
        max_tokens=300,
        messages=[
            {"role": "system", "content": VALIDATOR_SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"Concept being assessed: {kc.title}\n"
                f"Concept description: {kc.description}\n"
                f"Attempt number: {attempt_num} of 4\n\n"
                f"Student's explanation:\n\"\"\"{explanation}\"\"\"\n\n"
                f"Score this explanation strictly."
            )}
        ]
    )

    raw = response.choices[0].message.content.strip()

    try:
        scores = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[mastery_validator] JSON parse failed. Raw: {raw[:200]}")
        scores = {
            "core_idea": 0.0, "reasoning_quality": 0.0,
            "own_words": 0.0, "edge_awareness": 0.0,
            "feedback": "I had trouble reading your explanation. Please try again.",
            "what_was_right": "", "what_was_wrong": ""
        }

    # Compute weighted score
    weighted = sum(scores.get(k, 0.0) * RUBRIC_WEIGHTS[k] for k in RUBRIC_WEIGHTS)
    scores["weighted_score"] = round(weighted, 4)

    # Determine pass/fail/force
    threshold = ATTEMPT_THRESHOLDS.get(attempt_num)
    force_advance = (attempt_num >= 4)
    passed = False if force_advance else (weighted >= threshold)

    # Determine flag
    flag_type = None
    flag_reason = None

    if scores.get("core_idea", 1.0) < 0.30:
        flag_type = "misconception"
        flag_reason = (
            f"Core concept misunderstood on attempt {attempt_num}. "
            f"Score: {scores.get('core_idea', 0):.2f}"
        )
    elif force_advance:
        flag_type = "struggling"
        flag_reason = f"Did not pass after {attempt_num} attempts. Force advanced."
    elif attempt_num == 1 and weighted >= 0.85:
        flag_type = "strong"
        flag_reason = f"First-attempt score {weighted:.2f}. Ready for advanced material."

    # Update BKT state
    bkt_before = state["bkt_state"].get(state["current_kc_id"], kc.p_learned)
    bkt_after = update_bkt(
        p_learned=bkt_before,
        p_transit=0.10,
        p_slip=0.10,
        p_guess=0.20,
        correct=(passed or (weighted >= 0.50))   # partial credit for BKT
    )

    # Log to interaction_log (async, non-blocking)
    await log_interaction(
        user_id=state["user_id"],
        kc_id=state["current_kc_id"],
        topic_id=state["topic_id"],
        attempt_number=attempt_num,
        explanation_text=explanation,
        scores=scores,
        bkt_before=bkt_before,
        bkt_after=bkt_after,
        passed=passed,
        force_advanced=force_advance,
    )

    # Build state patch
    patch: dict = {
        "last_rubric_scores": scores,
        "last_weighted_score": weighted,
        "last_passed": passed or force_advance,
        "bkt_state": {**state["bkt_state"], state["current_kc_id"]: bkt_after},
    }

    if flag_type:
        patch["flags_this_session"] = state.get("flags_this_session", []) + [{
            "kc_id": state["current_kc_id"],
            "kc_title": kc.title,
            "flag_type": flag_type,
            "flag_reason": flag_reason,
        }]

    # Advance or re-teach
    if passed or force_advance:
        patch["phase"] = "notes_generation"
        patch["current_attempt_number"] = 1   # reset for next KC
    else:
        # Stay on this KC, increment attempt, go back to teaching
        patch["phase"] = "teaching"
        patch["current_attempt_number"] = attempt_num + 1

    return patch, scores, flag_type
