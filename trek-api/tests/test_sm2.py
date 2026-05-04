from datetime import datetime, timedelta, timezone

import pytest

from utils.sm2 import update_sm2
from agents import mastery_validator as mv


class _FakeResult:
    def __init__(self, data=None):
        self.data = data


class _FakeTable:
    def __init__(self, select_data=None):
        self.select_data = select_data
        self.upserts = []
        self.mode = None

    def select(self, *args, **kwargs):
        self.mode = "select"
        return self

    def eq(self, *args, **kwargs):
        return self

    def maybe_single(self):
        return self

    def upsert(self, payload, **kwargs):
        self.mode = "upsert"
        self.upserts.append(payload)
        return self

    async def execute(self):
        if self.mode == "select":
            return _FakeResult(self.select_data)
        return _FakeResult()


class _FakeSupabase:
    def __init__(self, table):
        self._table = table

    def table(self, name):
        assert name == "student_kc_state"
        return self._table


def test_update_sm2_first_success_starts_one_day_interval():
    new_easiness, new_interval, new_repetitions, next_review = update_sm2(
        easiness=2.5,
        interval=1,
        repetitions=0,
        quality=5,
    )

    assert new_easiness == 2.6
    assert new_interval == 1
    assert new_repetitions == 1
    assert next_review > datetime.now(timezone.utc)
    assert next_review < datetime.now(timezone.utc) + timedelta(days=2)


def test_update_sm2_second_success_uses_six_day_interval():
    new_easiness, new_interval, new_repetitions, _ = update_sm2(
        easiness=2.5,
        interval=1,
        repetitions=1,
        quality=4,
    )

    assert new_easiness == 2.5
    assert new_interval == 6
    assert new_repetitions == 2


def test_update_sm2_low_quality_resets_and_floors_easiness():
    new_easiness, new_interval, new_repetitions, _ = update_sm2(
        easiness=1.4,
        interval=10,
        repetitions=3,
        quality=2,
    )

    assert new_easiness == 1.3
    assert new_interval == 1
    assert new_repetitions == 0


@pytest.mark.asyncio
async def test_load_bkt_row_seeds_default_student_kc_state_when_missing(monkeypatch):
    fake_table = _FakeTable(select_data=None)
    monkeypatch.setattr(mv, "supabase", _FakeSupabase(fake_table))

    row = await mv._load_bkt_row("user-1", "kc-1", "topic-1")

    assert row == mv._BKT_DEFAULTS
    assert len(fake_table.upserts) == 1
    assert fake_table.upserts[0]["status"] == "not_started"
    assert fake_table.upserts[0]["sm2_easiness"] == 2.5
    assert fake_table.upserts[0]["sm2_interval"] == 1
    assert fake_table.upserts[0]["sm2_repetitions"] == 0


@pytest.mark.asyncio
async def test_upsert_bkt_row_writes_sm2_fields_when_mastered(monkeypatch):
    fake_table = _FakeTable(select_data=None)
    monkeypatch.setattr(mv, "supabase", _FakeSupabase(fake_table))

    await mv._upsert_bkt_row(
        user_id="user-1",
        kc_id="kc-1",
        topic_id="topic-1",
        new_p_learned=0.88,
        attempt_count=2,
        last_score=0.91,
        mastery=True,
        force_advanced=False,
        flag_type="strong",
        sm2_update=(2.6, 1, 1, "2026-05-05T00:00:00+00:00"),
    )

    payload = fake_table.upserts[-1]
    assert payload["status"] == "mastered"
    assert payload["sm2_easiness"] == 2.6
    assert payload["sm2_interval"] == 1
    assert payload["sm2_repetitions"] == 1
    assert payload["sm2_next_review"] == "2026-05-05T00:00:00+00:00"
