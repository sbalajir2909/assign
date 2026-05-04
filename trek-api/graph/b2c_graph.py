"""
LangGraph graph for the Assign B2C trek session.

Node execution order per KC:
  discovery → (END, waits for user)
  → curriculum_build → context_build → teaching → (END, awaiting_explanation)
  → [main.py validates explanation externally, updates state to notes_generation or teaching]
  → notes_generation → context_build → teaching → (END)
  → ... repeat per KC until complete

PostgresSaver is used — sessions persist across server restarts.
MemorySaver is available only via build_b2c_graph_sync() for tests.
"""

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool
from graph.b2c_state import TrekStateB2C
from utils.model_router import get_llm_client


# ── Node implementations ──────────────────────────────────────────────────────

async def discovery_node(state: TrekStateB2C) -> dict:
    from agents.b2c_discovery_agent import run_b2c_discovery
    return await run_b2c_discovery(state)


async def curriculum_node(state: TrekStateB2C) -> dict:
    from agents.b2c_curriculum_agent import run_b2c_curriculum
    return await run_b2c_curriculum(state)


async def context_build_node(state: TrekStateB2C) -> dict:
    from agents.context_builder import build_context
    return await build_context(state)


async def teaching_node(state: TrekStateB2C) -> dict:
    from agents.b2c_teaching_agent import run_teaching
    client = get_llm_client()
    return await run_teaching(state, client)


async def notes_node(state: TrekStateB2C) -> dict:
    from agents.notes_generator import generate_note
    client = get_llm_client()
    return await generate_note(state, client)


# ── Routing functions ─────────────────────────────────────────────────────────

def route_by_phase(state: TrekStateB2C) -> str:
    phase = state.get("phase", "discovery")
    routes = {
        "discovery": "discovery",
        "curriculum_build": "curriculum_build",
        "teaching": "context_build",
        "awaiting_explanation": "context_build",  # non-explanation message re-runs teaching
        "notes_generation": "notes_node",
        "complete": END,
    }
    return routes.get(phase, END)


def after_notes(state: TrekStateB2C) -> str:
    """After note generation, move to next KC (via context_build) or end."""
    if state.get("phase") == "complete":
        return END
    return "context_build"


# ── Graph builder ─────────────────────────────────────────────────────────────

async def build_b2c_graph(conn_string: str):
    """
    Builds and compiles the B2C graph with PostgresSaver backed by a connection pool.
    Returns (compiled_graph, pool) — pool must be closed on app shutdown.

    Raises on any connection or setup failure — do not swallow this error.
    Sessions must persist across restarts; MemorySaver is not an acceptable fallback.
    """
    pool = AsyncConnectionPool(
        conninfo=conn_string,
        max_size=5,
        kwargs={"autocommit": True, "prepare_threshold": 0},
        open=False,
    )
    await pool.open()
    checkpointer = AsyncPostgresSaver(pool)
    await checkpointer.setup()
    print("[b2c_graph] PostgresSaver initialized")

    builder = StateGraph(TrekStateB2C)

    builder.add_node("discovery",       discovery_node)
    builder.add_node("curriculum_build", curriculum_node)
    builder.add_node("context_build",   context_build_node)
    builder.add_node("teaching",        teaching_node)
    builder.add_node("notes_node",      notes_node)

    # Entry: route based on current phase
    builder.add_conditional_edges(START, route_by_phase, {
        "discovery":       "discovery",
        "curriculum_build": "curriculum_build",
        "context_build":   "context_build",
        "notes_node":      "notes_node",
        END:               END,
    })

    # discovery → END (waits for next user message)
    builder.add_edge("discovery", END)

    # curriculum_build → context_build → teaching → END (awaiting explanation)
    builder.add_edge("curriculum_build", "context_build")
    builder.add_edge("context_build", "teaching")
    builder.add_edge("teaching", END)

    # notes_node → context_build (for next KC) OR END (if complete)
    builder.add_conditional_edges("notes_node", after_notes, {
        "context_build": "context_build",
        END: END,
    })

    compiled = builder.compile(checkpointer=checkpointer)
    return compiled, pool


def build_b2c_graph_sync(checkpointer=None):
    """
    Builds a B2C graph with a pre-built checkpointer (for testing or sync contexts).
    """
    if checkpointer is None:
        from langgraph.checkpoint.memory import MemorySaver
        checkpointer = MemorySaver()

    builder = StateGraph(TrekStateB2C)

    builder.add_node("discovery",       discovery_node)
    builder.add_node("curriculum_build", curriculum_node)
    builder.add_node("context_build",   context_build_node)
    builder.add_node("teaching",        teaching_node)
    builder.add_node("notes_node",      notes_node)

    builder.add_conditional_edges(START, route_by_phase, {
        "discovery":       "discovery",
        "curriculum_build": "curriculum_build",
        "context_build":   "context_build",
        "notes_node":      "notes_node",
        END:               END,
    })

    builder.add_edge("discovery", END)
    builder.add_edge("curriculum_build", "context_build")
    builder.add_edge("context_build", "teaching")
    builder.add_edge("teaching", END)
    builder.add_conditional_edges("notes_node", after_notes, {
        "context_build": "context_build",
        END: END,
    })

    return builder.compile(checkpointer=checkpointer)
