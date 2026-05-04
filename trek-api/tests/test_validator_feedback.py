import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from agents import mastery_validator as mv
from graph.b2c_state import KCNode
from utils import interaction_logger as il


class _FakeResult:
    def __init__(self, data=None):
        self.data = data


class _FakeInteractionTable:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.mode = None
        self.limit_value = None
        self.inserts = []

    def select(self, *args, **kwargs):
        self.mode = "select"
        return self

    def eq(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, value):
        self.limit_value = value
        return self

    def insert(self, payload):
        self.mode = "insert"
        self.inserts.append(payload)
        return self

    async def execute(self):
        if self.mode == "select":
            rows = list(self.rows)
            if self.limit_value is not None:
                rows = rows[:self.limit_value]
            return _FakeResult(rows)
        return _FakeResult()


class _FakeSupabase:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return self.tables[name]


def _make_state(**overrides):
    kc = KCNode(
        id="kc-1",
        title="Recursion",
        description="A function that calls itself with a base case.",
        prerequisites=[],
        order_index=0,
    )
    base = {
        "kc_graph": [kc],
        "current_kc_id": "kc-1",
        "current_attempt_number": 2,
        "last_explanation": "It keeps calling itself until a base case stops it.",
        "user_id": "user-1",
        "topic_id": "topic-1",
        "bkt_state": {},
        "flags_this_session": [],
    }
    return {**base, **overrides}


def _mock_client(raw_json: str):
    client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = raw_json
    client.chat.completions.create = AsyncMock(return_value=mock_resp)
    return client


@pytest.mark.asyncio
async def test_load_previous_feedback_parses_quality_label_json(monkeypatch):
    interaction_rows = [
        {
            "quality_label": json.dumps({
                "feedback": "You got the self-call right, but explain the base case.",
                "what_was_wrong": "You did not explain the base case.",
            })
        },
        {
            "quality_label": json.dumps({
                "feedback": "You described what happens, but not why it stops.",
                "what_was_wrong": "Explain why the base case stops the recursion.",
            })
        },
    ]
    fake_supabase = _FakeSupabase({
        "interaction_log": _FakeInteractionTable(rows=interaction_rows),
    })
    monkeypatch.setattr(mv, "supabase", fake_supabase)

    feedback = await mv._load_previous_feedback("user-1", "kc-1")

    assert feedback == [
        "You did not explain the base case.",
        "You got the self-call right, but explain the base case.",
        "Explain why the base case stops the recursion.",
        "You described what happens, but not why it stops.",
    ]


@pytest.mark.asyncio
async def test_validate_explanation_includes_previous_feedback_in_prompt(monkeypatch):
    monkeypatch.setattr(mv, "_load_previous_feedback", AsyncMock(return_value=[
        "You did not explain the base case.",
        "Explain why the base case stops the recursion.",
    ]))
    monkeypatch.setattr(mv, "_load_bkt_row", AsyncMock(return_value={
        "p_learned": 0.2,
        "p_transit": 0.1,
        "p_slip": 0.1,
        "p_guess": 0.2,
        "attempt_count": 1,
        "sm2_easiness": 2.5,
        "sm2_interval": 1,
        "sm2_repetitions": 0,
    }))
    monkeypatch.setattr(mv, "_upsert_bkt_row", AsyncMock())
    monkeypatch.setattr(mv, "log_interaction", AsyncMock())
    monkeypatch.setattr(mv, "update_bkt", lambda **kwargs: 0.4)

    client = _mock_client(json.dumps({
        "core_accuracy": 0.7,
        "own_words": 0.8,
        "depth": 0.5,
        "feedback": "You explained the self-call well. Next, be explicit about the base case.",
        "what_was_right": "You said the function keeps calling itself.",
        "what_was_wrong": "Explain why the base case stops the recursion.",
    }))

    await mv.validate_explanation(_make_state(), client)

    prompt = client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
    assert "Previous feedback already given:" in prompt
    assert "You did not explain the base case." in prompt
    assert "Do not repeat any of these points." in prompt


@pytest.mark.asyncio
async def test_log_interaction_persists_feedback_payload_in_quality_label(monkeypatch):
    fake_table = _FakeInteractionTable()
    fake_supabase = _FakeSupabase({"interaction_log": fake_table})
    monkeypatch.setattr(il, "supabase", fake_supabase)

    await il.log_interaction(
        user_id="user-1",
        kc_id="kc-1",
        topic_id="topic-1",
        attempt_number=2,
        explanation_text="It keeps calling itself until the base case stops it.",
        scores={
            "core_accuracy": 0.8,
            "own_words": 0.7,
            "depth": 0.6,
            "weighted_score": 0.73,
            "feedback": "You got the core loop right. Next, connect it to the base case.",
            "what_was_right": "You explained the self-call correctly.",
            "what_was_wrong": "Explain why the base case stops the recursion.",
        },
        bkt_before=0.2,
        bkt_after=0.4,
        passed=False,
        force_advanced=False,
    )

    payload = fake_table.inserts[0]
    quality_label = json.loads(payload["quality_label"])
    assert quality_label["feedback"] == "You got the core loop right. Next, connect it to the base case."
    assert quality_label["what_was_wrong"] == "Explain why the base case stops the recursion."
