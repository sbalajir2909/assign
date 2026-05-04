import os
import uuid
import json
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import List, Optional
from psycopg.rows import dict_row
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
    "CF_ACCOUNT_ID",
    "CF_API_TOKEN",
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


# ── Syllabus extraction ───────────────────────────────────────────────────────

async def _extract_syllabus_topics(syllabus_base64: str, mime_type: str) -> Optional[list]:
    """
    Calls Cloudflare AI LLaVA to extract topic structure from an uploaded syllabus image.
    Returns a list of topic dicts on success, None on any failure.
    The raw file bytes are never stored — only the parsed JSON is returned.
    """
    import base64 as _b64
    import httpx
    import json as _json

    cf_account = os.environ.get("CF_ACCOUNT_ID", "")
    cf_token = os.environ.get("CF_API_TOKEN", "")
    if not cf_account or not cf_token:
        return None

    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{cf_account}"
        "/ai/run/@cf/llava-hf/llava-1.5-7b-hf"
    )

    try:
        image_bytes = _b64.b64decode(syllabus_base64)
        # LLaVA on Workers AI accepts the image as an array of uint8 byte values
        image_array = list(image_bytes)
    except Exception as exc:
        print(f"[syllabus] base64 decode failed: {exc}")
        return None

    prompt = (
        "Extract the list of topics, chapters, or learning objectives from this syllabus in order. "
        'Return JSON only: {"topics": [{"title": "string", "subtopics": ["string"], "week_or_order": 1}]}'
    )

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {cf_token}",
                    "Content-Type": "application/json",
                },
                json={"image": image_array, "prompt": prompt, "max_tokens": 1024},
            )

        if resp.status_code != 200:
            print(f"[syllabus] CF AI returned {resp.status_code}: {resp.text[:300]}")
            return None

        body = resp.json()
        if not body.get("success"):
            print(f"[syllabus] CF AI not successful: {body.get('errors', [])}")
            return None

        result_text = (body.get("result") or {}).get("description", "") or ""

        # Extract the JSON object from the model's response text
        start = result_text.find("{")
        end = result_text.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = _json.loads(result_text[start:end])
            topics = parsed.get("topics")
            if topics and isinstance(topics, list):
                print(f"[syllabus] Extracted {len(topics)} topic(s) from syllabus")
                return topics

        print(f"[syllabus] Could not parse topics from response: {result_text[:300]}")
        return None

    except Exception as exc:
        print(f"[syllabus] Extraction error: {exc}")
        return None


# ── Learning profile helpers ──────────────────────────────────────────────────

async def _derive_learning_style_hint(user_id: str, topic_id: str) -> Optional[str]:
    """
    Reads the last 20 interaction_log rows for (user, topic).
    Returns a hint string describing the student's learning pattern, or None.
    """
    from db.client import supabase
    try:
        result = await supabase.table("interaction_log") \
            .select("attempt_number, passed, explanation_text, force_advanced") \
            .eq("user_id", user_id) \
            .eq("topic_id", topic_id) \
            .order("created_at", desc=True) \
            .limit(20) \
            .execute()
        rows = result.data or []
    except Exception as e:
        print(f"[learning_profile] Failed to read interaction_log: {e}")
        return None

    if not rows:
        return None

    total = len(rows)
    passed_on_1 = sum(1 for r in rows if r.get("attempt_number") == 1 and r.get("passed"))
    passed_on_2 = sum(1 for r in rows if r.get("attempt_number") == 2 and r.get("passed"))
    passed_late = sum(1 for r in rows if r.get("attempt_number", 0) >= 3 and r.get("passed"))
    force_advanced = sum(1 for r in rows if r.get("force_advanced"))

    # Keyword heuristics on explanation text
    code_keywords = ("```", "def ", "for ", "if ", "import ", "print(", "->", "=>")
    code_count = sum(
        1 for r in rows
        if any(kw in (r.get("explanation_text") or "") for kw in code_keywords)
    )

    # Classify
    if (passed_on_1 + passed_on_2) >= max(total // 2, 1):
        if code_count >= total // 3:
            return "learns_fast_with_code"
        return "learns_fast"
    if passed_late >= total // 3 or force_advanced >= total // 4:
        return "needs_repetition"
    if code_count < total // 4:
        return "needs_analogies"
    return None


async def _upsert_learning_profile(user_id: str, kc_title: str, flag_type: Optional[str]) -> None:
    """Updates user_learning_profiles based on mastery outcome."""
    if flag_type not in ("struggling", "strong"):
        return
    from db.client import supabase
    try:
        col = "weak_areas" if flag_type == "struggling" else "strong_areas"
        existing = await supabase.table("user_learning_profiles") \
            .select(col) \
            .eq("user_id", user_id) \
            .maybe_single() \
            .execute()
        current: list = []
        if existing.data:
            current = existing.data.get(col) or []
        if kc_title not in current:
            current.append(kc_title)
        await supabase.table("user_learning_profiles").upsert(
            {"user_id": user_id, col: current},
            on_conflict="user_id",
        ).execute()
    except Exception as e:
        print(f"[learning_profile] Failed to upsert {flag_type} area '{kc_title}': {e}")


# ── B2C Endpoints ─────────────────────────────────────────────────────────────

class B2CStartRequest(BaseModel):
    user_id: str
    syllabus_base64: Optional[str] = None
    syllabus_mime_type: Optional[str] = None
    review_kc_id: Optional[str] = None

class B2CTrekMessage(BaseModel):
    user_id: str
    topic_id: str
    session_id: str
    message: str
    phase: str  # current phase from frontend state


def _b2c_initial_state(user_id: str, session_id: str, syllabus_topics: Optional[list] = None) -> dict:
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
        "unlock_next_concepts_enabled": False,
        "discovery_messages": [],
        "discovery_complete": False,
        "_discovery_profile": None,
        "learning_style_hint": None,
        "syllabus_topics": syllabus_topics,
    }


