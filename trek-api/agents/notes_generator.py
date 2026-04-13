"""
Notes generator — runs after every KC closes (pass or force-advance).

Output is structured, saved to kc_notes table, and surfaced in the Notes page.
The note IS the compressed context for future resume — do not treat it as cosmetic.

Note structure:
- concept_name: the KC title
- summary: one paragraph, plain language explanation
- key_points: exactly 3 bullet points
- student_analogy: if the student used a correct analogy, quote it
- watch_out: populated if KC was flagged
- full_text: concatenated plain text for search and context loading
"""

import json
from utils.model_router import get_model_name
from db.client import supabase

NOTES_SYSTEM_PROMPT = """You are generating a study note for a student who just finished learning a concept.

Rules:
1. summary: Write one paragraph (4-6 sentences) explaining the concept in plain language.
   Write it as if explaining to a friend, not a textbook. Do NOT copy the teaching verbatim.
2. key_points: Exactly 3 bullet points. Each under 15 words. The most important takeaways.
3. student_analogy: If the student used an analogy or comparison in their explanation that was
   CORRECT, quote it verbatim. If not, return empty string.
4. watch_out: If the student was flagged (struggling or misconception), write one sentence
   describing what to watch out for when revisiting this concept. If not flagged, return empty string.

Return ONLY valid JSON. No markdown. No preamble.

JSON format:
{
  "summary": "...",
  "key_points": ["...", "...", "..."],
  "student_analogy": "...",
  "watch_out": "..."
}"""


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

    response = await client.chat.completions.create(
        model=get_model_name("small"),
        temperature=0.3,
        max_tokens=500,
        messages=[
            {"role": "system", "content": NOTES_SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"Concept: {kc.title}\n"
                f"Description: {kc.description}\n"
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
            "key_points": [kc.title, "Review this concept again", "Ask for help if unclear"],
            "student_analogy": "",
            "watch_out": "This concept needs more review." if kc_flags else "",
        }

    # Build full_text for context loading and search
    full_text = f"{kc.title}\n\n{note_data['summary']}\n\n"
    full_text += "\n".join(f"- {p}" for p in note_data["key_points"])
    if note_data.get("student_analogy"):
        full_text += f"\n\nYour analogy: {note_data['student_analogy']}"
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
            "student_analogy": note_data.get("student_analogy", ""),
            "watch_out": note_data.get("watch_out", ""),
            "full_text": full_text,
        }, on_conflict="user_id,kc_id").execute()
    except Exception as e:
        print(f"[notes_generator] Failed to persist note: {e}")

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

    return {
        "phase": next_phase,
        "current_kc_index": next_kc_index,
        "current_kc_id": next_kc_id,
        "current_attempt_number": 1,
        "notes_generated": state.get("notes_generated", []) + [state["current_kc_id"]],
    }
