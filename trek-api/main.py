import os
import uuid
import json
from contextlib import asynccontextmanager
from typing import List, Optional
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


# ── Startup env-var validation ────────────────────────────────────────────────

_REQUIRED_ENV_VARS = [
    "GROQ_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TAVILY_API_KEY",
    "DATABASE_URL",
]

def _check_required_env_vars() -> None:
    missing = [v for v in _REQUIRED_ENV_VARS if not os.environ.get(v)]
    if missing:
        raise RuntimeError(
            "Missing required environment variables — server will not start:\n"
            + "\n".join(f"  • {v}" for v in missing)
        )


# ── App lifecycle ─────────────────────────────────────────────────────────────

b2c_graph = None
_b2c_pool = None  # postgres connection pool — closed on shutdown

@asynccontextmanager
async def lifespan(app: FastAPI):
    global b2c_graph, _b2c_pool

    _check_required_env_vars()

    from graph.b2c_graph import build_b2c_graph
    b2c_graph, _b2c_pool = await build_b2c_graph(os.environ["DATABASE_URL"])
    print("[startup] B2C graph initialized (PostgresSaver)")

    yield

    if _b2c_pool:
        try:
            await _b2c_pool.close()
        except Exception:
            pass


app = FastAPI(title="Assign B2C API", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── B2C Endpoints ─────────────────────────────────────────────────────────────

class B2CStartRequest(BaseModel):
    user_id: str

class B2CTrekMessage(BaseModel):
    user_id: str
    topic_id: str
    session_id: str
    message: str
    phase: str  # current phase from frontend state


def _b2c_initial_state(user_id: str, session_id: str) -> dict:
    return {
        "user_id": user_id,
        "topic_id": "",
        "topic_title": "",
        "session_id": session_id,
        "roadmap_id": None,
        "phase": "discovery",
        "ready_for_mastery_check": False,
        "current_kc_index": 0,
        "current_kc_id": None,
        "kc_graph": [],
        "total_kcs": 0,
        "current_attempt_number": 1,
        "max_attempts": 4,
        "pass_threshold": 0.65,
        "last_explanation": None,
        "last_rubric_scores": None,
        "last_weighted_score": None,
        "last_passed": None,
        "bkt_state": {},
        "context_window": [],
        "retrieved_context": [],
        "recent_turns": [],
        "session_summary": None,
        "flags_this_session": [],
        "notes_generated": [],
        "pending_message": None,
        "stream_tokens": True,
        "discovery_messages": [],
        "discovery_complete": False,
        "_discovery_profile": None,
    }


@app.post("/api/b2c/session")
async def b2c_start_session(req: B2CStartRequest):
    """Start a new B2C adaptive learning session."""
    session_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": session_id}}

    initial_state = _b2c_initial_state(req.user_id, session_id)
    result = await b2c_graph.ainvoke(initial_state, config=config)

    return {
        "session_id": session_id,
        "reply": result.get("pending_message", ""),
        "phase": result.get("phase", "discovery"),
    }


@app.post("/api/b2c/message")
async def b2c_message(body: B2CTrekMessage):
    """
    SSE endpoint — receives student message, runs the appropriate B2C agent, streams response.
    """
    config = {"configurable": {"thread_id": body.session_id}}

    from utils.semantic_router import route_intent
    from utils.model_router import get_llm_client

    llm_client = get_llm_client()

    async def generate():
        try:
            intent = await route_intent(body.message, body.phase, llm_client)

            # ── Explanation submitted ────────────────────────────────────────
            if intent == "explanation" and body.phase == "awaiting_explanation":
                checkpoint = await b2c_graph.aget_state(config)
                if not checkpoint or not checkpoint.values:
                    yield f"data: {json.dumps({'type': 'error', 'message': 'Session not found'})}\n\n"
                    return

                state = dict(checkpoint.values)

                updated_state = {
                    **state,
                    "last_explanation": body.message,
                    "phase": "validating",
                }
                recent = list(state.get("recent_turns", []))
                recent.append({"role": "user", "content": body.message})
                updated_state["recent_turns"] = recent[-6:]

                await b2c_graph.aupdate_state(config, updated_state)

                from agents.mastery_validator import validate_explanation
                patch, scores, flag_type = await validate_explanation(updated_state, llm_client)
                await b2c_graph.aupdate_state(config, patch)

                yield f"data: {json.dumps({'type': 'validation_result', 'passed': patch.get('last_passed', False), 'score': round(patch.get('last_weighted_score', 0.0), 2), 'feedback': scores.get('feedback', ''), 'what_was_right': scores.get('what_was_right', ''), 'what_was_wrong': scores.get('what_was_wrong', ''), 'flag_type': flag_type, 'attempt_number': state.get('current_attempt_number', 1), 'next_phase': patch.get('phase', 'teaching')})}\n\n"

                if patch.get("phase") in ("notes_generation", "teaching"):
                    result = await b2c_graph.ainvoke(None, config=config)
                    if result.get("pending_message"):
                        yield f"data: {json.dumps({'type': 'message', 'content': result['pending_message'], 'phase': result.get('phase', 'awaiting_explanation')})}\n\n"

                    if result.get("kc_graph"):
                        kc_summary = [
                            {"id": kc.id, "title": kc.title, "status": kc.status, "p_learned": result.get("bkt_state", {}).get(kc.id, 0.0), "order_index": kc.order_index}
                            for kc in result["kc_graph"]
                        ]
                        yield f"data: {json.dumps({'type': 'kc_graph', 'kc_graph': kc_summary})}\n\n"

            # ── Discovery / other phases ─────────────────────────────────────
            else:
                checkpoint = await b2c_graph.aget_state(config)
                if not checkpoint or not checkpoint.values:
                    yield f"data: {json.dumps({'type': 'error', 'message': 'Session not found'})}\n\n"
                    return

                state = dict(checkpoint.values)
                phase = state.get("phase", "discovery")
                patch: dict = {}

                if phase == "discovery":
                    disc_msgs = list(state.get("discovery_messages", []))
                    disc_msgs.append({"role": "user", "content": body.message})
                    patch["discovery_messages"] = disc_msgs
                else:
                    recent = list(state.get("recent_turns", []))
                    recent.append({"role": "user", "content": body.message})
                    patch["recent_turns"] = recent[-6:]

                await b2c_graph.aupdate_state(config, patch)
                result = await b2c_graph.ainvoke(None, config=config)

                if result.get("pending_message"):
                    yield f"data: {json.dumps({'type': 'message', 'content': result['pending_message'], 'phase': result.get('phase', phase)})}\n\n"

                if result.get("kc_graph"):
                    kc_summary = [
                        {"id": kc.id, "title": kc.title, "status": kc.status, "p_learned": result.get("bkt_state", {}).get(kc.id, 0.0), "order_index": kc.order_index}
                        for kc in result["kc_graph"]
                    ]
                    yield f"data: {json.dumps({'type': 'curriculum_ready', 'topic_id': result.get('topic_id', ''), 'topic_title': result.get('topic_title', ''), 'roadmap_id': result.get('roadmap_id', ''), 'kc_graph': kc_summary})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/b2c/notes/{user_id}")
