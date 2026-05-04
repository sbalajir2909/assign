"""
Bayesian Knowledge Tracing — standard BKT update equations.

update_bkt() is a pure function: no I/O, no side effects.
Call sites are responsible for loading params from student_kc_state and
persisting the returned value back.

Default parameters (set at KC creation, tunable later with real data):
  p_l0      = 0.10  (prior probability the student already knows the KC)
  p_transit = 0.10  (probability of transitioning from not-knowing to knowing)
  p_slip    = 0.10  (probability of answering incorrectly despite knowing)
  p_guess   = 0.20  (probability of answering correctly without knowing)

Mastery gate: P(L) >= 0.75.  With defaults and two consecutive correct
answers a student reaches ~0.775, so mastery is reachable in 2 attempts.
"""


def update_bkt(
    p_learned: float,
    p_transit: float,
    p_slip: float,
    p_guess: float,
    correct: bool,
) -> float:
    """
    Standard BKT update.  Returns the new P(L) clamped to [0.0, 1.0].

    correct: True  ↔  student's weighted rubric score >= 0.65
             False ↔  student's weighted rubric score  < 0.65
    """
    if correct:
        # Probability of observing a correct response
        p_obs = p_learned * (1.0 - p_slip) + (1.0 - p_learned) * p_guess
        # Posterior: P(learned | correct)
        p_after = (p_learned * (1.0 - p_slip)) / p_obs if p_obs > 0 else p_learned
    else:
        # Probability of observing an incorrect response
        p_obs = p_learned * p_slip + (1.0 - p_learned) * (1.0 - p_guess)
        # Posterior: P(learned | incorrect)
        p_after = (p_learned * p_slip) / p_obs if p_obs > 0 else p_learned

    # Apply learning transit: even after observing, there is a chance of
    # transitioning from not-knowing to knowing on this attempt.
    p_new = p_after + (1.0 - p_after) * p_transit

    return max(0.0, min(1.0, round(p_new, 6)))
