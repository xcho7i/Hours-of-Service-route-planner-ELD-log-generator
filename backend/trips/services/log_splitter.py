"""
Split a continuous list of :class:`DutySegment`s into per-calendar-day driver
log sheets.

Steps:
1. Split any segment that crosses midnight at the midnight boundary (handles
   multi-day rests such as a 34-hour restart, which span 2-3 days).
2. Group segments by calendar day.
3. Fill any gap inside a day (and the leading/trailing edges) with OFF_DUTY so
   every day is a complete 24-hour (1440-minute) timeline.
4. Compute per-status totals; ``total`` always equals 1440 minutes.
5. Collect dated remarks for display below the grid.

Days are computed in the timestamps' own timezone (UTC by convention).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, date

from .hos_planner import DutySegment, DutyStatus


@dataclass
class LogDay:
    date: date
    segments: list[DutySegment] = field(default_factory=list)
    remarks: list[dict] = field(default_factory=list)
    totals: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "date": self.date.isoformat(),
            "segments": [s.as_dict() for s in self.segments],
            "remarks": self.remarks,
            "totals": self.totals,
        }


def _midnight_after(dt: datetime) -> datetime:
    nxt = (dt + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return nxt


def split_at_midnight(segments: list[DutySegment]) -> list[DutySegment]:
    """Return a new list where no segment crosses a midnight boundary."""
    out: list[DutySegment] = []
    for seg in segments:
        total_min = max(1, int((seg.end - seg.start).total_seconds() // 60))
        cur_start = seg.start
        while True:
            boundary = _midnight_after(cur_start)
            if seg.end <= boundary:
                part_min = int((seg.end - cur_start).total_seconds() // 60)
                out.append(
                    DutySegment(
                        status=seg.status,
                        start=cur_start,
                        end=seg.end,
                        duration_minutes=part_min,
                        location_name=seg.location_name,
                        lat=seg.lat,
                        lng=seg.lng,
                        remarks=seg.remarks,
                        miles=seg.miles * part_min / total_min,
                    )
                )
                break
            # Segment spills past midnight: emit the part up to the boundary.
            part_min = int((boundary - cur_start).total_seconds() // 60)
            out.append(
                DutySegment(
                    status=seg.status,
                    start=cur_start,
                    end=boundary,
                    duration_minutes=part_min,
                    location_name=seg.location_name,
                    lat=seg.lat,
                    lng=seg.lng,
                    remarks=seg.remarks,
                    miles=seg.miles * part_min / total_min,
                )
            )
            cur_start = boundary
    return out


def _fill_day(day: date, segments: list[DutySegment]) -> list[DutySegment]:
    """Sort, then fill leading/internal/trailing gaps with OFF_DUTY so the day
    is a contiguous 24h timeline."""
    tz = segments[0].start.tzinfo if segments else None
    day_start = datetime(day.year, day.month, day.day, tzinfo=tz)
    day_end = day_start + timedelta(days=1)

    segments = sorted(segments, key=lambda s: s.start)
    filled: list[DutySegment] = []
    cursor = day_start

    def off(a: datetime, b: datetime) -> DutySegment:
        return DutySegment(
            status=DutyStatus.OFF_DUTY,
            start=a,
            end=b,
            duration_minutes=int((b - a).total_seconds() // 60),
            location_name="",
            lat=0.0,
            lng=0.0,
            remarks="",
        )

    for seg in segments:
        if seg.start > cursor:
            filled.append(off(cursor, seg.start))
        filled.append(seg)
        cursor = seg.end

    if cursor < day_end:
        filled.append(off(cursor, day_end))
    return filled


def _totals(segments: list[DutySegment]) -> dict:
    totals = {
        "off_duty": 0,
        "sleeper_berth": 0,
        "driving": 0,
        "on_duty_not_driving": 0,
    }
    key = {
        DutyStatus.OFF_DUTY: "off_duty",
        DutyStatus.SLEEPER_BERTH: "sleeper_berth",
        DutyStatus.DRIVING: "driving",
        DutyStatus.ON_DUTY_NOT_DRIVING: "on_duty_not_driving",
    }
    for seg in segments:
        totals[key[seg.status]] += seg.duration_minutes
    totals["total"] = sum(totals.values())
    return totals


def build_log_days(segments: list[DutySegment]) -> list[LogDay]:
    if not segments:
        return []

    split = split_at_midnight(segments)

    by_day: dict[date, list[DutySegment]] = {}
    for seg in split:
        by_day.setdefault(seg.start.date(), []).append(seg)

    log_days: list[LogDay] = []
    for day in sorted(by_day.keys()):
        filled = _fill_day(day, by_day[day])
        remarks = [
            {"time": s.start.isoformat(), "text": s.remarks}
            for s in filled
            if s.remarks
        ]
        log_days.append(
            LogDay(
                date=day,
                segments=filled,
                remarks=remarks,
                totals=_totals(filled),
            )
        )
    return log_days
