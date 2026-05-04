import json
from utils.model_router import complete

TOPIC_QUESTION = "What do you want to learn?"
PRIOR_QUESTION = (
    "What do you already know about this? List anything relevant — "
    "concepts, tools, experience — even if it feels basic."
)
GOAL_QUESTION = (
    "What's your goal? For example: pass an exam, build a specific "
    "project, understand it deeply, get a job, or something else."
)
TIMELINE_QUESTION = (
    "What's your timeline? For example: exam in 2 weeks, want to finish "
    "in a month, no deadline just want to go deep."
)

DISCOVERY_SYSTEM = """
You are Assign's discovery agent. Before any course is built, you collect exactly
four pieces of information — one at a time, in order. No more, no less.

You talk like a sharp, direct Gen Z friend. Casual but focused.
Short messages. Never combine two questions in one message.

━━━ COLLECTION ORDER ━━━

Step 1 — TOPIC
Ask exactly: "What do you want to learn?"
If the answer is vague (e.g. "coding"), ask one clarifying follow-up. Then move on.

Step 2 — PRIOR KNOWLEDGE
Ask exactly: "What do you already know about this? List anything relevant —
concepts, tools, experience — even if it feels basic."
Do not quiz or probe. Just record whatever they say. If they say "nothing", that's fine.

Step 3 — GOAL
Ask exactly: "What's your goal? For example: pass an exam, build a specific
project, understand it deeply, get a job, or something else."
Classify their answer internally as one of:
  exam | project | deep_understanding | job | other

Step 4 — TIMELINE
Ask exactly: "What's your timeline? For example: exam in 2 weeks, want to
finish in a month, no deadline just want to go deep."
Parse their answer into an integer number of weeks. Default to 4 if unclear.

━━━ RULES ━━━
- One question per message — never combine steps
- Never skip a step
- Output [DISCOVERY_COMPLETE] only after you have collected all four answers
- Do not output [DISCOVERY_COMPLETE] until you have topic, prior_knowledge, goal, and timeline

━━━ OUTPUT ━━━
When all four answers are collected, output a brief closing line, then:

[DISCOVERY_COMPLETE]
{
  "topic": "specific topic the student wants to learn",
  "prior_knowledge": ["concept1", "tool2"],
  "goal_type": "exam | project | deep_understanding | job | other",
  "goal_detail": "their specific goal in their own words",
  "timeline": "their raw timeline answer",
  "weeks_available": 4
}

prior_knowledge must be a list of strings — use an empty list [] if they know nothing.
weeks_available must be an integer — default 4 if their answer was vague.
"""

SYLLABUS_CONTEXT_SYSTEM = """
The learner uploaded a syllabus or study document before discovery started.

Use that document context to ground Step 1.
- Do not ignore the uploaded material and fall back to a generic topic ask.
- Reference the document's primary topic or extracted topic list when asking what they want to learn.
- If the learner says "that topic", "the whole thing", "the document", or similar,
  resolve it to the uploaded document's primary topic unless they explicitly narrow it to a section.
- If the uploaded document already makes the topic obvious, do not ask them to restate the exact title from scratch.
"""


def _sanitize_reply(text: str) -> str:
    clean = (text or "").replace("[After user responds]", "").strip()
    return clean or TIMELINE_QUESTION


def _question_was_asked(messages: list[dict], prefix: str) -> bool:
    prefix_lower = prefix.lower()
    for message in messages:
        if message.get("role") != "assistant":
            continue
        if message.get("content", "").strip().lower().startswith(prefix_lower):
            return True
    return False


def _can_finish_discovery(messages: list[dict]) -> bool:
    # The final timeline answer can only arrive after the timeline question has
    # already been sent in a previous assistant turn. This prevents the model
    # from hallucinating completion one step too early.
    return _question_was_asked(messages, "What's your timeline?")


def _syllabus_titles(syllabus_topics: list[dict] | None) -> list[str]:
    titles: list[str] = []
    for topic in syllabus_topics or []:
        if not isinstance(topic, dict):
            continue
        title = str(topic.get("title", "")).strip()
        if title:
            titles.append(title)
    return titles


def _syllabus_opening_question(
    syllabus_topics: list[dict] | None,
    syllabus_course_title: str | None,
) -> str:
    titles = _syllabus_titles(syllabus_topics)
    course_title = (syllabus_course_title or "").strip()
    examples = ", ".join(titles[:3])

    if course_title and examples:
        return (
            f"I read your document. It looks like it's about {course_title}. "
            f"Do you want the whole thing, or a specific part like {examples}?"
        )
    if course_title:
        return (
            f"I read your document. It looks like it's about {course_title}. "
            "Do you want the whole thing or a specific section?"
        )
    if examples:
        return (
            "I parsed your document. The main topics I found are "
            f"{examples}. Which one do you want to focus on first?"
        )
    return TOPIC_QUESTION


async def run_discovery(
    messages: list[dict],
    syllabus_topics: list[dict] | None = None,
    syllabus_course_title: str | None = None,
) -> dict:
    """
    Main discovery function.
    Takes full conversation history, returns next message.
    When discovery is complete, returns the learner profile.
    """
    if not messages and (syllabus_topics or syllabus_course_title):
        return {
            "phase": "discovery",
            "reply": _syllabus_opening_question(syllabus_topics, syllabus_course_title),
            "learner_profile": None,
            "discovery_complete": False,
        }

    extra_system_messages: list[dict] = []
    if syllabus_topics or syllabus_course_title:
        extra_system_messages.extend([
            {"role": "system", "content": SYLLABUS_CONTEXT_SYSTEM},
            {"role": "system", "content": (
                "Uploaded document context: " + json.dumps({
                    "course_title": (syllabus_course_title or "").strip(),
                    "topics": _syllabus_titles(syllabus_topics)[:12],
                })
            )},
        ])

    response = await complete(
        messages=[
            {"role": "system", "content": DISCOVERY_SYSTEM},
            *extra_system_messages,
            *messages,
        ],
        model_size="large",
        temperature=0.2,
        max_tokens=500,
    )

    if "[DISCOVERY_COMPLETE]" in response:
        parts = response.split("[DISCOVERY_COMPLETE]")
        closing_message = _sanitize_reply(parts[0])

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

        if not _can_finish_discovery(messages):
            return {
                "phase": "discovery",
                "reply": TIMELINE_QUESTION,
                "learner_profile": None,
                "discovery_complete": False,
            }

        return {
            "phase": "complete",
            "reply": closing_message or "got everything i need — building your course now.",
            "learner_profile": learner_profile,
            "discovery_complete": True,
        }

    return {
        "phase": "discovery",
        "reply": _sanitize_reply(response),
        "learner_profile": None,
        "discovery_complete": False,
    }
