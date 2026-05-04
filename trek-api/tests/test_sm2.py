from datetime import datetime, timedelta, timezone

from utils.sm2 import update_sm2


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

