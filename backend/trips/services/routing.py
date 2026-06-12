"""
Routing service.

`route(origin, dest)` returns a :class:`RouteLeg` describing the road segment
between two :class:`GeoPoint`s.

- If ``settings.ORS_API_KEY`` is set, real road routing is requested from
  OpenRouteService using the ``driving-hgv`` (heavy-goods-vehicle) profile.
- Otherwise -- or if the ORS request fails -- a deterministic mock leg is
  produced from the haversine distance at a constant 55 mph. This keeps the
  whole app working offline for local demos and tests.

Distances are reported in miles and durations in minutes.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import math

import requests
from django.conf import settings

from .geocoding import GeoPoint

MOCK_SPEED_MPH = 55.0
EARTH_RADIUS_MI = 3958.7613


@dataclass
class RouteLeg:
    origin: GeoPoint
    dest: GeoPoint
    distance_miles: float
    duration_minutes: float
    # Polyline as a list of [lat, lng] pairs (Leaflet ordering).
    geometry: list[list[float]] = field(default_factory=list)
    provider: str = "mock"

    @property
    def speed_mph(self) -> float:
        hours = self.duration_minutes / 60.0
        if hours <= 0:
            return MOCK_SPEED_MPH
        return self.distance_miles / hours


def haversine_miles(a: GeoPoint, b: GeoPoint) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (a.lat, a.lng, b.lat, b.lng))
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(h))


def _mock_leg(origin: GeoPoint, dest: GeoPoint) -> RouteLeg:
    distance = haversine_miles(origin, dest)
    duration = (distance / MOCK_SPEED_MPH) * 60.0
    geometry = [[origin.lat, origin.lng], [dest.lat, dest.lng]]
    return RouteLeg(
        origin=origin,
        dest=dest,
        distance_miles=distance,
        duration_minutes=duration,
        geometry=geometry,
        provider="mock",
    )


def _ors_leg(origin: GeoPoint, dest: GeoPoint) -> RouteLeg | None:
    try:
        resp = requests.post(
            "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson",
            json={
                "coordinates": [
                    [origin.lng, origin.lat],
                    [dest.lng, dest.lat],
                ]
            },
            headers={
                "Authorization": settings.ORS_API_KEY,
                "Content-Type": "application/json",
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        feature = data["features"][0]
        summary = feature["properties"]["summary"]
        coords = feature["geometry"]["coordinates"]  # [lng, lat] pairs
    except (requests.RequestException, ValueError, KeyError, IndexError):
        return None

    distance_miles = summary["distance"] / 1609.344
    duration_minutes = summary["duration"] / 60.0
    geometry = [[lat, lng] for lng, lat in coords]
    return RouteLeg(
        origin=origin,
        dest=dest,
        distance_miles=distance_miles,
        duration_minutes=duration_minutes,
        geometry=geometry,
        provider="openrouteservice",
    )


def route(origin: GeoPoint, dest: GeoPoint) -> RouteLeg:
    if settings.ORS_API_KEY:
        leg = _ors_leg(origin, dest)
        if leg is not None:
            return leg
    return _mock_leg(origin, dest)


def interpolate_along(geometry: list[list[float]], fraction: float) -> list[float]:
    """Return the [lat, lng] point at ``fraction`` (0..1) of the polyline,
    measured by cumulative great-circle distance between vertices."""
    fraction = max(0.0, min(1.0, fraction))
    if not geometry:
        return [0.0, 0.0]
    if len(geometry) == 1 or fraction <= 0:
        return list(geometry[0])
    if fraction >= 1:
        return list(geometry[-1])

    # Cumulative segment lengths.
    seglens = []
    total = 0.0
    for (lat1, lng1), (lat2, lng2) in zip(geometry, geometry[1:]):
        a = GeoPoint("", lat1, lng1)
        b = GeoPoint("", lat2, lng2)
        d = haversine_miles(a, b)
        seglens.append(d)
        total += d
    if total <= 0:
        return list(geometry[0])

    target = fraction * total
    acc = 0.0
    for i, seg in enumerate(seglens):
        if acc + seg >= target:
            t = 0.0 if seg == 0 else (target - acc) / seg
            lat1, lng1 = geometry[i]
            lat2, lng2 = geometry[i + 1]
            return [lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]
        acc += seg
    return list(geometry[-1])
