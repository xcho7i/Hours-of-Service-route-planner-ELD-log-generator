# TruckLog — HOS Route Planner

A full-stack application that plans an FMCSA Hours-of-Service (HOS) compliant
trip for a property-carrying commercial motor vehicle (CMV) driver and renders
the result as an interactive map, a route schedule, and filled daily driver log
sheets — one per calendar day.

- **Backend:** Django + Django REST Framework
- **Frontend:** React + TypeScript + Vite + React-Leaflet

The app takes a current location, pickup, dropoff, and the hours already used on
the 70-hour cycle, and returns:

1. A map with the route, stops, rests, fuel stops, pickup and dropoff.
2. A route schedule / instructions.
3. Filled daily log sheets (SVG), one per calendar day.

---

## Assessment assumptions

- Property-carrying CMV driver.
- 70-hour / 8-day cycle.
- No adverse driving conditions.
- Fueling at least once every 1,000 miles.
- Pickup takes 1 hour; dropoff takes 1 hour.

## HOS rules implemented

- Max **11 hours driving** after a valid 10-hour break (`MAX_DRIVE_SHIFT_MIN = 660`).
- No driving after the **14-hour** driving window expires (`MAX_DUTY_WINDOW_MIN = 840`).
- The 14-hour window starts when the driver begins work after 10 hours off.
- A **30-minute break** is inserted after **8 cumulative hours** of driving
  (`BREAK_AFTER_DRIVE_MIN = 480`). Normal breaks use `OFF_DUTY`.
- A **fuel stop** (30 min, `ON_DUTY_NOT_DRIVING`) is inserted every 1,000 miles.
  Because it is ≥30 minutes of non-driving time, a fuel stop also satisfies the
  30-minute break requirement.
- Pickup, dropoff, fueling, loading/unloading/inspections use `ON_DUTY_NOT_DRIVING`.
- Route movement uses `DRIVING`. The 10-hour overnight rest uses `SLEEPER_BERTH`.
- **Driving + on-duty-not-driving consume the 70-hour cycle** (`CYCLE_LIMIT_MIN = 4200`).
- If the 70-hour cycle is exhausted, a **34-hour `OFF_DUTY` restart**
  (`RESTART_MIN = 2040`) is inserted and the cycle is reset to 0.
- Route driving durations are **rounded up to the nearest 15 minutes** so the log
  grid is clean and conservative.

**Not implemented (per spec / MVP scope):** adverse-condition extension and the
split-sleeper-berth provision.

### Known simplification — rolling 8-day recap

The request provides only `current_cycle_used_hours`, **not** the previous 8
daily logs. A correct rolling 70-hour/8-day recap requires those daily totals so
that hours "fall off" 8 days later. Since they are unavailable, we treat
`current_cycle_used_hours` as the cycle already consumed at trip start, keep
subtracting on-duty time from 70, and only reset the cycle on a 34-hour restart.
No day-by-day recovery is computed. This is a deliberate, documented
approximation.

---

## Project layout

```
truck route planner/
├── backend/                 # Django + DRF API
│   ├── trucklog/            # project settings / urls
│   ├── trips/
│   │   ├── services/        # geocoding, routing, hos_planner, log_splitter,
│   │   │                    #   validators, trip_builder (orchestration)
│   │   ├── tests/           # unit tests for the 6 HOS scenarios
│   │   ├── serializers.py
│   │   ├── views.py         # POST /api/trips/plan
│   │   └── urls.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/                # React + TS + Vite
    └── src/
        ├── components/      # TripForm, RouteMap, ScheduleTimeline,
        │                    #   SummaryCards, LogSheetSvg
        ├── api.ts, types.ts, utils.ts
        └── App.tsx
```

---

## Running the backend

```bash
cd backend
python -m venv venv
# Windows:  venv\Scripts\activate
# macOS/Linux:  source venv/bin/activate
pip install -r requirements.txt

python manage.py migrate           # sets up Django's internal tables
python manage.py runserver 8000
```

The API is then available at `http://localhost:8000/api/trips/plan`.

> No domain data is persisted — trips are planned on the fly. The SQLite
> database only backs Django's internal machinery.

### Run the tests

```bash
cd backend
python manage.py test trips
```

The suite covers: short route (no break), >8h driving (30-min break), >11h
driving (10-hour rest), >1,000 miles (fuel stop), cycle near 70 (34-hour
restart), and a midnight-crossing trip (multiple log days, each totaling 24h),
plus API smoke + validation tests.

---

## Running the frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:8000`, so run the
backend first. To build for production: `npm run build` (output in `dist/`).

