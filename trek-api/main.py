import os
import uuid
from contextlib import asynccontextmanager
from typing import List
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from graph.graph import build_graph, get_checkpointer
from graph.state import TrekState
from models.schemas import (
    StartSessionRequest, StartSessionResponse,
    MessageRequest, MessageResponse,
    RoadmapResponse, HistoryResponse,
)
from db.roadmaps import get_roadmap, update_roadmap_concepts
from db.chat_history import get_messages
from db.snapshots import get_snapshot
from agents.visualizer_agent import run_visualizer


class ConceptsUpdate(BaseModel):
    concepts: List[dict]


# ── App lifecycle ─────────────────────────────────────────────────────────────

compiled_graph = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global compiled_graph
    checkpointer = await get_checkpointer()
    try:
        await checkpointer.setup()
    except Exception as e:
        print(f"Checkpointer setup warning (tables may already exist): {e}")
    compiled_graph = build_graph(checkpointer)
    yield

app = FastAPI(title="Trek API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helper ────────────────────────────────────────────────────────────────────

async def _invoke(session_id: str, state_patch: dict) -> TrekState:
    config = {"configurable": {"thread_id": session_id}}
    result = await compiled_graph.ainvoke(state_patch, config=config)
    return result


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/trek/session", response_model=StartSessionResponse)
async def start_session(req: StartSessionRequest):
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

        # Learner profile
        "topic": "",
        "exit_condition": "",
        "knowledge_baseline": {},
        "available_hours": 0.0,
        "context": "",
        "discovery_messages": [],

        # Course content
        "gist": "",
        "sprint_plan": {},
        "validated_nodes": [],
        "sources_hit": [],
        "graph_confidence": "",
        "evidence_strength": "",

        # Progress
        "current_concept_idx": 0,
        "current_sprint_idx": 0,
        "concept_mastered": False,
        "concept_attempt_count": 0,
        "flag_for_recall": [],
        "teaching_strategy": "gap_fill",
        "opening_prompt": "",
        "last_mastery_result": {},

        # Chat
        "messages": [],
        "last_reply": "",
        "past_snapshots": [],
    }

    result = await _invoke(session_id, initial_state)

    return StartSessionResponse(
        session_id=session_id,
        reply=result.get("last_reply", ""),
        phase=result.get("phase", "discovery"),
    )


@app.post("/trek/message", response_model=MessageResponse)
async def send_message(req: MessageRequest):
    """
    Send a user message.
    Routes automatically to the correct agent based on current phase.
    """
    config = {"configurable": {"thread_id": req.session_id}}

    # Load current state
    checkpoint = await compiled_graph.aget_state(config)
    if not checkpoint or not checkpoint.values:
        raise HTTPException(
            status_code=404,
            detail="Session not found. Start a new session first."
        )

    current = checkpoint.values
    phase = current.get("phase", "discovery")

    # Build state patch
    patch: dict = {}

    if req.roadmap_id:
        patch["roadmap_id"] = req.roadmap_id

    # ── Discovery phase ───────────────────────────────────────────────────────
    if phase == "discovery":
        discovery_messages = list(current.get("discovery_messages", []))
        discovery_messages.append({"role": "user", "content": req.message})
        patch["discovery_messages"] = discovery_messages

    # ── Gist phase — user approves or edits ───────────────────────────────────
    elif phase == "gist":
        approval_words = ("approve", "start", "yes", "go", "looks good",
                          "let's go", "lets go", "perfect", "good")
        if any(w in req.message.lower() for w in approval_words):
            patch["phase"] = "planning"
            patch["current_concept_idx"] = 0
            patch["current_sprint_idx"] = 0
            patch["concept_attempt_count"] = 0
            patch["messages"] = []
        else:
            # User is asking a question or requesting changes
            discovery_messages = list(current.get("discovery_messages", []))
            discovery_messages.append({"role": "user", "content": req.message})
            patch["discovery_messages"] = discovery_messages

    # ── Learning phase ────────────────────────────────────────────────────────
    elif phase in ("planning", "memory_load", "learning", "mastery_check", "memory_save"):
        updated_messages = list(current.get("messages", [])) + [
            {"role": "user", "content": req.message}
        ]
        patch["messages"] = updated_messages
        patch["phase"] = "learning"

    result = await _invoke(req.session_id, patch)

    # ── Visualizer — fire after teaching responses ─────────────────────────────
    visual = None
    result_phase = result.get("phase", phase)

    if result_phase == "learning":
        validated_nodes = result.get("validated_nodes", [])
        current_idx = result.get("current_concept_idx", 0)
        concept = (
            validated_nodes[current_idx]
            if current_idx < len(validated_nodes)
            else {}
        )
        if concept:
            try:
                visual_result = await run_visualizer(
                    concept=concept,
                    conversation=result.get("messages", []),
                )
                if visual_result.get("should_visualize"):
                    visual = {
                        "type": visual_result["visual_type"],
                        "subtype": visual_result["visual_subtype"],
                        "code": visual_result["code"],
                        "confidence": visual_result["confidence"],
                    }
            except Exception:
                visual = None

    return MessageResponse(
        reply=result.get("last_reply", ""),
        phase=result_phase,
        roadmap_id=result.get("roadmap_id"),
        gist=result.get("gist"),
        sprint_plan=result.get("sprint_plan"),
        sources_hit=result.get("sources_hit"),
        concept_mastered=result.get("concept_mastered", False),
        current_concept_idx=result.get("current_concept_idx"),
        current_sprint_idx=result.get("current_sprint_idx"),
        opening_prompt=result.get("opening_prompt"),
        visual=visual,
        flag_for_recall=result.get("flag_for_recall"),
        graph_confidence=result.get("graph_confidence"),
        evidence_strength=result.get("evidence_strength"),
    )


@app.get("/trek/roadmap/{roadmap_id}", response_model=RoadmapResponse)
async def fetch_roadmap(roadmap_id: str):
    data = get_roadmap(roadmap_id)
    if not data:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return RoadmapResponse(
        id=data["id"],
        topic=data["topic"],
        gist=data.get("gist", ""),
        sprint_plan=data.get("sprint_plan", {}),
        sources_hit=data.get("sources_hit", []),
        created_at=data["created_at"],
    )


@app.get("/trek/history/{roadmap_id}/concept/{concept_id}",
         response_model=HistoryResponse)
async def fetch_history(roadmap_id: str, concept_id: int):
    messages = get_messages(roadmap_id, concept_id)
    roadmap = get_roadmap(roadmap_id)
    snapshot = None
    if roadmap:
        snapshot = get_snapshot(roadmap["user_id"], concept_id)
    return HistoryResponse(messages=messages, snapshot=snapshot)


@app.put("/trek/roadmap/{roadmap_id}/concepts")
async def update_concepts(roadmap_id: str, body: ConceptsUpdate):
    update_roadmap_concepts(roadmap_id, body.concepts)
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}
