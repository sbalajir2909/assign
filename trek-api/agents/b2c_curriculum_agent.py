"""
B2C Curriculum agent — wraps the existing curriculum pipeline.
Converts the sprint planner's core path → KCNode objects and persists to Supabase.

Profile mapping:
  prior_knowledge  → knowledge_baseline (passed to build_graph)
  goal_type        → exit_condition (shapes KC graph focus)
  weeks_available  → core/deferred partition size (≈ 2 KCs/week)
  prior_knowledge  → pre-known KCs placed first in kc_graph as already-mastered,
                     teaching starts at first new KC
"""

import uuid
from datetime import datetime, timezone
from agents.curriculum_agent import run_curriculum
from graph.b2c_state import KCNode
from utils.sm2 import update_sm2
from db.client import supabase
from db.roadmaps import save_roadmap


# ── Pre-known KC detection ────────────────────────────────────────────────────

_STOP_WORDS = {
    'and', 'or', 'the', 'a', 'an', 'in', 'of', 'to', 'is', 'for',
    'with', 'on', 'at', 'from', 'by', 'as', 'its', 'it', 'be', 'are',
}


def _is_pre_known(title: str, prior_knowledge: list[str]) -> bool:
    """
    Returns True if a KC title meaningfully overlaps with the student's
    stated prior knowledge.  Uses word-level overlap + substring matching.
    Intentionally conservative — only flags clear matches to avoid
    incorrectly skipping KCs the student doesn't actually know.
    """
    if not prior_knowledge:
        return False
    title_lower = title.lower()
    title_words = set(title_lower.split()) - _STOP_WORDS
    if not title_words:
        return False
    for item in prior_knowledge:
        item_lower = item.lower().strip()
        if not item_lower:
            continue
        item_words = set(item_lower.split()) - _STOP_WORDS
        overlap = title_words & item_words

        # Direct substring: "lists" in "Python lists" or "Python lists" in "lists"
        if len(item_words) >= 2 and (item_lower in title_lower or title_lower in item_lower):
            return True
        # Word-level overlap ignoring stop words. Require at least two concrete
        # overlaps so broad self-reports do not auto-master whole branches.
        if len(overlap) >= 2:
            return True
        # Short KC titles can still count if every meaningful title word is
        # explicitly covered by the learner's prior-knowledge phrase.
        if title_words and len(title_words) <= 2 and overlap == title_words:
            return True
    return False


# ── Profile → curriculum pipeline mapping ────────────────────────────────────

_GOAL_EXIT_CONDITIONS = {
    "exam": (
        "Pass the {topic} exam — prioritize breadth and recall. "
        "Weight toward concepts most likely to appear on tests. "
        "Include revision and recall practice. Goal: {detail}"
    ),
    "project": (
        "Build a project using {topic} — prioritize applied, practical KCs. "
        "End with a synthesis KC that ties the project together. Goal: {detail}"
    ),
    "deep_understanding": (
        "Deep understanding of {topic} — include theory, internals, and edge cases. "
        "Do not sacrifice depth for breadth. Goal: {detail}"
    ),
    "job": (
        "Get a job using {topic} — focus on practical skills and common interview topics. "
        "Include real-world patterns and common pitfalls. Goal: {detail}"
    ),
    "other": "{detail}",
}


def _build_curriculum_profile(raw_profile: dict) -> dict:
    """Maps the discovery profile to the shape run_curriculum() expects."""
    topic = raw_profile["topic"]
    goal_type = raw_profile.get("goal_type", "other")
    goal_detail = raw_profile.get("goal_detail", f"understand {topic} end to end")
    prior_knowledge = raw_profile.get("prior_knowledge", [])
    timeline = str(raw_profile.get("timeline", "") or "")
    if goal_type == "deep_understanding" or "no deadline" in timeline.lower():
        weeks_available = 999
    else:
        weeks_available = int(raw_profile.get("weeks_available", 4) or 4)

    # Exit condition encodes goal shape for the graph builder
    exit_template = _GOAL_EXIT_CONDITIONS.get(goal_type, _GOAL_EXIT_CONDITIONS["other"])
    exit_condition = exit_template.format(topic=topic, detail=goal_detail)

    # Knowledge baseline — tells graph builder what to skip or fast-track
    if prior_knowledge:
        summary = (
            "Student already knows: " + ", ".join(prior_knowledge) + ". "
            "Keep them in the canonical map, but treat them as prior knowledge when sequencing."
        )
        probe_result = "strong" if len(prior_knowledge) >= 4 else "partial"
        probed_concept = prior_knowledge[0]
    else:
        summary = "Complete beginner — no prior knowledge of this topic."
        probe_result = "none"
        probed_concept = ""

    return {
        "topic": topic,
        "exit_condition": exit_condition,
        "knowledge_baseline": {
            "summary": summary,
            "probed_concept": probed_concept,
            "probe_result": probe_result,
        },
        "weeks_available": weeks_available,
        "available_hours": float(weeks_available * 3),  # 3 hrs/week default pace
    }


