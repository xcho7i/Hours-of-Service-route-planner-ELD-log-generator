import { useEffect, useRef, useState } from "react";
import TripForm from "./components/TripForm";
import RouteMap, { type Endpoints } from "./components/RouteMap";
import ScheduleTimeline from "./components/ScheduleTimeline";
import SummaryCards from "./components/SummaryCards";
import LogSheetSvg from "./components/LogSheetSvg";
import HelpModal from "./components/HelpModal";
import { ApiError, geocodeLocations, planTrip } from "./api";
import { exportSvgToPng } from "./exportPng";
import type { TripPlan, TripRequest } from "./types";

type Tab = "map" | "schedule" | "logs" | "debug";

export interface FormState {
  current: string;
  pickup: string;
  dropoff: string;
  cycle: string;
  startTime: string;
}

export type EndpointKind = "current" | "pickup" | "dropoff";

function buildRequest(form: FormState): TripRequest {
  const req: TripRequest = {
    current_location: form.current.trim(),
    pickup_location: form.pickup.trim(),
    dropoff_location: form.dropoff.trim(),
    current_cycle_used_hours: parseFloat(form.cycle) || 0,
  };
  if (form.startTime) {
    req.start_time =
      form.startTime.length === 16 ? `${form.startTime}:00` : form.startTime;
  }
  return req;
}

export default function App() {
  const [form, setForm] = useState<FormState>({
    current: "Louisville, KY",
    pickup: "Nashville, TN",
    dropoff: "Atlanta, GA",
    cycle: "12.5",
    startTime: "",
  });

  const [endpoints, setEndpoints] = useState<Endpoints>({
    current: null,
    pickup: null,
    dropoff: null,
  });

  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, unknown>>();
  const [tab, setTab] = useState<Tab>("map");
  const [helpOpen, setHelpOpen] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);

  // Export every rendered log sheet sequentially as PNGs.
  async function exportAllLogs() {
    const svgs = logsRef.current?.querySelectorAll("svg");
    if (!svgs || !plan) return;
    const dates = plan.log_days.map((d) => d.date);
    for (let i = 0; i < svgs.length; i++) {
      await exportSvgToPng(
        svgs[i] as SVGSVGElement,
        `driver-log-${dates[i] ?? i + 1}.png`,
        2
      );
    }
  }

  // Resolve pins for the initial (default) locations so the map shows from the
  // very first render and the user can drag right away.
  useEffect(() => {
    void refreshEndpoints(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function refreshEndpoints(f: FormState) {
    const r = await geocodeLocations({
      current_location: f.current,
      pickup_location: f.pickup,
      dropoff_location: f.dropoff,
    });
    setEndpoints(r);
  }

  async function handleSubmit() {
    setTab("map");
    setLoading(true);
    setError(null);
    setFieldErrors(undefined);
    try {
      const result = await planTrip(buildRequest(form));
      setPlan(result);
      // Sync pins to whatever was actually geocoded/planned.
      setEndpoints({
        current: result.locations.current,
        pickup: result.locations.pickup,
        dropoff: result.locations.dropoff,
      });
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFieldErrors(e.fieldErrors);
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }

  // Dragging a pin updates only the field + pin position. The route is NOT
  // re-planned until the user clicks "Plan route & generate logs".
  function handleEndpointDrag(kind: EndpointKind, lat: number, lng: number) {
    const value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    setForm((f) => ({ ...f, [kind]: value }));
    setEndpoints((e) => ({ ...e, [kind]: { name: value, lat, lng } }));
  }

  return (
    <div>
      <header className="app-header">
        <div className="logo">🚛</div>
        <div>
          <h1>TruckLog</h1>
          <div className="subtitle">
            Hours-of-Service route planner &amp; ELD log generator
          </div>
        </div>
        <button className="help-btn" onClick={() => setHelpOpen(true)}>
          <span aria-hidden>?</span> Help
        </button>
      </header>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      <div className="layout">
        <div>
          {error && (
            <div className="alert">
              {error}
              {fieldErrors && Object.keys(fieldErrors).length > 0 && (
                <ul>
                  {Object.entries(fieldErrors).map(([k, v]) => (
                    <li key={k}>
                      <strong>{k}:</strong>{" "}
                      {Array.isArray(v) ? v.join(", ") : String(v)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <TripForm
            values={form}
            onChange={setField}
            onLocationBlur={() => void refreshEndpoints(form)}
            onSubmit={handleSubmit}
            loading={loading}
            fieldErrors={fieldErrors}
          />
        </div>

        <div className="results">
          {plan && <SummaryCards summary={plan.summary} />}

          <div className="card" style={{ position: "relative" }}>
            {loading && (
              <div className="replan-overlay">
                <span
                  className="spinner"
                  style={{
                    borderTopColor: "#1d4ed8",
                    borderColor: "rgba(29,78,216,0.25)",
                  }}
                />
                Planning route…
              </div>
            )}

            <div className="tabs">
              <TabButton id="map" tab={tab} setTab={setTab}>
                Route Map
              </TabButton>
              <TabButton id="schedule" tab={tab} setTab={setTab} disabled={!plan}>
                Schedule
              </TabButton>
              <TabButton id="logs" tab={tab} setTab={setTab} disabled={!plan}>
                Log Sheets{plan ? ` (${plan.log_days.length})` : ""}
              </TabButton>
              <TabButton id="debug" tab={tab} setTab={setTab} disabled={!plan}>
                Debug JSON
              </TabButton>
            </div>

            {tab === "map" && (
              <>
                <RouteMap
                  endpoints={endpoints}
                  plan={plan}
                  onEndpointDrag={handleEndpointDrag}
                />
                <div className="map-hint">
                  {plan
                    ? "Drag any pin to a new location, then click “Plan route & generate logs” to update the route."
                    : "Drag the start / pickup / dropoff pins to set locations, then click “Plan route & generate logs”."}
                </div>
              </>
            )}

            {tab === "schedule" && plan && (
              <ScheduleTimeline segments={plan.segments} />
            )}
            {tab === "logs" && plan && (
              <div>
                <div className="logs-toolbar">
                  <span>
                    {plan.log_days.length} daily log
                    {plan.log_days.length === 1 ? "" : "s"}
                  </span>
                  <button className="export-btn" onClick={() => void exportAllLogs()}>
                    ⬇ Export all PNGs
                  </button>
                </div>
                <div ref={logsRef}>
                  {plan.log_days.map((d) => (
                    <LogSheetSvg
                      key={d.date}
                      day={d}
                      from={plan.locations.current.name}
                      to={plan.locations.dropoff.name}
                    />
                  ))}
                </div>
              </div>
            )}
            {tab === "debug" && plan && (
              <pre className="debug-json">{JSON.stringify(plan, null, 2)}</pre>
            )}
          </div>

          {!plan && !loading && (
            <div
              style={{
                fontSize: 13,
                color: "var(--muted)",
                textAlign: "center",
              }}
            >
              Plan a route to generate the schedule and daily log sheets.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  id,
  tab,
  setTab,
  children,
  disabled,
}: {
  id: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className={`tab ${tab === id ? "active" : ""}`}
      onClick={() => !disabled && setTab(id)}
      disabled={disabled}
      style={disabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
    >
      {children}
    </button>
  );
}
