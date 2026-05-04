import pytest

from agents import discovery_agent


@pytest.mark.asyncio
async def test_discovery_ignores_premature_completion(monkeypatch):
    async def fake_complete(**kwargs):
        return """What's your timeline? For example: exam in 2 weeks, want to finish in a month, no deadline just want to go deep.

[DISCOVERY_COMPLETE]
{
  "topic": "python web development",
  "prior_knowledge": ["basic syntax"],
  "goal_type": "project",
  "goal_detail": "build a portfolio project",
  "timeline": "4 weeks",
  "weeks_available": 4
}
"""

    monkeypatch.setattr(discovery_agent, "complete", fake_complete)

    result = await discovery_agent.run_discovery([
        {"role": "user", "content": "python web development"},
        {"role": "assistant", "content": discovery_agent.PRIOR_QUESTION},
        {"role": "user", "content": "basic syntax"},
        {"role": "assistant", "content": discovery_agent.GOAL_QUESTION},
        {"role": "user", "content": "build a portfolio project"},
    ])

    assert result["discovery_complete"] is False
    assert result["phase"] == "discovery"
    assert result["reply"] == discovery_agent.TIMELINE_QUESTION
    assert result["learner_profile"] is None


@pytest.mark.asyncio
async def test_discovery_accepts_completion_after_timeline(monkeypatch):
    async def fake_complete(**kwargs):
        return """got everything i need — building your course now.

[DISCOVERY_COMPLETE]
{
  "topic": "python web development",
  "prior_knowledge": ["basic syntax"],
  "goal_type": "project",
  "goal_detail": "build a portfolio project",
  "timeline": "no deadline",
  "weeks_available": 999
}
"""

    monkeypatch.setattr(discovery_agent, "complete", fake_complete)

    result = await discovery_agent.run_discovery([
        {"role": "user", "content": "python web development"},
        {"role": "assistant", "content": discovery_agent.PRIOR_QUESTION},
        {"role": "user", "content": "basic syntax"},
        {"role": "assistant", "content": discovery_agent.GOAL_QUESTION},
        {"role": "user", "content": "build a portfolio project"},
        {"role": "assistant", "content": discovery_agent.TIMELINE_QUESTION},
        {"role": "user", "content": "no deadline"},
    ])

    assert result["discovery_complete"] is True
    assert result["phase"] == "complete"
    assert result["learner_profile"]["weeks_available"] == 999


@pytest.mark.asyncio
async def test_discovery_sanitizes_meta_instruction(monkeypatch):
    async def fake_complete(**kwargs):
        return "What's your timeline? For example: exam in 2 weeks.\n\n[After user responds]"

    monkeypatch.setattr(discovery_agent, "complete", fake_complete)

    result = await discovery_agent.run_discovery([
        {"role": "user", "content": "python web development"},
        {"role": "assistant", "content": discovery_agent.PRIOR_QUESTION},
        {"role": "user", "content": "basic syntax"},
        {"role": "assistant", "content": discovery_agent.GOAL_QUESTION},
        {"role": "user", "content": "build a portfolio project"},
    ])

    assert "[After user responds]" not in result["reply"]
