from db.supabase_client import get_supabase


def save_roadmap(user_id: str, topic: str, concepts: list) -> str:
    """Insert a new roadmap and return its id."""
    sb = get_supabase()
    result = (
        sb.table("roadmaps")
        .insert({"user_id": user_id, "topic": topic, "concepts": concepts})
        .execute()
    )
    return result.data[0]["id"]


def update_roadmap_concepts(roadmap_id: str, concepts: list) -> None:
    """Update concepts and last_studied timestamp."""
    from datetime import datetime, timezone
    sb = get_supabase()
    sb.table("roadmaps").update({
        "concepts": concepts,
        "last_studied": datetime.now(timezone.utc).isoformat()
    }).eq("id", roadmap_id).execute()


def get_roadmap(roadmap_id: str) -> dict | None:
    sb = get_supabase()
    result = sb.table("roadmaps").select("*").eq("id", roadmap_id).single().execute()
    return result.data
