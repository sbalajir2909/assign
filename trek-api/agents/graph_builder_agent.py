import json
import asyncio
from utils.model_router import complete

GRAPH_BUILDER_PROMPT = """
You are a curriculum graph builder. You will receive extracted content from multiple 
web sources about a subject. Your job is to synthesize this into a weighted dependency 
graph of concept nodes.

Rules you must follow without exception:
1. Only include concepts that appear consistently across multiple sources.
   If only one source mentions something, do not include it.
2. Prerequisite ordering must be logically sound.
   Never place concept B before concept A if B requires A to be understood.
3. Complexity scores must be derived from how sources describe difficulty.
   If sources say "advanced", "challenging", "requires prior knowledge" — score high.
   If sources say "introduction", "basic", "beginner" — score low.
4. Time estimates must come from source material, not guesswork.
   If sources give no time estimate, reason from complexity score:
   low complexity = 1-2 hours, medium = 2-4 hours, high = 4-8 hours.
5. requires_live_data = true only for concepts involving:
   current versions, APIs that change, laws/regulations, prices, live statistics.
6. Never invent concepts the sources do not mention.
7. Never hardcode subject-specific knowledge. Reason only from the evidence given.

Output ONLY a valid JSON array. No prose. No markdown. No explanation.
Just the raw JSON array starting with [ and ending with ].
"""

def build_evidence_text(search_results: list) -> str:
    """
    Converts search results into a clean evidence block for the LLM.
    Truncates each result to avoid token overflow.
    """
    evidence_parts = []
    for i, result in enumerate(search_results[:6]):
        title = result.get("title", "")
        url = result.get("url", "")
        content = result.get("content", "")[:1500]
        evidence_parts.append(
            f"SOURCE {i+1}: {title}\nURL: {url}\nCONTENT:\n{content}\n"
        )
    return "\n---\n".join(evidence_parts)


def build_user_prompt(
    topic: str,
    exit_condition: str,
    knowledge_baseline: dict,
    evidence_text: str
) -> str:
    return f"""
Topic: {topic}
Exit condition (what the learner wants to achieve): {exit_condition}
Learner baseline (what they already know): {json.dumps(knowledge_baseline)}

Evidence from web sources:
{evidence_text}

Based on this evidence, build a weighted dependency graph.
For each concept node output exactly this structure:

{{
  "id": "snake_case_unique_id",
  "title": "Concept Title",
  "description": "One sentence — what this concept is",
  "why_needed": "One sentence — why this is needed to reach the exit condition",
  "prerequisites": ["id_of_concept_that_must_come_first"],
  "complexity": 0.0,
  "estimated_hours": 0.0,
  "requires_live_data": false,
  "source_count": 0
}}

Fields:
- id: snake_case, unique, derived from title
- prerequisites: list of concept IDs that must be mastered before this one. Empty list if none.
- complexity: 0.0 (trivial) to 1.0 (extremely hard). Derived from sources.
- estimated_hours: realistic hours to reach mastery. Derived from sources.
- requires_live_data: true if concept involves versioned APIs, current laws, live prices, etc.
- source_count: how many of the provided sources mention this concept (1-6)

Critical rules:
- Prune any concept already covered by the learner baseline
- Only include concepts on the critical path to the exit condition
- Order must respect prerequisite dependencies
- Do not include more concepts than genuinely needed
- Do not include fewer concepts than genuinely needed

Output ONLY the JSON array. Nothing else.
"""


async def build_graph(
    topic: str,
    exit_condition: str,
    knowledge_baseline: dict,
    search_results: list,
) -> dict:
    """
    Main graph builder function.
    Takes search results, synthesizes a weighted dependency graph.
    Returns validated-ready node list + evidence strength metadata.
    """
    evidence_text = build_evidence_text(search_results)

    user_prompt = build_user_prompt(
        topic=topic,
        exit_condition=exit_condition,
        knowledge_baseline=knowledge_baseline,
        evidence_text=evidence_text,
    )

    raw = await complete(
        messages=[
            {"role": "system", "content": GRAPH_BUILDER_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        model_size="large",
        temperature=0.2,
        max_tokens=4000,
    )

    # Strip markdown if model wraps in ```json
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        nodes = json.loads(raw)
    except json.JSONDecodeError as e:
        return {
            "nodes": [],
            "error": f"JSON parse failed: {str(e)}",
            "raw": raw,
        }

    # Sanity check each node has required fields
    required_fields = [
        "id", "title", "description", "why_needed",
        "prerequisites", "complexity", "estimated_hours",
        "requires_live_data", "source_count"
    ]
    clean_nodes = []
    for node in nodes:
        if all(f in node for f in required_fields):
            # Clamp complexity and hours to valid ranges
            node["complexity"] = max(0.0, min(1.0, float(node["complexity"])))
            node["estimated_hours"] = max(0.5, float(node["estimated_hours"]))
            clean_nodes.append(node)

    return {
        "nodes": clean_nodes,
        "total_nodes": len(clean_nodes),
        "error": None,
    }
