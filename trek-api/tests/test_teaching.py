import pytest
from unittest.mock import patch, MagicMock


def _base_state(**kwargs) -> dict:
    state = {
        "session_id": "test", "user_id": "u1", "roadmap_id": "r1",
        "phase": "learning",
        "discovery_step": 4, "topic": "Python", "level": "beginner",
        "goal": "understand", "time": "2 weeks",
        "gist": {}, "sources_hit": [],
        "current_concept_idx": 0,
        "concepts": [{"id": 0, "title": "Variables", "status": "current"}],
        "concept_mastered": False,
        "teaching_strategy": "analogy_first",
        "opening_prompt": "",
        "messages": [{"role": "user", "content": "i think variables store data"}],
        "last_reply": "",
        "past_snapshots": [],
    }
    state.update(kwargs)
    return state


def test_teaching_normal_response():
    from agents.teaching_agent import teaching_agent
    mock_response = MagicMock()
    mock_response.content = "exactly, so what happens when you reassign a variable?"
    with patch("agents.teaching_agent.ChatGroq") as MockLLM:
        MockLLM.return_value.invoke.return_value = mock_response
        result = teaching_agent(_base_state())
    assert result["concept_mastered"] is False
    assert result["phase"] == "learning"
    assert "reassign" in result["last_reply"]


def test_teaching_concept_mastered():
    from agents.teaching_agent import teaching_agent
    mock_response = MagicMock()
    mock_response.content = "clean explanation, you've got this [CONCEPT_MASTERED]"
    with patch("agents.teaching_agent.ChatGroq") as MockLLM:
        MockLLM.return_value.invoke.return_value = mock_response
        result = teaching_agent(_base_state())
    assert result["concept_mastered"] is True
    assert result["phase"] == "memory_save"
    assert "[CONCEPT_MASTERED]" not in result["last_reply"]


def test_teaching_injects_memory():
    from agents.teaching_agent import _build_system_prompt
    snap = {"example_used": "x = 5", "analogy_used": "like a box", "teaching_strategy": "analogy_first", "mastered": True}
    state = _base_state(past_snapshots=[snap])
    prompt = _build_system_prompt(state, "Variables", [snap])
    assert "x = 5" in prompt
    assert "MEMORY" in prompt
