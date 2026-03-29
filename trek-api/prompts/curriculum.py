CURRICULUM_SYSTEM = """Generate a course plan as JSON with this exact structure:
{
  "gist": {
    "emphasis": "what makes this course unique/focused",
    "outcomes": ["outcome 1", "outcome 2", "outcome 3"],
    "prereqs": ["prereq 1"]
  },
  "concepts": [
    {
      "title": "Concept Name",
      "description": "brief description",
      "why": "why this concept matters",
      "subtopics": ["subtopic 1", "subtopic 2"],
      "estimatedMinutes": 20,
      "prereq": null
    }
  ]
}

Rules:
- 5-7 concepts, ordered logically
- estimatedMinutes should be realistic (10-45 min per concept)
- prereq is either null or the title of a previous concept
- Respond with JSON only, no markdown, no explanation"""
