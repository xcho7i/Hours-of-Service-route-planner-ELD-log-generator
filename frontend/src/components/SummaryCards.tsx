import type { TripSummary } from "../types";
import { fmtDuration } from "../utils";

export default function SummaryCards({ summary }: { summary: TripSummary }) {
  const cards: { label: string; value: React.ReactNode }[] = [
    {
      label: "Total distance",
      value: (
        <>
          {summary.total_distance_miles.toLocaleString()} <small>mi</small>
        </>
      ),
    },
    {
      label: "Driving time",
      value: fmtDuration(summary.total_driving_minutes),
    },
    {
      label: "On-duty time",
      value: fmtDuration(summary.total_on_duty_minutes),
    },
    {
      label: "Trip duration",
      value: fmtDuration(summary.total_duration_minutes),
    },
    {
      label: "Log days",
      value: summary.num_days,
    },
    {
      label: "Cycle used (end)",
      value: (
        <>
          {summary.cycle_used_end_hours} <small>/ 70 h</small>
        </>
      ),
    },
    {
      label: "Fuel stops",
      value: summary.num_fuel_stops,
    },
    {
      label: "Breaks / Rests",
      value: `${summary.num_breaks} / ${summary.num_rests}`,
    },
    {
      label: "34-hr restarts",
      value: summary.num_restarts,
    },
  ];

  return (
    <div>
      <div className="summary-grid">
        {cards.map((c) => (
          <div className="stat" key={c.label}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value">{c.value}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
        Routing provider: <span className="badge">{summary.routing_provider}</span>
        {summary.routing_provider === "mock" && (
          <span style={{ marginLeft: 8 }}>
            (haversine @ 55 mph — set <code>ORS_API_KEY</code> for real roads)
          </span>
        )}
      </div>
    </div>
  );
}