async def b2c_get_notes(user_id: str):
    from db.client import supabase
    try:
        result = await supabase.table("kc_notes").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/b2c/progress/{user_id}/{topic_id}")
async def b2c_get_progress(user_id: str, topic_id: str):
    from db.client import supabase
    try:
        result = await supabase.table("student_kc_state").select("*").eq("user_id", user_id).eq("topic_id", topic_id).execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/b2c/topics/{user_id}")
async def b2c_get_topics(user_id: str):
    from db.client import supabase
    try:
        result = await supabase.table("topics").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/b2c/state/{session_id}")
async def b2c_get_state(session_id: str):
    config = {"configurable": {"thread_id": session_id}}
    checkpoint = await b2c_graph.aget_state(config)
    if not checkpoint or not checkpoint.values:
        raise HTTPException(status_code=404, detail="Session not found")

    state = checkpoint.values
    kc_graph_summary = []
    if state.get("kc_graph"):
        kc_graph_summary = [
            {"id": kc.id, "title": kc.title, "status": kc.status, "p_learned": state.get("bkt_state", {}).get(kc.id, 0.0), "order_index": kc.order_index, "flag_type": kc.flag_type}
            for kc in state["kc_graph"]
        ]

    return {
        "phase": state.get("phase"),
        "topic_id": state.get("topic_id"),
        "topic_title": state.get("topic_title"),
        "current_kc_index": state.get("current_kc_index", 0),
        "total_kcs": state.get("total_kcs", 0),
        "kc_graph": kc_graph_summary,
        "notes_generated": state.get("notes_generated", []),
        "flags_this_session": state.get("flags_this_session", []),
    }


@app.get("/health")
def health():
    return {"status": "ok", "version": "3.0.0"}
