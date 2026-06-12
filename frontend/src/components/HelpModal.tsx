import { STATUS_COLORS, STATUS_LABELS, STOP_META } from "../utils";
import type { DutyStatus, StopType } from "../types";

interface Props {
  onClose: () => void;
}

export default function HelpModal({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="How to use TruckLog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>How to use TruckLog</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="lead">
            TruckLog plans an Hours-of-Service (HOS) compliant trip for a
            property-carrying CMV driver and generates the daily log sheets for
            it. Enter a trip, plan it, and read the map, schedule and logs.
          </p>

          <Section n={1} title="Enter your trip">
            <ul>
              <li>
                <b>Current location</b>, <b>Pickup</b>, <b>Dropoff</b> — type a{" "}
                <code>City, ST</code> (e.g. <i>Nashville, TN</i>) or raw{" "}
                <code>lat, lng</code> coordinates.
              </li>
              <li>
                <b>Current cycle used (hours)</b> — how many hours you have
                already used on the 70-hour / 8-day clock (0–70).
              </li>
              <li>
                <b>Start time</b> — optional. Defaults to now, rounded up to the
                next 15 minutes.
              </li>
            </ul>
          </Section>

          <Section n={2} title="Adjust on the map (optional)">
            <ul>
              <li>
                The map shows three pins from the start. <b>Drag</b> the start /
                pickup / dropoff pin to move it — the location field updates to
                the new coordinates.
              </li>
              <li>
                Dragging does <b>not</b> re-plan automatically. Click{" "}
                <b>“Plan route &amp; generate logs”</b> when you’re ready.
              </li>
            </ul>
          </Section>

          <Section n={3} title="Plan & read the results">
            <ul>
              <li>
                <b>Summary cards</b> — distance, driving/on-duty time, number of
                log days, cycle used, and counts of fuel stops, breaks, rests and
                restarts.
              </li>
              <li>
                <b>Route Map</b> — the route line plus color-coded markers. Click
                a marker for its time window and remarks.
              </li>
              <li>
                <b>Schedule</b> — every duty change in order, with times and
                durations.
              </li>
              <li>
                <b>Log Sheets</b> — one filled daily log per calendar day, drawn
                as the standard grid (each day totals 24 hours).
              </li>
              <li>
                <b>Debug JSON</b> — the raw planner output, for verification.
              </li>
            </ul>
          </Section>

          <Section n={0} title="Map & marker legend">
            <div className="legend-grid">
              {(Object.keys(STOP_META) as StopType[]).map((t) => (
                <div className="legend-item" key={t}>
                  <span className="swatch round" style={{ background: STOP_META[t].color }} />
                  {STOP_META[t].label}
                </div>
              ))}
            </div>
          </Section>

          <Section n={0} title="Duty status colors">
            <div className="legend-grid">
              {(Object.keys(STATUS_LABELS) as DutyStatus[]).map((s) => (
                <div className="legend-item" key={s}>
                  <span className="swatch" style={{ background: STATUS_COLORS[s] }} />
                  {STATUS_LABELS[s]}
                </div>
              ))}
            </div>
          </Section>

          <Section n={0} title="HOS rules applied">
            <ul>
              <li>Max <b>11 hours driving</b> after a valid 10-hour break.</li>
              <li>No driving after the <b>14-hour</b> on-duty window expires.</li>
              <li>A <b>30-minute break</b> after 8 cumulative hours of driving.</li>
              <li>A <b>fuel stop</b> at least every 1,000 miles (also satisfies the 30-min break).</li>
              <li>Pickup and dropoff are <b>1 hour</b> of on-duty (not driving) each.</li>
              <li>Driving + on-duty time consume the <b>70-hour</b> cycle; a <b>34-hour restart</b> resets it.</li>
            </ul>
          </Section>

          <div className="callout">
            <b>Note:</b> Without an OpenRouteService API key the app uses a
            haversine + 55 mph estimate (shown as <code>mock</code> in the
            summary). Also, only your current cycle-used value is provided — not
            the prior 8 daily logs — so the 7/8-day recap columns on the log
            sheet are intentionally left blank.
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" style={{ width: "auto", padding: "10px 20px" }} onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="help-section">
      <h3>
        {n > 0 && <span className="step-num">{n}</span>}
        {title}
      </h3>
      {children}
    </div>
  );
}
