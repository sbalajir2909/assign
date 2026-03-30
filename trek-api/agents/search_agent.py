import os
import asyncio
from typing import Any
from tavily import AsyncTavilyClient
from dotenv import load_dotenv

load_dotenv()

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")


def generate_queries(topic: str, exit_condition: str) -> list[str]:
    return [
        f"{topic} complete learning path prerequisites",
        f"{topic} curriculum structure beginner to {exit_condition}",
        f"{topic} foundational concepts before advanced topics",
        f"{topic} syllabus course outline university",
    ]


def score_result(result: dict) -> float:
    score = 0.0
    url = result.get("url", "").lower()
    content = result.get("content", "").lower()
    title = result.get("title", "").lower()

    edu_domains = [".edu", ".ac.uk", ".ac.in", ".edu.au", "coursera",
                   "mit.edu", "stanford.edu", "khanacademy", "freecodecamp",
                   "brilliant.org", "wikipedia.org", "arxiv.org"]
    if any(d in url for d in edu_domains):
        score += 0.30

    curriculum_signals = ["prerequisites", "syllabus", "learning path",
                          "curriculum", "course outline", "module",
                          "chapter", "week 1", "unit 1", "lesson"]
    matches = sum(1 for s in curriculum_signals if s in content)
    score += min(matches * 0.05, 0.25)

    sequence_signals = ["before", "after", "first", "then", "next",
                        "followed by", "introduction to", "advanced"]
    matches = sum(1 for s in sequence_signals if s in content)
    score += min(matches * 0.03, 0.15)

    reference_signals = ["references", "further reading", "sources",
                         "bibliography", "see also", "citation"]
    if any(s in content for s in reference_signals):
        score += 0.10

    content_len = len(content)
    if content_len > 2000:
        score += 0.10
    elif content_len > 800:
        score += 0.05

    if any(w in title for w in ["course", "guide", "tutorial",
                                  "learn", "introduction", "curriculum"]):
        score += 0.10

    return min(score, 1.0)


async def run_search(topic: str, exit_condition: str) -> dict[str, Any]:
    client = AsyncTavilyClient(api_key=TAVILY_API_KEY)
    queries = generate_queries(topic, exit_condition)

    tasks = [
        client.search(
            query=q,
            search_depth="advanced",
            max_results=5,
            include_raw_content=True,
        )
        for q in queries
    ]

    results_per_query = await asyncio.gather(*tasks, return_exceptions=True)

    seen_urls = set()
    scored_results = []

    for query_result in results_per_query:
        if isinstance(query_result, Exception):
            print(f"Query failed: {query_result}")
            continue
        for r in query_result.get("results", []):
            url = r.get("url", "")
            if url in seen_urls:
                continue
            seen_urls.add(url)
            quality_score = score_result(r)
            scored_results.append({
                "title": r.get("title", ""),
                "url": url,
                "content": r.get("content", ""),
                "raw_content": r.get("raw_content", ""),
                "quality_score": quality_score,
            })

    scored_results.sort(key=lambda x: x["quality_score"], reverse=True)

    CONFIDENCE_THRESHOLD = 0.3
    top_results = [r for r in scored_results
                   if r["quality_score"] >= CONFIDENCE_THRESHOLD][:8]

    if len(top_results) >= 4:
        evidence_strength = "HIGH"
    elif len(top_results) >= 2:
        evidence_strength = "MEDIUM"
    else:
        evidence_strength = "LOW"

    return {
        "results": top_results,
        "evidence_strength": evidence_strength,
        "total_found": len(scored_results),
        "queries_run": queries,
    }


async def targeted_search(concept_title: str, topic: str) -> dict[str, Any]:
    client = AsyncTavilyClient(api_key=TAVILY_API_KEY)

    queries = [
        f"{concept_title} {topic} explained prerequisites",
        f"how to learn {concept_title} in {topic}",
    ]

    tasks = [
        client.search(query=q, search_depth="advanced", max_results=3)
        for q in queries
    ]

    results_per_query = await asyncio.gather(*tasks, return_exceptions=True)

    seen_urls = set()
    scored = []

    for query_result in results_per_query:
        if isinstance(query_result, Exception):
            continue
        for r in query_result.get("results", []):
            url = r.get("url", "")
            if url in seen_urls:
                continue
            seen_urls.add(url)
            scored.append({
                "title": r.get("title", ""),
                "url": url,
                "content": r.get("content", ""),
                "quality_score": score_result(r),
            })

    scored.sort(key=lambda x: x["quality_score"], reverse=True)

    return {
        "results": scored[:4],
        "evidence_strength": "HIGH" if len(scored) >= 3
                             else "MEDIUM" if scored else "LOW",
    }