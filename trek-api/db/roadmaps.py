"""
Roadmap persistence — writes the curriculum build result to the roadmaps table.

The roadmaps table is owned by the assign-main frontend schema and is the
primary record the dashboard and /api/roadmap route read from.  The B2C
pipeline writes here once, immediately after curriculum generation, so the
frontend can discover and resume sessions via roadmap_id.
"""

from db.client import supabase


async def save_roadmap(
    user_id: str,
    topic: str,
    sprint_plan: dict,
    gist: str,
    validated_nodes: list,
    learner_profile: dict,
    topic_id: str,
    session_id: str,
    concepts: list,
    sources_hit: list | None = None,
) -> str:
    """
    Inserts one row into roadmaps and returns the new UUID.

    Raises RuntimeError if the insert returns no data — callers should let
    this propagate so the session is not left without a roadmap_id.
    """
    total_minutes = int(sprint_plan.get("total_hours", 0) * 60)
    roadmap_profile = {
        **(learner_profile or {}),
        "_topic_id": topic_id,
        "_session_id": session_id,
    }

    result = await supabase.table("roadmaps").insert({
        "user_id": user_id,
        "topic": topic,
        "status": "active",
        "concepts": concepts,
        "sprint_plan": sprint_plan,
        "gist": gist,
        "validated_nodes": validated_nodes,
        "learner_profile": roadmap_profile,
        "sources_hit": sources_hit or [],
        "total_minutes_estimated": total_minutes,
    }).execute()

    if not result.data:
        raise RuntimeError(
            "[save_roadmap] INSERT returned no data. "
            "Check that SUPABASE_SERVICE_ROLE_KEY is set and RLS is not blocking the write."
        )

    return result.data[0]["id"]
