import json
import asyncio
from utils.model_router import complete

VALIDATOR_PROMPT = """
You are an adversarial curriculum validator. Your job is to scrutinize every concept 
node produced by a graph builder and decide if it is accurate, well-ordered, and 
genuinely evidence-backed.

You are NOT the graph builder. You are its critic.
You must be skeptical. Your default stance is to question, not approve.

For each node you will output one of three verdicts:
- ACCEPT: node is correct, well-placed, evidence-backed
- CORRECT: node has issues you will fix (wrong complexity, time, prerequisites)
- REJECT: node has no business being in this graph

Rules:
1. Prerequisite ordering — if B requires A, A must appear before B with no exceptions
2. Complexity calibration — compare nodes against each other. 
   If everything is scored 0.7+, something is wrong. There must be variance.
3. Time estimates — must be realistic. A "beginner concept" taking 8 hours is wrong.
   A "highly complex" concept taking 0.5 hours is wrong.
4. Source count — nodes with source_count of 1 are suspect. 
   If source_count is 1 and the concept seems niche, REJECT it.
5. Critical path — every node must be necessary to reach the exit condition.
   If removing a node would not affect reaching the exit condition, REJECT it.
6. Prerequisite consistency — if node A lists node B as a prerequisite,
   node B must exist in the graph. Flag broken references.

Output ONLY a valid JSON array. No prose. No markdown. Nothing else.
"""


def build_validator_prompt(
    topic: str,
    exit_condition: str,
    nodes: list,
) -> str:
    return f"""
Topic: {topic}
Exit condition: {exit_condition}

Nodes to validate:
{json.dumps(nodes, indent=2)}

For each node output exactly this structure:
{{
  "id": "same id as input node",
  "verdict": "ACCEPT | CORRECT | REJECT",
  "reason": "one sentence explaining your verdict",
  "corrected_node": null
}}

If verdict is CORRECT, corrected_node must be the full corrected node object 
with all fields from the original, with your fixes applied.
If verdict is ACCEPT or REJECT, corrected_node must be null.

If verdict is REJECT, also set:
"needs_research": true if you think a targeted search might surface 
a better replacement concept, false if the concept should just be dropped.

Output ONLY the JSON array. Nothing else.
"""


async def validate_graph(
    topic: str,
    exit_condition: str,
    nodes: list,
) -> dict:
    """
    Validates every node in the graph.
    Returns accepted + corrected nodes.
    Flags rejected nodes for re-search or dropping.
    """
    raw = await complete(
        messages=[
            {"role": "system", "content": VALIDATOR_PROMPT},
            {"role": "user", "content": build_validator_prompt(
                topic, exit_condition, nodes
            )},
        ],
        model_size="small",
        temperature=0.1,
        max_tokens=3000,
    )

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        verdicts = json.loads(raw)
    except json.JSONDecodeError as e:
        return {
            "validated_nodes": nodes,
            "verdicts": [],
            "error": f"JSON parse failed: {str(e)}",
        }

    # Process verdicts
    validated_nodes = []
    rejected = []
    needs_research = []

    original_map = {n["id"]: n for n in nodes}

    for verdict in verdicts:
        node_id = verdict.get("id")
        decision = verdict.get("verdict")

        if decision == "ACCEPT":
            if node_id in original_map:
                validated_nodes.append(original_map[node_id])

        elif decision == "CORRECT":
            corrected = verdict.get("corrected_node")
            if corrected:
                # Clamp values after correction
                corrected["complexity"] = max(0.0, min(1.0, 
                    float(corrected.get("complexity", 0.5))))
                corrected["estimated_hours"] = max(0.5, 
                    float(corrected.get("estimated_hours", 1.0)))
                validated_nodes.append(corrected)
            elif node_id in original_map:
                validated_nodes.append(original_map[node_id])

        elif decision == "REJECT":
            rejected.append({
                "id": node_id,
                "reason": verdict.get("reason", ""),
                "needs_research": verdict.get("needs_research", False),
            })
            if verdict.get("needs_research"):
                needs_research.append(node_id)

    # Fix broken prerequisite references
    valid_ids = {n["id"] for n in validated_nodes}
    for node in validated_nodes:
        node["prerequisites"] = [
            p for p in node.get("prerequisites", [])
            if p in valid_ids
        ]

    # Confidence score: ratio of accepted+corrected to total
    total = len(nodes)
    passed = len(validated_nodes)
    confidence = passed / total if total > 0 else 0.0

    if confidence >= 0.8:
        graph_confidence = "HIGH"
    elif confidence >= 0.5:
        graph_confidence = "MEDIUM"
    else:
        graph_confidence = "LOW"

    return {
        "validated_nodes": validated_nodes,
        "rejected": rejected,
        "needs_research": needs_research,
        "graph_confidence": graph_confidence,
        "confidence_score": confidence,
        "total_input": total,
        "total_passed": passed,
        "error": None,
    }
