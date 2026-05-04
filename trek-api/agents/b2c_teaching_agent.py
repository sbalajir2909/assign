"""
B2C Teaching agent — explains the current KC to the student, then prompts explanation.

CRITICAL: Always ends with a clear instruction asking the student to explain in their own words.
Every teaching turn must end with this ask.
Teaching must be adaptive — if the student failed a previous attempt, teach differently.
"""

from utils.model_router import get_model_name

TEACHING_SYSTEM_PROMPT = """You are Assign, an adaptive tutor. Your behavior is strictly governed by which attempt this is.

━━━ ATTEMPT 1 — first time teaching this concept ━━━
• Start with ONE short question to probe what the student already knows.
  e.g. "Before I explain, what do you already know about [concept]?"
• Keep the initial explanation to 2–3 sentences max. One analogy if it helps.
• Total response must be under 60 words.
• End with: "Now explain [concept] back to me in your own words."

━━━ ATTEMPT 2 — student got a partial score ━━━
• Address ONLY the one specific gap identified in the validator feedback.
• Use a COMPLETELY DIFFERENT analogy or example than anything already in the chat history.
• Do NOT re-explain the full concept — only the gap.
• Under 80 words total.
• End with a targeted question that directly tests the gap, not a generic "explain it back."

━━━ ATTEMPT 3 ━━━
• Go concrete: give a specific code example, real-world scenario, or step-by-step breakdown.
• Ask a narrow, targeted question that only works if they understand the gap.
• Under 80 words.

━━━ ATTEMPT 4 — final attempt ━━━
• Be direct. State the specific missing piece in exactly one sentence.
• Then ask them to explain just that one thing back.
• Under 60 words.

━━━ ALWAYS ━━━
• Never use the same analogy twice in a session. Scan the conversation history
  for any analogy already used and explicitly choose something different.
• Never re-explain the full concept after attempt 1 — only address the gap.
• Never ask multiple questions. One ask per response, always.
• If flag_type is 'misconception': correct the specific misconception in one sentence first,
  then proceed with the attempt rules above.
"""


async def run_teaching(state: dict, client) -> dict:
    """
    Teaches the current KC and returns state patch.
    Always ends by asking student to explain back.
    """
    kc = next(k for k in state["kc_graph"] if k.id == state["current_kc_id"])
    attempt = state.get("current_attempt_number", 1)

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

    # Per-attempt task instruction — tells the LLM exactly what to produce.
    if attempt == 1:
        task_instruction = (
            f"Concept: {kc.title}\n"
            f"Description: {kc.description}\n"
            f"{misconception_note}\n\n"
            "This is the student's first time seeing this concept. "
            "Follow the ATTEMPT 1 rules: probe question first, brief explanation, under 60 words."
        )
    else:
        task_instruction = (
            f"Concept: {kc.title}\n"
            f"{reattempt_context}"
            f"{misconception_note}\n\n"
            f"Follow the ATTEMPT {attempt} rules. "
            "Address only the gap. Do not re-explain the full concept. "
            "Choose an analogy not yet used in this conversation."
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
    recent = state.get("recent_turns", [])
    recent = (recent + [{"role": "assistant", "content": full_text}])[-6:]

    return {
        "phase": "awaiting_explanation",
        "pending_message": full_text,
        "recent_turns": recent,
        "ready_for_mastery_check": True,
    }
