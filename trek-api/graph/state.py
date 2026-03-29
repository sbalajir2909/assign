from typing import TypedDict, Literal, Optional


class TrekState(TypedDict):
    # ── Session ──────────────────────────────────────────────────────────────
    session_id: str
    user_id: str
    roadmap_id: Optional[str]

    # ── Phase ────────────────────────────────────────────────────────────────
    phase: Literal["discovery", "generation", "gist", "planning", "memory_load", "learning", "memory_save"]
    discovery_step: int          # 0-3

    # ── Learner profile (filled during discovery) ────────────────────────────
    topic: str
    level: str                   # never touched / heard of it / used it a bit
    goal: str                    # understand concepts / build something / exam prep
    time: str                    # how much time available

    # ── Course content (filled during generation) ────────────────────────────
    gist: dict                   # { emphasis, outcomes, prereqs }
    concepts: list               # list of concept dicts
    sources_hit: list            # list of source names

    # ── Learning progress ────────────────────────────────────────────────────
    current_concept_idx: int
    concept_mastered: bool
    teaching_strategy: str       # gap_fill | analogy_first | example_driven | definition_heavy
    opening_prompt: str          # opening question for current concept

    # ── Chat (current concept messages) ──────────────────────────────────────
    messages: list               # [{ role: 'user'|'assistant', content: str }]
    last_reply: str              # latest assistant reply to return to frontend

    # ── Memory (loaded from Supabase per concept) ────────────────────────────
    past_snapshots: list         # [{ example_used, analogy_used, strategy, mastered }]
