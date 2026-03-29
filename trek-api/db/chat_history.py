from db.supabase_client import get_supabase


def save_message(user_id: str, roadmap_id: str, concept_id: int, role: str, content: str) -> None:
    """Save a single chat message."""
    sb = get_supabase()
    sb.table("chat_history").insert({
        "user_id": user_id,
        "roadmap_id": roadmap_id,
        "concept_id": concept_id,
        "role": role,
        "content": content,
    }).execute()


def get_messages(roadmap_id: str, concept_id: int) -> list[dict]:
    """Fetch all messages for a concept, ordered by time."""
    sb = get_supabase()
    result = (
        sb.table("chat_history")
        .select("role, content, created_at")
        .eq("roadmap_id", roadmap_id)
        .eq("concept_id", concept_id)
        .order("created_at")
        .execute()
    )
    return result.data or []
