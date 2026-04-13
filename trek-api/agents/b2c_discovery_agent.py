"""
B2C Discovery agent — wraps the existing discovery agent and persists the topic to Supabase.
"""

import uuid
from agents.discovery_agent import run_discovery
from db.client import supabase


async def run_b2c_discovery(state: dict) -> dict:
    """
    Runs the discovery conversation.
    When discovery is complete, creates a topic record in the DB.
    Returns state patch.
    """
    messages = state.get("discovery_messages", [])
    result = await run_discovery(messages)

    updates: dict = {
        "discovery_messages": messages + [
            {"role": "assistant", "content": result["reply"]}
        ],
        "pending_message": result["reply"],
    }

    if result["discovery_complete"] and result["learner_profile"]:
        profile = result["learner_profile"]
        topic_title = profile.get("topic", "New Topic")
        user_id = state.get("user_id", "")

        # Create topic in DB
        topic_id = str(uuid.uuid4())
        try:
            db_result = await supabase.table("topics").insert({
                "user_id": user_id,
                "title": topic_title,
                "status": "active",
            }).execute()
            if db_result.data:
                topic_id = db_result.data[0]["id"]
        except Exception as e:
            print(f"[b2c_discovery] Failed to create topic in DB: {e}")

        updates.update({
            "topic_id": topic_id,
            "topic_title": topic_title,
            "phase": "curriculum_build",
            "discovery_complete": True,
            "_discovery_profile": profile,
        })
    else:
        updates["discovery_complete"] = False

    return updates
