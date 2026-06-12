// Mirrors the JSON contract returned by POST /api/trips/plan.

export type DutyStatus =
  | "OFF_DUTY"
  | "SLEEPER_BERTH"
  | "DRIVING"
  | "ON_DUTY_NOT_DRIVING";

export type StopType =
  | "PICKUP"
  | "DROPOFF"
  | "FUEL"
  | "BREAK_30"
  | "REST_10"
  | "RESTART_34";

export interface DutySegment {
  status: DutyStatus;
  start: string; // ISO datetime
  end: string;
  duration_minutes: number;
  location_name: string;
  lat: number;
  lng: number;
  remarks: string;
  miles: number;
}

export interface Stop {
  type: StopType;
  start: string;
  end: string;
  location_name: string;
  lat: number;
  lng: number;
  remarks: string;
}

export interface LogDayTotals {
  off_duty: number;
  sleeper_berth: number;
  driving: number;
  on_duty_not_driving: number;
  total: number;
}

export interface LogDay {
  date: string; // YYYY-MM-DD
  segments: DutySegment[];
  remarks: { time: string; text: string }[];
  totals: LogDayTotals;
}

export interface GeoPoint {
  name: string;
  lat: number;
  lng: number;
}

export interface RouteLegInfo {
  from: string;
  to: string;
  distance_miles: number;
  duration_minutes: number;
}

export interface TripSummary {
  total_distance_miles: number;
  total_duration_minutes: number;
  total_driving_minutes: number;
  total_on_duty_minutes: number;
  start_time: string;
  end_time: string;
  num_days: number;
  cycle_used_start_hours: number;
  cycle_used_end_hours: number;
  num_fuel_stops: number;
  num_breaks: number;
  num_rests: number;
  num_restarts: number;
  routing_provider: string;
}

export interface TripPlan {
  summary: TripSummary;
  locations: { current: GeoPoint; pickup: GeoPoint; dropoff: GeoPoint };
  route: { geometry: [number, number][]; legs: RouteLegInfo[] };
  stops: Stop[];
  segments: DutySegment[];
  log_days: LogDay[];
}

export interface TripRequest {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  current_cycle_used_hours: number;
  start_time?: string;
}
