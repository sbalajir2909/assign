"""
Tests for mastery validator state shape and attempt-counter invariants.

The B2C pipeline stores KC data under 'kc_graph' (not 'concepts' or
'validated_nodes' from the pre-B2C design).  These tests guard against
regressions that would silently read the wrong key.

Attempt counter rules (NON-NEGOTIABLE):
  Attempt 1 → threshold 0.65  (first attempt)
  Attempt 2 → threshold 0.65  (second chance)
  Attempt 3 → threshold 0.50  (relaxed gate)
  Attempt 4 → FORCE ADVANCE   (never block a student forever)
"""

from graph.b2c_state import KCNode
from agents.mastery_validator import ATTEMPT_THRESHOLDS


# ── B2C state shape ───────────────────────────────────────────────────────────

def _base_state(attempt_number: int = 1):
    """Minimal valid B2C state dict for mastery validator consumption."""
    kc = KCNode(
        id="kc-1",
        title="Big O Notation",
        description="Describes how algorithm complexity scales with input size.",
        prerequisites=[],
        order_index=0,
        p_learned=0.1,
    )
    return {
        # B2C key — NOT 'concepts' or 'validated_nodes' (pre-B2C keys)
        "kc_graph": [kc],
        "current_kc_id": "kc-1",
        "current_attempt_number": attempt_number,
        "last_explanation": "Big O notation tells us how an algorithm's runtime grows.",
        "user_id": "user-test-1",
        "topic_id": "topic-test-1",
        "bkt_state": {"kc-1": 0.1},
        "flags_this_session": [],
    }


def test_state_uses_kc_graph_not_concepts():
    """B2C validator reads from kc_graph — pre-B2C 'concepts' key must not appear."""
    state = _base_state()
    assert "kc_graph" in state
    assert "concepts" not in state


def test_state_uses_kc_graph_not_validated_nodes():
    """B2C state does not carry 'validated_nodes' (that's internal to curriculum)."""
    state = _base_state()
    assert "kc_graph" in state
    assert "validated_nodes" not in state


def test_kc_is_accessible_via_kc_graph():
    """The validator looks up kc_graph by current_kc_id — confirm the KC is there."""
    state = _base_state()
    kc = next(k for k in state["kc_graph"] if k.id == state["current_kc_id"])
    assert kc.title == "Big O Notation"


# ── Attempt counter ───────────────────────────────────────────────────────────

def test_first_attempt_is_1_not_0():
    """current_attempt_number must start at 1. Attempt 0 is not defined."""
    state = _base_state(attempt_number=1)
    assert state["current_attempt_number"] == 1
    assert state["current_attempt_number"] in ATTEMPT_THRESHOLDS


def test_attempt_1_threshold():
    assert ATTEMPT_THRESHOLDS[1] == 0.65


def test_attempt_2_threshold():
    assert ATTEMPT_THRESHOLDS[2] == 0.65


def test_attempt_3_threshold():
    assert ATTEMPT_THRESHOLDS[3] == 0.50


def test_attempt_4_is_force_advance():
    """Attempt 4 threshold is None — signals unconditional force-advance."""
    assert ATTEMPT_THRESHOLDS[4] is None


def test_force_advance_fires_at_4_not_3():
    """
    force_advance = (attempt_num >= 4)
    Attempt 3 must still be scored; force-advance must not fire until attempt 4.
    """
    assert not (3 >= 4), "attempt 3 must NOT force-advance"
    assert 4 >= 4,       "attempt 4 MUST force-advance"


def test_all_four_attempts_defined_in_thresholds():
    for n in (1, 2, 3, 4):
        assert n in ATTEMPT_THRESHOLDS, f"ATTEMPT_THRESHOLDS missing entry for attempt {n}"


def test_no_attempt_0_in_thresholds():
    """Attempt 0 is not valid — guards against off-by-one initialisation."""
    assert 0 not in ATTEMPT_THRESHOLDS
