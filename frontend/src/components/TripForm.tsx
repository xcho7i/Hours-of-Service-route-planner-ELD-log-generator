import type { FormState } from "../App";

interface Props {
  values: FormState;
  onChange: (field: keyof FormState, value: string) => void;
  /** Called when a location text field loses focus, to refresh map pins. */
  onLocationBlur: () => void;
  onSubmit: () => void;
  loading: boolean;
  fieldErrors?: Record<string, unknown>;
}

const FIELD_ERROR_KEYS: Record<string, string> = {
  current: "current_location",
  pickup: "pickup_location",
  dropoff: "dropoff_location",
  cycle: "current_cycle_used_hours",
  startTime: "start_time",
};

export default function TripForm({
  values,
  onChange,
  onLocationBlur,
  onSubmit,
  loading,
  fieldErrors,
}: Props) {
  function fieldError(field: keyof FormState): string | null {
    if (!fieldErrors) return null;
    const v = (fieldErrors as any)[FIELD_ERROR_KEYS[field]];
    if (!v) return null;
    return Array.isArray(v) ? String(v[0]) : String(v);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Plan a trip</h2>
      <div className="card-sub">
        Property-carrying CMV · 70 hr / 8 day cycle
      </div>

      <Field
        label="Current location"
        value={values.current}
        onChange={(v) => onChange("current", v)}
        onBlur={onLocationBlur}
        placeholder="City, ST or lat, lng"
        error={fieldError("current")}
      />
      <Field
        label="Pickup location"
        value={values.pickup}
        onChange={(v) => onChange("pickup", v)}
        onBlur={onLocationBlur}
        placeholder="City, ST or lat, lng"
        error={fieldError("pickup")}
      />
      <Field
        label="Dropoff location"
        value={values.dropoff}
        onChange={(v) => onChange("dropoff", v)}
        onBlur={onLocationBlur}
        placeholder="City, ST or lat, lng"
        error={fieldError("dropoff")}
      />

      <div className="field">
        <label>Current cycle used (hours)</label>
        <input
          type="number"
          min={0}
          max={70}
          step={0.25}
          value={values.cycle}
          onChange={(e) => onChange("cycle", e.target.value)}
        />
        <div className="hint">Hours already on the 70-hour clock (0–70).</div>
        {fieldError("cycle") && (
          <div className="hint" style={{ color: "var(--danger)" }}>
            {fieldError("cycle")}
          </div>
        )}
      </div>

      <div className="field">
        <label>Start time (optional)</label>
        <input
          type="datetime-local"
          value={values.startTime}
          onChange={(e) => onChange("startTime", e.target.value)}
        />
        <div className="hint">Defaults to now, rounded up to 15 minutes.</div>
      </div>

      <button className="btn" type="submit" disabled={loading}>
        {loading && <span className="spinner" />}
        {loading ? "Planning route…" : "Plan route & generate logs"}
      </button>

      <div className="hint" style={{ marginTop: 10, textAlign: "center" }}>
        Tip: drag the start / pickup / dropoff pins on the map to set locations,
        then click the button above to plan.
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string | null;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        style={error ? { borderColor: "var(--danger)" } : undefined}
      />
      {error && (
        <div className="hint" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
