import { useRef } from "react";
import type { LogDay, DutyStatus } from "../types";
import { fmtDate, toHours, fmtTime } from "../utils";
import { exportSvgToPng } from "../exportPng";

/**
 * Renders one full daily driver's log, drawn entirely in code (no background
 * image), mirroring the standard paper-log layout. The duty grid uses the
 * template coordinate system (viewBox 0 0 513 518):
 *
 *   graph grid:  x=64  y=184  width=390  height=68
 *   rows:        OFF_DUTY 192 | SLEEPER_BERTH 209 | DRIVING 226 | ON_DUTY 243
 *   time map:    x = 64 + (minutesAfterMidnight / 1440) * 390
 *
 * Header (date, miles, carrier lines), remarks and the 70hr/8day recap are also
 * drawn and filled with whatever the planner makes available.
 */

const VB_W = 513;
const VB_H = 518;
const GRID_X = 64;
const GRID_Y = 184;
const GRID_W = 390;
const GRID_H = 68;

const ROW_Y: Record<DutyStatus, number> = {
  OFF_DUTY: 192,
  SLEEPER_BERTH: 209,
  DRIVING: 226,
  ON_DUTY_NOT_DRIVING: 243,
};

const ROW_LABELS: { status: DutyStatus; num: string; text: string }[] = [
  { status: "OFF_DUTY", num: "1.", text: "Off Duty" },
  { status: "SLEEPER_BERTH", num: "2.", text: "Sleeper Berth" },
  { status: "DRIVING", num: "3.", text: "Driving" },
  { status: "ON_DUTY_NOT_DRIVING", num: "4.", text: "On Duty (not driving)" },
];

const INK = "#1d3a8a"; // duty trace
const LINE = "#334155";
const FAINT = "#cbd5e1";
const TEXT = "#0f172a";
const MUTED = "#475569";

function xForMinutes(min: number): number {
  return GRID_X + (min / 1440) * GRID_W;
}

function minutesOfDay(iso: string): number {
  const h = parseInt(iso.slice(11, 13), 10);
  const m = parseInt(iso.slice(14, 16), 10);
  return h * 60 + m;
}

interface Props {
  day: LogDay;
  from?: string;
  to?: string;
  carrier?: string;
  mainOffice?: string;
  homeTerminal?: string;
}

