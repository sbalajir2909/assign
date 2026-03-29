import os
import uuid
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from graph.graph import build_graph, get_checkpointer
from graph.state import TrekState
from models.schemas import (
    StartSessionRequest, StartSessionResponse,
    MessageRequest, MessageResponse,
    RoadmapResponse, HistoryResponse,
)
from db.roadmaps import get_roadmap, save_roadmap, update_roadmap_concepts
from db.chat_history import get_messages
from db.snapshots import get_snapshot


# ── App lifecycle ────────────────────────────────────────────────────────────

compiled_graph = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global compiled_graph
    checkpointer = get_checkpointer()
    checkpointer.setup()          # Creates LangGraph checkpoint tables in Supabase
    compiled_graph = build_graph(checkpointer)
    yield


app = FastAPI(title="Trek API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helper ───────────────────────────────────────────────────────────────────

def _invoke(session_id: str, state_patch: dict) -> TrekState:
    config = {"configurable": {"thread_id": session_id}}
    result = compiled_graph.invoke(state_patch, config=config)
    return result


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/trek/session", response_model=StartSessionResponse)
def start_session(req: StartSessionRequest):
    """
    Create a new Trek session.
    Returns session_id and the first discovery question.
    """
    session_id = str(uuid.uuid4())

    initial_state: dict = {
        "session_id": session_id,
        "user_id": req.user_id,
        "roadmap_id": None,
        "phase": "discovery",
        "discovery_step": 0,
        "topic": "", "level": "", "goal": "", "time": "",
        "gist": {}, "concepts": [], "sources_hit": [],
        "current_concept_idx": 0,
        "concept_mastered": False,
        "teaching_strategy": "gap_fill",
        "opening_prompt": "",
        "messages": [],
        "last_reply": "",
        "past_snapshots": [],
    }

    result = _invoke(session_id, initial_state)

    return StartSessionResponse(
        session_id=session_id,
        reply=result.get("last_reply", ""),
        phase=result.get("phase", "discovery"),
    )


@app.post("/trek/message", response_model=MessageResponse)
def send_message(req: MessageRequest):
    """
    Send a user message. Automatically routes to the correct agent based on phase.
    Handles: discovery, roadmap generation, planning, memory, teaching.
    """
    config = {"configurable": {"thread_id": req.session_id}}

    # Load current state from checkpoint
    checkpoint = compiled_graph.get_state(config)
    if not checkpoint or not checkpoint.values:
        raise HTTPException(status_code=404, detail="Session not found. Start a new session first.")

    current = checkpoint.values
    phase = current.get("phase", "discovery")

    # Append user message to state
    updated_messages = list(current.get("messages", [])) + [
        {"role": "user", "content": req.message}
    ]

    # Build state patch
    patch: dict = {"messages": updated_messages}

    # If frontend passes updated concepts after gist editing, sync them
    if req.concepts is not None:
        patch["concepts"] = req.concepts

    # If frontend passes roadmap_id (saved on frontend), store it
    if req.roadmap_id:
        patch["roadmap_id"] = req.roadmap_id

    # If in gist phase and user says "approve", move to planning
    if phase == "gist" and req.message.lower() in ("approve", "start", "yes", "go"):
        concepts = current.get("concepts", [])
        updated_concepts = [
            {**c, "status": "current" if i == 0 else "locked"}
            for i, c in enumerate(concepts)
        ]
        patch["concepts"] = updated_concepts
        patch["phase"] = "planning"
        patch["current_concept_idx"] = 0
        patch["messages"] = []

    result = _invoke(req.session_id, patch)

    return MessageResponse(
        reply=result.get("last_reply", ""),
        phase=result.get("phase", phase),
        discovery_step=result.get("discovery_step"),
        roadmap_id=result.get("roadmap_id"),
        gist=result.get("gist"),
        concepts=result.get("concepts"),
        sources_hit=result.get("sources_hit"),
        concept_mastered=result.get("concept_mastered", False),
        current_concept_idx=result.get("current_concept_idx"),
        opening_prompt=result.get("opening_prompt"),
    )


@app.get("/trek/roadmap/{roadmap_id}", response_model=RoadmapResponse)
def fetch_roadmap(roadmap_id: str):
    data = get_roadmap(roadmap_id)
    if not data:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return RoadmapResponse(
        id=data["id"],
        topic=data["topic"],
        gist=data.get("gist", {}),
        concepts=data.get("concepts", []),
        created_at=data["created_at"],
    )


@app.get("/trek/history/{roadmap_id}/concept/{concept_id}", response_model=HistoryResponse)
def fetch_history(roadmap_id: str, concept_id: int):
    messages = get_messages(roadmap_id, concept_id)
    # Also fetch snapshot so frontend can show "previously used example"
    # We need user_id — get it from the roadmap
    roadmap = get_roadmap(roadmap_id)
    snapshot = None
    if roadmap:
        snapshot = get_snapshot(roadmap["user_id"], concept_id)
    return HistoryResponse(messages=messages, snapshot=snapshot)


@app.put("/trek/roadmap/{roadmap_id}/concepts")
def update_concepts(roadmap_id: str, concepts: list):
    """Called when user edits concepts in gist phase."""
    update_roadmap_concepts(roadmap_id, concepts)
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok"}