# ── Main agent ────────────────────────────────────────────────────────────────

async def run_b2c_curriculum(state: dict) -> dict:
    """
    Builds the KC graph from the learner profile.
    Persists knowledge_components and student_kc_state rows.
    Returns state patch.
    """
    raw_profile = state.get("_discovery_profile")

    if raw_profile:
        prior_knowledge: list[str] = raw_profile.get("prior_knowledge", [])
        curriculum_profile = _build_curriculum_profile(raw_profile)
    else:
        prior_knowledge = []
        curriculum_profile = {
            "topic": state.get("topic_title", ""),
            "exit_condition": "understand the topic end to end",
            "knowledge_baseline": {
                "summary": "unknown",
                "probed_concept": "",
                "probe_result": "weak",
            },
            "weeks_available": 4,
            "available_hours": 12.0,  # 4 weeks × 3 hrs default
        }

    syllabus_topics = state.get("syllabus_topics")
    if syllabus_topics:
        curriculum_profile["syllabus_topics"] = syllabus_topics

    result = await run_curriculum(curriculum_profile)

    if result.get("error") or not result.get("core_path"):
        return {
            "pending_message": (
                "I had trouble building your course. "
                "Let me know your topic again and we'll try once more."
            ),
            "phase": "discovery",
            "discovery_complete": False,
            "discovery_messages": [],
        }

    core_nodes = result["core_path"]
    deferred_nodes = result.get("deferred_nodes", [])
    topic_id = state["topic_id"]
    user_id = state["user_id"]

    # ── Separate pre-known from new KCs ──────────────────────────────────────
    # Pre-known KCs go FIRST in kc_graph so globalIdx < current_kc_index makes
    # the sidebar show them as already done.  Teaching starts at first new KC.
    pre_known_nodes = [n for n in core_nodes if _is_pre_known(n.get("title", ""), prior_knowledge)]
    new_nodes       = [n for n in core_nodes if not _is_pre_known(n.get("title", ""), prior_knowledge)]

    if pre_known_nodes:
        print(f"[b2c_curriculum] {len(pre_known_nodes)} pre-known KC(s) detected: "
              + ", ".join(n.get("title", "?") for n in pre_known_nodes))

    ordered_nodes = pre_known_nodes + new_nodes
    n_pre_known = len(pre_known_nodes)

    # ── Build KCNode objects ──────────────────────────────────────────────────
    runtime_ids = {
        node.get("id"): str(uuid.uuid4())
        for node in ordered_nodes
    }
    kc_nodes: list[KCNode] = []
    for i, node in enumerate(ordered_nodes):
        kc_id = runtime_ids.get(node.get("id")) or str(uuid.uuid4())
        is_pre_known = i < n_pre_known
        is_current = i == n_pre_known and i < len(ordered_nodes)
        kc_nodes.append(KCNode(
            id=kc_id,
            title=node.get("title", f"Concept {i + 1}"),
            description=node.get("description") or node.get("why_needed", ""),
            prerequisites=[
                runtime_ids[prereq_id]
                for prereq_id in node.get("prerequisites", [])
                if prereq_id in runtime_ids
            ],
            order_index=i,
            p_learned=0.9 if is_pre_known else 0.0,
            status="mastered" if is_pre_known else ("in_progress" if is_current else "not_started"),
        ))

    # ── Persist to DB ─────────────────────────────────────────────────────────
    for i, kc in enumerate(kc_nodes):
        is_pre_known = i < n_pre_known

        try:
            await supabase.table("knowledge_components").insert({
                "id": kc.id,
                "topic_id": topic_id,
                "title": kc.title,
                "description": kc.description,
                "prerequisites": kc.prerequisites,
                "order_index": kc.order_index,
            }).execute()
        except Exception as e:
            print(f"[b2c_curriculum] Failed to store KC '{kc.title}': {e}")

        try:
            kc_state_payload = {
                "user_id": user_id,
                "kc_id": kc.id,
                "topic_id": topic_id,
                # Pre-known KCs start as mastered; new KCs start fresh.
                "p_learned": 0.9 if is_pre_known else 0.0,
                "p_l0":      0.9 if is_pre_known else 0.1,
                "status":    "mastered" if is_pre_known else "not_started",
            }
            if is_pre_known:
                # Self-reported prior knowledge is conservative evidence of
                # mastery, so seed an immediate 1-day review schedule.
                (
                    sm2_easiness,
                    sm2_interval,
                    sm2_repetitions,
                    next_review,
                ) = update_sm2(2.5, 1, 0, 3)
                kc_state_payload.update({
                    "sm2_easiness": sm2_easiness,
                    "sm2_interval": sm2_interval,
                    "sm2_repetitions": sm2_repetitions,
                    "sm2_next_review": next_review.isoformat(),
                    "last_studied_at": datetime.now(timezone.utc).isoformat(),
                })
            await supabase.table("student_kc_state").insert(kc_state_payload).execute()
        except Exception as e:
            print(f"[b2c_curriculum] Failed to create KC state for '{kc.title}': {e}")

    # Teaching starts at the first NEW KC (past all pre-known ones)
    first_new_idx = n_pre_known
    first_kc = kc_nodes[first_new_idx] if first_new_idx < len(kc_nodes) else None
    concepts_snapshot = []
    for i, kc in enumerate(kc_nodes):
        dashboard_status = "done" if i < n_pre_known else ("current" if first_kc and i == first_new_idx else "locked")
        concepts_snapshot.append({
            "id": kc.id,
            "title": kc.title,
            "status": dashboard_status,
            "p_learned": kc.p_learned,
            "order_index": kc.order_index,
        })

    # Build intro message (gist)
    gist = result.get("gist") or (
        f"Built {len(new_nodes)} concept(s) for {state.get('topic_title', 'your topic')}."
        + (f" Skipped {n_pre_known} you already know." if n_pre_known else "")
        + " Let's start."
    )

    # Persist curriculum to roadmaps table
    roadmap_id = await save_roadmap(
        user_id=user_id,
        topic=state.get("topic_title", topic_id),
        sprint_plan=result.get("sprint_plan", {}),
        gist=gist,
        validated_nodes=deferred_nodes,
        learner_profile=raw_profile or {},
        topic_id=topic_id,
        session_id=state.get("session_id", ""),
        concepts=concepts_snapshot,
        sources_hit=result.get("sources_hit", []),
    )
    print(f"[b2c_curriculum] roadmap persisted: {roadmap_id}")

    # Phase 'complete' if everything was pre-known (nothing left to teach)
    next_phase = "complete" if first_kc is None else "teaching"

    return {
        "roadmap_id": roadmap_id,
        "kc_graph": kc_nodes,
        "total_kcs": len(kc_nodes),
        "current_kc_index": first_new_idx,
        "current_kc_id": first_kc.id if first_kc else None,
        "current_attempt_number": 1,
        "max_attempts": 4,
        "pass_threshold": 0.65,
        # Pre-known KCs get high P(L); new KCs start at 0
        "bkt_state": {
            kc.id: (0.9 if i < n_pre_known else 0.0)
            for i, kc in enumerate(kc_nodes)
        },
        "flags_this_session": [],
        "notes_generated": [],
        "context_window": [],
        "recent_turns": [],
        "session_summary": None,
        "phase": next_phase,
        "pending_message": gist,
        "unlock_next_concepts_enabled": True,
    }