export default function LogSheetSvg({
  day,
  from,
  to,
  carrier,
  mainOffice,
  homeTerminal,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const segs = day.segments;
  const totals = day.totals;

  const milesToday = Math.round(
    segs.reduce((acc, s) => acc + (s.status === "DRIVING" ? s.miles : 0), 0)
  );

  // ISO date -> month / day / year
  const [yyyy, mm, dd] = day.date.split("-");

  // Build the duty trace (horizontal runs + vertical connectors).
  const horizontals: JSX.Element[] = [];
  const verticals: JSX.Element[] = [];
  segs.forEach((s, i) => {
    const startMin = minutesOfDay(s.start);
    const endMin = i === segs.length - 1 ? 1440 : minutesOfDay(s.end) || 1440;
    const y = ROW_Y[s.status];
    horizontals.push(
      <line
        key={`h-${i}`}
        x1={xForMinutes(startMin)}
        y1={y}
        x2={xForMinutes(endMin)}
        y2={y}
        stroke={INK}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    );
    if (i > 0) {
      const prevY = ROW_Y[segs[i - 1].status];
      if (prevY !== y) {
        verticals.push(
          <line
            key={`v-${i}`}
            x1={xForMinutes(startMin)}
            y1={prevY}
            x2={xForMinutes(startMin)}
            y2={y}
            stroke={INK}
            strokeWidth={1.6}
          />
        );
      }
    }
  });

  function handleExport() {
    if (svgRef.current) {
      void exportSvgToPng(svgRef.current, `driver-log-${day.date}.png`, 2);
    }
  }

  return (
    <div className="logsheet">
      <div className="logsheet-head">
        <h3>Driver's Daily Log — {fmtDate(day.date)}</h3>
        <button className="export-btn" onClick={handleExport}>
          ⬇ Export PNG
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label="Daily log sheet"
        fontFamily="'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
      >
        <rect x={0} y={0} width={VB_W} height={VB_H} fill="#fff" />

        <Header
          mm={mm}
          dd={dd}
          yyyy={yyyy}
          milesToday={milesToday}
          from={from}
          to={to}
          carrier={carrier}
          mainOffice={mainOffice}
          homeTerminal={homeTerminal}
        />

        <Grid />
        {horizontals}
        {verticals}
        <RowTotals totals={totals} />

        <Remarks day={day} />
        <Recap totals={totals} />
      </svg>
    </div>
  );
}

/* ----------------------------- header ----------------------------- */
function Header({
  mm,
  dd,
  yyyy,
  milesToday,
  from,
  to,
  carrier,
  mainOffice,
  homeTerminal,
}: {
  mm: string;
  dd: string;
  yyyy: string;
  milesToday: number;
  from?: string;
  to?: string;
  carrier?: string;
  mainOffice?: string;
  homeTerminal?: string;
}) {
  return (
    <g>
      <text x={8} y={20} fontSize={15} fontWeight={700} fill={TEXT}>
        Driver's Daily Log
      </text>
      <text x={30} y={31} fontSize={6.5} fill={MUTED}>
        (24 hours)
      </text>

      {/* date with slashes */}
      <FilledLine x={232} y={22} w={34} value={mm} />
      <text x={268} y={22} fontSize={9} fill={TEXT}>/</text>
      <FilledLine x={274} y={22} w={28} value={dd} />
      <text x={304} y={22} fontSize={9} fill={TEXT}>/</text>
      <FilledLine x={310} y={22} w={44} value={yyyy} />
      <text x={249} y={31} fontSize={5.5} fill={MUTED}>(month)</text>
      <text x={282} y={31} fontSize={5.5} fill={MUTED}>(day)</text>
      <text x={320} y={31} fontSize={5.5} fill={MUTED}>(year)</text>

      <text x={372} y={12} fontSize={5.5} fill={MUTED}>
        Original — File at home terminal.
      </text>
      <text x={372} y={20} fontSize={5.5} fill={MUTED}>
        Duplicate — Driver retains for 8 days.
      </text>

      {/* From / To */}
      <text x={8} y={50} fontSize={7} fontWeight={700} fill={TEXT}>From:</text>
      <FilledLine x={34} y={50} w={210} value={from} />
      <text x={252} y={50} fontSize={7} fontWeight={700} fill={TEXT}>To:</text>
      <FilledLine x={268} y={50} w={237} value={to} />

      {/* mileage boxes */}
      <LabeledBox x={70} y={66} w={92} h={20} value={String(milesToday)} label="Total Miles Driving Today" />
      <LabeledBox x={166} y={66} w={92} h={20} value={String(milesToday)} label="Total Mileage Today" />
      <LabeledBox
        x={70}
        y={108}
        w={188}
        h={20}
        value=""
        label="Truck/Tractor & Trailer Numbers or License Plate(s)/State"
      />

      {/* carrier / office / terminal */}
      <CarrierLine x={300} y={78} value={carrier} label="Name of Carrier or Carriers" />
      <CarrierLine x={300} y={100} value={mainOffice} label="Main Office Address" />
      <CarrierLine x={300} y={122} value={homeTerminal} label="Home Terminal Address" />
    </g>
  );
}

function FilledLine({
  x,
  y,
  w,
  value,
}: {
  x: number;
  y: number;
  w: number;
  value?: string;
}) {
  return (
    <g>
      <line x1={x} y1={y} x2={x + w} y2={y} stroke={LINE} strokeWidth={0.6} />
      {value ? (
        <text x={x + w / 2} y={y - 2} fontSize={7} textAnchor="middle" fill={TEXT}>
          {value}
        </text>
      ) : null}
    </g>
  );
}

function LabeledBox({
  x,
  y,
  w,
  h,
  value,
  label,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  value: string;
  label: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={LINE} strokeWidth={0.7} />
      {value ? (
        <text x={x + w / 2} y={y + h / 2 + 3} fontSize={9} fontWeight={700} textAnchor="middle" fill={TEXT}>
          {value}
        </text>
      ) : null}
      <text x={x + w / 2} y={y + h + 7} fontSize={5} textAnchor="middle" fill={MUTED}>
        {label}
      </text>
    </g>
  );
}

function CarrierLine({ x, y, value, label }: { x: number; y: number; value?: string; label: string }) {
  const w = 200;
  return (
    <g>
      <line x1={x} y1={y} x2={x + w} y2={y} stroke={LINE} strokeWidth={0.6} />
      {value ? (
        <text x={x + w / 2} y={y - 2} fontSize={6.5} textAnchor="middle" fill={TEXT}>
          {value}
        </text>
      ) : null}
      <text x={x + w / 2} y={y + 7} fontSize={5} textAnchor="middle" fill={MUTED}>
        {label}
      </text>
    </g>
  );
}

/* ------------------------------- grid ------------------------------- */
function Grid() {
  const els: JSX.Element[] = [];

  els.push(
    <rect key="box" x={GRID_X} y={GRID_Y} width={GRID_W} height={GRID_H} fill="#fff" stroke={LINE} strokeWidth={1} />
  );
  [200.5, 217.5, 234.5].forEach((y, i) => {
    els.push(
      <line key={`rs-${i}`} x1={GRID_X} y1={y} x2={GRID_X + GRID_W} y2={y} stroke={FAINT} strokeWidth={0.6} />
    );
  });

  for (let hour = 0; hour <= 24; hour++) {
    const x = xForMinutes(hour * 60);
    els.push(
      <line
        key={`hl-${hour}`}
        x1={x}
        y1={GRID_Y}
        x2={x}
        y2={GRID_Y + GRID_H}
        stroke={hour % 6 === 0 ? "#64748b" : "#94a3b8"}
        strokeWidth={hour % 6 === 0 ? 0.9 : 0.5}
      />
    );
    const label = hour === 0 || hour === 24 ? "Mid-night" : hour === 12 ? "Noon" : String(hour % 12 || 12);
    els.push(
      <text key={`hlbl-${hour}`} x={x} y={GRID_Y - 3} fontSize={hour === 0 || hour === 12 || hour === 24 ? 5 : 6} textAnchor="middle" fill={MUTED}>
        {label}
      </text>
    );
    if (hour < 24) {
      for (let q = 1; q < 4; q++) {
        const qx = xForMinutes(hour * 60 + q * 15);
        ROW_LABELS.forEach((row) => {
          const ry = ROW_Y[row.status];
          els.push(
            <line key={`q-${hour}-${q}-${row.status}`} x1={qx} y1={ry - 3.5} x2={qx} y2={ry + (q === 2 ? 4.5 : 3)} stroke="#e2e8f0" strokeWidth={0.4} />
          );
        });
      }
    }
  }

  ROW_LABELS.forEach((row) => {
    els.push(
      <text key={`row-${row.status}`} x={GRID_X - 4} y={ROW_Y[row.status] + 2} fontSize={5.5} textAnchor="end" fill={LINE}>
        {row.num} {row.text}
      </text>
    );
  });

  els.push(
    <text key="th" x={GRID_X + GRID_W + 6} y={GRID_Y - 3} fontSize={5.5} fill={MUTED}>
      Total Hours
    </text>
  );

  return <g>{els}</g>;
}

function RowTotals({ totals }: { totals: LogDay["totals"] }) {
  const map: { status: DutyStatus; value: number }[] = [
    { status: "OFF_DUTY", value: totals.off_duty },
    { status: "SLEEPER_BERTH", value: totals.sleeper_berth },
    { status: "DRIVING", value: totals.driving },
    { status: "ON_DUTY_NOT_DRIVING", value: totals.on_duty_not_driving },
  ];
  return (
    <g>
      {map.map((m) => (
        <g key={m.status}>
          <line x1={GRID_X + GRID_W + 6} y1={ROW_Y[m.status] + 1} x2={GRID_X + GRID_W + 44} y2={ROW_Y[m.status] + 1} stroke={LINE} strokeWidth={0.5} />
          <text x={GRID_X + GRID_W + 25} y={ROW_Y[m.status] - 1} fontSize={7} textAnchor="middle" fill={TEXT} fontWeight={600}>
            {toHours(m.value)}
          </text>
        </g>
      ))}
      <text x={GRID_X + GRID_W + 25} y={GRID_Y + GRID_H + 10} fontSize={7} textAnchor="middle" fill={TEXT} fontWeight={700}>
        = {toHours(totals.total)}
      </text>
    </g>
  );
}

/* ----------------------------- remarks ----------------------------- */
function Remarks({ day }: { day: LogDay }) {
  const top = 266;
  const els: JSX.Element[] = [];
  els.push(
    <text key="title" x={8} y={top} fontSize={9} fontWeight={700} fill={TEXT}>
      Remarks
    </text>
  );
  // outline box for the remarks area
  els.push(
    <rect key="rbox" x={6} y={top + 6} width={372} height={120} fill="none" stroke={FAINT} strokeWidth={0.6} />
  );

  // dated remarks (stops / activity changes)
  const items = day.remarks.slice(0, 11);
  items.forEach((r, i) => {
    const y = top + 20 + i * 10;
    els.push(
      <text key={`rm-${i}`} x={12} y={y} fontSize={6} fill={MUTED}>
        <tspan fontWeight={700} fill={TEXT}>{fmtTime(r.time)}</tspan>  {r.text}
      </text>
    );
  });
  if (day.remarks.length > 11) {
    els.push(
      <text key="more" x={12} y={top + 20 + 11 * 10} fontSize={6} fill={MUTED}>
        + {day.remarks.length - 11} more…
      </text>
    );
  }

  // shipping / commodity labels (left column, like the paper form)
  els.push(
    <g key="ship">
      <text x={386} y={top + 18} fontSize={6} fontWeight={700} fill={TEXT}>Shipping Documents:</text>
      <line x1={386} y1={top + 30} x2={505} y2={top + 30} stroke={LINE} strokeWidth={0.5} />
      <text x={386} y={top + 44} fontSize={5.5} fill={MUTED}>DVL or Manifest No.</text>
      <line x1={386} y1={top + 54} x2={505} y2={top + 54} stroke={LINE} strokeWidth={0.5} />
      <text x={386} y={top + 68} fontSize={5.5} fill={MUTED}>Shipper &amp; Commodity</text>
      <line x1={386} y1={top + 78} x2={505} y2={top + 78} stroke={LINE} strokeWidth={0.5} />
    </g>
  );

  els.push(
    <text key="note" x={256} y={top + 138} fontSize={5} textAnchor="middle" fill={MUTED}>
      Enter name of place you reported and where released from work, and when and where each change of duty occurred.
    </text>
  );

  return <g>{els}</g>;
}

/* ------------------------------ recap ------------------------------ */
function Recap({ totals }: { totals: LogDay["totals"] }) {
  const top = 430;
  const onDutyToday = toHours(totals.driving + totals.on_duty_not_driving);
  return (
    <g>
      <line x1={6} y1={top} x2={VB_W - 6} y2={top} stroke={LINE} strokeWidth={0.7} />
      <text x={8} y={top + 12} fontSize={6} fontWeight={700} fill={TEXT}>Recap:</text>
      <text x={8} y={top + 21} fontSize={5.5} fill={MUTED}>Complete at end of day</text>

      {/* On-duty today (lines 3 & 4) — this we know exactly */}
      <text x={70} y={top + 12} fontSize={5.5} fill={MUTED}>On-duty hours today</text>
      <text x={70} y={top + 20} fontSize={5.5} fill={MUTED}>(Total lines 3 &amp; 4):</text>
      <rect x={132} y={top + 6} width={34} height={16} fill="none" stroke={LINE} strokeWidth={0.6} />
      <text x={149} y={top + 17} fontSize={8} fontWeight={700} textAnchor="middle" fill={TEXT}>
        {onDutyToday}
      </text>

      <text x={185} y={top + 12} fontSize={6} fontWeight={700} fill={TEXT}>70 Hour / 8 Day</text>
      <text x={355} y={top + 12} fontSize={6} fontWeight={700} fill={TEXT}>60 Hour / 7 Day</text>

      {/* The A/B/C 7/8-day columns require prior daily logs we don't have. */}
      <RecapCol x={185} top={top} title="A. On-duty last 7/8 days" />
      <RecapCol x={270} top={top} title="B. Available tomorrow" />
      <RecapCol x={355} top={top} title="C. On-duty last 5/7 days" />

      <text x={8} y={top + 50} fontSize={5} fill={MUTED}>
        * 70 hr / 8 day cycle. The 7/8-day recap (A/B/C) needs prior daily logs, which this MVP does not collect — only the current cycle-used value is provided.
      </text>
    </g>
  );
}

function RecapCol({ x, top, title }: { x: number; top: number; title: string }) {
  return (
    <g>
      <text x={x} y={top + 24} fontSize={5} fill={MUTED}>{title}</text>
      <line x1={x} y1={top + 34} x2={x + 70} y2={top + 34} stroke={LINE} strokeWidth={0.5} />
    </g>
  );
}
