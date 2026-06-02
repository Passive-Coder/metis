from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


@dataclass
class ReviewState:
    ease_factor: float = 2.3
    interval_days: int = 0
    repetitions: int = 0
    lapses: int = 0


@dataclass
class ReviewUpdate:
    ease_factor: float
    interval_days: int
    repetitions: int
    lapses: int
    due_at: datetime


def sm2_update(state: ReviewState, quality: int, now: datetime | None = None) -> ReviewUpdate:
    """Classic SM-2 update for coding problems, using quality 0-5."""
    if not 0 <= quality <= 5:
        raise ValueError("quality must be between 0 and 5")

    current_time = now or datetime.now(UTC)
    ease = state.ease_factor
    repetitions = state.repetitions
    interval = state.interval_days
    lapses = state.lapses

    if quality < 3:
        repetitions = 0
        interval = 1
        lapses += 1
        ease = max(1.3, ease - 0.2)
    else:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = max(1, round(interval * ease))

        repetitions += 1
        ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        ease = max(1.3, ease)

    return ReviewUpdate(
        due_at=current_time + timedelta(days=interval),
        ease_factor=round(ease, 3),
        interval_days=interval,
        lapses=lapses,
        repetitions=repetitions,
    )
