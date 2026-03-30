from typing import TypedDict, Literal, Optional


class TrekState(TypedDict):
    session_id: str
    user_id: str
    roadmap_id: Optional[str]

    phase: Literal[
        "discovery",
        "generation",
        "gist",
        "planning",
        "memory_load",
        "learning",
        "mastery_check",
        "memory_save",
    ]

    topic: str
    exit_condition: str
    knowledge_baseline: dict
    available_hours: float
    context: str
    discovery_messages: list

    gist: str
    sprint_plan: dict
    validated_nodes: list
    sources_hit: list
    graph_confidence: str
    evidence_strength: str

    current_concept_idx: int
    current_sprint_idx: int
    concept_mastered: bool
    concept_attempt_count: int
    flag_for_recall: list
    teaching_strategy: str
    opening_prompt: str

    last_mastery_result: dict

    messages: list
    last_reply: str

    past_snapshots: list
