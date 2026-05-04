import pytest

import main


@pytest.mark.asyncio
async def test_extract_syllabus_structure_from_text(monkeypatch):
    async def fake_complete(**kwargs):
        return """
        {
          "course_title": "Personal Finance",
          "topics": [
            {"title": "Budgeting", "subtopics": ["tracking expenses"], "week_or_order": 1},
            {"title": "Saving and Investing", "subtopics": ["emergency fund"], "week_or_order": 2}
          ]
        }
        """

    monkeypatch.setattr(main, "complete", fake_complete)

    result = await main._extract_syllabus_structure_from_text(
        "Week 1 Budgeting\nWeek 2 Saving and Investing",
        filename="personal-finance-outline.pdf",
    )

    assert result == {
        "course_title": "Personal Finance",
        "topics": [
            {
                "title": "Budgeting",
                "subtopics": ["tracking expenses"],
                "week_or_order": 1,
            },
            {
                "title": "Saving and Investing",
                "subtopics": ["emergency fund"],
                "week_or_order": 2,
            },
        ],
    }


def test_normalize_syllabus_structure_ignores_empty_topics():
    result = main._normalize_syllabus_structure({
        "course_title": "",
        "topics": [
            {"title": "  ", "subtopics": ["x"], "week_or_order": 1},
            {"title": "Financial Literacy", "subtopics": ["budgeting", ""], "week_or_order": "2"},
        ],
    })

    assert result == {
        "course_title": "Financial Literacy",
        "topics": [
            {
                "title": "Financial Literacy",
                "subtopics": ["budgeting"],
                "week_or_order": 2,
            }
        ],
    }