async def _load_review_kc_state(user_id: str, kc_id: str) -> Optional[dict]:
    """
    Loads the minimum topic + KC state needed to start a one-KC review session.
    """
    if not _b2c_pool:
        raise RuntimeError("B2C pool not initialized")

    query = """
        SELECT
            kc.id AS kc_id,
            kc.title AS kc_title,
            kc.description AS kc_description,
            kc.prerequisites AS kc_prerequisites,
            kc.order_index AS kc_order_index,
            t.id AS topic_id,
            t.title AS topic_title,
            skc.p_learned,
            skc.attempt_count,
            skc.flag_type,
            skc.flag_reason
        FROM student_kc_state skc
        JOIN knowledge_components kc ON skc.kc_id = kc.id
        JOIN topics t ON skc.topic_id = t.id
        WHERE skc.user_id = %s
          AND kc.id = %s
          AND t.user_id = %s
        LIMIT 1
    """
    async with _b2c_pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(query, (user_id, kc_id, user_id))
            return await cur.fetchone()


async def _fetch_due_review_kcs(user_id: str) -> dict:
    """
    Returns due review KCs plus total due count for the dashboard/review page.
    """
    if not _b2c_pool:
        raise RuntimeError("B2C pool not initialized")

    query = """
        SELECT
            skc.kc_id,
            kc.title AS kc_title,
            kc.topic_id,
            t.title AS topic_title,
            skc.sm2_next_review,
            skc.sm2_interval,
            COUNT(*) OVER() AS due_count
        FROM student_kc_state skc
        JOIN knowledge_components kc ON skc.kc_id = kc.id
        JOIN topics t ON skc.topic_id = t.id
        WHERE skc.user_id = %s
          AND skc.status = 'mastered'
          AND skc.sm2_next_review IS NOT NULL
          AND skc.sm2_next_review <= NOW()
        ORDER BY skc.sm2_next_review ASC
        LIMIT 20
    """

    async with _b2c_pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(query, (user_id,))
            rows = await cur.fetchall()

    due_count = int(rows[0]["due_count"]) if rows else 0
    now = datetime.now(timezone.utc)
    kcs = []
    for row in rows:
        next_review = row["sm2_next_review"]
        if next_review.tzinfo is None:
            next_review = next_review.replace(tzinfo=timezone.utc)
        overdue_days = max(0, (now.date() - next_review.date()).days)
        kcs.append({
            "kc_id": row["kc_id"],
            "kc_title": row["kc_title"],
            "topic_title": row["topic_title"],
            "topic_id": row["topic_id"],
            "days_overdue": overdue_days,
            "sm2_interval": row["sm2_interval"],
        })

    return {"due_count": due_count, "kcs": kcs}


