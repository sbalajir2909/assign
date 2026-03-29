from db.supabase_client import get_supabase


def get_snapshot(user_id: str, concept_id: int) -> dict | None:
    """Fetch the most recent teaching snapshot for a user + concept."""
    sb = get_supabase()
    result = (
        sb.table("teaching_snapshots")
        .select("*")
        .eq("user_id", user_id)
        .eq("concept_id", concept_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def save_snapshot(
    user_id: str,
    roadmap_id: str,
    concept_id: int,
    concept_title: str,
    example_used: str,
    analogy_used: str,
    teaching_strategy: str,
    mastered: bool,
) -> None:
    """Upsert a teaching snapshot (one active row per user+concept)."""
    sb = get_supabase()
    existing = get_snapshot(user_id, concept_id)
    payload = {
        "user_id": user_id,
        "roadmap_id": roadmap_id,
        "concept_id": concept_id,
        "concept_title": concept_title,
        "example_used": example_used,
        "analogy_used": analogy_used,
        "teaching_strategy": teaching_strategy,
        "mastered": mastered,
    }
    if existing:
        sb.table("teaching_snapshots").update(payload).eq("id", existing["id"]).execute()
    else:
        sb.table("teaching_snapshots").insert(payload).execute()
