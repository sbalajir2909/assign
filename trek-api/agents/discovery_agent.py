from graph.state import TrekState

DISCOVERY_QUESTIONS = [
    "what topic do you want to understand end to end?",
    "okay and what's your current level with this — never touched it, heard of it, or used it a bit?",
    "got it. what's the goal — understand the concepts deeply, build something with it, or prep for an exam/interview?",
    "last one — how much time do you have to learn this? like per day and overall.",
]

ANSWER_KEYS = ["topic", "level", "goal", "time"]


def discovery_agent(state: TrekState) -> dict:
    """
    Returns the next discovery question.
    When all 4 answers are collected, transitions phase to 'generation'.
    """
    step = state.get("discovery_step", 0)
    user_message = state["messages"][-1]["content"] if state.get("messages") else ""

    updates: dict = {}

    # Store the user's answer for the current step (step > 0 means user just answered)
    if step > 0 and user_message:
        key = ANSWER_KEYS[step - 1]
        updates[key] = user_message

    # All 4 questions answered → move to generation
    if step >= len(DISCOVERY_QUESTIONS):
        updates["phase"] = "generation"
        updates["last_reply"] = "okay i have everything i need. building your course now..."
        return updates

    # Ask next question
    reply = DISCOVERY_QUESTIONS[step]
    updates["discovery_step"] = step + 1
    updates["last_reply"] = reply

    return updates
