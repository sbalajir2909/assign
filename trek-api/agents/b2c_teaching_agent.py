"""
B2C Teaching agent — explains the current KC to the student, then prompts explanation.

CRITICAL: Always ends with a clear instruction asking the student to explain in their own words.
Every teaching turn must end with this ask.
Teaching must be adaptive — if the student failed a previous attempt, teach differently.
"""

import re

from prompts.teacher import TEACHING_SYSTEM_PROMPT
from utils.model_router import get_model_name

_ANALOGY_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+")


def _extract_used_analogies(recent_turns: list[dict]) -> list[str]:
    """Pull prior analogy-style sentences from the recent chat history."""
    used: list[str] = []
    for turn in recent_turns:
        content = turn.get("content", "")
        if not isinstance(content, str):
            continue
        for sentence in _ANALOGY_SENTENCE_SPLIT_RE.split(content):
            normalized = " ".join(sentence.split()).strip()
            lowered = normalized.lower()
            if not normalized:
                continue
            if "like a" in lowered or "like an" in lowered or "think of" in lowered:
                if normalized not in used:
                    used.append(normalized)
    return used


async def run_teaching(state: dict, client) -> dict:
    """
    Teaches the current KC and returns state patch.
    Always ends by asking student to explain back.
    """
    kc = next(k for k in state["kc_graph"] if k.id == state["current_kc_id"])
    attempt = state.get("current_attempt_number", 1)
    recent_turns = list(state.get("recent_turns", []))
    used_analogies = _extract_used_analogies(recent_turns)
    forbidden_analogies = ""
    if used_analogies:
        joined = " | ".join(used_analogies)
        forbidden_analogies = (
            f"\nDo not use these analogies: {joined}. "
            "Use a completely different comparison."
        )

    # Build re-attempt context if needed.
    # Note: score keys match the 3-dimension rubric (core_accuracy, own_words, depth).
    reattempt_context = ""
    if attempt > 1 and state.get("last_rubric_scores"):
        scores = state["last_rubric_scores"]
        gap = scores.get("what_was_wrong", "").strip()
        right = scores.get("what_was_right", "").strip()
        reattempt_context = (
            f"\nThis is attempt {attempt} of 4."
            f"\nWhat the student got right: {right or 'partially understood the concept'}"
            f"\nThe specific gap to address: {gap or 'unclear — use a different framing'}"
            f"\nAddress ONLY this gap. Do not re-explain the full concept."
        )

    # Check for active misconception flag
    misconception_note = ""
    active_flags = [
        f for f in state.get("flags_this_session", [])
        if f["kc_id"] == state["current_kc_id"]
    ]
    if any(f["flag_type"] == "misconception" for f in active_flags):
        misconception_note = (
            "\nIMPORTANT: This student has a misconception about this concept. "
            "Their last explanation showed a fundamentally wrong understanding of the core idea. "
            "Before teaching, briefly correct the misconception directly and clearly."
        )

    # Prepend semantically retrieved prior teaching moments when available.
    # These come from concept_rag_chunks written after previous KC masteries.
    # Placed before TEACHING_SYSTEM_PROMPT so they read as background knowledge,
    # not as instructions.
    prior_moments = state.get("retrieved_context", [])
    retrieved_system: list[dict] = []
    if prior_moments:
        joined = "\n---\n".join(prior_moments)
        retrieved_system = [{"role": "system", "content": (
            "Relevant prior teaching moments for this student:\n" + joined
        )}]
        print(f"[teaching_agent] Injecting {len(prior_moments)} RAG chunk(s) into prompt")

    # Learning style hint — derived from interaction_log history, written by main.py
    style_note = ""
    hint = state.get("learning_style_hint")
    if hint:
        style_note = f"\nThis student's learning pattern: {hint}. Adapt your teaching style accordingly."

    # Per-attempt task instruction — tells the LLM exactly what to produce.
    if attempt == 1:
        task_instruction = (
            f"Concept: {kc.title}\n"
            f"Description: {kc.description}\n"
            f"{misconception_note}"
            f"{forbidden_analogies}"
            f"{style_note}\n\n"
            "This is the student's first time seeing this concept. "
            "Follow the ATTEMPT 1 rules: probe question first, brief explanation, under 60 words."
        )
    elif attempt == 2:
        task_instruction = (
            f"Concept: {kc.title}\n"
            f"{reattempt_context}"
            f"{misconception_note}"
            f"{forbidden_analogies}"
            f"{style_note}\n\n"
            "Follow the ATTEMPT 2 rules. "
            "Address only the gap. Do not re-explain the full concept. "
            "If you use a comparison at all, it must be completely different from the forbidden analogies."
        )
    else:
        direct_example_note = (
            "\nNo analogies. Use a direct, concrete code example or explicit step-by-step explanation."
        )
        task_instruction = (
            f"Concept: {kc.title}\n"
            f"{reattempt_context}"
            f"{misconception_note}"
            f"{forbidden_analogies}"
            f"{direct_example_note}"
            f"{style_note}\n\n"
            f"Follow the ATTEMPT {attempt} rules. "
            "Address only the gap. Do not re-explain the full concept. "
            "Use no analogies."
        )

    messages = [
        *retrieved_system,
        {"role": "system", "content": TEACHING_SYSTEM_PROMPT},
        *state.get("context_window", []),
        {"role": "user", "content": task_instruction},
    ]

    response = await client.chat.completions.create(
        model=get_model_name("large"),
        temperature=0.7,
        max_tokens=400,
        messages=messages,
    )

    full_text = response.choices[0].message.content.strip()

    # Update recent turns
    recent = (recent_turns + [{"role": "assistant", "content": full_text}])[-6:]

    return {
        "phase": "awaiting_explanation",
        "pending_message": full_text,
        "recent_turns": recent,
        "ready_for_mastery_check": True,
    }
