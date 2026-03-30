import json
import re
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from graph.state import TrekState
from prompts.planner import PLANNER_SYSTEM


def planner_agent(state: TrekState) -> dict:
    """
    Decides teaching strategy for the current concept.
    Uses validated_nodes and new learner profile fields.
    """
    validated_nodes = state.get("validated_nodes", [])
    concept_idx = state.get("current_concept_idx", 0)

    if concept_idx >= len(validated_nodes):
        return {
            "phase": "memory_load",
            "teaching_strategy": "gap_fill",
            "opening_prompt": ""
        }

    concept = validated_nodes[concept_idx]

    learner_profile = {
        "topic": state.get("topic", ""),
        "exit_condition": state.get("exit_condition", ""),
        "knowledge_baseline": state.get("knowledge_baseline", {}),
        "available_hours": state.get("available_hours", 0),
        "context": state.get("context", ""),
    }

    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        max_tokens=400
    )

    messages = [
        SystemMessage(content=PLANNER_SYSTEM),
        HumanMessage(content=f"""
Concept to teach:
- Title: {concept.get('title', '')}
- Description: {concept.get('description', '')}
- Why needed: {concept.get('why_needed', '')}
- Complexity: {concept.get('complexity', 0.5)}
- Prerequisites mastered: {concept.get('prerequisites', [])}

Learner profile:
{json.dumps(learner_profile, indent=2)}

Knowledge baseline probe result: {learner_profile['knowledge_baseline'].get('probe_result', 'unknown')}
""")
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
        "opening_prompt": f"okay let's get into {concept['title']}. what do you already know about it?",
    }
