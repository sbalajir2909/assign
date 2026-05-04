"""
Unit tests for B2C graph routing functions.

route_by_phase and after_notes are pure functions — no LLM calls,
no DB calls, no network.  All assertions here are synchronous.

Key invariant: the teaching node routes to END (not to a mastery_check
node), because mastery validation is handled externally by main.py when
the student submits an explanation.
"""

from langgraph.graph import END
from graph.b2c_graph import route_by_phase, after_notes


# ── route_by_phase ────────────────────────────────────────────────────────────

def test_route_discovery():
    assert route_by_phase({"phase": "discovery"}) == "discovery"


def test_route_curriculum_build():
    assert route_by_phase({"phase": "curriculum_build"}) == "curriculum_build"


def test_route_teaching_goes_to_context_build():
    # teaching phase enters via context_build so the 700-token window is fresh
    assert route_by_phase({"phase": "teaching"}) == "context_build"


def test_route_awaiting_explanation_goes_to_context_build():
    # A non-explanation message while awaiting explanation re-runs teaching
    assert route_by_phase({"phase": "awaiting_explanation"}) == "context_build"


def test_route_notes_generation():
    assert route_by_phase({"phase": "notes_generation"}) == "notes_node"


def test_route_complete_goes_to_end():
    assert route_by_phase({"phase": "complete"}) == END


def test_route_unknown_phase_goes_to_end():
    assert route_by_phase({"phase": "totally_unknown"}) == END


def test_route_missing_phase_defaults_to_discovery():
    # phase defaults to "discovery" when key is absent
    assert route_by_phase({}) == "discovery"


def test_teaching_does_not_route_to_mastery_check():
    # Mastery checking is external — the graph must never go to a
    # mastery_check node from the teaching phase.
    result = route_by_phase({"phase": "teaching"})
    assert result != "mastery_check"


# ── after_notes ───────────────────────────────────────────────────────────────

def test_after_notes_complete_goes_to_end():
    assert after_notes({"phase": "complete"}) == END


def test_after_notes_non_complete_goes_to_context_build():
    for phase in ("teaching", "notes_generation", "awaiting_explanation", "discovery"):
        assert after_notes({"phase": phase}) == "context_build", (
            f"after_notes should return context_build for phase={phase!r}"
        )


def test_after_notes_missing_phase_goes_to_context_build():
    assert after_notes({}) == "context_build"
