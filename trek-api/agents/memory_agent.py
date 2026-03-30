from utils.model_router import complete
from graph.state import TrekState
from db.snapshots import get_snapshot, save_snapshot
from db.chat_history import save_message
import asyncio


def _keyword_match(user_message: str, nodes: list) -> int | None:
    msg = user_message.lower()
    for i, node in enumerate(nodes):
        keywords = [node.get("title", "").lower()]
        keywords += [s.lower() for s in node.get("subtopics", [])]
        if any(kw in msg for kw in keywords if kw):
            return i
    return None


def memory_load_agent(state: TrekState) -> dict:
    """
    Runs BEFORE teaching agent.
    Fetches past teaching snapshot for current concept from Supabase.
    """
    user_id = state.get("user_id", "")
    validated_nodes = state.get("validated_nodes", [])
    current_idx = state.get("current_concept_idx", 0)
    messages = state.get("messages", [])

    user_message = ""
    for msg in reversed(messages):
        if msg["role"] == "user":
            user_message = msg["content"]
            break

    # Simple keyword match — no LLM needed for concept detection
    matched = _keyword_match(user_message, validated_nodes)
    concept_idx = matched if matched is not None else current_idx

    past_snapshots: list = []
    if user_id:
        try:
            snapshot = get_snapshot(user_id, concept_idx)
            if snapshot:
                past_snapshots = [snapshot]
        except Exception as e:
            print(f"[memory_load] snapshot fetch failed: {e}")

    return {"past_snapshots": past_snapshots, "phase": "learning"}


def memory_save_agent(state: TrekState) -> dict:
    """
    Runs AFTER concept is mastered.
    Saves snapshot and advances to next concept.
    """
    user_id = state.get("user_id", "")
    roadmap_id = state.get("roadmap_id", "")
    concept_idx = state.get("current_concept_idx", 0)
    validated_nodes = state.get("validated_nodes", [])
    teaching_strategy = state.get("teaching_strategy", "gap_fill")

    concept_title = validated_nodes[concept_idx]["title"] if concept_idx < len(validated_nodes) else ""

    # Save last exchange to chat history
    if roadmap_id and user_id:
        messages = state.get("messages", [])
        for msg in messages[-2:]:
            try:
                save_message(
                    user_id=user_id,
                    roadmap_id=roadmap_id,
                    concept_id=concept_idx,
                    role=msg["role"],
                    content=msg["content"],
                )
            except Exception as e:
                print(f"[memory_save] save_message failed: {e}")

    # Extract example/analogy from last reply
    last_reply = state.get("last_reply", "")
    example_used = _extract_example(last_reply)
    analogy_used = _extract_analogy(last_reply)

    if user_id:
        try:
            save_snapshot(
                user_id=user_id,
                roadmap_id=roadmap_id or "",
                concept_id=concept_idx,
                concept_title=concept_title,
                example_used=example_used,
                analogy_used=analogy_used,
                teaching_strategy=teaching_strategy,
                mastered=True,
            )
        except Exception as e:
            print(f"[memory_save] save_snapshot failed: {e}")

    next_idx = concept_idx + 1
    total = len(validated_nodes)

    if next_idx < total:
        return {
            "current_concept_idx": next_idx,
            "concept_mastered": False,
            "concept_attempt_count": 0,
            "past_snapshots": [],
            "messages": [],
            "phase": "planning",
        }

    # All concepts mastered
    return {
        "concept_mastered": False,
        "phase": "gist",
        "last_reply": "you've mastered every concept in this course. that's it — you actually know this now.",
    }


def _extract_example(text: str) -> str:
    import re
    match = re.search(r"`([^`]+)`", text)
    if match:
        return match.group(1)
    match = re.search(r"\b\w+\s*=\s*\S+", text)
    if match:
        return match.group(0)
    return ""


def _extract_analogy(text: str) -> str:
    import re
    match = re.search(r"like\s+a[n]?\s+[^.!?,]+", text, re.IGNORECASE)
    if match:
        return match.group(0).strip()
    return ""
