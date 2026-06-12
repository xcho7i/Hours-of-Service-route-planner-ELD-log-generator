"""
Input validation for the trip-planning request.

Kept separate from the DRF serializer so the domain rules (cycle bounds,
non-empty locations, start-time parsing) live in one place and can be unit
tested directly.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math

from .hos_planner import round_up_to_15_minutes

CYCLE_LIMIT_HOURS = 70.0


class ValidationError(Exception):
    """Raised with a human-readable message when request data is invalid."""


@dataclass
class TripRequest:
    current_location: str
    pickup_location: str
    dropoff_location: str
    current_cycle_used_hours: float
    start_time: datetime  # always timezone-aware (UTC)


def _require_location(value, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"'{field_name}' is required and must be a non-empty string.")
    return value.strip()


def _parse_cycle(value) -> float:
    try:
        hours = float(value)
    except (TypeError, ValueError):
        raise ValidationError("'current_cycle_used_hours' must be a number.")
    if math.isnan(hours) or math.isinf(hours):
        raise ValidationError("'current_cycle_used_hours' must be a finite number.")
    if hours < 0:
        raise ValidationError("'current_cycle_used_hours' cannot be negative.")
    if hours > CYCLE_LIMIT_HOURS:
        raise ValidationError(
            f"'current_cycle_used_hours' cannot exceed the {CYCLE_LIMIT_HOURS:g}-hour cycle limit."
        )
    return hours


def _parse_start_time(value) -> datetime:
    if value is None or value == "":
        # Default: current backend time rounded up to the next 15 minutes.
        return round_up_to_15_minutes(datetime.now(timezone.utc))
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        text = value.strip()
        # Accept a trailing 'Z' (Python <3.11 compatibility for fromisoformat).
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            raise ValidationError(
                "'start_time' must be an ISO-8601 datetime string."
            )
    else:
        raise ValidationError("'start_time' must be an ISO-8601 datetime string.")

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def validate_trip_request(payload: dict) -> TripRequest:
    """Validate a raw request dict and return a normalized :class:`TripRequest`.

    Raises :class:`ValidationError` on the first problem found.
    """
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object.")

    current = _require_location(payload.get("current_location"), "current_location")
    pickup = _require_location(payload.get("pickup_location"), "pickup_location")
    dropoff = _require_location(payload.get("dropoff_location"), "dropoff_location")
    cycle = _parse_cycle(payload.get("current_cycle_used_hours"))
    start = _parse_start_time(payload.get("start_time"))

    return TripRequest(
        current_location=current,
        pickup_location=pickup,
        dropoff_location=dropoff,
        current_cycle_used_hours=cycle,
        start_time=start,
    )
