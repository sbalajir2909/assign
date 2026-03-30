from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from graph.state import TrekState
from prompts.teacher import TEACHER_SYSTEM


def teaching_agent(state: TrekState) -> dict:
    """
    Socratic tutor using Feynman technique.
    Uses validated_nodes and new learner profile fields.
    Does NOT self-mark mastery — that's the mastery_validator's job.
    Outputs [READY_FOR_MASTERY_CHECK] when it thinks the learner is ready.
    """
    validated_nodes = state.get("validated_nodes", [])
    concept_idx = state.get("current_concept_idx", 0)
    past_snapshots = state.get("past_snapshots", [])
    messages = state.get("messages", [])
    attempt_count = state.get("concept_attempt_count", 0)

    concept = validated_nodes[concept_idx] if concept_idx < len(validated_nodes) else {}
    concept_title = concept.get("title", "")

    system_prompt = _build_system_prompt(state, concept, past_snapshots, attempt_count)

    lc_messages = [SystemMessage(content=system_prompt)]
    for msg in messages:
        if msg["role"] == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            lc_messages.append(AIMessage(content=msg["content"]))

    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.7,
        max_tokens=500
    )

    try:
        response = llm.invoke(lc_messages)
        raw = response.content or ""
    except Exception as e:
        print(f"[teaching_agent] error: {e}")
        raw = "something went wrong, try again"

    # Teaching agent signals readiness for mastery check
    # but does NOT mark mastery itself
    ready_for_check = "[READY_FOR_MASTERY_CHECK]" in raw
    reply = raw.replace("[READY_FOR_MASTERY_CHECK]", "").strip()

    updated_messages = list(messages) + [{"role": "assistant", "content": reply}]

    return {
        "last_reply": reply,
        "messages": updated_messages,
        "concept_mastered": ready_for_check,
        "phase": "memory_save" if ready_for_check else "learning",
    }


def _build_system_prompt(
    state: TrekState,
    concept: dict,
    past_snapshots: list,
    attempt_count: int
) -> str:
    topic = state.get("topic", "")
    exit_condition = state.get("exit_condition", "")
    knowledge_baseline = state.get("knowledge_baseline", {})
    teaching_strategy = state.get("teaching_strategy", "gap_fill")
    opening_prompt = state.get("opening_prompt", "")

    concept_context = f"""
CURRENT CONCEPT:
- Title: {concept.get('title', '')}
- Description: {concept.get('description', '')}
- Why this matters: {concept.get('why_needed', '')}
- Complexity: {concept.get('complexity', 0.5)} (0=trivial, 1=extremely hard)
- Teaching strategy: {teaching_strategy}

LEARNER CONTEXT:
- Learning goal: {topic} → {exit_condition}
- Baseline: {knowledge_baseline.get('summary', 'unknown')}
- Probe result: {knowledge_baseline.get('probe_result', 'unknown')}
- Attempt number on this concept: {attempt_count + 1}
"""

    memory_context = ""
    if past_snapshots:
        snap = past_snapshots[0]
        example = snap.get("example_used", "")
        analogy = snap.get("analogy_used", "")
        memory_context = f"""
MEMORY — Previously taught this concept:
- Example used before: {example if example else "none"}
- Analogy used before: {analogy if analogy else "none"}
- Was mastered before: {snap.get('mastered', False)}
Keep using the same example/analogy for consistency.
"""

    strategy_instructions = {
        "gap_fill": "The learner knows some of this. Find exactly what's missing and fill only that gap.",
        "analogy_first": "Start with a strong concrete analogy before any technical explanation.",
        "example_driven": "Lead with a real working example. Explain the concept through it.",
        "definition_heavy": "Be precise and thorough. This learner needs depth and exactness.",
    }.get(teaching_strategy, "Find the gap and fill it.")

    opening_instruction = f"\nOPENING: Start with this question: {opening_prompt}" if opening_prompt and attempt_count == 0 else ""

    mastery_instruction = """
MASTERY SIGNAL:
When the learner has demonstrated genuine understanding — they can explain the concept correctly in their own words, with correct reasoning — end your message with exactly: [READY_FOR_MASTERY_CHECK]
Do NOT output this token unless their explanation was genuinely clean and correct.
Do NOT output this on your first message.
Do NOT output this if they just repeated keywords without understanding.
"""

    return (
        TEACHER_SYSTEM
        + "\n\n"
        + concept_context
        + "\n"
        + strategy_instructions
        + opening_instruction
        + "\n"
        + memory_context
        + "\n"
        + mastery_instruction
    )
