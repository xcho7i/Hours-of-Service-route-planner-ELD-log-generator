"""
Hours-of-Service (HOS) planner.

Implements the property-carrying CMV, 70-hour / 8-day cycle ruleset described
in the project spec. The planner walks the trip's driving legs and on-duty
activities, inserting 30-minute breaks, 10-hour rests, fuel stops and 34-hour
restarts as the regulation requires, producing a continuous list of
:class:`DutySegment`s with absolute timestamps.

Key simplification (per spec): only ``current_cycle_used_hours`` is provided,
not the previous 8 daily logs. We therefore treat that value as the cycle
already consumed at trip start and keep subtracting on-duty time from the
70-hour budget. Only a 34-hour restart resets the cycle to zero. No rolling
day-by-day recovery is attempted.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import math

# --------------------------------------------------------------------------
# Planner constants (minutes unless noted)
# --------------------------------------------------------------------------
MAX_DRIVE_SHIFT_MIN = 660       # 11h driving after a 10h break
MAX_DUTY_WINDOW_MIN = 840       # 14h on-duty driving window
BREAK_AFTER_DRIVE_MIN = 480     # 8h driving before a 30-min break is required
BREAK_DURATION_MIN = 30
DAILY_RESET_MIN = 600           # 10h off-duty / sleeper to reset the shift
CYCLE_LIMIT_MIN = 4200          # 70h cycle
RESTART_MIN = 2040              # 34h restart
FUEL_EVERY_MILES = 1000
FUEL_DURATION_MIN = 30
PICKUP_DURATION_MIN = 60
DROPOFF_DURATION_MIN = 60

ROUND_MINUTES = 15


class DutyStatus(str, Enum):
    OFF_DUTY = "OFF_DUTY"
    SLEEPER_BERTH = "SLEEPER_BERTH"
    DRIVING = "DRIVING"
    ON_DUTY_NOT_DRIVING = "ON_DUTY_NOT_DRIVING"


class StopType(str, Enum):
    PICKUP = "PICKUP"
    DROPOFF = "DROPOFF"
    FUEL = "FUEL"
    BREAK_30 = "BREAK_30"
    REST_10 = "REST_10"
    RESTART_34 = "RESTART_34"


def round_up_to_15_minutes(dt: datetime) -> datetime:
    """Round a datetime up to the next 15-minute boundary (no-op if already on one)."""
    discard = timedelta(
        minutes=dt.minute % ROUND_MINUTES,
        seconds=dt.second,
        microseconds=dt.microsecond,
    )
    if discard == timedelta(0):
        return dt
    return dt + (timedelta(minutes=ROUND_MINUTES) - discard)


def round_up_minutes(minutes: float) -> int:
    """Round a duration in minutes up to the nearest 15 minutes."""
    return int(math.ceil(minutes / ROUND_MINUTES) * ROUND_MINUTES)


@dataclass
class DutySegment:
    status: DutyStatus
    start: datetime
    end: datetime
    duration_minutes: int
    location_name: str
    lat: float
    lng: float
    remarks: str = ""
    miles: float = 0.0  # distance covered by this segment (DRIVING only)

    def as_dict(self) -> dict:
        return {
            "status": self.status.value,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "duration_minutes": self.duration_minutes,
            "location_name": self.location_name,
            "lat": self.lat,
            "lng": self.lng,
            "remarks": self.remarks,
            "miles": round(self.miles, 1),
        }


@dataclass
class Stop:
    type: StopType
    start: datetime
    end: datetime
    location_name: str
    lat: float
    lng: float
    remarks: str = ""

    def as_dict(self) -> dict:
        return {
            "type": self.type.value,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "location_name": self.location_name,
            "lat": self.lat,
            "lng": self.lng,
            "remarks": self.remarks,
        }


@dataclass
class DriveLeg:
    """A driving leg to be scheduled, already rounded and ready to plan."""
    label: str
    distance_miles: float
    duration_minutes: int
    speed_mph: float
    geometry: list[list[float]]
    origin_name: str
    dest_name: str
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float


@dataclass
class PlanResult:
    segments: list[DutySegment] = field(default_factory=list)
    stops: list[Stop] = field(default_factory=list)
    end_time: datetime | None = None
    cycle_used_end_min: float = 0.0


class HosPlanner:
    """Stateful scheduler. Construct, then call :meth:`plan`."""

    def __init__(self, start_time: datetime, current_cycle_used_hours: float):
        self.clock = start_time
        self.cycle_used_min = current_cycle_used_hours * 60.0

        # Counters that reset on a 10h break / 34h restart.
        self.drive_shift_min = 0.0          # driving since last 10h+ break
        self.window_start = start_time      # 14h window anchor

        # Resets on any >=30min non-driving period.
        self.drive_since_break_min = 0.0

        # Resets only on a fuel stop.
        self.miles_since_fuel = 0.0

        self.segments: list[DutySegment] = []
        self.stops: list[Stop] = []

    # -- derived limits ----------------------------------------------------
    def cycle_remaining_min(self) -> float:
        return CYCLE_LIMIT_MIN - self.cycle_used_min

    def shift_drive_remaining_min(self) -> float:
        return MAX_DRIVE_SHIFT_MIN - self.drive_shift_min

    def window_remaining_min(self) -> float:
        elapsed = (self.clock - self.window_start).total_seconds() / 60.0
        return MAX_DUTY_WINDOW_MIN - elapsed

    # -- low-level segment append -----------------------------------------
    def _append(
        self,
        status: DutyStatus,
        duration_min: float,
        location_name: str,
        lat: float,
        lng: float,
        remarks: str = "",
        miles: float = 0.0,
    ) -> DutySegment:
        duration_min = int(round(duration_min))
        start = self.clock
        end = start + timedelta(minutes=duration_min)
        seg = DutySegment(
            status=status,
            start=start,
            end=end,
            duration_minutes=duration_min,
            location_name=location_name,
            lat=lat,
            lng=lng,
            remarks=remarks,
            miles=miles,
        )
        self.segments.append(seg)
        self.clock = end

        # Cycle is consumed by all on-duty time (driving + on-duty-not-driving).
        if status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY_NOT_DRIVING):
            self.cycle_used_min += duration_min

        # Any non-driving period of >= 30 minutes satisfies the 30-min break
        # requirement (a fuel/pickup/dropoff stop counts, per spec).
        if status != DutyStatus.DRIVING and duration_min >= BREAK_DURATION_MIN:
            self.drive_since_break_min = 0.0

        return seg

    # -- rest / break / restart insertion ----------------------------------
    def _add_rest_10(self, lat: float, lng: float, location_name: str) -> None:
        self._append(
            DutyStatus.SLEEPER_BERTH,
            DAILY_RESET_MIN,
            location_name,
            lat,
            lng,
            remarks="10-hour rest (reset 11h/14h limits)",
        )
        self.stops.append(
            Stop(StopType.REST_10, self.clock - timedelta(minutes=DAILY_RESET_MIN),
                 self.clock, location_name, lat, lng, "10-hour off-duty rest")
        )
        # Reset shift counters; new 14h window begins when work resumes (now).
        self.drive_shift_min = 0.0
        self.drive_since_break_min = 0.0
        self.window_start = self.clock

    def _add_restart_34(self, lat: float, lng: float, location_name: str) -> None:
        self._append(
            DutyStatus.OFF_DUTY,
            RESTART_MIN,
            location_name,
            lat,
            lng,
            remarks="34-hour restart (reset 70h cycle)",
        )
        self.stops.append(
            Stop(StopType.RESTART_34, self.clock - timedelta(minutes=RESTART_MIN),
                 self.clock, location_name, lat, lng, "34-hour off-duty restart")
        )
        self.cycle_used_min = 0.0
        self.drive_shift_min = 0.0
        self.drive_since_break_min = 0.0
        self.window_start = self.clock

    def _add_break_30(self, lat: float, lng: float, location_name: str) -> None:
        self._append(
            DutyStatus.OFF_DUTY,
            BREAK_DURATION_MIN,
            location_name,
            lat,
            lng,
            remarks="30-minute break (after 8h driving)",
        )
        self.stops.append(
            Stop(StopType.BREAK_30, self.clock - timedelta(minutes=BREAK_DURATION_MIN),
                 self.clock, location_name, lat, lng, "30-minute rest break")
        )
        # _append already reset drive_since_break_min.

    def _add_fuel(self, lat: float, lng: float, location_name: str) -> None:
        self._append(
            DutyStatus.ON_DUTY_NOT_DRIVING,
            FUEL_DURATION_MIN,
            location_name,
            lat,
            lng,
            remarks="Fuel stop (every 1,000 mi)",
        )
        self.stops.append(
            Stop(StopType.FUEL, self.clock - timedelta(minutes=FUEL_DURATION_MIN),
                 self.clock, location_name, lat, lng, "Fueling")
        )
        self.miles_since_fuel = 0.0
        # _append reset the 30-min break counter (30 min non-driving).

    def add_on_duty_activity(
        self,
        duration_min: int,
        stop_type: StopType,
        location_name: str,
        lat: float,
        lng: float,
        remarks: str,
    ) -> None:
        """Pickup / dropoff: on-duty-not-driving work that consumes the cycle.

        If the cycle is exhausted first, a 34-hour restart is inserted.
        """
        if self.cycle_remaining_min() <= 0:
            self._add_restart_34(lat, lng, location_name)
        self._append(
            DutyStatus.ON_DUTY_NOT_DRIVING,
            duration_min,
            location_name,
            lat,
            lng,
            remarks=remarks,
        )
        self.stops.append(
            Stop(stop_type, self.clock - timedelta(minutes=duration_min),
                 self.clock, location_name, lat, lng, remarks)
        )

    # -- the driving scheduler --------------------------------------------
    def drive(self, leg: DriveLeg) -> None:
        remaining = float(leg.duration_minutes)
        speed = leg.speed_mph if leg.speed_mph > 0 else 55.0
        driven_in_leg = 0.0
        guard = 0

        def point_now() -> tuple[float, float]:
            frac = driven_in_leg / leg.duration_minutes if leg.duration_minutes else 1.0
            lat, lng = _interp(leg, frac)
            return lat, lng

        while remaining > 0.0001:
            guard += 1
            if guard > 100000:  # safety net against any unforeseen non-progress
                raise RuntimeError("HOS planner failed to converge.")

            lat, lng = point_now()
            here = f"En route ({leg.label})"

            # 1. Cycle exhausted -> 34h restart.
            if self.cycle_remaining_min() <= 0:
                self._add_restart_34(lat, lng, here)
                continue
            # 2. 11h driving limit reached -> 10h rest.
            if self.shift_drive_remaining_min() <= 0:
                self._add_rest_10(lat, lng, here)
                continue
            # 3. 14h window expired -> 10h rest.
            if self.window_remaining_min() <= 0:
                self._add_rest_10(lat, lng, here)
                continue
            # 4. 8h cumulative driving -> 30-min break.
            if self.drive_since_break_min >= BREAK_AFTER_DRIVE_MIN:
                self._add_break_30(lat, lng, here)
                continue
            # 5. 1,000 miles since fuel -> fuel stop.
            if self.miles_since_fuel >= FUEL_EVERY_MILES:
                self._add_fuel(lat, lng, here)
                continue

            # Largest legal driving chunk before the next mandatory event.
            miles_to_fuel = FUEL_EVERY_MILES - self.miles_since_fuel
            fuel_limit_min = (miles_to_fuel / speed) * 60.0
            chunk = min(
                remaining,
                self.shift_drive_remaining_min(),
                self.window_remaining_min(),
                BREAK_AFTER_DRIVE_MIN - self.drive_since_break_min,
                fuel_limit_min,
                self.cycle_remaining_min(),
            )
            chunk = max(1.0, math.floor(chunk)) if chunk < 1.0 else chunk

            miles = (chunk / 60.0) * speed
            self._append(
                DutyStatus.DRIVING,
                chunk,
                here,
                lat,
                lng,
                remarks=f"Driving {leg.label}",
                miles=miles,
            )
            remaining -= chunk
            driven_in_leg += chunk
            self.drive_shift_min += chunk
            self.drive_since_break_min += chunk
            self.miles_since_fuel += miles


def _interp(leg: DriveLeg, fraction: float) -> tuple[float, float]:
    from .routing import interpolate_along  # local import to avoid cycle

    if leg.geometry:
        lat, lng = interpolate_along(leg.geometry, fraction)
        return lat, lng
    lat = leg.origin_lat + (leg.dest_lat - leg.origin_lat) * fraction
    lng = leg.origin_lng + (leg.dest_lng - leg.origin_lng) * fraction
    return lat, lng
