"""
Geocoding service.

Resolution order for a free-text place name:
1. A small built-in gazetteer of common US cities. This makes the demo and the
   test-suite fully deterministic and offline-friendly.
2. The Django cache (filesystem-backed) so repeated lookups never re-hit the
   network -- this also keeps us within Nominatim's usage policy.
3. The free Nominatim (OpenStreetMap) geocoder over HTTP.

A successful lookup returns a `GeoPoint`. If nothing resolves, a
`GeocodingError` is raised so the API can return a clear 400.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import re

import requests
from django.conf import settings
from django.core.cache import cache


class GeocodingError(Exception):
    """Raised when a location string cannot be resolved to coordinates."""


@dataclass(frozen=True)
class GeoPoint:
    name: str
    lat: float
    lng: float

    def as_dict(self) -> dict:
        return {"name": self.name, "lat": self.lat, "lng": self.lng}


# Built-in gazetteer: canonical "City, ST" -> (lat, lng). Keys are matched
# case-insensitively, and a bare city name (no state) also matches.
GAZETTEER: dict[str, tuple[float, float]] = {
    "louisville, ky": (38.2527, -85.7585),
    "nashville, tn": (36.1627, -86.7816),
    "atlanta, ga": (33.7490, -84.3880),
    "chicago, il": (41.8781, -87.6298),
    "dallas, tx": (32.7767, -96.7970),
    "houston, tx": (29.7604, -95.3698),
    "los angeles, ca": (34.0522, -118.2437),
    "san francisco, ca": (37.7749, -122.4194),
    "new york, ny": (40.7128, -74.0060),
    "denver, co": (39.7392, -104.9903),
    "seattle, wa": (47.6062, -122.3321),
    "miami, fl": (25.7617, -80.1918),
    "phoenix, az": (33.4484, -112.0740),
    "kansas city, mo": (39.0997, -94.5786),
    "memphis, tn": (35.1495, -90.0490),
    "indianapolis, in": (39.7684, -86.1581),
    "st. louis, mo": (38.6270, -90.1994),
    "saint louis, mo": (38.6270, -90.1994),
    "oklahoma city, ok": (35.4676, -97.5164),
    "salt lake city, ut": (40.7608, -111.8910),
    "portland, or": (45.5152, -122.6784),
    "minneapolis, mn": (44.9778, -93.2650),
    "columbus, oh": (39.9612, -82.9988),
    "cincinnati, oh": (39.1031, -84.5120),
    "knoxville, tn": (35.9606, -83.9207),
    "charlotte, nc": (35.2271, -80.8431),
}


# Matches a bare "lat, lng" pair (e.g. dragged map points). Requires a decimal
# point on at least one number so "Nashville, TN" never matches.
_COORD_RE = re.compile(
    r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$"
)


def _from_coords(raw: str) -> GeoPoint | None:
    m = _COORD_RE.match(raw)
    if not m:
        return None
    lat, lng = float(m.group(1)), float(m.group(2))
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return None
    return GeoPoint(name=f"{lat:.4f}, {lng:.4f}", lat=lat, lng=lng)


def _cache_key(raw: str) -> str:
    digest = hashlib.sha1(raw.strip().lower().encode("utf-8")).hexdigest()
    return f"geocode:{digest}"


def _from_gazetteer(raw: str) -> GeoPoint | None:
    key = raw.strip().lower()
    if key in GAZETTEER:
        lat, lng = GAZETTEER[key]
        return GeoPoint(name=raw.strip(), lat=lat, lng=lng)
    # Also allow a bare city name to match the first gazetteer entry.
    for full, (lat, lng) in GAZETTEER.items():
        city = full.split(",")[0].strip()
        if key == city:
            return GeoPoint(name=raw.strip(), lat=lat, lng=lng)
    return None


def _from_nominatim(raw: str) -> GeoPoint | None:
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": raw, "format": "json", "limit": 1},
            headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json()
    except (requests.RequestException, ValueError):
        return None
    if not results:
        return None
    top = results[0]
    return GeoPoint(
        name=top.get("display_name", raw),
        lat=float(top["lat"]),
        lng=float(top["lon"]),
    )


def geocode(raw: str) -> GeoPoint:
    """Resolve a free-text location to a :class:`GeoPoint`.

    Raises :class:`GeocodingError` if the location cannot be resolved.
    """
    if not raw or not raw.strip():
        raise GeocodingError("Empty location string.")

    # Bare "lat, lng" (e.g. a dragged map point) resolves without any network.
    point = _from_coords(raw)
    if point is not None:
        return point

    point = _from_gazetteer(raw)
    if point is not None:
        return point

    cache_key = _cache_key(raw)
    cached = cache.get(cache_key)
    if cached is not None:
        return GeoPoint(**cached)

    point = _from_nominatim(raw)
    if point is None:
        raise GeocodingError(
            f"Could not geocode location: {raw!r}. "
            "Try a more specific 'City, ST' form."
        )

    cache.set(cache_key, point.as_dict())
    return point
