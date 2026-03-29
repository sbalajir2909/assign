import os
import json
import re
import httpx
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from graph.state import TrekState
from prompts.curriculum import CURRICULUM_SYSTEM


def curriculum_agent(state: TrekState) -> dict:
    """
    Generates course roadmap via scraper API (with LLM fallback).
    Transitions phase to 'gist' when done.
    """
    topic = state.get("topic", "")
    level = state.get("level", "")
    goal = state.get("goal", "")
    time = state.get("time", "")

    discovery_answers = {"topic": topic, "level": level, "goal": goal, "time": time}
    scraper_url = os.environ.get("SCRAPER_API_URL", "https://assign-scraper-production.up.railway.app/scrape")

    course = None
    sources_hit: list = []

    # Try scraper first
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(scraper_url, json=discovery_answers)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("course"):
                    course = data["course"]
                    sources_hit = data.get("context", {}).get("sourcesHit", [])
    except Exception as e:
        print(f"[curriculum_agent] scraper failed, using LLM fallback: {e}")

    # LLM fallback
    if not course:
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.3, max_tokens=1500)
        messages = [
            SystemMessage(content=CURRICULUM_SYSTEM),
            HumanMessage(content=f"Topic: {topic}\nLevel: {level}\nGoal: {goal}\nTime: {time}"),
        ]
        response = llm.invoke(messages)
        raw = response.content or ""
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            course = json.loads(match.group())

    if not course:
        return {
            "phase": "gist",
            "last_reply": "something went wrong building your course, try again",
            "concepts": [],
            "gist": {},
            "sources_hit": [],
        }

    gist_data = course.get("gist", {})
    concepts_raw = course.get("concepts", [])
    concepts = [
        {**c, "id": i, "status": "locked"}
        for i, c in enumerate(concepts_raw)
    ]

    source_count = len(sources_hit)
    reply = (
        f"course built from {source_count} sources. check the overview on the left — "
        "see what you'll walk out knowing, edit anything, then hit approve."
        if source_count
        else "course built. check the overview on the left — edit anything, then hit approve."
    )

    return {
        "phase": "gist",
        "gist": gist_data,
        "concepts": concepts,
        "sources_hit": sources_hit,
        "last_reply": reply,
    }
