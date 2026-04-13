"""
B2C state definition — single source of truth for what flows through the B2C LangGraph.
"""

from typing import TypedDict, Optional, List, Literal
from dataclasses import dataclass, field


Phase = Literal[
    "discovery",            # probing starting KC
    "curriculum_build",     # generating KC graph
    "teaching",             # explaining current KC
    "awaiting_explanation", # waiting for student to explain back
    "validating",           # running mastery validator
    "notes_generation",     # auto-generating note for closed KC
    "complete"              # all KCs mastered or force-advanced
]

FlagType = Literal["struggling", "misconception", "strong", None]


@dataclass
class KCNode:
    id: str
    title: str
    description: str
    prerequisites: List[str]
    order_index: int
    p_learned: float = 0.0
    status: str = "not_started"
    attempt_count: int = 0
    flag_type: FlagType = None
    flag_reason: str = None


class TrekStateB2C(TypedDict):
    # Identity
    user_id: str
    topic_id: str
    topic_title: str
    session_id: str

    # Phase control
    phase: Phase
    current_kc_index: int
    current_kc_id: Optional[str]

    # KC graph
    kc_graph: List[KCNode]      # ordered list, index = order_index
    total_kcs: int

    # Current attempt tracking — CRITICAL for mastery gate
    current_attempt_number: int  # resets to 0 when KC changes (1-based: 1..4)
    max_attempts: int            # always 4
    pass_threshold: float        # attempt 1-2: 0.65, attempt 3: 0.50, attempt 4: force
    last_explanation: Optional[str]
    last_rubric_scores: Optional[dict]
    last_weighted_score: Optional[float]
    last_passed: Optional[bool]

    # BKT
    bkt_state: dict              # {kc_id: p_learned}

    # Context window (assembled by context_builder)
    context_window: List[dict]   # [{role, content}] — max 700 tokens total
    recent_turns: List[dict]     # last 3 turns always included verbatim
    session_summary: Optional[str]

    # Flags accumulated this session
    flags_this_session: List[dict]   # [{kc_id, flag_type, flag_reason}]

    # Notes generated this session
    notes_generated: List[str]   # kc_ids with notes

    # Messages to send to frontend
    pending_message: Optional[str]
    stream_tokens: bool          # always True in production

    # Discovery phase
    discovery_messages: List[dict]
    discovery_complete: bool
    _discovery_profile: Optional[dict]
