from types import SimpleNamespace

import pytest

import main
from main import B2CStartRequest, B2CTrekMessage


class FakeGraph:
    def __init__(self, state, result):
        self._state = state
        self._result = result
        self.updated = []
        self.invoked = []

    async def aget_state(self, config):
        return SimpleNamespace(values=self._state)

    async def aupdate_state(self, config, patch):
        self.updated.append((config, patch))
        self._state = {**self._state, **patch}

    async def ainvoke(self, patch, config=None):
        self.invoked.append((config, patch))
        return self._result


class SequencedFakeGraph(FakeGraph):
    def __init__(self, state, results):
        super().__init__(state=state, result={})
        self._results = list(results)

    async def ainvoke(self, patch, config=None):
        self.invoked.append((config, patch))
        return self._results.pop(0)


async def _read_stream(response) -> str:
    chunks = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            chunks.append(chunk.decode())
        else:
            chunks.append(chunk)
    return "".join(chunks)


@pytest.mark.asyncio
async def test_b2c_message_appends_discovery_message_before_graph_run(monkeypatch):
    state = {
        "phase": "discovery",
        "discovery_messages": [
            {"role": "assistant", "content": "What do you want to learn?"}
        ],
    }
    result = {"pending_message": "Why do you want to learn Python?"}
    fake_graph = FakeGraph(state=state, result=result)

    async def fake_route_intent(message, phase, llm_client):
        return "other"

    monkeypatch.setattr(main, "b2c_graph", fake_graph)
    monkeypatch.setattr("utils.semantic_router.route_intent", fake_route_intent)
    monkeypatch.setattr("utils.model_router.get_llm_client", lambda: object())

    response = await main.b2c_message(
        B2CTrekMessage(
            user_id="user-1",
            topic_id="topic-1",
            session_id="session-1",
            message="python",
            phase="discovery",
        )
    )
    stream = await _read_stream(response)

    expected_messages = [
        {"role": "assistant", "content": "What do you want to learn?"},
        {"role": "user", "content": "python"},
    ]

    assert fake_graph.updated == [
        (
            {"configurable": {"thread_id": "session-1"}},
            {"discovery_messages": expected_messages},
        )
    ]
    assert fake_graph.invoked == [
        (
            {"configurable": {"thread_id": "session-1"}},
            {"discovery_messages": expected_messages},
        )
    ]
    assert "Why do you want to learn Python?" in stream


@pytest.mark.asyncio
async def test_b2c_message_allows_curriculum_build_without_current_kc(monkeypatch):
    state = {
        "phase": "curriculum_build",
        "user_id": "user-1",
        "topic_id": "topic-1",
        "recent_turns": [],
    }
    result = {
        "pending_message": "Here's your first concept.",
        "phase": "awaiting_explanation",
        "kc_graph": [],
    }
    fake_graph = FakeGraph(state=state, result=result)

    async def fake_route_intent(message, phase, llm_client):
        return "other"

    monkeypatch.setattr(main, "b2c_graph", fake_graph)
    monkeypatch.setattr("utils.semantic_router.route_intent", fake_route_intent)
    monkeypatch.setattr("utils.model_router.get_llm_client", lambda: object())

    response = await main.b2c_message(
        B2CTrekMessage(
            user_id="user-1",
            topic_id="topic-1",
            session_id="session-1",
            message="let's learn",
            phase="curriculum_build",
        )
    )
    stream = await _read_stream(response)

    assert fake_graph.updated == []
    assert fake_graph.invoked == [
        (
            {"configurable": {"thread_id": "session-1"}},
            {"recent_turns": [{"role": "user", "content": "let's learn"}]},
        )
    ]
    assert "Here's your first concept." in stream


