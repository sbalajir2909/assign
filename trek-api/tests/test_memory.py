import pytest
from unittest.mock import patch, MagicMock
from agents.memory_agent import memory_load_agent, memory_save_agent, _extract_example, _extract_analogy


def _base_state(**kwargs) -> dict:
    state = {
        "session_id": "test", "user_id": "u1", "roadmap_id": "r1",
        "phase": "memory_load",
        "discovery_step": 4, "topic": "Python", "level": "beginner",
        "goal": "understand", "time": "2 weeks",
        "gist": {}, "sources_hit": [],
        "current_concept_idx": 0,
        "concepts": [{"id": 0, "title": "Variables", "status": "current"}],
        "concept_mastered": False,
        "teaching_strategy": "analogy_first", "opening_prompt": "",
        "messages": [], "last_reply": "", "past_snapshots": [],
    }
    state.update(kwargs)
    return state


def test_memory_load_no_snapshot():
    with patch("agents.memory_agent.get_snapshot", return_value=None):
        result = memory_load_agent(_base_state())
    assert result["past_snapshots"] == []
    assert result["phase"] == "learning"


def test_memory_load_with_snapshot():
    snap = {"example_used": "x = 5", "analogy_used": "like a box", "mastered": True}
    with patch("agents.memory_agent.get_snapshot", return_value=snap):
        result = memory_load_agent(_base_state())
    assert result["past_snapshots"] == [snap]


def test_extract_example_backtick():
    assert _extract_example("use `x = 5` to store a value") == "x = 5"


def test_extract_analogy():
    assert "like a" in _extract_analogy("think of it like a labeled box")


def test_memory_save_advances_concept():
    state = _base_state(
        concept_mastered=True,
        concepts=[
            {"id": 0, "title": "Variables", "status": "current"},
            {"id": 1, "title": "Loops", "status": "locked"},
        ],
        last_reply="use `x = 5` like a box to store values",
    )
    with patch("agents.memory_agent.save_snapshot"), patch("agents.memory_agent.save_message"):
        result = memory_save_agent(state)
    assert result["current_concept_idx"] == 1
    assert result["phase"] == "planning"
    done = [c for c in result["concepts"] if c["title"] == "Variables"]
    assert done[0]["status"] == "done"
