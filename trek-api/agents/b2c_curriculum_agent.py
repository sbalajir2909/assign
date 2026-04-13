"""
B2C Curriculum agent — wraps the existing curriculum pipeline.
Converts validated_nodes → KCNode objects and persists to Supabase.
"""

import uuid
from agents.curriculum_agent import run_curriculum
from graph.b2c_state import KCNode
from db.client import supabase


async def run_b2c_curriculum(state: dict) -> dict:
    """
    Builds the KC graph from the learner profile.
    Persists knowledge_components and student_kc_state rows.
    Returns state patch.
    """
    profile = state.get("_discovery_profile") or {
        "topic": state.get("topic_title", ""),
        "exit_condition": "understand the topic end to end",
        "knowledge_baseline": {
            "summary": "unknown",
            "probed_concept": "",
            "probe_result": "weak",
        },
        "available_hours": 10.0,
        "context": "",
    }

    result = await run_curriculum(profile)

    if result.get("error") or not result.get("validated_nodes"):
        return {
            "pending_message": (
                "I had trouble building your course. "
                "Let me know your topic again and we'll try once more."
            ),
            "phase": "discovery",
            "discovery_complete": False,
            "discovery_messages": [],
        }

    validated_nodes = result["validated_nodes"]
    topic_id = state["topic_id"]
    user_id = state["user_id"]

    # Convert to KCNode objects
    kc_nodes: list[KCNode] = []
    for i, node in enumerate(validated_nodes):
        kc_id = str(uuid.uuid4())
        kc_nodes.append(KCNode(
            id=kc_id,
            title=node.get("title", f"Concept {i + 1}"),
            description=node.get("description") or node.get("why_needed", ""),
            prerequisites=node.get("prerequisites", []),
            order_index=i,
        ))

    # Persist to DB
    for kc in kc_nodes:
        try:
            await supabase.table("knowledge_components").insert({
                "id": kc.id,
                "topic_id": topic_id,
                "title": kc.title,
                "description": kc.description,
                "prerequisites": kc.prerequisites,
                "order_index": kc.order_index,
            }).execute()
        except Exception as e:
            print(f"[b2c_curriculum] Failed to store KC '{kc.title}': {e}")

        try:
            await supabase.table("student_kc_state").insert({
                "user_id": user_id,
                "kc_id": kc.id,
                "topic_id": topic_id,
                "p_learned": 0.0,
                "p_l0": 0.1,
                "status": "not_started",
            }).execute()
        except Exception as e:
            print(f"[b2c_curriculum] Failed to create KC state for '{kc.title}': {e}")

    first_kc = kc_nodes[0] if kc_nodes else None

    # Build intro message (gist)
    gist = result.get("gist") or (
        f"Built {len(kc_nodes)} concepts for {state.get('topic_title', 'your topic')}. "
        f"Let's start with the first one."
    )

    return {
        "kc_graph": kc_nodes,
        "total_kcs": len(kc_nodes),
        "current_kc_index": 0,
        "current_kc_id": first_kc.id if first_kc else None,
        "current_attempt_number": 1,
        "max_attempts": 4,
        "pass_threshold": 0.65,
        "bkt_state": {kc.id: 0.0 for kc in kc_nodes},
        "flags_this_session": [],
        "notes_generated": [],
        "context_window": [],
        "recent_turns": [],
        "session_summary": None,
        "phase": "teaching",
        "pending_message": gist,
    }
