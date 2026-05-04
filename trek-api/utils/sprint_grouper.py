from dataclasses import dataclass
from heapq import heappop, heappush


@dataclass
class Sprint:
    sprint_number: int
    concepts: list
    total_hours: float
    cognitive_load: float


def compute_cognitive_load(concepts: list) -> float:
    total = 0.0
    for c in concepts:
        complexity = _normalized_complexity(c.get("complexity", 3))
        hours = c.get("estimated_hours", 1.0)
        if complexity >= 0.8:
            total += hours * 1.5
        elif complexity >= 0.6:
            total += hours * 1.2
        else:
            total += hours
    return round(total, 2)


def has_high_complexity_conflict(concepts: list) -> bool:
    high = [c for c in concepts if _normalized_complexity(c.get("complexity", 3)) >= 0.8]
    return len(high) >= 2


def _normalized_complexity(value: float | int) -> float:
    number = float(value or 0)
    if number < 1.0:
        return max(0.0, number)
    return max(0.0, min(1.0, number / 5.0))


def topological_sort(nodes: list) -> list:
    node_map = {n["id"]: n for n in nodes}
    indegree = {n["id"]: 0 for n in nodes}
    children = {n["id"]: [] for n in nodes}
    original_order = {n["id"]: idx for idx, n in enumerate(nodes)}
    levels = {n["id"]: 0 for n in nodes}

    for node in nodes:
        for prereq_id in node.get("prerequisites", []):
            if prereq_id in node_map:
                indegree[node["id"]] += 1
                children[prereq_id].append(node["id"])

    heap: list[tuple[int, float, int, str]] = []
    for node_id, degree in indegree.items():
        if degree == 0:
            node = node_map[node_id]
            heappush(
                heap,
                (levels[node_id], _normalized_complexity(node.get("complexity", 3)), original_order[node_id], node_id),
            )

    sorted_nodes = []
    seen = set()

    while heap:
        _, _, _, node_id = heappop(heap)
        if node_id in seen:
            continue
        seen.add(node_id)
        sorted_nodes.append(node_map[node_id])
        for child_id in children[node_id]:
            levels[child_id] = max(levels[child_id], levels[node_id] + 1)
            indegree[child_id] -= 1
            if indegree[child_id] == 0:
                child = node_map[child_id]
                heappush(
                    heap,
                    (levels[child_id], _normalized_complexity(child.get("complexity", 3)), original_order[child_id], child_id),
                )

    if len(sorted_nodes) != len(nodes):
        leftovers = [
            node for node in nodes
            if node["id"] not in seen
        ]
        leftovers.sort(key=lambda node: (levels[node["id"]], _normalized_complexity(node.get("complexity", 3)), original_order[node["id"]]))
        sorted_nodes.extend(leftovers)

    return sorted_nodes


def partition_core_and_deferred(sorted_nodes: list, weeks_available: int | None) -> tuple[list, list]:
    total_kcs = len(sorted_nodes)
    if weeks_available is None:
        return sorted_nodes, []

    if weeks_available >= 999:
        return sorted_nodes, []

    target = min(total_kcs, max(0, int(weeks_available) * 2))
    selected_ids = {
        node["id"]
        for node in sorted_nodes
        if not node.get("prerequisites")
    }

    for node in sorted_nodes:
        if len(selected_ids) >= target and target > 0:
            break
        selected_ids.add(node["id"])

    core_path = [node for node in sorted_nodes if node["id"] in selected_ids]
    deferred = [node for node in sorted_nodes if node["id"] not in selected_ids]
    return core_path, deferred


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
    weeks_available: int | None,
    topic: str,
    exit_condition: str,
    available_hours: float | None = None,
) -> dict:
    sorted_nodes = topological_sort(validated_nodes)
    core_path, deferred_nodes = partition_core_and_deferred(sorted_nodes, weeks_available)
    sprints = group_into_sprints(core_path)

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
        "weeks_available": weeks_available,
        "total_sprints": len(sprints),
        "total_hours": round(total_hours, 1),
        "available_hours": available_hours,
        "sprints": sprint_data,
        "core_path": core_path,
        "core_count": len(core_path),
        "deferred_nodes": deferred_nodes,
        "deferred_count": len(deferred_nodes),
        # Backward-compatible aliases for older consumers that still read cut_*.
        "cut_nodes": deferred_nodes,
        "cut_count": len(deferred_nodes),
    }
