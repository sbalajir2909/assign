from utils.sprint_grouper import generate_sprint_plan, topological_sort


def _node(node_id: str, title: str, prerequisites: list[str], complexity: int) -> dict:
    return {
        "id": node_id,
        "title": title,
        "description": title,
        "why_needed": title,
        "prerequisites": prerequisites,
        "complexity": complexity,
        "estimated_hours": 1.0,
        "requires_live_data": False,
        "source_count": 3,
    }


def test_topological_sort_prefers_lower_complexity_among_available_nodes():
    nodes = [
        _node("advanced_setup", "Advanced Setup", [], 5),
        _node("basics", "Basics", [], 1),
        _node("project", "Project", ["basics"], 3),
    ]

    ordered = topological_sort(nodes)

    assert [node["id"] for node in ordered[:2]] == ["basics", "advanced_setup"]


def test_partition_keeps_foundations_and_defers_the_rest():
    nodes = [
        _node("syntax", "Syntax", [], 1),
        _node("variables", "Variables", [], 1),
        _node("control_flow", "Control Flow", ["syntax"], 2),
        _node("functions", "Functions", ["variables"], 2),
        _node("oop", "OOP", ["functions"], 4),
        _node("testing", "Testing", ["functions"], 3),
    ]

    plan = generate_sprint_plan(
        validated_nodes=nodes,
        weeks_available=2,
        topic="Python",
        exit_condition="build apps",
        available_hours=6.0,
    )

    assert [node["id"] for node in plan["core_path"]] == [
        "syntax",
        "variables",
        "control_flow",
        "functions",
    ]
    assert [node["id"] for node in plan["deferred_nodes"]] == ["testing", "oop"]
    assert all(not node["prerequisites"] or node["id"] not in {"syntax", "variables"} for node in plan["deferred_nodes"])


def test_no_deadline_keeps_all_kcs_in_core():
    nodes = [
        _node("a", "A", [], 1),
        _node("b", "B", ["a"], 2),
        _node("c", "C", ["b"], 3),
    ]

    plan = generate_sprint_plan(
        validated_nodes=nodes,
        weeks_available=999,
        topic="Topic",
        exit_condition="Goal",
    )

    assert len(plan["core_path"]) == 3
    assert plan["deferred_nodes"] == []
