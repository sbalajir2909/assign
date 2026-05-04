"""
Notes generator — runs after every KC closes (pass or force-advance).

Output is structured, saved to kc_notes table, and surfaced in the Notes page.
The note IS the compressed context for future resume — do not treat it as cosmetic.

Note structure:
- concept_name: the KC title
- summary: 2-3 sentence plain language explanation
- the_analogy: best analogy used in this session
- key_points: 3 concrete takeaways with examples
- watch_out: populated if KC was flagged
- student_analogy: the student's best explanation from interaction_log
- quick_reference: one memorable line
- full_text: concatenated plain text for search and context loading
"""

import json
import re
from utils.model_router import get_model_name
from utils.embeddings import embed_text
from db.client import supabase

NOTES_SYSTEM_PROMPT = """You are generating a study note for a student who just finished learning a concept.

Rules:
1. summary: Write 2-3 sentences explaining the concept in plain English.
   Write it as if explaining to a friend, not a textbook.
2. key_points: Exactly 3 items. Each item must have:
   - point: one sentence
   - example: one concrete example or tiny code snippet
3. watch_out: One sentence describing the most common mistake with this concept.
4. quick_reference: One memorable line the student can glance at later.

Return ONLY valid JSON. No markdown. No preamble.

JSON format:
{
  "summary": "...",
  "key_points": [
    {"point": "...", "example": "..."},
    {"point": "...", "example": "..."},
    {"point": "...", "example": "..."}
  ],
  "watch_out": "...",
  "quick_reference": "..."
}"""

_ANALOGY_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+")
_ANALOGY_MARKERS = ("like a", "like an", "think of", "imagine", "as if")


def _extract_analogy_candidates(text: str) -> list[str]:
    candidates: list[str] = []
    for sentence in _ANALOGY_SPLIT_RE.split(text or ""):
        normalized = " ".join(sentence.split()).strip()
        lowered = normalized.lower()
        if normalized and any(marker in lowered for marker in _ANALOGY_MARKERS):
            candidates.append(normalized)
    return candidates


def _normalize_key_points(items: list | None) -> list[dict]:
    normalized: list[dict] = []
    for item in items or []:
        if isinstance(item, dict):
            point = str(item.get("point", "")).strip()
            example = str(item.get("example", "")).strip()
        else:
            point = str(item).strip()
            example = ""
        if point:
            normalized.append({"point": point, "example": example})
    return normalized[:3]


async def _load_best_session_analogy(user_id: str, topic_id: str, kc_id: str) -> str:
    try:
        result = await supabase.table("b2c_chat_history") \
            .select("content") \
            .eq("user_id", user_id) \
            .eq("topic_id", topic_id) \
            .eq("kc_id", kc_id) \
            .eq("role", "assistant") \
            .order("turn_index") \
            .execute()
    except Exception as e:
        print(f"[notes_generator] Failed to read chat history for analogy: {e}")
        return ""

    best = ""
    for row in result.data or []:
        for candidate in _extract_analogy_candidates(row.get("content", "")):
            if len(candidate) >= len(best):
                best = candidate
    return best


async def _load_best_student_explanation(user_id: str, kc_id: str) -> str:
    try:
        result = await supabase.table("interaction_log") \
            .select("explanation_text, weighted_score") \
            .eq("user_id", user_id) \
            .eq("kc_id", kc_id) \
            .order("weighted_score", desc=True) \
            .limit(1) \
            .execute()
        row = (result.data or [{}])[0]
        return str(row.get("explanation_text", "")).strip()
    except Exception as e:
        print(f"[notes_generator] Failed to read best student explanation: {e}")
        return ""