---

## Where to set `ORS_API_KEY`

Routing uses **OpenRouteService** (`driving-hgv` profile) when an API key is
present, and otherwise falls back to a **haversine + 55 mph mock route** so the
app works fully offline for local demos and tests.

1. Get a free key at <https://openrouteservice.org/dev/#/signup>.
2. Copy `backend/.env.example` to `backend/.env`.
3. Set the key:

   ```
   ORS_API_KEY=your-key-here
   ```

Restart the backend. The summary panel shows the active provider
(`openrouteservice` vs `mock`).

Geocoding uses a built-in gazetteer of common US cities first (deterministic /
offline), then a filesystem cache, then the free **Nominatim** geocoder. Set a
descriptive `NOMINATIM_USER_AGENT` in `.env` per their usage policy.

---

## API

### `POST /api/trips/plan`

Request:

```json
{
  "current_location": "Louisville, KY",
  "pickup_location": "Nashville, TN",
  "dropoff_location": "Atlanta, GA",
  "current_cycle_used_hours": 12.5,
  "start_time": "2026-06-12T08:00:00Z"
}
```

`start_time` is optional; when omitted it defaults to the current backend time
rounded up to the nearest 15 minutes. All timestamps are handled in UTC.

Response (abridged):

```json
{
  "summary": { "total_distance_miles": 369.9, "num_days": 1, "routing_provider": "mock", ... },
  "locations": { "current": {...}, "pickup": {...}, "dropoff": {...} },
  "route": { "geometry": [[lat,lng], ...], "legs": [ ... ] },
  "stops": [ { "type": "FUEL", "start": "...", "end": "...", "lat": ..., "lng": ..., "remarks": "..." } ],
  "segments": [ { "status": "DRIVING", "start": "...", "end": "...", "duration_minutes": 180, ... } ],
  "log_days": [ { "date": "2026-06-12", "segments": [...], "remarks": [...], "totals": { "off_duty": 900, "sleeper_berth": 0, "driving": 420, "on_duty_not_driving": 120, "total": 1440 } } ]
}
```

Validation errors return HTTP 400 with an `errors` object.

The frontend's **Debug JSON** tab shows this full payload so reviewers can verify
the generated segments directly.

---

## Daily log sheets

Each `LogDay` is rendered as a complete SVG log form **drawn entirely in code**
(no background image), using the standard paper-log coordinate system
(`viewBox 0 0 513 518`):

- graph grid `x=64, y=184, width=390, height=68`
- rows: `OFF_DUTY 192`, `SLEEPER_BERTH 209`, `DRIVING 226`, `ON_DUTY_NOT_DRIVING 243`
- time → x: `x = 64 + (minutes_after_midnight / 1440) * 390`

Beyond the duty grid, the sheet renders and fills the header (date,
`Total Miles Driving Today` computed from per-segment mileage, From/To, and the
carrier/office/terminal lines), the dated **Remarks** list, per-row + daily
**Total Hours**, and the **70 hr / 8 day Recap** (the on-duty-today figure is
filled exactly; the A/B/C 7/8-day columns are left blank because they require
prior daily logs — see the simplification note above).

Segments are split at midnight (mileage split proportionally), drawn as
horizontal runs per status row with vertical connectors at status changes; every
day's total equals 24 hours (1440 minutes).

Each sheet has an **Export PNG** button (and an **Export all PNGs** button for
the whole trip). Export rasterizes the inline SVG to a canvas at 2× scale and
downloads a PNG — no server round-trip or third-party library, and because the
sheet is pure vector (no embedded raster image) the canvas is never tainted.

---

## Deployment

**Backend (e.g. Render / Railway / Fly / any WSGI host):**

1. Set environment variables: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=0`,
   `DJANGO_ALLOWED_HOSTS=your-api-domain`, `ORS_API_KEY`, and
   `CORS_ALLOWED_ORIGINS=https://your-frontend-domain`.
2. `pip install -r requirements.txt && python manage.py migrate`.
3. Serve with Gunicorn: `gunicorn trucklog.wsgi --bind 0.0.0.0:$PORT`
   (add `gunicorn` to `requirements.txt` for production).

**Frontend (e.g. Vercel / Netlify / static host):**

1. Set `VITE_API_BASE_URL=https://your-api-domain` at build time.
2. `npm install && npm run build` and deploy the `dist/` directory.

Ensure the backend's `CORS_ALLOWED_ORIGINS` includes the deployed frontend
origin (or set `CORS_ALLOW_ALL_ORIGINS=1` for a quick demo).
