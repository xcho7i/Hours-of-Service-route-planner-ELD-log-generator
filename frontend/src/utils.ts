import type { DutyStatus, StopType } from "./types";

export const STATUS_COLORS: Record<DutyStatus, string> = {
  OFF_DUTY: "#94a3b8",
  SLEEPER_BERTH: "#6366f1",
  DRIVING: "#16a34a",
  ON_DUTY_NOT_DRIVING: "#f59e0b",
};

export const STATUS_LABELS: Record<DutyStatus, string> = {
  OFF_DUTY: "Off Duty",
  SLEEPER_BERTH: "Sleeper Berth",
  DRIVING: "Driving",
  ON_DUTY_NOT_DRIVING: "On Duty (not driving)",
};

export const STOP_META: Record<StopType, { color: string; label: string }> = {
  PICKUP: { color: "#2563eb", label: "Pickup" },
  DROPOFF: { color: "#db2777", label: "Dropoff" },
  FUEL: { color: "#f59e0b", label: "Fuel" },
  BREAK_30: { color: "#0ea5e9", label: "30-min Break" },
  REST_10: { color: "#6366f1", label: "10-hr Rest" },
  RESTART_34: { color: "#7c3aed", label: "34-hr Restart" },
};

/** Format an ISO datetime as HH:MM (24h), using the timestamp as-is. */
export function fmtTime(iso: string): string {
  return iso.slice(11, 16);
}

export function fmtDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** minutes -> "Hh Mm" */
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** minutes -> decimal hours string, e.g. 90 -> "1.5" */
export function toHours(min: number): string {
  return (min / 60).toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
}

/** Minutes after midnight for an ISO datetime (UTC). */
export function minutesAfterMidnight(iso: string): number {
  const h = parseInt(iso.slice(11, 13), 10);
  const m = parseInt(iso.slice(14, 16), 10);
  return h * 60 + m;
}