async def generate_note(state: dict, client) -> dict:
    """
    Generates and persists a note for the current KC.
    Runs after every KC closes (pass or force-advance).
    Returns state patch dict.
    """
    kc = next(k for k in state["kc_graph"] if k.id == state["current_kc_id"])

    # Find flag for this KC if any
    kc_flags = [
        f for f in state.get("flags_this_session", [])
        if f["kc_id"] == state["current_kc_id"]
    ]
    flag_context = ""
    if kc_flags:
        f = kc_flags[-1]
        flag_context = f"Student flag: {f['flag_type']} — {f['flag_reason']}"

    best_explanation = state.get("last_explanation", "")
    best_session_analogy = await _load_best_session_analogy(
        state["user_id"], state["topic_id"], state["current_kc_id"]
    )
    student_analogy = await _load_best_student_explanation(
        state["user_id"], state["current_kc_id"]
    ) or best_explanation

    response = await client.chat.completions.create(
        model=get_model_name("small"),
        temperature=0.3,
        max_tokens=500,
        messages=[
            {"role": "system", "content": NOTES_SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"Concept: {kc.title}\n"
                f"Description: {kc.description}\n"
                f"Best analogy used in this session: {best_session_analogy or 'none'}\n"
                f"Student's best explanation: \"\"\"{student_analogy or best_explanation}\"\"\"\n"
                f"Student's final explanation: \"\"\"{best_explanation}\"\"\"\n"
                f"{flag_context}\n\n"
                f"Generate the study note now."
            )}
        ]
    )

    raw = response.choices[0].message.content.strip()

    try:
        note_data = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[notes_generator] JSON parse failed. Raw: {raw[:200]}")
        note_data = {
            "summary": kc.description or kc.title,
            "key_points": [
                {"point": kc.title, "example": kc.description or ""},
                {"point": "Review this concept again", "example": ""},
                {"point": "Ask for help if unclear", "example": ""},
            ],
            "watch_out": "This concept needs more review." if kc_flags else "",
            "quick_reference": kc.title,
        }

    note_data["key_points"] = _normalize_key_points(note_data.get("key_points"))
    if not note_data["key_points"]:
        note_data["key_points"] = [{"point": kc.title, "example": kc.description or ""}]
    note_data["watch_out"] = str(note_data.get("watch_out", "")).strip()
    note_data["quick_reference"] = str(note_data.get("quick_reference", kc.title)).strip() or kc.title

    # Build full_text for context loading and search
    full_text = f"{kc.title}\n\n{note_data['summary']}\n\n"
    full_text += f"Quick reference: {note_data['quick_reference']}\n"
    if best_session_analogy:
        full_text += f"\nHow we explained it: {best_session_analogy}\n"
    full_text += "\n".join(
        f"- {item['point']}\n  Example: {item['example']}".rstrip()
        for item in note_data["key_points"]
    )
    if student_analogy:
        full_text += f"\n\nIn your own words: {student_analogy}"
    if note_data.get("watch_out"):
        full_text += f"\n\nWatch out: {note_data['watch_out']}"

    # Persist to Supabase
    try:
        await supabase.table("kc_notes").upsert({
            "user_id": state["user_id"],
            "kc_id": state["current_kc_id"],
            "topic_id": state["topic_id"],
            "status": "complete",
            "concept_name": kc.title,
            "summary": note_data["summary"],
            "key_points": note_data["key_points"],
            "the_analogy": best_session_analogy,
            "student_analogy": student_analogy,
            "watch_out": note_data.get("watch_out", ""),
            "quick_reference": note_data["quick_reference"],
            "full_text": full_text,
        }, on_conflict="user_id,kc_id").execute()
    except Exception as e:
        print(f"[notes_generator] Failed to persist note: {e}")

    # ── RAG write path ────────────────────────────────────────────────────────
    # Embed and store the note so context_builder can retrieve semantically
    # relevant prior teaching moments via match_concept_chunks().
    # Failures are non-fatal — the teaching loop must not be blocked by a
    # transient embedding or DB error.

    _rag_base = {
        "user_id": state["user_id"],
        "roadmap_id": state.get("roadmap_id"),   # nullable; set after curriculum build
        "concept_index": kc.order_index,
        "concept_title": kc.title,
    }

    # Chunk 1 — summary: title + paragraph summary + 3 key points
    summary_text = (
        f"{kc.title}\n\n{note_data['summary']}\n\n"
        f"Quick reference: {note_data['quick_reference']}\n\n"
        + "\n".join(
            f"- {item['point']}\nExample: {item['example']}".rstrip()
            for item in note_data["key_points"]
        )
    )
    try:
        summary_vec = await embed_text(summary_text)
        await supabase.table("concept_rag_chunks").insert({
            **_rag_base,
            "content": summary_text,
            "chunk_type": "summary",
            "embedding": summary_vec,
        }).execute()
    except Exception as e:
        print(f"[notes_generator] Failed to store summary chunk for '{kc.title}': {e}")

    # Chunk 2 — mental_model: student's own analogy (only if one was recorded)
    analogy = best_session_analogy or student_analogy
    if analogy:
        try:
            analogy_vec = await embed_text(analogy)
            await supabase.table("concept_rag_chunks").insert({
                **_rag_base,
                "content": analogy,
                "chunk_type": "mental_model",
                "embedding": analogy_vec,
            }).execute()
        except Exception as e:
            print(f"[notes_generator] Failed to store analogy chunk for '{kc.title}': {e}")

    # Determine next KC
    next_index = state["current_kc_index"] + 1
    if next_index >= state["total_kcs"]:
        next_phase = "complete"
        next_kc_id = None
        next_kc_index = state["current_kc_index"]
    else:
        next_phase = "teaching"
        next_kc_id = state["kc_graph"][next_index].id
        next_kc_index = next_index
        state["kc_graph"][next_index].status = "in_progress"

    return {
        "phase": next_phase,
        "current_kc_index": next_kc_index,
        "current_kc_id": next_kc_id,
        "current_attempt_number": 1,
        "kc_graph": state["kc_graph"],
        "notes_generated": state.get("notes_generated", []) + [state["current_kc_id"]],
    }
