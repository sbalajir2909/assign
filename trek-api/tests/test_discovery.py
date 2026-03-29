import pytest
from agents.discovery_agent import discovery_agent, DISCOVERY_QUESTIONS


def _state(step: int, message: str = "") -> dict:
    return {
        "session_id": "test", "user_id": "u1", "roadmap_id": None,
        "phase": "discovery", "discovery_step": step,
        "topic": "", "level": "", "goal": "", "time": "",
        "gist": {}, "concepts": [], "sources_hit": [],
        "current_concept_idx": 0, "concept_mastered": False,
        "teaching_strategy": "gap_fill", "opening_prompt": "",
        "messages": [{"role": "user", "content": message}] if message else [],
        "last_reply": "", "past_snapshots": [],
    }


def test_first_question():
    result = discovery_agent(_state(0))
    assert result["last_reply"] == DISCOVERY_QUESTIONS[0]
    assert result["discovery_step"] == 1


def test_second_question_stores_topic():
    result = discovery_agent(_state(1, "Python"))
    assert result["topic"] == "Python"
    assert result["last_reply"] == DISCOVERY_QUESTIONS[1]
    assert result["discovery_step"] == 2


def test_all_answered_transitions_to_generation():
    result = discovery_agent(_state(4, "2 weeks"))
    assert result["phase"] == "generation"
