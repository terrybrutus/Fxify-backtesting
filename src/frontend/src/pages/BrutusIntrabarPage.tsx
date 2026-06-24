import { Download, Upload, ZoomIn } from "lucide-react";
import { useMemo, useState } from "react";

type Direction = "long" | "short";
type TargetTf = "15m" | "1H";
type Outcome = "target" | "stop" | "timeout" | "no-data";

type MinuteBar = {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type PartialBar = {
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type IntrabarTouch = {
  id: string;
  symbol: string;
  timeframe: TargetTf;
  direction: Direction;
  bucketStart: number;
  touchTime: number;
  minuteOffset: number;
  entryBand: number;
  bandWidth: number;
  touchDepth: number;
  touchDepthRatio: number;
  touchCloseDistance: number;
  immediateRejection: number;
  oneMinuteFollowThrough: number;
  fifteenMinuteR: number;
  sixtyMinuteR: number;
  outcome15: Outcome;
  outcome60: Outcome;
  session: string;
  plainRead: string;
};

type SummaryRow = {
  label: string;
  touches: number;
  targetRate15: number;
  stopRate15: number;
  avgR15: number;
  avgR60: number;
  avgTouchDepth: number;
  avgImmediateRejection: number;
  plainRead: string;
};

const SYMBOL_MAP: Record<string, string> = {
  "DJ30.R": "DJ30.R",
  "USTEC.R": "USTEC.R",
  "US500.R": "US500.R",
  "JPN225.R": "JPN225.R",
};

const TARGETS: { label: TargetTf; ms: number }[] = [
  { label: "15m", ms: 15 * 60 * 1000 },
  { label: "1H", ms: 60 * 60 * 1000 },
];

const LENGTH = 9;
const MULT = 2;
const MAX_EVENTS = 500;

function parseCsvRecords(text: string) {
  const records: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) records.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }
  row.push(current);
  if (row.some((cell) => cell.trim() !== "")) records.push(row);
  return records;
}

function asNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function inferSymbol(fileName: string) {
  const upper = fileName.toUpperCase();
  return (
    Object.keys(SYMBOL_MAP).find((candidate) => upper.includes(candidate)) ??
    "UNKNOWN"
  );
}

function parseMinuteCsv(text: string, fileName: string) {
  const records = parseCsvRecords(text);
  const [header, ...rows] = records;
  if (!header) return [];
  const index = new Map(
    header.map((cell, cellIndex) => [cell.trim().toLowerCase(), cellIndex]),
  );
  const symbol = inferSymbol(fileName);
  return rows.flatMap((row): MinuteBar[] => {
    const timestamp = asNumber(row[index.get("time") ?? -1]);
    const open = asNumber(row[index.get("open") ?? -1]);
    const high = asNumber(row[index.get("high") ?? -1]);
    const low = asNumber(row[index.get("low") ?? -1]);
    const close = asNumber(row[index.get("close") ?? -1]);
    if (
      timestamp == null ||
      open == null ||
      high == null ||
      low == null ||
      close == null
    ) {
      return [];
    }
    return [
      {
        symbol,
        timestamp: timestamp * 1000,
        open,
        high,
        low,
        close,
      },
    ];
  });
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      values.length,
  );
}

function ema(values: number[], length: number) {
  if (values.length === 0) return 0;
  const alpha = 2 / (length + 1);
  return values.reduce((current, value, index) => {
    if (index === 0) return value;
    return value * alpha + current * (1 - alpha);
  }, values[0]);
}

function bandsFor(history: PartialBar[], partial: PartialBar) {
  const bars = [...history, partial].slice(-80);
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const upper = ema(highs, LENGTH) + MULT * stdev(highs.slice(-LENGTH));
  const lower = ema(lows, LENGTH) - MULT * stdev(lows.slice(-LENGTH));
  return { upper, lower, width: Math.max(upper - lower, 0.0001) };
}

function easternHour(timestamp: number) {
  const hourText = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: "America/New_York",
  }).format(new Date(timestamp));
  return Number(hourText);
}

function sessionFor(timestamp: number) {
  const hour = easternHour(timestamp);
  if (hour >= 18 || hour < 3) return "Asia / post-open";
  if (hour >= 3 && hour < 8) return "London";
  if (hour >= 8 && hour < 12) return "NY open";
  if (hour >= 12 && hour < 16) return "NY midday";
  return "After-hours";
}

function bucketFor(timestamp: number, targetMs: number) {
  return Math.floor(timestamp / targetMs) * targetMs;
}

function fmtDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function fmt(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function simulateR(
  bars: MinuteBar[],
  startIndex: number,
  direction: Direction,
  entry: number,
  risk: number,
  minutes: number,
) {
  const stop = direction === "long" ? entry - risk : entry + risk;
  const target = direction === "long" ? entry + risk * 1.5 : entry - risk * 1.5;
  const window = bars.slice(startIndex + 1, startIndex + 1 + minutes);
  if (window.length === 0) return { outcome: "no-data" as Outcome, r: 0 };
  for (const bar of window) {
    const stopHit = direction === "long" ? bar.low <= stop : bar.high >= stop;
    const targetHit =
      direction === "long" ? bar.high >= target : bar.low <= target;
    if (stopHit) return { outcome: "stop" as Outcome, r: -1 };
    if (targetHit) return { outcome: "target" as Outcome, r: 1.5 };
  }
  const last = window[window.length - 1];
  const points = direction === "long" ? last.close - entry : entry - last.close;
  return { outcome: "timeout" as Outcome, r: points / risk };
}

function buildPlainRead(touch: Omit<IntrabarTouch, "plainRead">) {
  const fast = touch.minuteOffset <= 2 ? "early" : "late";
  const depth =
    touch.touchDepthRatio >= 0.15
      ? "deep"
      : touch.touchDepthRatio >= 0.04
        ? "moderate"
        : "light";
  const rejection =
    touch.immediateRejection > 0
      ? "showed quick snapback"
      : "was still pushing through";
  return `${touch.symbol} ${touch.timeframe} ${touch.direction}: ${fast} ${depth} touch, ${rejection}.`;
}

function detectForDataset(
  bars: MinuteBar[],
  timeframe: TargetTf,
  targetMs: number,
) {
  const events: IntrabarTouch[] = [];
  const completed: PartialBar[] = [];
  let current: PartialBar | undefined;
  let currentBucket = 0;
  let seenLong = false;
  let seenShort = false;

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    const bucket = bucketFor(bar.timestamp, targetMs);
    if (!current || bucket !== currentBucket) {
      if (current) completed.push(current);
      currentBucket = bucket;
      current = {
        start: bucket,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      };
      seenLong = false;
      seenShort = false;
    } else {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
    }

    if (completed.length < LENGTH) continue;

    const { upper, lower, width } = bandsFor(completed, current);
    const minuteOffset = Math.floor((bar.timestamp - currentBucket) / 60000);
    const candidates: { direction: Direction; entry: number; depth: number }[] =
      [];
    if (!seenLong && bar.low <= lower) {
      candidates.push({
        direction: "long",
        entry: lower,
        depth: lower - bar.low,
      });
      seenLong = true;
    }
    if (!seenShort && bar.high >= upper) {
      candidates.push({
        direction: "short",
        entry: upper,
        depth: bar.high - upper,
      });
      seenShort = true;
    }

    for (const candidate of candidates) {
      const next = bars[index + 1];
      const touchCloseDistance =
        candidate.direction === "long"
          ? bar.close - candidate.entry
          : candidate.entry - bar.close;
      const immediateRejection =
        candidate.direction === "long"
          ? bar.close - bar.low
          : bar.high - bar.close;
      const oneMinuteFollowThrough = next
        ? candidate.direction === "long"
          ? next.close - bar.close
          : bar.close - next.close
        : 0;
      const risk = width * 0.5;
      const result15 = simulateR(
        bars,
        index,
        candidate.direction,
        candidate.entry,
        risk,
        15,
      );
      const result60 = simulateR(
        bars,
        index,
        candidate.direction,
        candidate.entry,
        risk,
        60,
      );
      const eventBase = {
        id: `${bar.symbol}-${timeframe}-${candidate.direction}-${bar.timestamp}`,
        symbol: bar.symbol,
        timeframe,
        direction: candidate.direction,
        bucketStart: currentBucket,
        touchTime: bar.timestamp,
        minuteOffset,
        entryBand: candidate.entry,
        bandWidth: width,
        touchDepth: candidate.depth,
        touchDepthRatio: candidate.depth / width,
        touchCloseDistance,
        immediateRejection,
        oneMinuteFollowThrough,
        fifteenMinuteR: result15.r,
        sixtyMinuteR: result60.r,
        outcome15: result15.outcome,
        outcome60: result60.outcome,
        session: sessionFor(bar.timestamp),
      };
      events.push({ ...eventBase, plainRead: buildPlainRead(eventBase) });
    }
  }

  return events;
}

function buildTouches(bars: MinuteBar[]) {
  const bySymbol = new Map<string, MinuteBar[]>();
  for (const bar of bars) {
    bySymbol.set(bar.symbol, [...(bySymbol.get(bar.symbol) ?? []), bar]);
  }
  const all: IntrabarTouch[] = [];
  for (const dataset of bySymbol.values()) {
    dataset.sort((a, b) => a.timestamp - b.timestamp);
    for (const target of TARGETS) {
      all.push(...detectForDataset(dataset, target.label, target.ms));
    }
  }
  return all.sort((a, b) => b.touchTime - a.touchTime);
}

