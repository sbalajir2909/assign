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
    # Optional: frontend can pass these to override state
    concepts: Optional[list] = None         # updated concept list after gist editing
    roadmap_id: Optional[str] = None        # set after roadmap is saved on frontend


class MessageResponse(BaseModel):
    reply: str
    phase: str
    discovery_step: Optional[int] = None
    roadmap_id: Optional[str] = None
    gist: Optional[dict] = None
    concepts: Optional[list] = None
    sources_hit: Optional[list] = None
    concept_mastered: bool = False
    current_concept_idx: Optional[int] = None
    opening_prompt: Optional[str] = None


class RoadmapResponse(BaseModel):
    id: str
    topic: str
    gist: dict
    concepts: list
    created_at: str


class HistoryResponse(BaseModel):
    messages: list
    snapshot: Optional[dict] = None
