import type { DutySegment } from "../types";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  fmtTime,
  fmtDate,
  fmtDuration,
} from "../utils";

export default function ScheduleTimeline({
  segments,
}: {
  segments: DutySegment[];
}) {
  // Collapse adjacent OFF_DUTY filler is not needed here; the planner emits
  // meaningful segments. We hide the trailing/leading auto-filled off-duty
  // (those have empty location & remarks) to keep the schedule actionable,
  // but still show explicit breaks/rests (which carry remarks).
  const rows = segments.filter(
    (s) => s.status !== "OFF_DUTY" || s.remarks !== ""
  );

  let lastDate = "";

  return (
    <div>
      <Legend />
      {rows.map((s, i) => {
        const date = s.start.slice(0, 10);
        const showDate = date !== lastDate;
        lastDate = date;
        return (
          <div key={i}>
            {showDate && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--muted)",
                  margin: "12px 0 4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {fmtDate(s.start)}
              </div>
            )}
            <div className="timeline-row">
              <span
                className="timeline-dot"
                style={{ background: STATUS_COLORS[s.status] }}
              />
              <span className="timeline-time">
                {fmtTime(s.start)}–{fmtTime(s.end)}
              </span>
              <span className="timeline-status">{STATUS_LABELS[s.status]}</span>
              <span className="timeline-dur">
                {fmtDuration(s.duration_minutes)}
              </span>
              <span className="timeline-remarks">
                {s.remarks || s.location_name}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      {(
        Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]
      ).map((k) => (
        <div className="item" key={k}>
          <span className="swatch" style={{ background: STATUS_COLORS[k] }} />
          {STATUS_LABELS[k]}
        </div>
      ))}
    </div>
  );
}
