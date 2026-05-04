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
- core_accuracy: 0.50  (concept fundamentally correct?)
- own_words:     0.30  (explained in their own framing?)
- depth:         0.20  (shows WHY, not just WHAT?)

Flag rules:
- core_accuracy < 0.30 on ANY attempt → flag='misconception' immediately
- 4 attempts without mastery → flag='struggling' (force advance on attempt 4)
- attempt 1 weighted_score >= 0.85 → flag='strong'
"""

import json
from datetime import datetime, timezone
from utils.model_router import get_model_name
from utils.bkt import update_bkt
from utils.sm2 import update_sm2
from utils.interaction_logger import log_interaction
from db.client import supabase

VALIDATOR_SYSTEM_PROMPT = """You are evaluating whether a student genuinely understands a concept.

PRIMARY QUESTION: Could this student explain this concept to a friend who had never heard of it?
If yes — even if imprecisely worded — that is mastery.

Judge the CORE concept the student was actually asked to explain.
Do not require every related sub-topic, edge case, or implementation detail.
If the student answered the actual question correctly, they should usually pass.

Score on THREE dimensions. Return ONLY valid JSON. No preamble, no markdown, no explanation outside the JSON.

━━━ RUBRIC ━━━

1. core_accuracy  (weight 0.50)
   The student's core idea — is it fundamentally correct?
   • Correct concept in informal language → HIGH score (0.75+)
   • Missing technical terms is NOT a penalty if the idea is right
   • Low scores (< 0.40) only for factual errors or fundamental misunderstandings
   • Do NOT penalize for omitting edge cases or optional sub-topics, especially on attempts 1 or 2
   • Missing nuance is not a reason to fail if the core idea is right

2. own_words  (weight 0.30)
   Did they explain it with their own framing and examples?
   • Verbatim repetition of the teaching text → LOW (< 0.40)
   • Personal paraphrase or personal example → HIGH (0.75+)
   • Partial paraphrase with one original thought → MEDIUM (0.50–0.70)

3. depth  (weight 0.20)
   Do they show WHY it works, not just WHAT it is?
   • One correct "why" or causal reasoning → HIGH (0.75+)
   • Description of behavior only, no reasoning → LOW (0.30–0.50)
   • Do not require exhaustive explanations — one good reason is enough
   • On attempts 1 or 2, missing depth beyond the core idea should not be treated as failure

━━━ PASS / EDGE-CASE RULES ━━━
• weighted_score >= 0.65 = passed.
• On attempts 1 or 2, do not fail them for missing edge cases, caveats, or extra sub-topics.
• Only after attempt 2, and only if the core idea is already understood, you may mention one extra nuance.
• That extra nuance should be a growth pointer after a pass, not the reason they failed.

━━━ FEEDBACK RULES (non-negotiable) ━━━

what_was_right:
  ALWAYS specific and genuine. Quote or paraphrase what they actually said that was correct.
  Never write "good attempt", "nice try", or anything generic. Never leave this empty.

If weighted score >= 0.65 (passed):
  feedback = "[one sentence naming what they explained well] + [one growth pointer —
  something interesting to explore deeper, framed as curiosity not correction]"
  what_was_wrong = "" (empty — they passed)

If weighted score < 0.65 (not yet):
  feedback = "[acknowledge the ONE most correct thing they said] + [identify ONE specific
  gap — not a list, just the most important thing missing]"
  what_was_wrong = one specific gap only
  The gap must be directly actionable and materially different from any previous feedback supplied in the prompt.

Never repeat the same what_was_wrong across attempts if the prompt lists previous feedback already given.

