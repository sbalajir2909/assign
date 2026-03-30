from pydantic import BaseModel
from typing import Optional


class StartSessionRequest(BaseModel):
    user_id: str


class StartSessionResponse(BaseModel):
    session_id: str
    reply: str
    phase: str


class MessageRequest(BaseModel):
    session_id: str
    user_id: str
    message: str
    roadmap_id: Optional[str] = None


class MessageResponse(BaseModel):
    reply: str
    phase: str
    roadmap_id: Optional[str] = None
    gist: Optional[str] = None
    sprint_plan: Optional[dict] = None
    sources_hit: Optional[list] = None
    concept_mastered: bool = False
    current_concept_idx: Optional[int] = None
    current_sprint_idx: Optional[int] = None
    opening_prompt: Optional[str] = None
    visual: Optional[dict] = None
    flag_for_recall: Optional[list] = None
    graph_confidence: Optional[str] = None
    evidence_strength: Optional[str] = None


class RoadmapResponse(BaseModel):
    id: str
    topic: str
    gist: str
    sprint_plan: dict
    sources_hit: list
    created_at: str


class HistoryResponse(BaseModel):
    messages: list
    snapshot: Optional[dict] = None
