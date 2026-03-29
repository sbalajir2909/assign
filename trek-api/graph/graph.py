import os
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres import PostgresSaver
from graph.state import TrekState
from agents.discovery_agent import discovery_agent
from agents.curriculum_agent import curriculum_agent
from agents.planner_agent import planner_agent
from agents.memory_agent import memory_load_agent, memory_save_agent
from agents.teaching_agent import teaching_agent


def _route(state: TrekState) -> str:
    """Conditional router — decides which node to run based on current phase."""
    phase = state.get("phase", "discovery")
    routes = {
        "discovery":    "discovery",
        "generation":   "curriculum",
        "planning":     "planner",
        "memory_load":  "memory_load",
        "learning":     "teaching",
        "memory_save":  "memory_save",
    }
    return routes.get(phase, "discovery")


def build_graph(checkpointer: PostgresSaver) -> StateGraph:
    graph = StateGraph(TrekState)

    # Register nodes
    graph.add_node("discovery",   discovery_agent)
    graph.add_node("curriculum",  curriculum_agent)
    graph.add_node("planner",     planner_agent)
    graph.add_node("memory_load", memory_load_agent)
    graph.add_node("teaching",    teaching_agent)
    graph.add_node("memory_save", memory_save_agent)

    # Entry: route based on current phase
    graph.add_conditional_edges(START, _route, {
        "discovery":   "discovery",
        "curriculum":  "curriculum",
        "planner":     "planner",
        "memory_load": "memory_load",
        "teaching":    "teaching",
        "memory_save": "memory_save",
    })

    # After planner → memory_load → teaching (chained within one invocation)
    graph.add_edge("planner",     "memory_load")
    graph.add_edge("memory_load", "teaching")

    # After teaching: either save memory (if mastered) or END
    graph.add_conditional_edges("teaching", _after_teaching, {
        "memory_save": "memory_save",
        "end":         END,
    })

    # All other nodes end after running
    graph.add_edge("discovery",   END)
    graph.add_edge("curriculum",  END)
    graph.add_edge("memory_save", END)

    return graph.compile(checkpointer=checkpointer)


def _after_teaching(state: TrekState) -> str:
    return "memory_save" if state.get("concept_mastered") else "end"


def get_checkpointer():
    conn_str = os.environ["SUPABASE_DB_CONNECTION_STRING"]
    # Returns a context manager — must be used with `with` in the caller
    return PostgresSaver.from_conn_string(conn_str)
