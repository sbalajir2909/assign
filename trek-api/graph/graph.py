import os
import json
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool
from graph.state import TrekState


# ── Agent imports ─────────────────────────────────────────────────────────────

from agents.discovery_agent import run_discovery
from agents.curriculum_agent import run_curriculum
from agents.mastery_validator_agent import validate_mastery
from agents.planner_agent import planner_agent
from agents.memory_agent import memory_load_agent, memory_save_agent
from agents.teaching_agent import teaching_agent


# ── Node wrappers ─────────────────────────────────────────────────────────────
# LangGraph nodes must accept state dict and return state dict.
# These wrappers adapt our async agent functions to that interface.

async def discovery_node(state: TrekState) -> dict:
    messages = state.get("discovery_messages", [])
    result = await run_discovery(messages)

    updates = {
        "last_reply": result["reply"],
        "discovery_messages": messages + [
            {"role": "assistant", "content": result["reply"]}
        ],
    }

    if result["discovery_complete"] and result["learner_profile"]:
        profile = result["learner_profile"]
        updates.update({
            "topic": profile.get("topic", ""),
            "exit_condition": profile.get("exit_condition", ""),
            "knowledge_baseline": profile.get("knowledge_baseline", {}),
            "available_hours": profile.get("available_hours", 10.0),
            "context": profile.get("context", ""),
            "phase": "generation",
        })
    
    return updates


async def curriculum_node(state: TrekState) -> dict:
    learner_profile = {
        "topic": state["topic"],
        "exit_condition": state["exit_condition"],
        "knowledge_baseline": state["knowledge_baseline"],
        "available_hours": state["available_hours"],
        "context": state.get("context", ""),
    }

    result = await run_curriculum(learner_profile)

    if result.get("error"):
        return {
            "last_reply": "something went wrong building your course. let's try again.",
            "phase": "discovery",
        }

    return {
        "gist": result["gist"],
        "sprint_plan": result["sprint_plan"],
        "validated_nodes": result["validated_nodes"],
        "sources_hit": result["sources_hit"],
        "graph_confidence": result["graph_confidence"],
        "evidence_strength": result["evidence_strength"],
        "last_reply": result["gist"],
        "phase": "gist",
        "current_concept_idx": 0,
        "current_sprint_idx": 0,
        "concept_attempt_count": 0,
        "flag_for_recall": [],
    }


async def mastery_check_node(state: TrekState) -> dict:
    messages = state.get("messages", [])
    if not messages:
        return {"concept_mastered": False}

    # Get the last user message as the explanation to evaluate
    user_messages = [m for m in messages if m["role"] == "user"]
    if not user_messages:
        return {"concept_mastered": False}

    learner_explanation = user_messages[-1]["content"]
    attempt_number = state.get("concept_attempt_count", 1)

    # Get current concept
    validated_nodes = state.get("validated_nodes", [])
    current_idx = state.get("current_concept_idx", 0)
    concept = validated_nodes[current_idx] if current_idx < len(validated_nodes) else {}

    result = await validate_mastery(
        concept=concept,
        conversation=messages,
        learner_explanation=learner_explanation,
        attempt_number=attempt_number,
    )

    updates = {
        "last_mastery_result": result,
        "concept_mastered": result["verdict"] == "MASTERED",
        "concept_attempt_count": attempt_number + 1,
    }

    # Track concepts flagged for recall
    if result.get("flag_for_recall"):
        flagged = state.get("flag_for_recall", [])
        flagged.append(concept.get("id", ""))
        updates["flag_for_recall"] = flagged

    return updates


# ── Router functions ──────────────────────────────────────────────────────────

def _route(state: TrekState) -> str:
    phase = state.get("phase", "discovery")
    routes = {
        "discovery":     "discovery",
        "generation":    "curriculum",
        "planning":      "planner",
        "memory_load":   "memory_load",
        "learning":      "teaching",
        "mastery_check": "mastery_check",
        "memory_save":   "memory_save",
    }
    return routes.get(phase, "discovery")


def _after_teaching(state: TrekState) -> str:
    return "mastery_check"


def _after_mastery(state: TrekState) -> str:
    if state.get("concept_mastered"):
        return "memory_save"
    return "end"


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_graph(checkpointer: PostgresSaver) -> StateGraph:
    graph = StateGraph(TrekState)

    # Register nodes
    graph.add_node("discovery",     discovery_node)
    graph.add_node("curriculum",    curriculum_node)
    graph.add_node("planner",       planner_agent)
    graph.add_node("memory_load",   memory_load_agent)
    graph.add_node("teaching",      teaching_agent)
    graph.add_node("mastery_check", mastery_check_node)
    graph.add_node("memory_save",   memory_save_agent)

    # Entry point
    graph.add_conditional_edges(START, _route, {
        "discovery":     "discovery",
        "curriculum":    "curriculum",
        "planner":       "planner",
        "memory_load":   "memory_load",
        "teaching":      "teaching",
        "mastery_check": "mastery_check",
        "memory_save":   "memory_save",
    })

    # Planner → memory_load → teaching
    graph.add_edge("planner",     "memory_load")
    graph.add_edge("memory_load", "teaching")

    # Teaching → mastery check
    graph.add_conditional_edges("teaching", _after_teaching, {
        "mastery_check": "mastery_check",
    })

    # Mastery check → save or end
    graph.add_conditional_edges("mastery_check", _after_mastery, {
        "memory_save": "memory_save",
        "end":         END,
    })

    # Terminal nodes
    graph.add_edge("discovery",   END)
    graph.add_edge("curriculum",  END)
    graph.add_edge("memory_save", END)

    return graph.compile(checkpointer=checkpointer)


def get_checkpointer() -> PostgresSaver:
    conn_str = os.environ["SUPABASE_DB_CONNECTION_STRING"]
    pool = ConnectionPool(
        conninfo=conn_str,
        max_size=20,
        kwargs={"autocommit": True, "prepare_threshold": 0},
        open=False,
    )
    pool.open()
    return PostgresSaver(pool)
