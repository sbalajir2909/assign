"""
Mastery gate — controls whether a student advances past a KC.

Rules (NON-NEGOTIABLE):
- BKT mastery gate: P(L) >= 0.75 → advance.
- Force-advance on attempt 4 regardless of P(L). flag='struggling'.
- Student can NEVER self-advance. The validator always gates.

BKT signal:
- correct = (weighted_rubric_score >= 0.65)
- BKT params are loaded per (user, KC) from student_kc_state.
- Defaults: p_l0=0.1, p_transit=0.10, p_slip=0.10, p_guess=0.20.

Rubric weights (sum to 1.0):
- core_idea:        0.40
- reasoning_quality: 0.30
- own_words:         0.20
- edge_awareness:    0.10

Flag rules:
- score_core_idea < 0.30 on ANY attempt → flag='misconception' immediately
- 4 attempts without mastery → flag='struggling' (force advance on attempt 4)
- attempt 1 weighted_score >= 0.85 → flag='strong'
"""

import json
from datetime import datetime, timezone
from utils.model_router import get_model_name
from utils.bkt import update_bkt
from utils.interaction_logger import log_interaction
from db.client import supabase

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

# Kept for documentation and test compatibility — describes the rubric thresholds
# that existed before BKT.  The BKT correct signal always uses a fixed 0.65.
ATTEMPT_THRESHOLDS = {1: 0.65, 2: 0.65, 3: 0.50, 4: None}  # None = force advance

RUBRIC_WEIGHTS = {
    "core_idea": 0.40,
    "reasoning_quality": 0.30,
    "own_words": 0.20,
    "edge_awareness": 0.10,
}

BKT_MASTERY_THRESHOLD = 0.75   # P(L) gate for KC advancement
BKT_CORRECT_THRESHOLD = 0.65   # rubric score that counts as "correct" for BKT

# Default BKT params used when no row exists in student_kc_state
_BKT_DEFAULTS = {
    "p_learned": 0.1,
    "p_transit": 0.10,
    "p_slip": 0.10,
    "p_guess": 0.20,
    "attempt_count": 0,
}


async def _load_bkt_row(user_id: str, kc_id: str) -> dict:
    """Fetches BKT state for (user, KC). Returns defaults if no row exists."""
    try:
        result = await supabase.table("student_kc_state") \
            .select("p_learned, p_transit, p_slip, p_guess, attempt_count") \
            .eq("user_id", user_id) \
            .eq("kc_id", kc_id) \
            .maybe_single() \
            .execute()
        if result.data:
            return {
                "p_learned": result.data.get("p_learned", _BKT_DEFAULTS["p_learned"]),
                "p_transit": result.data.get("p_transit", _BKT_DEFAULTS["p_transit"]),
                "p_slip":    result.data.get("p_slip",    _BKT_DEFAULTS["p_slip"]),
                "p_guess":   result.data.get("p_guess",   _BKT_DEFAULTS["p_guess"]),
                "attempt_count": result.data.get("attempt_count", 0),
            }
    except Exception as e:
        print(f"[mastery_validator] Failed to load BKT state for kc={kc_id}: {e}")
    return dict(_BKT_DEFAULTS)


