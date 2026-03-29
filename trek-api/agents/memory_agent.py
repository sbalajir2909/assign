from langchain_groq import ChatGroq
from graph.state import TrekState
from db.snapshots import get_snapshot, save_snapshot
from db.chat_history import save_message


def _keyword_match(user_message: str, concepts: list) -> int | None:
    """
    Step 1 — Fast keyword match (0ms, no LLM call).
    Checks if any concept title or its subtopics appear in the user message.
    Returns concept index if matched, None otherwise.
    """
    msg = user_message.lower()
    for i, concept in enumerate(concepts):
        keywords = [concept["title"].lower()]
        keywords += [s.lower() for s in concept.get("subtopics", [])]
        if any(kw in msg for kw in keywords):
            return i
    return None


def _llm_match(user_message: str, concepts: list, current_idx: int) -> int:
    """
    Step 2 — LLM fallback (only called when keyword match fails).
    Uses llama-3.1-8b-instant (fast/cheap) to detect concept from natural language.
    """
    titles = "\n".join([f"{i}: {c['title']}" for i, c in enumerate(concepts)])
    prompt = (
        f"A learner asked: \"{user_message}\"\n\n"
        f"Concepts in this course:\n{titles}\n\n"
        "Which concept number (0-indexed) is the learner asking about? "
        "Reply with just the number, or -1 if the question is about the current concept."
    )
    try:
        llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0, max_tokens=5)
        result = llm.invoke(prompt)
        idx = int(result.content.strip())
        if 0 <= idx < len(concepts):
            return idx
    except Exception as e:
        print(f"[memory_load_agent] LLM concept detection failed: {e}")
    return current_idx


def _detect_concept_idx(user_message: str, concepts: list, current_idx: int) -> int:
    """
    Two-step concept detection:
    1. Keyword match first  → instant (0ms), no LLM call
    2. LLM fallback         → only if keyword match fails (~300ms)

    80-90% of questions are handled by keyword match alone.
    LLM only fires for ambiguous/natural language questions.
    """
    # Step 1: fast keyword match
    matched = _keyword_match(user_message, concepts)
    if matched is not None:
        print(f"[concept_detector] keyword match → concept {matched} (no LLM call)")
        return matched

    # Step 2: LLM fallback for natural language
    print(f"[concept_detector] keyword miss → calling LLM router")
    return _llm_match(user_message, concepts, current_idx)


def memory_load_agent(state: TrekState) -> dict:
    """
    Runs BEFORE teaching agent.
    1. Uses LLM concept router to detect which concept the user is asking about.
    2. Fetches past teaching snapshot for that concept from Supabase.
    3. Injects into state.past_snapshots.

    This ensures that if a user asks "what is a variable?" while on Concept 3,
    the system correctly fetches the snapshot for Concept 0 (Variables).
    """
    user_id = state.get("user_id", "")
    concepts = state.get("concepts", [])
    current_idx = state.get("current_concept_idx", 0)
    messages = state.get("messages", [])

    # Get the latest user message
    user_message = ""
    for msg in reversed(messages):
        if msg["role"] == "user":
            user_message = msg["content"]
            break

    # Detect which concept the question is about
    concept_idx = _detect_concept_idx(user_message, concepts, current_idx)

    past_snapshots: list = []
    if user_id:
        snapshot = get_snapshot(user_id, concept_idx)
        if snapshot:
            past_snapshots = [snapshot]

    return {"past_snapshots": past_snapshots, "phase": "learning"}


def memory_save_agent(state: TrekState) -> dict:
    """
    Runs AFTER concept is mastered.
    Extracts example/analogy from last assistant message and saves snapshot.
    Also saves the last exchange to chat_history.
    """
    user_id = state.get("user_id", "")
    roadmap_id = state.get("roadmap_id", "")
    concept_idx = state.get("current_concept_idx", 0)
    concepts = state.get("concepts", [])
    teaching_strategy = state.get("teaching_strategy", "gap_fill")

    concept_title = concepts[concept_idx]["title"] if concept_idx < len(concepts) else ""

    # Save last exchange to chat_history
    if roadmap_id and user_id:
        messages = state.get("messages", [])
        for msg in messages[-2:]:  # Save last user + assistant pair
            save_message(
                user_id=user_id,
                roadmap_id=roadmap_id,
                concept_id=concept_idx,
                role=msg["role"],
                content=msg["content"],
            )

    # Extract example/analogy from last assistant reply (simple heuristic)
    last_reply = state.get("last_reply", "")
    example_used = _extract_example(last_reply)
    analogy_used = _extract_analogy(last_reply)

    if user_id and roadmap_id:
        save_snapshot(
            user_id=user_id,
            roadmap_id=roadmap_id,
            concept_id=concept_idx,
            concept_title=concept_title,
            example_used=example_used,
            analogy_used=analogy_used,
            teaching_strategy=teaching_strategy,
            mastered=True,
        )

    # Advance to next concept
    next_idx = concept_idx + 1
    updated_concepts = []
    for i, c in enumerate(concepts):
        if i == concept_idx:
            updated_concepts.append({**c, "status": "done"})
        elif i == next_idx:
            updated_concepts.append({**c, "status": "current"})
        else:
            updated_concepts.append(c)

    if next_idx < len(concepts):
        return {
            "concepts": updated_concepts,
            "current_concept_idx": next_idx,
            "concept_mastered": False,
            "past_snapshots": [],
            "messages": [],
            "phase": "planning",
        }

    # All concepts done
    return {
        "concepts": updated_concepts,
        "concept_mastered": False,
        "phase": "gist",  # reuse gist phase as "done" signal
        "last_reply": "you've mastered every concept in this course. that's it — you actually know this now.",
    }


def _extract_example(text: str) -> str:
    """Extract code-like example from text (e.g. x = 5)."""
    import re
    # Look for code patterns: x = 5, print("hello"), etc.
    match = re.search(r"`([^`]+)`", text)
    if match:
        return match.group(1)
    # Look for assignment patterns
    match = re.search(r"\b\w+\s*=\s*\S+", text)
    if match:
        return match.group(0)
    return ""


def _extract_analogy(text: str) -> str:
    """Extract analogy from text (looks for 'like a' patterns)."""
    import re
    match = re.search(r"like\s+a[n]?\s+[^.!?,]+", text, re.IGNORECASE)
    if match:
        return match.group(0).strip()
    return ""
