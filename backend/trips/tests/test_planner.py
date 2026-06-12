"""
Backend unit tests for the HOS planner.

All tests force the offline mock router (ORS_API_KEY="") and rely on the
built-in gazetteer, so they are deterministic and need no network. Mock routing
uses haversine distance at a constant 55 mph.

Scenarios covered (per spec):
1. Short route under 8 driving hours -> no 30-min break.
2. Route over 8 driving hours -> a 30-minute break is inserted.
3. Route over 11 driving hours -> a 10-hour rest is inserted.
4. Route over 1,000 miles -> a fuel stop is inserted.
5. Cycle used near 70 -> a 34-hour restart is inserted.
6. Trip crossing midnight -> multiple log days, each totaling 24 hours.
"""
from django.test import TestCase, override_settings

from trips.services.validators import validate_trip_request
from trips.services.trip_builder import plan_trip


def _plan(current, pickup, dropoff, cycle, start_time=None):
    payload = {
        "current_location": current,
        "pickup_location": pickup,
        "dropoff_location": dropoff,
        "current_cycle_used_hours": cycle,
    }
    if start_time is not None:
        payload["start_time"] = start_time
    req = validate_trip_request(payload)
    return plan_trip(req)


def _stop_types(result):
    return [s["type"] for s in result["stops"]]


@override_settings(ORS_API_KEY="")
class HosPlannerTests(TestCase):
    # 1 -----------------------------------------------------------------
    def test_short_route_no_break(self):
        # Louisville -> Nashville -> Atlanta is ~370 mi (~6.7h driving) < 8h.
        result = _plan("Louisville, KY", "Nashville, TN", "Atlanta, GA", 10.0)
        types = _stop_types(result)
        self.assertNotIn("BREAK_30", types)
        self.assertNotIn("REST_10", types)
        self.assertNotIn("FUEL", types)
        self.assertNotIn("RESTART_34", types)
        self.assertIn("PICKUP", types)
        self.assertIn("DROPOFF", types)
        # Each log day must be a full 24h.
        for day in result["log_days"]:
            self.assertEqual(day["totals"]["total"], 1440)

    # 2 -----------------------------------------------------------------
    def test_over_8h_requires_30_min_break(self):
        # Denver -> Kansas City is ~560 mi (~10.2h driving): >8h but <11h.
        result = _plan("Denver, CO", "Denver, CO", "Kansas City, MO", 5.0)
        types = _stop_types(result)
        self.assertIn("BREAK_30", types)
        self.assertNotIn("REST_10", types)

    # 3 -----------------------------------------------------------------
    def test_over_11h_requires_10h_rest(self):
        # Denver -> Chicago is ~920 mi (~16.7h driving): exceeds the 11h limit.
        result = _plan("Denver, CO", "Denver, CO", "Chicago, IL", 5.0)
        types = _stop_types(result)
        self.assertIn("REST_10", types)
        # Driving never exceeds 11h between two 10h rests.
        self._assert_drive_blocks_within_11h(result)

    # 4 -----------------------------------------------------------------
    def test_over_1000_miles_requires_fuel(self):
        # Los Angeles -> New York is ~2400 mi: at least two fuel stops.
        result = _plan("Los Angeles, CA", "Los Angeles, CA", "New York, NY", 0.0)
        types = _stop_types(result)
        self.assertIn("FUEL", types)
        self.assertGreaterEqual(result["summary"]["num_fuel_stops"], 1)

    # 5 -----------------------------------------------------------------
    def test_cycle_near_70_requires_restart(self):
        # 69.5h already used -> only 0.5h of cycle remains, so a 34h restart
        # must be inserted to finish the trip.
        result = _plan("Louisville, KY", "Nashville, TN", "Atlanta, GA", 69.5)
        types = _stop_types(result)
        self.assertIn("RESTART_34", types)
        # After the restart, the cycle was reset and partially re-consumed.
        self.assertLess(result["summary"]["cycle_used_end_hours"], 70.0)

    # 6 -----------------------------------------------------------------
    def test_trip_crossing_midnight_creates_multiple_days(self):
        result = _plan(
            "Denver, CO", "Denver, CO", "Chicago, IL", 5.0,
            start_time="2026-06-12T18:00:00+00:00",
        )
        self.assertGreaterEqual(len(result["log_days"]), 2)
        for day in result["log_days"]:
            self.assertEqual(day["totals"]["total"], 1440)
            # Totals decompose into the four duty statuses.
            t = day["totals"]
            self.assertEqual(
                t["off_duty"] + t["sleeper_berth"] + t["driving"]
                + t["on_duty_not_driving"],
                1440,
            )

    # -- helpers --------------------------------------------------------
    def _assert_drive_blocks_within_11h(self, result):
        """Sum DRIVING minutes between consecutive 10h rests; none may exceed 660."""
        drive_block = 0
        for seg in result["segments"]:
            if seg["status"] == "DRIVING":
                drive_block += seg["duration_minutes"]
            elif seg["status"] == "SLEEPER_BERTH" and seg["duration_minutes"] >= 600:
                self.assertLessEqual(drive_block, 660)
                drive_block = 0
        self.assertLessEqual(drive_block, 660)


@override_settings(ORS_API_KEY="")
class ApiEndpointTests(TestCase):
    def test_plan_endpoint_smoke(self):
        resp = self.client.post(
            "/api/trips/plan",
            data={
                "current_location": "Louisville, KY",
                "pickup_location": "Nashville, TN",
                "dropoff_location": "Atlanta, GA",
                "current_cycle_used_hours": 12.5,
            },
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        for key in ("summary", "route", "stops", "segments", "log_days", "locations"):
            self.assertIn(key, body)
        self.assertGreater(len(body["route"]["geometry"]), 0)

    def test_invalid_cycle_returns_400(self):
        resp = self.client.post(
            "/api/trips/plan",
            data={
                "current_location": "Louisville, KY",
                "pickup_location": "Nashville, TN",
                "dropoff_location": "Atlanta, GA",
                "current_cycle_used_hours": 99,
            },
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
