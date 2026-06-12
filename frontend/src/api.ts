import type { GeoPoint, TripPlan, TripRequest } from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  constructor(message: string, public fieldErrors?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
  }
}

export async function planTrip(req: TripRequest): Promise<TripPlan> {
  let resp: Response;
  try {
    resp = await fetch(`${BASE}/api/trips/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    throw new ApiError(
      "Could not reach the planning service. Is the backend running on :8000?"
    );
  }

  let body: any = null;
  try {
    body = await resp.json();
  } catch {
    /* non-JSON response */
  }

  if (!resp.ok) {
    const errors = body?.errors;
    if (errors?.detail) throw new ApiError(String(errors.detail), errors);
    if (errors)
      throw new ApiError("Please correct the highlighted fields.", errors);
    throw new ApiError(`Request failed (HTTP ${resp.status}).`);
  }

  return body as TripPlan;
}

export interface GeocodeResult {
  current: GeoPoint | null;
  pickup: GeoPoint | null;
  dropoff: GeoPoint | null;
}

/** Resolve the three locations to coordinates for map pins (best-effort:
 *  unresolved locations come back null and network errors yield all-null). */
export async function geocodeLocations(req: {
  current_location?: string;
  pickup_location?: string;
  dropoff_location?: string;
}): Promise<GeocodeResult> {
  try {
    const resp = await fetch(`${BASE}/api/trips/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!resp.ok) return { current: null, pickup: null, dropoff: null };
    return (await resp.json()) as GeocodeResult;
  } catch {
    return { current: null, pickup: null, dropoff: null };
  }
}
