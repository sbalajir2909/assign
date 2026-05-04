from main import _classify_learning_velocity, _fallback_report_suggestions


def test_learning_velocity_improving_when_late_scores_are_higher():
    assert _classify_learning_velocity([0.4, 0.5, 0.8, 0.9]) == "improving"


def test_learning_velocity_slowing_when_late_scores_drop():
    assert _classify_learning_velocity([0.9, 0.85, 0.55, 0.5]) == "slowing"


def test_fallback_report_suggestions_prioritize_misconceptions():
    suggestions = _fallback_report_suggestions(
        strengths=["Variables"],
        needs_work=["Loops"],
        misconceptions=["Recursion"],
        velocity="steady",
    )
    assert suggestions[0].startswith("Revisit Recursion")