━━━ JSON FORMAT ━━━
{
  "core_accuracy": <float 0.0-1.0>,
  "own_words": <float 0.0-1.0>,
  "depth": <float 0.0-1.0>,
  "feedback": "<feedback following the rules above>",
  "what_was_right": "<specific and genuine — never empty>",
  "what_was_wrong": "<one specific gap, or empty string if passed>"
}"""

# Kept for documentation and test compatibility — describes the rubric thresholds
# that existed before BKT.  The BKT correct signal always uses a fixed 0.65.
ATTEMPT_THRESHOLDS = {1: 0.65, 2: 0.65, 3: 0.50, 4: None}  # None = force advance

RUBRIC_WEIGHTS = {
    "core_accuracy": 0.50,
    "own_words": 0.30,
    "depth": 0.20,
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
    "sm2_easiness": 2.5,
    "sm2_interval": 1,
    "sm2_repetitions": 0,
}


def _with_default(value, default):
    return default if value is None else value


def _extract_feedback_strings(rows: list[dict] | None) -> list[str]:
    feedback_points: list[str] = []
    for row in rows or []:
        payload = row.get("quality_label")
        if not payload:
            continue
        parsed = None
        if isinstance(payload, str):
            try:
                parsed = json.loads(payload)
            except json.JSONDecodeError:
                parsed = payload.strip()
        elif isinstance(payload, dict):
            parsed = payload

        if isinstance(parsed, dict):
            for key in ("what_was_wrong", "feedback"):
                value = parsed.get(key)
                if isinstance(value, str):
                    value = value.strip()
                    if value and value not in feedback_points:
                        feedback_points.append(value)
        elif isinstance(parsed, str):
            parsed = parsed.strip()
            if parsed and parsed not in feedback_points:
                feedback_points.append(parsed)
    return feedback_points


async def _load_previous_feedback(user_id: str, kc_id: str) -> list[str]:
    try:
        result = await supabase.table("interaction_log") \
            .select("quality_label") \
            .eq("user_id", user_id) \
            .eq("kc_id", kc_id) \
            .order("created_at", desc=True) \
            .limit(3) \
            .execute()
        return _extract_feedback_strings(result.data)
    except Exception as e:
        print(f"[mastery_validator] Failed to load prior feedback for kc={kc_id}: {e}")
        return []


async def _ensure_bkt_row(user_id: str, kc_id: str, topic_id: str) -> None:
    """
    Seeds student_kc_state with defaults when the KC row does not exist yet.
    This protects first-attempt production writes from silently skipping the
    SM-2 update path.
    """
    try:
        await supabase.table("student_kc_state").upsert({
            "user_id": user_id,
            "kc_id": kc_id,
            "topic_id": topic_id,
            "p_learned": _BKT_DEFAULTS["p_learned"],
            "p_l0": _BKT_DEFAULTS["p_learned"],
            "p_transit": _BKT_DEFAULTS["p_transit"],
            "p_slip": _BKT_DEFAULTS["p_slip"],
            "p_guess": _BKT_DEFAULTS["p_guess"],
            "attempt_count": _BKT_DEFAULTS["attempt_count"],
            "status": "not_started",
            "sm2_easiness": _BKT_DEFAULTS["sm2_easiness"],
            "sm2_interval": _BKT_DEFAULTS["sm2_interval"],
            "sm2_repetitions": _BKT_DEFAULTS["sm2_repetitions"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id,kc_id").execute()
        print(f"[mastery_validator] seeded default kc state for kc={kc_id}")
    except Exception as e:
        print(f"[mastery_validator] Failed to seed default kc state for kc={kc_id}: {e}")


async def _load_bkt_row(user_id: str, kc_id: str, topic_id: str) -> dict:
    """Fetches BKT state for (user, KC). Seeds defaults if no row exists."""
    try:
        result = await supabase.table("student_kc_state") \
            .select(
                "p_learned, p_transit, p_slip, p_guess, attempt_count, "
                "sm2_easiness, sm2_interval, sm2_repetitions"
            ) \
            .eq("user_id", user_id) \
            .eq("kc_id", kc_id) \
            .maybe_single() \
            .execute()
        if result.data:
            return {
                "p_learned": _with_default(result.data.get("p_learned"), _BKT_DEFAULTS["p_learned"]),
                "p_transit": _with_default(result.data.get("p_transit"), _BKT_DEFAULTS["p_transit"]),
                "p_slip":    _with_default(result.data.get("p_slip"),    _BKT_DEFAULTS["p_slip"]),
                "p_guess":   _with_default(result.data.get("p_guess"),   _BKT_DEFAULTS["p_guess"]),
                "attempt_count": _with_default(result.data.get("attempt_count"), 0),
                "sm2_easiness": _with_default(result.data.get("sm2_easiness"), _BKT_DEFAULTS["sm2_easiness"]),
                "sm2_interval": _with_default(result.data.get("sm2_interval"), _BKT_DEFAULTS["sm2_interval"]),
                "sm2_repetitions": _with_default(result.data.get("sm2_repetitions"), _BKT_DEFAULTS["sm2_repetitions"]),
            }
    except Exception as e:
        print(f"[mastery_validator] Failed to load BKT state for kc={kc_id}: {e}")

    await _ensure_bkt_row(user_id, kc_id, topic_id)
    return dict(_BKT_DEFAULTS)


def _sm2_quality_from_score(weighted_score: float, force_advanced: bool) -> int:
    if force_advanced:
        return 2
    if weighted_score >= 0.9:
        return 5
    if weighted_score >= 0.8:
        return 4
    if weighted_score >= 0.65:
        return 3
    if weighted_score >= 0.5:
        return 2
    return 1


def _updated_kc_graph(state: dict, kc_id: str, status: str, p_learned: float) -> list:
    next_graph = []
    for node in state.get("kc_graph", []):
        if node.id == kc_id:
            node.status = status
            node.p_learned = p_learned
        elif node.order_index == state.get("current_kc_index") and status not in ("mastered", "force_advanced"):
            node.status = "in_progress"
            node.p_learned = p_learned if node.id == kc_id else getattr(node, "p_learned", 0.0)
        next_graph.append(node)
    return next_graph


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
    sm2_update: tuple[float, int, int, str] | None = None,
) -> None:
    """Persists updated BKT state to student_kc_state."""
    if mastery:
        status = "mastered"
    elif force_advanced:
        status = "force_advanced"
    else:
        status = "in_progress"

    now = datetime.now(timezone.utc).isoformat()
    payload = {
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
    }
    if sm2_update:
        new_easiness, new_interval, new_repetitions, next_review_iso = sm2_update
        print(
            f"[sm2] writing review for kc={kc_id} "
            f"next_review={next_review_iso} interval={new_interval}"
        )
        payload.update({
            "sm2_easiness": new_easiness,
            "sm2_interval": new_interval,
            "sm2_repetitions": new_repetitions,
            "sm2_next_review": next_review_iso,
        })
    try:
        await supabase.table("student_kc_state").upsert(
            payload,
            on_conflict="user_id,kc_id",
        ).execute()
        if sm2_update:
            print(
                f"[sm2] wrote review for kc={kc_id} "
                f"next_review={payload['sm2_next_review']} interval={payload['sm2_interval']}"
            )
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
    previous_feedback = await _load_previous_feedback(user_id, kc_id)

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
                f"Previous feedback already given: {previous_feedback}. "
                "Do not repeat any of these points.\n\n"
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
            "core_accuracy": 0.0, "own_words": 0.0, "depth": 0.0,
            "feedback": "I had trouble reading your explanation. Please try again.",
            "what_was_right": "You made an attempt to explain the concept.",
            "what_was_wrong": "I couldn't parse your response — please try again.",
        }

    weighted = sum(scores.get(k, 0.0) * RUBRIC_WEIGHTS[k] for k in RUBRIC_WEIGHTS)
    scores["weighted_score"] = round(weighted, 4)

    # ── Step 2: BKT update ────────────────────────────────────────────────────
    bkt_row = await _load_bkt_row(user_id, kc_id, topic_id)
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
    force_advance = attempt_num >= 4 and not mastery
    advance = mastery or force_advance
    new_attempt_count = bkt_row["attempt_count"] + 1

    sm2_update = None
    if advance:
        quality = _sm2_quality_from_score(weighted, force_advance)
        new_easiness, new_interval, new_repetitions, next_review = update_sm2(
            easiness=bkt_row["sm2_easiness"],
            interval=bkt_row["sm2_interval"],
            repetitions=bkt_row["sm2_repetitions"],
            quality=quality,
        )
        sm2_update = (
            new_easiness,
            new_interval,
            new_repetitions,
            next_review.isoformat(),
        )

    # ── Step 4: Flag determination ────────────────────────────────────────────
    flag_type = None
    flag_reason = None

    if scores.get("core_accuracy", 1.0) < 0.30:
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
        sm2_update=sm2_update,
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
        "kc_graph": _updated_kc_graph(
            state,
            kc_id,
            "mastered" if mastery else ("force_advanced" if force_advance else "in_progress"),
            new_p_learned,
        ),
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