function rowFor(label: string, touches: IntrabarTouch[]): SummaryRow {
  const target15 = touches.filter(
    (touch) => touch.outcome15 === "target",
  ).length;
  const stops15 = touches.filter((touch) => touch.outcome15 === "stop").length;
  const avgR15 = mean(touches.map((touch) => touch.fifteenMinuteR));
  const avgR60 = mean(touches.map((touch) => touch.sixtyMinuteR));
  const avgDepth = mean(touches.map((touch) => touch.touchDepthRatio));
  const avgRejection = mean(
    touches.map((touch) => touch.immediateRejection / touch.bandWidth),
  );
  const plainRead =
    touches.length < 10
      ? "Too small to trust yet."
      : avgR15 > 0.2 && stops15 / touches.length < 0.35
        ? "This bucket is worth reviewing; snapback is showing up better than the broader set."
        : avgR15 < -0.1
          ? "This bucket is acting like a trap more than a reversal."
          : "Mixed; keep as research, not a rule.";
  return {
    label,
    touches: touches.length,
    targetRate15: touches.length ? target15 / touches.length : 0,
    stopRate15: touches.length ? stops15 / touches.length : 0,
    avgR15,
    avgR60,
    avgTouchDepth: avgDepth,
    avgImmediateRejection: avgRejection,
    plainRead,
  };
}

function groupRows(
  touches: IntrabarTouch[],
  labelFor: (touch: IntrabarTouch) => string,
) {
  const groups = new Map<string, IntrabarTouch[]>();
  for (const touch of touches) {
    const label = labelFor(touch);
    groups.set(label, [...(groups.get(label) ?? []), touch]);
  }
  return Array.from(groups.entries())
    .map(([label, group]) => rowFor(label, group))
    .sort((a, b) => b.touches - a.touches);
}

function exportJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Table({
  rows,
  title,
}: {
  rows: SummaryRow[];
  title: string;
}) {
  return (
    <section className="border border-border bg-card p-4">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Bucket</th>
              <th className="px-2 py-2 text-right">Touches</th>
              <th className="px-2 py-2 text-right">15m Target</th>
              <th className="px-2 py-2 text-right">15m Stop</th>
              <th className="px-2 py-2 text-right">Avg 15m R</th>
              <th className="px-2 py-2 text-right">Avg 60m R</th>
              <th className="px-2 py-2">Read</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-2 py-5 text-muted-foreground" colSpan={7}>
                  Import 1m Alchemy CSVs to populate this section.
                </td>
              </tr>
            ) : (
              rows.slice(0, 20).map((row) => (
                <tr className="border-b border-border/70" key={row.label}>
                  <td className="px-2 py-2 font-mono text-xs">{row.label}</td>
                  <td className="px-2 py-2 text-right font-mono">
                    {row.touches}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {pct(row.targetRate15)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {pct(row.stopRate15)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {fmt(row.avgR15)}R
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {fmt(row.avgR60)}R
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {row.plainRead}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BrutusIntrabarPage() {
  const [bars, setBars] = useState<MinuteBar[]>([]);
  const [fileNotes, setFileNotes] = useState<string[]>([]);

  const touches = useMemo(() => buildTouches(bars), [bars]);
  const latestTouches = touches.slice(0, MAX_EVENTS);
  const bySymbol = useMemo(
    () => groupRows(touches, (touch) => `${touch.symbol} | ${touch.timeframe}`),
    [touches],
  );
  const bySession = useMemo(
    () =>
      groupRows(touches, (touch) => `${touch.session} | ${touch.timeframe}`),
    [touches],
  );
  const byTiming = useMemo(
    () =>
      groupRows(touches, (touch) => {
        if (touch.minuteOffset <= 2) return `${touch.timeframe} | first 0-2m`;
        if (touch.minuteOffset <= 7) return `${touch.timeframe} | middle`;
        return `${touch.timeframe} | late`;
      }),
    [touches],
  );
  const byDepth = useMemo(
    () =>
      groupRows(touches, (touch) => {
        if (touch.touchDepthRatio >= 0.15) return `${touch.timeframe} | deep`;
        if (touch.touchDepthRatio >= 0.04)
          return `${touch.timeframe} | moderate`;
        return `${touch.timeframe} | light`;
      }),
    [touches],
  );

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const imported: MinuteBar[] = [];
    const notes: string[] = [];
    for (const file of Array.from(files)) {
      const parsed = parseMinuteCsv(await file.text(), file.name);
      imported.push(...parsed);
      notes.push(`${file.name}: ${parsed.length} 1m bars`);
    }
    setBars(imported.sort((a, b) => a.timestamp - b.timestamp));
    setFileNotes(notes);
  }

  return (
    <div className="space-y-4 p-6" data-ocid="brutus.intrabar.page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">
            Brutus Intrabar Lab
          </h1>
          <p className="mt-1 max-w-5xl text-sm text-muted-foreground">
            Import 1m Alchemy TradingView CSVs. This page reconstructs 15m and
            1H Brutus bands minute by minute, then marks the first 1m candle
            that touched the developing higher-timeframe band.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 border border-primary bg-primary px-4 py-2 font-mono text-xs text-primary-foreground">
            <Upload className="h-4 w-4" />
            Import 1m CSVs
            <input
              accept=".csv"
              className="hidden"
              multiple
              onChange={(event) => importFiles(event.target.files)}
              type="file"
            />
          </label>
          <button
            className="inline-flex items-center gap-2 border border-border bg-card px-4 py-2 font-mono text-xs hover:border-primary disabled:opacity-40"
            disabled={touches.length === 0}
            onClick={() =>
              exportJson("ict-brutus-intrabar-lab.json", {
                files: fileNotes,
                settings: {
                  source: "1m Alchemy TradingView CSV exports",
                  length: LENGTH,
                  stdDev: MULT,
                  targetTimeframes: TARGETS.map((target) => target.label),
                  truthWarning:
                    "This is a 1m developing-band approximation, not tick-level live alert truth.",
                },
                totals: {
                  minuteBars: bars.length,
                  intrabarTouches: touches.length,
                },
                bySymbol,
                bySession,
                byTiming,
                byDepth,
                latestTouches,
              })
            }
            type="button"
          >
            <Download className="h-4 w-4" />
            Export Intrabar Lab
          </button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            1m candles
          </p>
          <p className="mt-2 font-display text-2xl font-bold">{bars.length}</p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            HTF touches
          </p>
          <p className="mt-2 font-display text-2xl font-bold">
            {touches.length}
          </p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Timeframes
          </p>
          <p className="mt-2 font-display text-2xl font-bold">15m, 1H</p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Truth type
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            1m approximation, not tick-perfect.
          </p>
        </div>
      </section>

      <section className="border border-amber-500/40 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <ZoomIn className="mt-0.5 h-4 w-4 text-amber-300" />
          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-widest">
              What this proves
            </h2>
            <p className="mt-2 max-w-5xl text-sm text-muted-foreground">
              This checks whether the touch happened early, middle, or late
              inside the 15m/1H candle, and whether the next minutes snapped
              back or kept pushing. It does not know the exact second or tick
              where TradingView first fired.
            </p>
          </div>
        </div>
      </section>

      {fileNotes.length > 0 && (
        <section className="border border-border bg-card p-4">
          <h2 className="font-display text-lg font-bold">Imported Files</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {fileNotes.map((note) => (
              <p
                className="border border-border bg-background p-2 font-mono text-xs text-muted-foreground"
                key={note}
              >
                {note}
              </p>
            ))}
          </div>
        </section>
      )}

      <Table rows={bySymbol} title="Symbol / Timeframe Evidence" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Table rows={byTiming} title="Touch Timing" />
        <Table rows={byDepth} title="Touch Depth" />
      </div>
      <Table rows={bySession} title="Session Behavior" />

      <section className="border border-border bg-card p-4">
        <h2 className="font-display text-lg font-bold">
          Latest Intrabar Touches
        </h2>
        <div className="mt-3 max-h-[560px] overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="sticky top-0 border-b border-border bg-card font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Touch time</th>
                <th className="px-2 py-2">Setup</th>
                <th className="px-2 py-2 text-right">Offset</th>
                <th className="px-2 py-2 text-right">Depth</th>
                <th className="px-2 py-2 text-right">15m R</th>
                <th className="px-2 py-2 text-right">60m R</th>
                <th className="px-2 py-2">Plain read</th>
              </tr>
            </thead>
            <tbody>
              {latestTouches.length === 0 ? (
                <tr>
                  <td className="px-2 py-5 text-muted-foreground" colSpan={7}>
                    Import 1m CSVs to inspect intrabar touch events.
                  </td>
                </tr>
              ) : (
                latestTouches.map((touch) => (
                  <tr className="border-b border-border/70" key={touch.id}>
                    <td className="px-2 py-2 font-mono text-xs">
                      {fmtDate(touch.touchTime)}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {touch.symbol} {touch.timeframe} {touch.direction}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {touch.minuteOffset}m
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {pct(touch.touchDepthRatio)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {fmt(touch.fifteenMinuteR)}R
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {fmt(touch.sixtyMinuteR)}R
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {touch.plainRead}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
