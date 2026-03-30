import json
from utils.model_router import complete

MASTERY_SYSTEM = """
You are an independent mastery validator. You are NOT the teaching agent.
Your only job is to evaluate whether a learner has genuinely understood a concept
based on their explanation.

You are adversarial by design. Your default is skepticism.
Pattern matching keywords is NOT understanding.
Restating what the teacher said is NOT understanding.
Genuine understanding means the learner can reason about the concept in their own words.

You will receive:
- The concept being taught
- The full conversation so far
- The learner's most recent explanation

Output ONLY a JSON object. Nothing else.

{
  "verdict": "MASTERED | PARTIAL | NOT_YET",
  "score": 0.0,
  "dimensions": {
    "core_idea": 0.0,
    "reasoning_quality": 0.0,
    "own_words": 0.0,
    "edge_awareness": 0.0
  },
  "gap": "one sentence describing what's missing, or null if mastered",
  "teaching_hint": "one sentence suggesting how to address the gap, or null if mastered"
}

Scoring dimensions (each 0.0 to 1.0):
- core_idea: did they get the fundamental concept correct?
  1.0 = fully correct, 0.5 = mostly correct, 0.0 = wrong
- reasoning_quality: did they explain the mechanism, not just name it?
  1.0 = explained how/why clearly, 0.5 = partial mechanism, 0.0 = just named it
- own_words: did they use their own framing or just repeat the teacher?
  1.0 = clearly their own framing, 0.5 = mixed, 0.0 = verbatim repeat
- edge_awareness: do they show awareness of limits, exceptions, or tradeoffs?
  1.0 = explicitly mentioned a limitation or edge case
  0.5 = implied awareness
  0.0 = no awareness shown — THIS IS OKAY for simpler concepts, do not penalize heavily

Important: edge_awareness weight is only 0.10. A learner who nails core_idea,
reasoning_quality and own_words should still pass even with zero edge_awareness.
Do not use edge_awareness to fail an otherwise strong explanation.

Weighted score formula:
  score = (core_idea × 0.40) + (reasoning_quality × 0.30) + (own_words × 0.20) + (edge_awareness × 0.10)
"""


def get_threshold(attempt_number: int, complexity: float) -> float:
    """
    Threshold scales with both attempt number and concept complexity.
    Harder concepts get more lenient thresholds — they're harder to articulate.
    """
    base_thresholds = {
        1: 0.65,
        2: 0.50,
    }
    base = base_thresholds.get(attempt_number, 0.65)
    leniency = complexity * 0.10
    return max(base - leniency, 0.40)


async def validate_mastery(
    concept: dict,
    conversation: list[dict],
    learner_explanation: str,
    attempt_number: int,
) -> dict:
    """
    Validates whether the learner has mastered the current concept.

    attempt_number: 1, 2, or 3
    - Attempt 1: threshold scales with complexity (base 0.65)
    - Attempt 2: threshold lowers further (base 0.50)
    - Attempt 3: force advance regardless, flag for Recall mode
    """

    # Hard rule: force advance on attempt 3
    if attempt_number >= 3:
        return {
            "verdict": "MASTERED",
            "score": 0.0,
            "forced_advance": True,
            "flag_for_recall": True,
            "gap": "Learner struggled with this concept — scheduled for Recall review",
            "teaching_hint": None,
            "dimensions": {
                "core_idea": 0.0,
                "reasoning_quality": 0.0,
                "own_words": 0.0,
                "edge_awareness": 0.0,
            },
        }

    response = await complete(
        messages=[
            {"role": "system", "content": MASTERY_SYSTEM},
            {
                "role": "user",
                "content": f"""
Concept being taught:
{json.dumps(concept)}

Conversation so far:
{json.dumps(conversation[-6:], indent=2)}

Learner's explanation to evaluate:
{learner_explanation}

Attempt number: {attempt_number}
"""
            }
        ],
        model_size="small",
        temperature=0.1,
        max_tokens=300,
    )

    try:
        result = json.loads(response)
    except json.JSONDecodeError:
        return {
            "verdict": "NOT_YET",
            "score": 0.0,
            "forced_advance": False,
            "flag_for_recall": False,
            "gap": "Could not evaluate explanation",
            "teaching_hint": "Ask the learner to try explaining again differently",
            "dimensions": {},
        }

    score = result.get("score", 0.0)
    complexity = concept.get("complexity", 0.5)
    threshold = get_threshold(attempt_number, complexity)

    # Apply attempt-adjusted threshold
    if score >= threshold:
        result["verdict"] = "MASTERED"
    elif score >= 0.50:
        result["verdict"] = "PARTIAL"
    else:
        result["verdict"] = "NOT_YET"

    result["forced_advance"] = False
    result["flag_for_recall"] = False

    # If PARTIAL on attempt 2, still advance but flag for recall
    if attempt_number == 2 and result["verdict"] == "PARTIAL":
        result["verdict"] = "MASTERED"
        result["flag_for_recall"] = True

    return result