"""
Unit tests for the B2C teaching agent.

All LLM calls are mocked — no network traffic, no API keys required.

Critical invariants tested:
- Teaching always sets phase = "awaiting_explanation"
- Teaching always sets ready_for_mastery_check = True
  (the B2C teaching node always ends by asking for an explanation)
- recent_turns is appended, not replaced
"""

from unittest.mock import AsyncMock, MagicMock

from graph.b2c_state import KCNode


def _make_kc(**overrides):
    defaults = dict(
        id="kc-1",
        title="Recursion",
        description="A function that calls itself, with a base case to terminate.",
        prerequisites=[],
        order_index=0,
    )
    return KCNode(**{**defaults, **overrides})


def _make_state(**overrides):
    kc = _make_kc()
    base = {
        "kc_graph": [kc],
        "current_kc_id": "kc-1",
        "current_attempt_number": 1,
        "last_rubric_scores": None,
        "flags_this_session": [],
        "context_window": [],
        "recent_turns": [],
    }
    return {**base, **overrides}


def _mock_client(text: str = "Teaching text. Now, explain Recursion back to me in your own words."):
    client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = text
    client.chat.completions.create = AsyncMock(return_value=mock_resp)
    return client


# ── Phase and mastery-check signal ───────────────────────────────────────────

async def test_teaching_sets_awaiting_explanation_phase():
    from agents.b2c_teaching_agent import run_teaching

    result = await run_teaching(_make_state(), _mock_client())
    assert result["phase"] == "awaiting_explanation"


async def test_teaching_sets_ready_for_mastery_check_true():
    """
    The B2C teaching node always asks for an explanation.
    ready_for_mastery_check must be True so main.py knows to accept
    the next student message as an explanation attempt.
    """
    from agents.b2c_teaching_agent import run_teaching

    result = await run_teaching(_make_state(), _mock_client())
    assert result.get("ready_for_mastery_check") is True


async def test_teaching_pending_message_matches_llm_response():
    from agents.b2c_teaching_agent import run_teaching

    expected = "Recursion is when a function calls itself. Now, explain Recursion back to me."
    result = await run_teaching(_make_state(), _mock_client(expected))
    assert result["pending_message"] == expected


# ── recent_turns management ───────────────────────────────────────────────────

async def test_teaching_appends_assistant_turn():
    from agents.b2c_teaching_agent import run_teaching

    result = await run_teaching(_make_state(recent_turns=[]), _mock_client())
    turns = result["recent_turns"]
    assert len(turns) == 1
    assert turns[0]["role"] == "assistant"


async def test_teaching_preserves_prior_turns():
    from agents.b2c_teaching_agent import run_teaching

    prior = [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi there"},
    ]
    result = await run_teaching(_make_state(recent_turns=prior), _mock_client())
    turns = result["recent_turns"]
    assert len(turns) == 3
    assert turns[-1]["role"] == "assistant"


async def test_teaching_trims_turns_to_six():
    from agents.b2c_teaching_agent import run_teaching

    # 6 existing turns + 1 new = 7, should be trimmed to 6
    prior = [{"role": "user", "content": f"msg {i}"} for i in range(6)]
    result = await run_teaching(_make_state(recent_turns=prior), _mock_client())
    assert len(result["recent_turns"]) == 6


# ── Re-attempt behaviour ──────────────────────────────────────────────────────

async def test_reattempt_does_not_raise():
    """Attempt 2 with prior rubric scores must not raise."""
    from agents.b2c_teaching_agent import run_teaching

    state = _make_state(
        current_attempt_number=2,
        last_rubric_scores={
            "core_idea": 0.3,
            "reasoning_quality": 0.4,
            "what_was_wrong": "missed the base case",
        },
    )
    result = await run_teaching(state, _mock_client())
    assert result["phase"] == "awaiting_explanation"
    assert result.get("ready_for_mastery_check") is True


async def test_misconception_flag_triggers_special_prompt():
    """When a misconception flag is active, teaching still completes normally."""
    from agents.b2c_teaching_agent import run_teaching

    state = _make_state(
        flags_this_session=[{
            "kc_id": "kc-1",
            "flag_type": "misconception",
            "flag_reason": "Thought recursion is iteration",
        }]
    )
    result = await run_teaching(state, _mock_client())
    assert result["phase"] == "awaiting_explanation"
