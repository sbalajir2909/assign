import json
import re
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from graph.state import TrekState
from prompts.planner import PLANNER_SYSTEM


def planner_agent(state: TrekState) -> dict:
    """
    Decides teaching strategy for the current concept.
    Runs once per concept before learning begins.
    Transitions phase to 'memory_load'.
    """
    concepts = state.get("concepts", [])
    concept_idx = state.get("current_concept_idx", 0)

    if concept_idx >= len(concepts):
        return {"phase": "memory_load", "teaching_strategy": "gap_fill", "opening_prompt": ""}

    concept = concepts[concept_idx]
    learner_profile = {
        "topic": state.get("topic", ""),
        "level": state.get("level", ""),
        "goal": state.get("goal", ""),
        "time": state.get("time", ""),
    }

    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.3, max_tokens=300)
    messages = [
        SystemMessage(content=PLANNER_SYSTEM),
        HumanMessage(content=f"Concept: {concept['title']}\nLearner: {json.dumps(learner_profile)}"),
    ]

    try:
        response = llm.invoke(messages)
        raw = response.content or ""
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            plan = json.loads(match.group())
            return {
                "phase": "memory_load",
                "teaching_strategy": plan.get("strategy", "gap_fill"),
                "opening_prompt": plan.get("openingPrompt", f"tell me what you already know about {concept['title']}"),
            }
    except Exception as e:
        print(f"[planner_agent] error: {e}")

    return {
        "phase": "memory_load",
        "teaching_strategy": "gap_fill",
        "opening_prompt": f"okay let's start. tell me — what do you already know about {concept['title']}?",
    }
