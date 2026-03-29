from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from graph.state import TrekState
from prompts.teacher import TEACHER_SYSTEM


def teaching_agent(state: TrekState) -> dict:
    """
    Socratic tutor using Feynman technique.
    Injects memory context (past snapshots) into system prompt.
    Detects [CONCEPT_MASTERED] and sets concept_mastered flag.
    """
    concepts = state.get("concepts", [])
    concept_idx = state.get("current_concept_idx", 0)
    past_snapshots = state.get("past_snapshots", [])
    messages = state.get("messages", [])

    concept_title = concepts[concept_idx]["title"] if concept_idx < len(concepts) else ""

    # Build system prompt with learner profile + memory
    system_prompt = _build_system_prompt(state, concept_title, past_snapshots)

    # Convert messages to LangChain format
    lc_messages = [SystemMessage(content=system_prompt)]
    for msg in messages:
        if msg["role"] == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            lc_messages.append(AIMessage(content=msg["content"]))

    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.7, max_tokens=400)

    try:
        response = llm.invoke(lc_messages)
        raw = response.content or ""
    except Exception as e:
        print(f"[teaching_agent] error: {e}")
        raw = "something went wrong, try again"

    concept_mastered = "[CONCEPT_MASTERED]" in raw
    reply = raw.replace("[CONCEPT_MASTERED]", "").strip()

    # Append assistant reply to messages
    updated_messages = list(messages) + [{"role": "assistant", "content": reply}]

    updates = {
        "last_reply": reply,
        "messages": updated_messages,
        "concept_mastered": concept_mastered,
        "phase": "memory_save" if concept_mastered else "learning",
    }

    return updates


def _build_system_prompt(state: TrekState, concept_title: str, past_snapshots: list) -> str:
    profile_context = f"""
Learner profile:
- Topic: {state.get('topic', '')}
- Level: {state.get('level', '')}
- Goal: {state.get('goal', '')}
- Current concept: {concept_title}
- Teaching strategy: {state.get('teaching_strategy', 'gap_fill')}
"""

    memory_context = ""
    if past_snapshots:
        snap = past_snapshots[0]
        example = snap.get("example_used", "")
        analogy = snap.get("analogy_used", "")
        strategy = snap.get("teaching_strategy", "")
        memory_context = f"""
MEMORY — You previously taught this concept to this learner:
- Example used: {example if example else "none"}
- Analogy used: {analogy if analogy else "none"}
- Strategy used: {strategy if strategy else "none"}
- Was mastered before: {snap.get('mastered', False)}

IMPORTANT: Use the SAME example ({example}) for consistency if it was used before.
Build on what was already taught. Do not restart from scratch.
"""

    return TEACHER_SYSTEM + "\n\n" + profile_context + memory_context
