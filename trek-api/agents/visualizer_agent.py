import json
import re
from utils.model_router import complete

CLASSIFIER_SYSTEM = """
You are a visual learning classifier. Your default answer is NO.
Only recommend a visual if it genuinely reveals something that words cannot.

Output ONLY a JSON object. Nothing else.

{
  "should_visualize": false,
  "visual_type": "mermaid | svg | none",
  "visual_subtype": "flowchart | graph | sequence | timeline | illustration | metaphor",
  "confidence": "HIGH | MEDIUM | LOW",
  "reason": "one sentence explaining the decision"
}

NEVER visualize these — always return should_visualize=false:
- Definitions ("what is X")
- Philosophical or motivational concepts ("why X matters")
- Opinions or value judgments
- Concepts where the visual would be arbitrary decoration
- Anything where words explain it better than shapes

ONLY visualize these — and only if confidence is HIGH or MEDIUM:
- mermaid/flowchart: step-by-step processes with clear sequence (auth flow, algorithm steps)
- mermaid/graph: dependency relationships between named components
- mermaid/sequence: two or more actors exchanging messages over time
- mermaid/stateDiagram-v2: a system with distinct states and transitions
- svg/illustration: physical mechanisms or abstract concepts with genuine spatial structure
  (neural network layers, memory layout, tree structures, attention mechanism)
- svg/metaphor: abstract concept that has a natural geometric metaphor
  (gradient descent as a ball rolling downhill, hash table as buckets)

Visual type rules — be strict:
- mermaid: use ONLY when there is a clear process, sequence, or named relationship graph
- svg: use ONLY when spatial arrangement genuinely carries meaning
- If concept is spatial/layered/geometric → svg
- If concept is a process/flow/sequence → mermaid
- If unsure → none

Confidence rules:
- HIGH: the visual type is obvious and the content is structurally safe to draw
- MEDIUM: visual would help but content is partially ambiguous
- LOW: uncertain — set should_visualize=false when confidence is LOW
"""

MERMAID_SYSTEM = """
You are a Mermaid diagram generator for educational content.
Generate clean, accurate Mermaid diagram code for the given concept.

Rules:
- Output ONLY the raw Mermaid code. No markdown fences. No explanation.
- Use only concepts that are structurally derived from the concept description.
- Never invent facts or relationships not present in the concept definition.
- Keep diagrams simple — max 8 nodes for flowcharts, max 6 for others.
- Labels must be short — max 5 words per node.
- Use the correct Mermaid syntax for the diagram type.

Supported types and their syntax starters:
- flowchart: flowchart TD
- graph: graph LR  
- sequence: sequenceDiagram
- timeline: timeline
- state machine: stateDiagram-v2
"""

SVG_SYSTEM = """
You are an SVG educational diagram generator.
Generate clean, accurate SVG code that visually explains a concept.

Rules:
- Output ONLY raw SVG code starting with <svg and ending with </svg>
- viewBox must be "0 0 600 400"
- Use simple shapes only: rect, circle, ellipse, line, path, text, arrow
- Colors: use simple flat colors, no gradients
- Text: font-family sans-serif, font-size 14px max
- Never draw anything not described in the concept definition
- Never invent relationships or mechanisms
- Keep it clean — max 12 visual elements
- Every text element must be readable — never overlap text with shapes
- If you cannot draw this accurately, output: <svg viewBox="0 0 600 400"></svg>

The empty SVG is acceptable. A wrong SVG is not.
"""


async def classify_concept(concept: dict, conversation_context: str) -> dict:
    """
    Decides if and how to visualize the current concept.
    Uses small model — pure classification task.
    """
    response = await complete(
        messages=[
            {"role": "system", "content": CLASSIFIER_SYSTEM},
            {
                "role": "user",
                "content": f"""
Concept:
{json.dumps(concept, indent=2)}

Recent conversation context:
{conversation_context}

Should this concept be visualized right now?
"""
            }
        ],
        model_size="small",
        temperature=0.1,
        max_tokens=150,
    )

    try:
        result = json.loads(response)
        return result
    except json.JSONDecodeError:
        return {
            "should_visualize": False,
            "visual_type": "none",
            "confidence": "LOW",
            "reason": "Classification failed",
        }