@app.post("/api/b2c/session")
async def b2c_start_session(req: B2CStartRequest):
    """Start a new B2C adaptive learning session."""
    session_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": session_id}}

    if req.review_kc_id:
        from graph.b2c_state import KCNode

        review_row = await _load_review_kc_state(req.user_id, req.review_kc_id)
        if not review_row:
            raise HTTPException(status_code=404, detail="Review concept not found")

        initial_state = _b2c_initial_state(req.user_id, session_id)
        review_kc = KCNode(
            id=review_row["kc_id"],
            title=review_row["kc_title"],
            description=review_row["kc_description"] or "",
            prerequisites=[str(p) for p in (review_row["kc_prerequisites"] or [])],
            order_index=review_row["kc_order_index"] or 0,
            p_learned=review_row["p_learned"] or 0.0,
            status="in_progress",
            attempt_count=review_row["attempt_count"] or 0,
            flag_type=review_row["flag_type"],
            flag_reason=review_row["flag_reason"],
        )
        initial_state.update({
            "topic_id": review_row["topic_id"],
            "topic_title": review_row["topic_title"],
            "phase": "teaching",
            "current_kc_index": 0,
            "current_kc_id": review_row["kc_id"],
            "kc_graph": [review_kc],
            "total_kcs": 1,
            "bkt_state": {
                review_row["kc_id"]: review_row["p_learned"] or 0.0,
            },
            "flags_this_session": (
                [{
                    "kc_id": review_row["kc_id"],
                    "kc_title": review_row["kc_title"],
                    "flag_type": review_row["flag_type"],
                    "flag_reason": review_row["flag_reason"],
                }]
                if review_row["flag_type"] else []
            ),
        })
        result = await b2c_graph.ainvoke(initial_state, config=config)
        return {
            "session_id": session_id,
            "reply": result.get("pending_message", ""),
            "phase": result.get("phase", "teaching"),
        }

    # Extract syllabus structure before creating the session.
    # Raw bytes are never stored — only the parsed topic list.
    syllabus_topics = None
    if req.syllabus_base64:
        print("[syllabus] Extracting topics from uploaded syllabus...")
        syllabus_topics = await _extract_syllabus_topics(
            req.syllabus_base64,
            req.syllabus_mime_type or "image/png",
        )
        if not syllabus_topics:
            print("[syllabus] Extraction failed — continuing without syllabus")

    initial_state = _b2c_initial_state(req.user_id, session_id, syllabus_topics=syllabus_topics)
    result = await b2c_graph.ainvoke(initial_state, config=config)

    return {
        "session_id": session_id,
        "reply": result.get("pending_message", ""),
        "phase": result.get("phase", "discovery"),
        "syllabus_extracted": syllabus_topics is not None,
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

                # Derive learning style hint from interaction history and merge into patch.
                hint = await _derive_learning_style_hint(
                    updated_state["user_id"], updated_state["topic_id"]
                )
                if hint:
                    patch["learning_style_hint"] = hint

                # If KC was mastered/force-advanced, update the long-term profile.
                if patch.get("last_passed") and flag_type in ("struggling", "strong"):
                    kc = next(
                        (k for k in updated_state["kc_graph"] if k.id == updated_state["current_kc_id"]),
                        None,
                    )
                    if kc:
                        await _upsert_learning_profile(
                            updated_state["user_id"], kc.title, flag_type
                        )

                await b2c_graph.aupdate_state(config, patch)

                yield f"data: {json.dumps({'type': 'validation_result', 'passed': patch.get('last_passed', False), 'score': round(patch.get('last_weighted_score', 0.0), 2), 'feedback': scores.get('feedback', ''), 'what_was_right': scores.get('what_was_right', ''), 'what_was_wrong': scores.get('what_was_wrong', ''), 'flag_type': flag_type, 'attempt_number': state.get('current_attempt_number', 1), 'next_phase': patch.get('phase', 'teaching')})}\n\n"

                # Consolidation message — highest retention leverage point.
                # Only when the student actually passed (mastery or force-advance).
                if patch.get("last_passed"):
                    from agents.consolidation_agent import generate_consolidation
                    try:
                        consolidation = await generate_consolidation(updated_state, llm_client)
                        yield f"data: {json.dumps({'type': 'consolidation', 'content': consolidation})}\n\n"
                    except Exception as e:
                        print(f"[consolidation] Failed to generate: {e}")

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
                    await b2c_graph.aupdate_state(config, patch)
                else:
                    recent = list(state.get("recent_turns", []))
                    recent.append({"role": "user", "content": body.message})
                    patch["recent_turns"] = recent[-6:]

                # For discovery, persist the appended user turn, but also pass
                # it into ainvoke so this run sees it even with PostgresSaver.
                result = await b2c_graph.ainvoke(patch, config=config)

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


@app.get("/api/b2c/review/{user_id}")
async def b2c_get_review_due(user_id: str):
    try:
        return await _fetch_due_review_kcs(user_id)
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
