import asyncio
import sys
sys.path.append(".")
from agents.curriculum_agent import run_curriculum

async def test():
    print("Curriculum pipeline test\n")
    print("=" * 50)

    learner_profile = {
        "topic": "machine learning for recommendation systems",
        "exit_condition": "build and deploy a recommendation system",
        "knowledge_baseline": {
            "summary": "familiar with Python basics, data analysis with pandas",
            "probed_concept": "simple Python functions and data structures",
            "probe_result": "partial",
        },
        "available_hours": 42.0,
        "context": "building a recommendation system for work project",
    }

    result = await run_curriculum(learner_profile)

    if result.get("error"):
        print(f"Error: {result['error']}")
        return

    print(f"\nEvidence strength: {result['evidence_strength']}")
    print(f"Graph confidence: {result['graph_confidence']}")
    print(f"Sources hit: {len(result['sources_hit'])}")
    print(f"\nSprint plan:")
    print(f"  Total sprints: {result['sprint_plan']['total_sprints']}")
    print(f"  Total hours: {result['sprint_plan']['total_hours']}")
    print(f"  Cut nodes: {result['sprint_plan']['cut_count']}")

    for sprint in result["sprint_plan"]["sprints"]:
        print(f"\n  Sprint {sprint['sprint_number']} "
              f"({sprint['total_hours']}h, load: {sprint['cognitive_load']})")
        for c in sprint["concepts"]:
            print(f"    - {c['title']} [{c['complexity']}] ({c['estimated_hours']}h)")

    print(f"\nCourse preview:\n")
    print(result["gist"])

asyncio.run(test())