async def generate_mermaid(
    concept: dict,
    visual_subtype: str,
    search_evidence: list = None,
) -> str:
    """
    Generates Mermaid diagram code.
    Grounded in concept definition and optional search evidence.
    """
    evidence_text = ""
    if search_evidence:
        evidence_text = "\n\nSupporting evidence from web sources:\n"
        for r in search_evidence[:3]:
            evidence_text += f"- {r.get('title', '')}: {r.get('content', '')[:300]}\n"

    response = await complete(
        messages=[
            {"role": "system", "content": MERMAID_SYSTEM},
            {
                "role": "user",
                "content": f"""
Generate a {visual_subtype} diagram for this concept:

{json.dumps(concept, indent=2)}
{evidence_text}

Output only the raw Mermaid code.
"""
            }
        ],
        model_size="large",
        temperature=0.2,
        max_tokens=600,
    )

    # Strip markdown fences if model adds them
    raw = response.strip()
    if raw.startswith("```"):
        raw = re.sub(r"```[\w]*\n?", "", raw)
        raw = raw.replace("```", "").strip()

    return raw


async def generate_svg(
    concept: dict,
    search_evidence: list = None,
) -> str:
    """
    Generates SVG illustration code.
    Grounded in concept definition and optional search evidence.
    Falls back to empty SVG if uncertain.
    """
    evidence_text = ""
    if search_evidence:
        evidence_text = "\n\nSupporting evidence:\n"
        for r in search_evidence[:2]:
            evidence_text += f"- {r.get('content', '')[:400]}\n"

    response = await complete(
        messages=[
            {"role": "system", "content": SVG_SYSTEM},
            {
                "role": "user",
                "content": f"""
Generate an SVG illustration for this concept:

{json.dumps(concept, indent=2)}
{evidence_text}

Output only the raw SVG code.
"""
            }
        ],
        model_size="large",
        temperature=0.2,
        max_tokens=1500,
    )

    raw = response.strip()

    # Validate it looks like SVG
    if not raw.startswith("<svg"):
        return '<svg viewBox="0 0 600 400"></svg>'

    return raw


async def run_visualizer(
    concept: dict,
    conversation: list[dict],
    search_evidence: list = None,
) -> dict:
    """
    Main visualizer function.
    Called by teaching agent after explaining a concept.

    Returns:
    {
        "should_visualize": bool,
        "visual_type": "mermaid | svg | none",
        "visual_subtype": str,
        "code": str,
        "confidence": str,
        "reason": str,
    }
    """
    # Build conversation context for classifier
    context = "\n".join([
        f"{m['role']}: {m['content'][:200]}"
        for m in conversation[-4:]
    ])

    # Step 1: classify
    classification = await classify_concept(concept, context)

    if (
        not classification.get("should_visualize")
        or classification.get("confidence") == "LOW"
        or classification.get("visual_type") == "none"
    ):
        return {
            "should_visualize": False,
            "visual_type": "none",
            "visual_subtype": None,
            "code": None,
            "confidence": classification.get("confidence", "LOW"),
            "reason": classification.get("reason", "No visual needed"),
        }

    visual_type = classification.get("visual_type")
    visual_subtype = classification.get("visual_subtype", "flowchart")

    # Step 2: generate
    if "mermaid" in visual_type:
        visual_type = "mermaid"
        code = await generate_mermaid(concept, visual_subtype, search_evidence)
    elif "svg" in visual_type:
        visual_type = "svg"
        code = await generate_svg(concept, search_evidence)
    else:
        code = None

    # Step 3: validate output is not empty
    if not code or code.strip() == '<svg viewBox="0 0 600 400"></svg>':
        return {
            "should_visualize": False,
            "visual_type": "none",
            "visual_subtype": None,
            "code": None,
            "confidence": "LOW",
            "reason": "Generation produced empty output — abstaining",
        }

    return {
        "should_visualize": True,
        "visual_type": visual_type,
        "visual_subtype": visual_subtype,
        "code": code,
        "confidence": classification.get("confidence"),
        "reason": classification.get("reason"),
    }