async def _upsert_bkt_row(
    user_id: str,
    kc_id: str,
    topic_id: str,
    new_p_learned: float,
    attempt_count: int,
    last_score: float,
    mastery: bool,
    force_advanced: bool,
    flag_type: str | None,
) -> None:
    """Persists updated BKT state to student_kc_state."""
    if mastery:
        status = "mastered"
    elif force_advanced:
        status = "force_advanced"
    else:
        status = "in_progress"

    now = datetime.now(timezone.utc).isoformat()
    try:
        await supabase.table("student_kc_state").upsert({
            "user_id": user_id,
            "kc_id": kc_id,
            "topic_id": topic_id,
            "p_learned": new_p_learned,
            "attempt_count": attempt_count,
            "last_attempt_score": last_score,
            "status": status,
            "flag_type": flag_type,
            "last_studied_at": now,
            "updated_at": now,
        }, on_conflict="user_id,kc_id").execute()
    except Exception as e:
        print(f"[mastery_validator] Failed to persist BKT state for kc={kc_id}: {e}")


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
    user_id = state["user_id"]
    kc_id = state["current_kc_id"]
    topic_id = state["topic_id"]

    # ── Step 1: LLM rubric scoring ────────────────────────────────────────────
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

    weighted = sum(scores.get(k, 0.0) * RUBRIC_WEIGHTS[k] for k in RUBRIC_WEIGHTS)
    scores["weighted_score"] = round(weighted, 4)

    # ── Step 2: BKT update ────────────────────────────────────────────────────
    bkt_row = await _load_bkt_row(user_id, kc_id)
    bkt_before = bkt_row["p_learned"]

    # Binary correct signal: rubric score >= 0.65
    correct = weighted >= BKT_CORRECT_THRESHOLD

    new_p_learned = update_bkt(
        p_learned=bkt_row["p_learned"],
        p_transit=bkt_row["p_transit"],
        p_slip=bkt_row["p_slip"],
        p_guess=bkt_row["p_guess"],
        correct=correct,
    )
    bkt_after = new_p_learned

    # ── Step 3: Mastery gate ──────────────────────────────────────────────────
    mastery = new_p_learned >= BKT_MASTERY_THRESHOLD
    force_advance = attempt_num >= 4
    advance = mastery or force_advance
    new_attempt_count = bkt_row["attempt_count"] + 1

    # ── Step 4: Flag determination ────────────────────────────────────────────
    flag_type = None
    flag_reason = None

    if scores.get("core_idea", 1.0) < 0.30:
        flag_type = "misconception"
        flag_reason = (
            f"Core concept misunderstood on attempt {attempt_num}. "
            f"Score: {scores.get('core_idea', 0):.2f}"
        )
    elif force_advance and not mastery:
        flag_type = "struggling"
        flag_reason = f"Did not reach mastery after {attempt_num} attempts. Force advanced."
    elif attempt_num == 1 and weighted >= 0.85:
        flag_type = "strong"
        flag_reason = f"First-attempt score {weighted:.2f}. Ready for advanced material."

    # ── Step 5: Persist BKT state ─────────────────────────────────────────────
    await _upsert_bkt_row(
        user_id=user_id,
        kc_id=kc_id,
        topic_id=topic_id,
        new_p_learned=new_p_learned,
        attempt_count=new_attempt_count,
        last_score=weighted,
        mastery=mastery,
        force_advanced=force_advance,
        flag_type=flag_type,
    )

    # ── Step 6: Log attempt ───────────────────────────────────────────────────
    await log_interaction(
        user_id=user_id,
        kc_id=kc_id,
        topic_id=topic_id,
        attempt_number=attempt_num,
        explanation_text=explanation,
        scores=scores,
        bkt_before=bkt_before,
        bkt_after=bkt_after,
        passed=advance,
        force_advanced=force_advance,
    )

    # ── Step 7: Build state patch ─────────────────────────────────────────────
    patch: dict = {
        "last_rubric_scores": scores,
        "last_weighted_score": weighted,
        "last_passed": advance,
        "bkt_state": {**state["bkt_state"], kc_id: new_p_learned},
    }

    if flag_type:
        patch["flags_this_session"] = state.get("flags_this_session", []) + [{
            "kc_id": kc_id,
            "kc_title": kc.title,
            "flag_type": flag_type,
            "flag_reason": flag_reason,
        }]

    if advance:
        patch["phase"] = "notes_generation"
        patch["current_attempt_number"] = 1   # reset for next KC
    else:
        patch["phase"] = "teaching"
        patch["current_attempt_number"] = attempt_num + 1

    return patch, scores, flag_type
