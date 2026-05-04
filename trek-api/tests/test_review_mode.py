from types import SimpleNamespace

import pytest

import main
from main import B2CStartRequest


class FakeGraph:
    def __init__(self):
        self.invocations = []

    async def ainvoke(self, state, config=None):
        self.invocations.append((state, config))
        return {
            "pending_message": "let's review hash maps.",
            "phase": "awaiting_explanation",
        }


@pytest.mark.asyncio
async def test_b2c_start_session_review_mode_skips_discovery(monkeypatch):
    fake_graph = FakeGraph()

    async def fake_load_review_kc_state(user_id, kc_id):
        return {
            "kc_id": kc_id,
            "kc_title": "Hash maps",
            "kc_description": "Store key-value pairs for fast lookup.",
            "kc_prerequisites": [],
            "kc_order_index": 3,
            "topic_id": "topic-1",
            "topic_title": "Data Structures",
            "p_learned": 0.92,
            "attempt_count": 2,
            "flag_type": None,
            "flag_reason": None,
        }

    monkeypatch.setattr(main, "b2c_graph", fake_graph)
    monkeypatch.setattr(main, "_load_review_kc_state", fake_load_review_kc_state)

    response = await main.b2c_start_session(
        B2CStartRequest(user_id="user-1", review_kc_id="kc-1")
    )

    assert response["reply"] == "let's review hash maps."
    assert response["phase"] == "awaiting_explanation"
    assert len(fake_graph.invocations) == 1

    state, config = fake_graph.invocations[0]
    assert config["configurable"]["thread_id"] == response["session_id"]
    assert state["phase"] == "teaching"
    assert state["current_kc_id"] == "kc-1"
    assert state["current_kc_index"] == 0
    assert state["total_kcs"] == 1
    assert state["topic_id"] == "topic-1"
    assert state["topic_title"] == "Data Structures"
    assert state["bkt_state"] == {"kc-1": 0.92}
    assert len(state["kc_graph"]) == 1
    assert state["kc_graph"][0].title == "Hash maps"
