from datetime import datetime, timedelta, timezone


def update_sm2(
    easiness: float,
    interval: int,
    repetitions: int,
    quality: int,
) -> tuple[float, int, int, datetime]:
    """
    Applies one SM-2 review update and returns:
    (new_easiness, new_interval_days, new_repetitions, next_review_at_utc)
    """
    if quality < 3:
        new_repetitions = 0
        new_interval = 1
    else:
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval * easiness)
        new_repetitions = repetitions + 1

    new_easiness = easiness + (
        0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    )
    new_easiness = max(1.3, new_easiness)
    next_review = datetime.now(timezone.utc) + timedelta(days=new_interval)

    return round(new_easiness, 2), new_interval, new_repetitions, next_review
