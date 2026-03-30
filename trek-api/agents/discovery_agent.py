import json
from utils.model_router import complete

DISCOVERY_SYSTEM = """
You are Assign's discovery agent. Your job is to understand exactly who this learner 
is and what they actually need — before any course is built.

You talk like a sharp, direct Gen Z friend. Casual but focused. No corporate tone.
Short messages. One thing at a time. Never overwhelm.

You have four jobs in order:
1. Find out what they want to learn and why
2. Extract a concrete, testable exit condition
3. Probe their actual knowledge (not self-reported level)
4. Understand their real time constraint

Rules:
- Never ask more than one question per message
- Never accept vague answers — push for specifics
- When you have enough to build a course, output [DISCOVERY_COMPLETE] on its own line
  followed by a JSON block with the learner profile
- Do not output [DISCOVERY_COMPLETE] until you have all four pieces of information

The JSON block must follow this exact structure:
{
  "topic": "specific topic",
  "exit_condition": "concrete testable outcome",
  "knowledge_baseline": {
    "summary": "what they actually know based on their answers",
    "probed_concept": "the concept you tested them on",
    "probe_result": "strong | partial | weak | none"
  },
  "available_hours": 10.0,
  "context": "why they need this"
}
"""

PROBE_SYSTEM = """
You are evaluating a learner's explanation of a concept.
Score their understanding based on what they said.
Output ONLY a JSON object, nothing else.

{
  "probe_result": "strong | partial | weak | none",
  "reasoning": "one sentence explaining the score"
}

Scoring guide:
- strong: correct explanation with reasoning, not just keywords
- partial: got the gist but missing key details or has misconceptions  
- weak: vague, mostly wrong, or just repeating the question back
- none: no understanding demonstrated
"""


async def get_probe_concept(topic: str) -> str:
    """
    Asks the model to pick a good foundational concept to probe
    for this specific topic. No hardcoding.
    """
    response = await complete(
        messages=[
            {
                "role": "user",
                "content": f"""For the topic "{topic}", what is one foundational concept 
that a beginner must understand before anything else?
Give me just the concept name, nothing else. 5 words max."""
            }
        ],
        model_size="small",
        temperature=0.1,
        max_tokens=20,
    )
    return response.strip()


async def score_probe(concept: str, user_explanation: str) -> dict:
    """
    Scores the user's explanation of the probed concept.
    Uses small model — pure classification task.
    """
    response = await complete(
        messages=[
            {"role": "system", "content": PROBE_SYSTEM},
            {
                "role": "user",
                "content": f"""Concept: {concept}
Learner's explanation: {user_explanation}"""
            }
        ],
        model_size="small",
        temperature=0.1,
        max_tokens=100,
    )

    try:
        return json.loads(response)
    except json.JSONDecodeError:
        return {"probe_result": "weak", "reasoning": "Could not parse explanation"}


async def run_discovery(messages: list[dict]) -> dict:
    """
    Main discovery function.
    Takes full conversation history, returns next message.
    When discovery is complete, returns the learner profile.
    """
    response = await complete(
        messages=[
            {"role": "system", "content": DISCOVERY_SYSTEM},
            *messages,
        ],
        model_size="large",
        temperature=0.7,
        max_tokens=500,
    )

    if "[DISCOVERY_COMPLETE]" in response:
        parts = response.split("[DISCOVERY_COMPLETE]")
        closing_message = parts[0].strip()

        try:
            json_str = parts[1].strip()
            if json_str.startswith("```"):
                json_str = json_str.split("```")[1]
                if json_str.startswith("json"):
                    json_str = json_str[4:]
            json_str = json_str.strip()
            learner_profile = json.loads(json_str)
        except (json.JSONDecodeError, IndexError):
            learner_profile = None

        return {
            "phase": "complete",
            "reply": closing_message or "okay i've got everything i need. building your course now.",
            "learner_profile": learner_profile,
            "discovery_complete": True,
        }

    return {
        "phase": "discovery",
        "reply": response,
        "learner_profile": None,
        "discovery_complete": False,
    }