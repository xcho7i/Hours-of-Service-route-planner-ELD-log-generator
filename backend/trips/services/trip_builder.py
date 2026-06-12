"""
Trip orchestration: ties geocoding, routing, the HOS planner and the log
splitter together into the response payload returned by POST /api/trips/plan.

Planning flow (per spec):
1. Geocode the three locations.
2. Route current -> pickup and pickup -> dropoff.
3. Schedule driving current -> pickup.
4. 1h ON_DUTY_NOT_DRIVING at pickup.
5. Schedule driving pickup -> dropoff.
6. 1h ON_DUTY_NOT_DRIVING at dropoff.
   (breaks / rests / fuel / restarts are inserted during 3-6)
7. Split duty segments by calendar day and fill gaps with OFF_DUTY.
8. Assemble summary, route geometry, stops, segments and log_days.
"""
from __future__ import annotations

from .geocoding import geocode
from .hos_planner import (
    DriveLeg,
    DutyStatus,
    HosPlanner,
    PICKUP_DURATION_MIN,
    DROPOFF_DURATION_MIN,
    StopType,
    round_up_minutes,
)
from .log_splitter import build_log_days
from .routing import route
from .validators import TripRequest


def _make_leg(label: str, route_leg) -> DriveLeg:
    return DriveLeg(
        label=label,
        distance_miles=route_leg.distance_miles,
        duration_minutes=round_up_minutes(route_leg.duration_minutes),
        speed_mph=route_leg.speed_mph,
        geometry=route_leg.geometry,
        origin_name=route_leg.origin.name,
        dest_name=route_leg.dest.name,
        origin_lat=route_leg.origin.lat,
        origin_lng=route_leg.origin.lng,
        dest_lat=route_leg.dest.lat,
        dest_lng=route_leg.dest.lng,
    )


def plan_trip(req: TripRequest) -> dict:
    # 1. Geocode (may raise GeocodingError -> handled by the view).
    current = geocode(req.current_location)
    pickup = geocode(req.pickup_location)
    dropoff = geocode(req.dropoff_location)

    # 2. Route the two legs.
    leg1_route = route(current, pickup)
    leg2_route = route(pickup, dropoff)
    leg1 = _make_leg(f"{current.name} → {pickup.name}", leg1_route)
    leg2 = _make_leg(f"{pickup.name} → {dropoff.name}", leg2_route)

    # 3-6. Run the scheduler.
    planner = HosPlanner(req.start_time, req.current_cycle_used_hours)
    planner.drive(leg1)
    planner.add_on_duty_activity(
        PICKUP_DURATION_MIN, StopType.PICKUP, pickup.name,
        pickup.lat, pickup.lng, "Pickup (load)",
    )
    planner.drive(leg2)
    planner.add_on_duty_activity(
        DROPOFF_DURATION_MIN, StopType.DROPOFF, dropoff.name,
        dropoff.lat, dropoff.lng, "Dropoff (unload)",
    )

    segments = planner.segments
    stops = planner.stops

    # 7. Per-day log sheets.
    log_days = build_log_days(segments)

    # 8. Assemble response.
    total_distance = leg1_route.distance_miles + leg2_route.distance_miles
    driving_min = sum(
        s.duration_minutes for s in segments if s.status == DutyStatus.DRIVING
    )
    on_duty_min = sum(
        s.duration_minutes
        for s in segments
        if s.status == DutyStatus.ON_DUTY_NOT_DRIVING
    )
    start = segments[0].start if segments else req.start_time
    end = segments[-1].end if segments else req.start_time

    # Merge the two leg polylines for a single map route.
    geometry = list(leg1_route.geometry)
    if leg2_route.geometry:
        geometry += leg2_route.geometry[1:] if geometry else leg2_route.geometry

    def count(t: StopType) -> int:
        return sum(1 for s in stops if s.type == t)

    summary = {
        "total_distance_miles": round(total_distance, 1),
        "total_duration_minutes": int((end - start).total_seconds() // 60),
        "total_driving_minutes": driving_min,
        "total_on_duty_minutes": driving_min + on_duty_min,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "num_days": len(log_days),
        "cycle_used_start_hours": round(req.current_cycle_used_hours, 2),
        "cycle_used_end_hours": round(planner.cycle_used_min / 60.0, 2),
        "num_fuel_stops": count(StopType.FUEL),
        "num_breaks": count(StopType.BREAK_30),
        "num_rests": count(StopType.REST_10),
        "num_restarts": count(StopType.RESTART_34),
        "routing_provider": leg1_route.provider,
    }

    return {
        "summary": summary,
        "locations": {
            "current": current.as_dict(),
            "pickup": pickup.as_dict(),
            "dropoff": dropoff.as_dict(),
        },
        "route": {
            "geometry": geometry,
            "legs": [
                {
                    "from": current.name,
                    "to": pickup.name,
                    "distance_miles": round(leg1_route.distance_miles, 1),
                    "duration_minutes": leg1.duration_minutes,
                },
                {
                    "from": pickup.name,
                    "to": dropoff.name,
                    "distance_miles": round(leg2_route.distance_miles, 1),
                    "duration_minutes": leg2.duration_minutes,
                },
            ],
        },
        "stops": [s.as_dict() for s in stops],
        "segments": [s.as_dict() for s in segments],
        "log_days": [d.as_dict() for d in log_days],
    }
