from dataclasses import dataclass


@dataclass
class Sprint:
    sprint_number: int
    concepts: list
    total_hours: float
    cognitive_load: float


def compute_cognitive_load(concepts: list) -> float:
    total = 0.0
    for c in concepts:
        complexity = c.get("complexity", 0.5)
        hours = c.get("estimated_hours", 1.0)
        if complexity >= 0.8:
            total += hours * 1.5
        elif complexity >= 0.6:
            total += hours * 1.2
        else:
            total += hours
    return round(total, 2)


def has_high_complexity_conflict(concepts: list) -> bool:
    high = [c for c in concepts if c.get("complexity", 0) >= 0.8]
    return len(high) >= 2


def topological_sort(nodes: list) -> list:
    node_map = {n["id"]: n for n in nodes}
    visited = set()
    sorted_nodes = []

    def visit(node_id: str):
        if node_id in visited:
            return
        visited.add(node_id)
        node = node_map.get(node_id)
        if not node:
            return
        for prereq_id in node.get("prerequisites", []):
            visit(prereq_id)
        sorted_nodes.append(node)

    for node in nodes:
        visit(node["id"])

    return sorted_nodes


def prune_by_time(sorted_nodes: list, available_hours: float) -> tuple[list, list]:
    total_hours = sum(n.get("estimated_hours", 1.0) for n in sorted_nodes)

    if total_hours <= available_hours:
        return sorted_nodes, []

    all_prereqs = set()
    for node in sorted_nodes:
        for p in node.get("prerequisites", []):
            all_prereqs.add(p)

    non_critical = [n for n in sorted_nodes if n["id"] not in all_prereqs]
    non_critical.sort(key=lambda x: x.get("complexity", 0))

    kept = list(sorted_nodes)
    cut = []

    for node in non_critical:
        current_total = sum(n.get("estimated_hours", 1.0) for n in kept)
        if current_total > available_hours:
            kept.remove(node)
            cut.append(node)
        else:
            break

    return kept, cut


def group_into_sprints(nodes: list, max_sprint_load: float = 6.0) -> list[Sprint]:
    sprints = []
    current_concepts = []
    sprint_number = 1

    for node in nodes:
        candidate = current_concepts + [node]
        candidate_load = compute_cognitive_load(candidate)
        has_conflict = has_high_complexity_conflict(candidate)

        if candidate_load <= max_sprint_load and not has_conflict:
            current_concepts.append(node)
        else:
            if current_concepts:
                sprints.append(Sprint(
                    sprint_number=sprint_number,
                    concepts=current_concepts,
                    total_hours=sum(
                        c.get("estimated_hours", 1.0) for c in current_concepts
                    ),
                    cognitive_load=compute_cognitive_load(current_concepts),
                ))
                sprint_number += 1
            current_concepts = [node]

    if current_concepts:
        sprints.append(Sprint(
            sprint_number=sprint_number,
            concepts=current_concepts,
            total_hours=sum(
                c.get("estimated_hours", 1.0) for c in current_concepts
            ),
            cognitive_load=compute_cognitive_load(current_concepts),
        ))

    return sprints


def generate_sprint_plan(
    validated_nodes: list,
    available_hours: float,
    topic: str,
    exit_condition: str,
) -> dict:
    sorted_nodes = topological_sort(validated_nodes)
    kept_nodes, cut_nodes = prune_by_time(sorted_nodes, available_hours)
    sprints = group_into_sprints(kept_nodes)

    sprint_data = []
    for sprint in sprints:
        sprint_data.append({
            "sprint_number": sprint.sprint_number,
            "total_hours": round(sprint.total_hours, 1),
            "cognitive_load": sprint.cognitive_load,
            "concepts": sprint.concepts,
        })

    total_hours = sum(s["total_hours"] for s in sprint_data)

    return {
        "topic": topic,
        "exit_condition": exit_condition,
        "total_sprints": len(sprints),
        "total_hours": round(total_hours, 1),
        "available_hours": available_hours,
        "sprints": sprint_data,
        "cut_nodes": cut_nodes,
        "cut_count": len(cut_nodes),
    }