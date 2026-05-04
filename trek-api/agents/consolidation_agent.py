"""
Consolidation agent — generates a post-mastery message at the highest-retention moment.

Called immediately after the student passes mastery validation on a KC.
The message is specific to their explanation, goal type, and next KC.
"""

from utils.model_router import get_model_name

_SYSTEM = (
    "You are a great teacher closing out a lesson. "
    "Be warm but not sycophantic. Be specific not generic. "
    "Under 100 words. No bullet points. Flowing prose only."
)


async def generate_consolidation(state: dict, llm_client) -> str:
    """
    Generates a consolidation message after the student masters a KC.

    Does three things in order:
    1. Acknowledge something specific from their explanation
    2. Give a concrete real-world example matched to their goal type
    3. Bridge to the next KC (or close the course if done)
    """
    kc_graph = state.get("kc_graph", [])
    current_idx = state.get("current_kc_index", 0)

    current_kc = kc_graph[current_idx] if current_idx < len(kc_graph) else None
    kc_title = current_kc.title if current_kc else "this concept"

    next_kc_title = None
    if current_idx + 1 < len(kc_graph):
        next_kc_title = kc_graph[current_idx + 1].title

    profile = state.get("_discovery_profile") or {}
    goal_type = profile.get("goal_type", "other")
    goal_detail = profile.get("goal_detail", "understand the topic")
    best_explanation = state.get("last_explanation") or ""
    attempt_count = state.get("current_attempt_number", 1)

    if next_kc_title:
        bridge_instruction = (
            f"3. One sentence on why the next concept '{next_kc_title}' "
            "builds directly on what they just learned."
        )
    else:
        bridge_instruction = "3. One sentence saying the course is complete."

    user_content = (
        f"The student just mastered '{kc_title}' on attempt {attempt_count}. "
        f"Their goal: {goal_type} — {goal_detail}.\n"
        f"Their best explanation was: '{best_explanation}'.\n\n"
        "Write a consolidation message that does exactly three things in order, no more:\n"
        "1. One sentence acknowledging something SPECIFIC from their explanation "
        "that was correct — not generic praise\n"
        "2. One concrete real-world example relevant to their goal:\n"
        "   - If goal_type is 'project': a 2-3 line code snippet showing this "
        "concept in a real script\n"
        "   - If goal_type is 'exam': one typical exam question this appears in, "
        "with the answer\n"
        "   - If goal_type is 'job': one interview question, with a strong "
        "one-line answer\n"
        "   - If goal_type is 'deep_understanding': an interesting edge case or "
        "counterintuitive behavior\n"
        f"{bridge_instruction}"
    )

    response = await llm_client.chat.completions.create(
        model=get_model_name("large"),
        temperature=0.7,
        max_tokens=300,
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": user_content},
        ],
    )

    return response.choices[0].message.content.strip()
