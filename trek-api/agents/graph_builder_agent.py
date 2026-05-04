import json
import asyncio
import re
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
8. Build the canonical map, not a shortened syllabus. Do not prune for time.

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

Generate a COMPLETE knowledge graph for {topic} with ALL concepts a learner needs
to go from the learner baseline above to the exit condition above.
No time budget. No cutting. Generate every KC that belongs in this learning journey.
Minimum 10 KCs, no maximum.

Based on this evidence, build the canonical dependency graph.
For each concept node output exactly this structure:

{{
  "id": "snake_case_unique_id",
  "title": "Concept Title",
  "description": "One sentence — what this concept is",
  "why_needed": "One sentence — why this is needed to reach the exit condition",
  "prerequisites": ["Title of concept that must come first"],
  "complexity": 1,
  "estimated_hours": 1.0,
  "requires_live_data": false,
  "source_count": 0
}}

Fields:
- id: snake_case, unique, derived from title
- prerequisites: list of concept TITLES that must be mastered before this one. Empty list if none.
- complexity: integer 1 (foundational) to 5 (very advanced). Derived from sources.
- estimated_hours: 0.5 to 2.0 hours for the KC itself.
- requires_live_data: true if concept involves versioned APIs, current laws, live prices, etc.
- source_count: how many of the provided sources mention this concept (1-6)

Critical rules:
- This is the canonical map. Do NOT prune for time, brevity, or learner confidence.
- Do NOT drop concepts just because the learner already knows them. Include them in the map.
- Include foundational, intermediate, and advanced concepts if they belong in the journey.
- Order must respect prerequisite dependencies.
- The graph must be exhaustive enough that later sprint partitioning can defer concepts without losing them.

Output ONLY the JSON array. Nothing else.
"""


def _slugify_title(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")
    return slug or "concept"


def _normalize_prerequisites(nodes: list[dict]) -> None:
    id_map = {n.get("id"): n.get("id") for n in nodes if n.get("id")}
    title_map = {
        (n.get("title") or "").strip().lower(): n.get("id")
        for n in nodes
        if n.get("title") and n.get("id")
    }

    for node in nodes:
        normalized: list[str] = []
        for prereq in node.get("prerequisites", []):
            if not isinstance(prereq, str):
                continue
            prereq_key = prereq.strip()
            mapped = id_map.get(prereq_key) or title_map.get(prereq_key.lower())
            if mapped and mapped != node.get("id") and mapped not in normalized:
                normalized.append(mapped)
        node["prerequisites"] = normalized


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
            node["id"] = _slugify_title(node.get("title", "")) or node["id"]
            # Clamp complexity and hours to the canonical-map ranges.
            node["complexity"] = int(max(1, min(5, round(float(node["complexity"])))))
            node["estimated_hours"] = max(0.5, min(2.0, float(node["estimated_hours"])))
            clean_nodes.append(node)

    _normalize_prerequisites(clean_nodes)

    return {
        "nodes": clean_nodes,
        "total_nodes": len(clean_nodes),
        "error": None,
    }
