"""
Bayesian Knowledge Tracing — updates mastery probability after each attempt.

Parameters (fixed for launch, tunable later with real data):
- p_transit = 0.10  (probability of learning the KC from one attempt)
- p_slip    = 0.10  (probability of answering wrong despite knowing)
- p_guess   = 0.20  (probability of answering right without knowing)
"""


def update_bkt(p_learned: float, p_transit: float, p_slip: float,
               p_guess: float, correct: bool) -> float:
    """
    Standard BKT update. Returns new p_learned.
    correct: True if weighted_score >= 0.50 (partial credit counts)
    """
    p_correct_given_learned = 1.0 - p_slip
    p_correct_given_not_learned = p_guess

    if correct:
        p_learned_given_obs = (
            p_correct_given_learned * p_learned
        ) / (
            p_correct_given_learned * p_learned +
            p_correct_given_not_learned * (1 - p_learned)
        )
    else:
        p_incorrect_given_learned = p_slip
        p_incorrect_given_not_learned = 1.0 - p_guess
        p_learned_given_obs = (
            p_incorrect_given_learned * p_learned
        ) / (
            p_incorrect_given_learned * p_learned +
            p_incorrect_given_not_learned * (1 - p_learned)
        )

    # Apply transit: even after wrong answer, some learning happens
    p_new = p_learned_given_obs + (1 - p_learned_given_obs) * p_transit
    return round(min(p_new, 0.99), 4)  # cap at 0.99, never 1.0


def apply_ebbinghaus_decay(p_learned: float, days_since_last_study: int) -> float:
    """
    Applies forgetting curve decay. Run on login if days_since > 1.
    R = e^(-t/S) where S = stability (default 1.0 for new learning)
    """
    import math
    if days_since_last_study <= 0:
        return p_learned
    stability = 1.0  # will be tunable per KC after real data
    retention = math.exp(-days_since_last_study / stability)
    return round(p_learned * retention, 4)


def update_sm2(easiness: float, interval: int, repetitions: int,
               score: float) -> tuple[float, int, int]:
    """
    SM-2 spaced repetition. score is 0.0-1.0 (map to 0-5 scale).
    Returns (new_easiness, new_interval, new_repetitions).
    """
    q = round(score * 5)  # map 0.0-1.0 to 0-5

    if q < 3:
        # Failed — reset
        return easiness, 1, 0

    new_easiness = max(1.3, easiness + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))

    if repetitions == 0:
        new_interval = 1
    elif repetitions == 1:
        new_interval = 6
    else:
        new_interval = round(interval * new_easiness)

    return round(new_easiness, 2), new_interval, repetitions + 1
