"""
B2C Teaching agent — explains the current KC to the student, then prompts explanation.

CRITICAL: Always ends with a clear instruction asking the student to explain in their own words.
Every teaching turn must end with this ask.
Teaching must be adaptive — if the student failed a previous attempt, teach differently.
"""

from utils.model_router import get_model_name

TEACHING_SYSTEM_PROMPT = """You are Assign, an adaptive learning tutor.
Your job is to teach one specific concept clearly, then ask the student to explain it back.

Rules you must follow:
1. Teach the concept in 3-5 sentences. Be concrete. Use one analogy if helpful.
2. ALWAYS end with: "Now, explain [concept] back to me in your own words."
3. If this is attempt 2 or higher (re-attempt after failing), change your approach entirely.
   Use a different analogy. Simplify. Focus only on what they got wrong.
4. Never lecture for more than 150 words.
5. Never ask multiple questions. One ask only: explain it back.
6. If flag_type is 'misconception', explicitly address the misconception first before re-teaching.

You have context about this student: what they've learned, what they've struggled with,
what analogies worked for them before. Use it.
"""


async def run_teaching(state: dict, client) -> dict:
    """
    Teaches the current KC and returns state patch.
    Always ends by asking student to explain back.
    """
    kc = next(k for k in state["kc_graph"] if k.id == state["current_kc_id"])
    attempt = state.get("current_attempt_number", 1)

    # Build re-attempt context if needed
    reattempt_context = ""
    if attempt > 1 and state.get("last_rubric_scores"):
        scores = state["last_rubric_scores"]
        reattempt_context = (
            f"\nThis is attempt {attempt}. The student previously scored:\n"
            f"- Core idea: {scores.get('core_idea', 0):.0%}\n"
            f"- Reasoning: {scores.get('reasoning_quality', 0):.0%}\n"
            f"What was wrong: {scores.get('what_was_wrong', 'unclear')}\n"
            f"Adjust your teaching to address this specifically."
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

    messages = [
        *retrieved_system,
        {"role": "system", "content": TEACHING_SYSTEM_PROMPT},
        *state.get("context_window", []),
        {"role": "user", "content": (
            f"Current concept to teach: {kc.title}\n"
            f"Description: {kc.description}\n"
            f"{reattempt_context}"
            f"{misconception_note}\n\n"
            f"Teach this concept now."
        )}
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
