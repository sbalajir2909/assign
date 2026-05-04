from types import SimpleNamespace

import pytest

import main
from main import B2CTrekMessage


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
