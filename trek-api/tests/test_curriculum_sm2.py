import pytest

from agents import b2c_curriculum_agent as curriculum


class _FakeResult:
    def __init__(self, data=None):
        self.data = data


class _FakeInsertQuery:
    def __init__(self, store, name):
        self.store = store
        self.name = name
        self.payload = None

    def insert(self, payload):
        self.payload = payload
        return self

    async def execute(self):
        self.store.setdefault(self.name, []).append(self.payload)
        return _FakeResult()


class _FakeSupabase:
    def __init__(self):
        self.store = {}

    def table(self, name):
        return _FakeInsertQuery(self.store, name)


@pytest.mark.asyncio
async def test_preknown_mastered_kc_gets_sm2_schedule(monkeypatch):
    fake_supabase = _FakeSupabase()

    async def fake_run_curriculum(profile):
        return {
            "validated_nodes": [{
                "title": "Hash Maps",
                "description": "Key-value lookup",
                "prerequisites": [],
            }],
            "gist": "Built your course.",
            "sprint_plan": {},
            "sources_hit": [],
        }

    async def fake_save_roadmap(**kwargs):
        return "roadmap-1"

    monkeypatch.setattr(curriculum, "supabase", fake_supabase)
    monkeypatch.setattr(curriculum, "run_curriculum", fake_run_curriculum)
    monkeypatch.setattr(curriculum, "save_roadmap", fake_save_roadmap)

    state = {
        "user_id": "user-1",
        "topic_id": "topic-1",
        "topic_title": "Data Structures",
        "_discovery_profile": {
            "topic": "Data Structures",
            "prior_knowledge": ["Hash Maps"],
            "goal_type": "project",
            "goal_detail": "Build a cache",
            "weeks_available": 4,
        },
        "syllabus_topics": None,
    }

    result = await curriculum.run_b2c_curriculum(state)

    student_rows = fake_supabase.store["student_kc_state"]
    assert len(student_rows) == 1
    assert student_rows[0]["status"] == "mastered"
    assert student_rows[0]["sm2_easiness"] >= 1.3
    assert student_rows[0]["sm2_interval"] == 1
    assert student_rows[0]["sm2_repetitions"] == 1
    assert student_rows[0]["sm2_next_review"]
    assert result["phase"] in ("teaching", "complete")