@pytest.mark.asyncio
async def test_b2c_message_auto_runs_curriculum_after_discovery(monkeypatch):
    state = {
        "phase": "discovery",
        "user_id": "user-1",
        "topic_id": "",
        "discovery_messages": [
            {"role": "assistant", "content": "What's your timeline?"},
        ],
    }
    fake_graph = SequencedFakeGraph(
        state=state,
        results=[
            {
                "pending_message": "Discovery complete.",
                "phase": "curriculum_build",
            },
            {
                "pending_message": "Let's start with Flask routes.",
                "phase": "awaiting_explanation",
                "topic_id": "topic-1",
                "topic_title": "Flask web development",
                "roadmap_id": "roadmap-1",
                "current_kc_id": "kc-1",
                "bkt_state": {"kc-1": 0.0},
                "kc_graph": [
                    SimpleNamespace(
                        id="kc-1",
                        title="Flask routes",
                        status="current",
                        order_index=0,
                    )
                ],
            },
        ],
    )

    async def fake_route_intent(message, phase, llm_client):
        return "other"

    persisted = []

    async def fake_persist(*args):
        persisted.append(args)

    monkeypatch.setattr(main, "b2c_graph", fake_graph)
    monkeypatch.setattr(main, "_persist_b2c_chat_turn", fake_persist)
    monkeypatch.setattr("utils.semantic_router.route_intent", fake_route_intent)
    monkeypatch.setattr("utils.model_router.get_llm_client", lambda: object())

    response = await main.b2c_message(
        B2CTrekMessage(
            user_id="user-1",
            topic_id="",
            session_id="session-1",
            message="no deadline",
            phase="discovery",
        )
    )
    stream = await _read_stream(response)

    assert fake_graph.invoked == [
        (
            {"configurable": {"thread_id": "session-1"}},
            {
                "discovery_messages": [
                    {"role": "assistant", "content": "What's your timeline?"},
                    {"role": "user", "content": "no deadline"},
                ]
            },
        ),
        (
            {"configurable": {"thread_id": "session-1"}},
            None,
        ),
    ]
    assert persisted == [
        ("user-1", "topic-1", "kc-1", "assistant", "Let's start with Flask routes."),
    ]
    assert "Discovery complete." in stream
    assert "Let's start with Flask routes." in stream
    assert '"type": "curriculum_ready"' in stream


@pytest.mark.asyncio
async def test_b2c_start_session_reconstructs_from_roadmap(monkeypatch):
    fake_graph = FakeGraph(
        state={},
        result={
            "pending_message": "Let's resume with budgeting basics.",
            "phase": "awaiting_explanation",
            "topic_id": "topic-1",
            "current_kc_id": "kc-1",
            "current_kc_index": 1,
        },
    )
    persisted = []
    bound = []

    async def fake_load_resume(user_id, roadmap_id):
        return {
            "topic_id": "topic-1",
            "topic_title": "Personal Finance",
            "roadmap_id": roadmap_id,
            "phase": "teaching",
            "current_kc_index": 1,
            "current_kc_id": "kc-1",
            "kc_graph": [],
            "total_kcs": 3,
            "bkt_state": {"kc-1": 0.42},
            "recent_turns": [],
            "flags_this_session": [],
            "notes_generated": [],
            "unlock_next_concepts_enabled": True,
            "_discovery_profile": {"topic": "Personal Finance"},
        }

    async def fake_bind(*args):
        bound.append(args)

    async def fake_persist(*args):
        persisted.append(args)

    monkeypatch.setattr(main, "b2c_graph", fake_graph)
    monkeypatch.setattr(main, "_load_resume_session_state", fake_load_resume)
    monkeypatch.setattr(main, "_bind_session_to_roadmap", fake_bind)
    monkeypatch.setattr(main, "_persist_b2c_chat_turn", fake_persist)

    response = await main.b2c_start_session(
        B2CStartRequest(
            user_id="user-1",
            roadmap_id="roadmap-1",
        )
    )

    assert response["reply"] == "Let's resume with budgeting basics."
    assert response["phase"] == "awaiting_explanation"
    assert response["topic_id"] == "topic-1"
    assert response["roadmap_id"] == "roadmap-1"
    assert response["current_kc_index"] == 1
    assert fake_graph.invoked[0][1]["roadmap_id"] == "roadmap-1"
    assert fake_graph.invoked[0][1]["topic_id"] == "topic-1"
    assert bound == [
        ("user-1", "roadmap-1", "topic-1", response["session_id"]),
    ]
    assert persisted == [
        ("user-1", "topic-1", "kc-1", "assistant", "Let's resume with budgeting basics."),
    ]
