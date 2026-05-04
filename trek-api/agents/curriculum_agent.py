import json
import sys
sys.path.append(".")

from agents.search_agent import run_search, targeted_search
from agents.graph_builder_agent import build_graph
from agents.validator_agent import validate_graph
from utils.sprint_grouper import generate_sprint_plan
from utils.model_router import complete

GIST_SYSTEM = """
You are Assign. The user has just had their learning profile built.
You are now presenting their personalized course to them before they approve it.

Write a warm, direct course preview. Cover:
1. What they will be able to do by the end
2. What the course emphasizes and why
3. How many sprints, total hours
4. What is deferred (if anything) and why

Be honest if some concepts are deferred due to timeline constraints.
Nothing is cut forever — deferred concepts stay in the roadmap for later unlock.
Talk like a sharp Gen Z friend. No bullet points. Conversational prose.
Keep it under 150 words.
"""


async def generate_gist(
    learner_profile: dict,
    sprint_plan: dict,
) -> str:
    """
    Generates the human-readable course preview shown to user before approval.
    """
    response = await complete(
        messages=[
            {"role": "system", "content": GIST_SYSTEM},
            {
                "role": "user",
                "content": f"""
Learner profile: {json.dumps(learner_profile)}
Sprint plan: {json.dumps({
    "total_sprints": sprint_plan["total_sprints"],
    "total_hours": sprint_plan["total_hours"],
    "weeks_available": sprint_plan.get("weeks_available"),
    "available_hours": sprint_plan["available_hours"],
    "core_count": sprint_plan.get("core_count"),
    "deferred_count": sprint_plan.get("deferred_count", 0),
    "sprints": [
        {
            "sprint_number": s["sprint_number"],
            "total_hours": s["total_hours"],
            "concepts": [c["title"] for c in s["concepts"]],
        }
        for s in sprint_plan["sprints"]
    ],
    "deferred_nodes": [c["title"] for c in sprint_plan.get("deferred_nodes", [])],
})}

Write the course preview now.
"""
            }
        ],
        model_size="large",
        temperature=0.7,
        max_tokens=300,
    )
    return response


async def run_curriculum(learner_profile: dict) -> dict:
    """
    Full curriculum pipeline.
    Input: learner profile from discovery agent.
    Output: validated sprint plan + gist + raw nodes.

    Pipeline:
    1. Search — find real curriculum content from the web
    2. Graph builder — synthesize weighted dependency graph
    3. Validator — scrutinize every node, reject weak ones
    4. Re-search — targeted search for any rejected nodes that need it
    5. Sprint grouper — partition canonical graph into core path + deferred set
    6. Gist generator — human-readable course preview
    """
    topic = learner_profile["topic"]
    exit_condition = learner_profile["exit_condition"]
    knowledge_baseline = learner_profile["knowledge_baseline"]
    available_hours = learner_profile["available_hours"]
    weeks_available = learner_profile.get("weeks_available")

    # Syllabus override — if the student uploaded a syllabus, lock topic order
    syllabus_topics = learner_profile.get("syllabus_topics")
    if syllabus_topics:
        topics_str = json.dumps(syllabus_topics)
        exit_condition = (
            "The student has provided their syllabus. Generate KCs that map directly to these topics "
            f"in this order: {topics_str}. Use Tavily to find content for each topic but follow the "
            "syllabus structure for KC titles and ordering. " + exit_condition
        )

    # ── Step 1: Search ──────────────────────────────────────────
    print(f"[curriculum] searching for: {topic}")
    search_data = await run_search(topic, exit_condition)
    print(f"[curriculum] evidence strength: {search_data['evidence_strength']}, "
          f"sources: {len(search_data['results'])}")

    # ── Step 2: Graph builder ────────────────────────────────────
    print("[curriculum] building dependency graph...")
    graph_data = await build_graph(
        topic=topic,
        exit_condition=exit_condition,
        knowledge_baseline=knowledge_baseline,
        search_results=search_data["results"],
    )

    if graph_data.get("error") or not graph_data["nodes"]:
        return {
            "error": "Graph builder failed to produce nodes",
            "detail": graph_data.get("error"),
        }

    print(f"[curriculum] graph built: {graph_data['total_nodes']} nodes")

    # ── Step 3: Validator ────────────────────────────────────────
    print("[curriculum] validating graph...")
    validation = await validate_graph(
        topic=topic,
        exit_condition=exit_condition,
        nodes=graph_data["nodes"],
    )

    print(f"[curriculum] validation: {validation['graph_confidence']} confidence, "
          f"{validation['total_passed']}/{validation['total_input']} passed")

    # ── Step 4: Re-search for rejected nodes ─────────────────────
    if validation["needs_research"]:
        print(f"[curriculum] re-searching {len(validation['needs_research'])} rejected nodes...")
        for concept_id in validation["needs_research"]:
            extra = await targeted_search(concept_id.replace("_", " "), topic)
            if extra["results"]:
                # Re-run graph builder just for this concept with extra evidence
                extra_graph = await build_graph(
                    topic=topic,
                    exit_condition=exit_condition,
                    knowledge_baseline=knowledge_baseline,
                    search_results=extra["results"],
                )
                # Add any new nodes the validator didn't reject
                existing_ids = {n["id"] for n in validation["validated_nodes"]}
                for node in extra_graph["nodes"]:
                    if node["id"] not in existing_ids:
                        validation["validated_nodes"].append(node)

    validated_nodes = validation["validated_nodes"]

    if not validated_nodes:
        return {"error": "No nodes survived validation"}

    # ── Step 5: Sprint grouper ────────────────────────────────────
    print("[curriculum] generating sprint plan...")
    sprint_plan = generate_sprint_plan(
        validated_nodes=validated_nodes,
        weeks_available=weeks_available,
        topic=topic,
        exit_condition=exit_condition,
        available_hours=available_hours,
    )

    print(f"[curriculum] {sprint_plan['total_sprints']} sprints, "
          f"{sprint_plan['total_hours']}h total, "
          f"{sprint_plan['deferred_count']} concepts deferred")

    # ── Step 6: Gist ──────────────────────────────────────────────
    print("[curriculum] generating course preview...")
    gist = await generate_gist(learner_profile, sprint_plan)

    if syllabus_topics:
        gist = "course mapped to your syllabus — " + gist

    return {
        "sprint_plan": sprint_plan,
        "core_path": sprint_plan["core_path"],
        "deferred_nodes": sprint_plan["deferred_nodes"],
        "validated_nodes": sprint_plan["deferred_nodes"],
        "canonical_nodes": validated_nodes,
        "gist": gist,
        "evidence_strength": search_data["evidence_strength"],
        "graph_confidence": validation["graph_confidence"],
        "sources_hit": [r["url"] for r in search_data["results"]],
        "error": None,
    }
