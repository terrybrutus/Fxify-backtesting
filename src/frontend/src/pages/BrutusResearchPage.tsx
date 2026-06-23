import { Download, Upload, Waves } from "lucide-react";
import { useMemo, useState } from "react";

type Direction = "long" | "short";

type BrutusBar = {
  symbol: string;
  timeframe: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  upper: number;
  lower: number;
  longSignal: boolean;
  shortSignal: boolean;
};

type BrutusSignal = {
  id: string;
  symbol: string;
  timeframe: string;
  timestamp: number;
  direction: Direction;
  index: number;
  entryClose: number;
  entryBand: number;
  signalBar: BrutusBar;
  next1: Outcome;
  next2: Outcome;
  next4: Outcome;
  next8: Outcome;
  bandNext1: Outcome;
  bandNext2: Outcome;
  bandNext4: Outcome;
  bandNext8: Outcome;
  session: string;
  bandWidthPct: number;
  outsidePct: number;
  candleShape: string;
};

type Outcome = {
  closePoints: number;
  maxFavorable: number;
  maxAdverse: number;
  available: boolean;
};

type GroupRow = {
  label: string;
  signals: number;
  winRate1: number;
  avgClose1: number;
  avgClose2: number;
  avgClose4: number;
  avgMfe4: number;
  avgMae4: number;
};

type ModelRow = {
  label: string;
  signals: number;
  winRate: number;
  avgPoints: number;
  avgPct: number;
  avgBest: number;
  avgWorst: number;
  plainRead: string;
};

type AvoidRow = {
  label: string;
  signals: number;
  avgClose4: number;
  avgMae4: number;
  reason: string;
};

const STORAGE_KEY = "ict.brutus.tv.csv.v1";
const HORIZONS = [1, 2, 4, 8] as const;

const SYMBOL_MAP: Record<string, string> = {
  "DJ30.R": "DJ30.R",
  "USTEC.R": "USTEC.R",
  "US500.R": "US500.R",
  "JPN225.R": "JPN225.R",
};

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

function inferMeta(fileName: string) {
  const upper = fileName.toUpperCase();
  const symbol =
    Object.keys(SYMBOL_MAP).find((candidate) => upper.includes(candidate)) ??
    "UNKNOWN";
  const timeframe =
    upper.includes(", 60") || upper.includes("_60") ? "1H" : "15m";
  return { symbol, timeframe };
}

function parseTradingViewCsv(text: string, fileName: string) {
  const records = parseCsvRecords(text);
  const [header, ...rows] = records;
  if (!header) return [];
  const index = new Map(
    header.map((cell, cellIndex) => [cell.trim().toLowerCase(), cellIndex]),
  );
  const meta = inferMeta(fileName);
  return rows.flatMap((row): BrutusBar[] => {
    const timestamp = asNumber(row[index.get("time") ?? -1]);
    const open = asNumber(row[index.get("open") ?? -1]);
    const high = asNumber(row[index.get("high") ?? -1]);
    const low = asNumber(row[index.get("low") ?? -1]);
    const close = asNumber(row[index.get("close") ?? -1]);
    const upper = asNumber(row[index.get("upper") ?? -1]);
    const lower = asNumber(row[index.get("lower") ?? -1]);
    if (
      timestamp == null ||
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      upper == null ||
      lower == null
    ) {
      return [];
    }
    return [
      {
        symbol: meta.symbol,
        timeframe: meta.timeframe,
        timestamp: timestamp * 1000,
        open,
        high,
        low,
        close,
        upper,
        lower,
        longSignal: row[index.get("long signal") ?? -1] === "1",
        shortSignal: row[index.get("short signal") ?? -1] === "1",
      },
    ];
  });
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

function fmtPoints(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function candleShape(bar: BrutusBar, direction: Direction) {
  const body = Math.abs(bar.close - bar.open);
  const range = Math.max(bar.high - bar.low, 0.0001);
  const wickBias =
    direction === "long"
      ? (Math.min(bar.open, bar.close) - bar.low) / range
      : (bar.high - Math.max(bar.open, bar.close)) / range;
  if (body / range > 0.7) return "large body";
  if (wickBias > 0.45) return "large wick";
  return "balanced";
}

function outcomeFor(
  bars: BrutusBar[],
  index: number,
  direction: Direction,
  horizon: number,
  entry: number,
): Outcome {
  const future = bars.slice(index + 1, index + 1 + horizon);
  if (future.length < horizon) {
    return {
      closePoints: 0,
      maxFavorable: 0,
      maxAdverse: 0,
      available: false,
    };
  }
  const last = future[future.length - 1];
  if (direction === "long") {
    return {
      closePoints: last.close - entry,
      maxFavorable: Math.max(...future.map((bar) => bar.high - entry)),
      maxAdverse: Math.min(...future.map((bar) => bar.low - entry)),
      available: true,
    };
  }
  return {
    closePoints: entry - last.close,
    maxFavorable: Math.max(...future.map((bar) => entry - bar.low)),
    maxAdverse: Math.min(...future.map((bar) => entry - bar.high)),
    available: true,
  };
}

function buildSignals(allBars: BrutusBar[]) {
  const byDataset = new Map<string, BrutusBar[]>();
  for (const bar of allBars) {
    const key = `${bar.symbol}|${bar.timeframe}`;
    byDataset.set(key, [...(byDataset.get(key) ?? []), bar]);
  }
  const signals: BrutusSignal[] = [];
  for (const bars of byDataset.values()) {
    bars.sort((a, b) => a.timestamp - b.timestamp);
    bars.forEach((bar, index) => {
      const directions: Direction[] = [];
      if (bar.longSignal) directions.push("long");
      if (bar.shortSignal) directions.push("short");
      for (const direction of directions) {
        const entryBand = direction === "long" ? bar.lower : bar.upper;
        const entryClose = bar.close;
        signals.push({
          id: `${bar.symbol}-${bar.timeframe}-${bar.timestamp}-${direction}`,
          symbol: bar.symbol,
          timeframe: bar.timeframe,
          timestamp: bar.timestamp,
          direction,
          index,
          entryClose,
          entryBand,
          signalBar: bar,
          next1: outcomeFor(bars, index, direction, 1, entryClose),
          next2: outcomeFor(bars, index, direction, 2, entryClose),
          next4: outcomeFor(bars, index, direction, 4, entryClose),
          next8: outcomeFor(bars, index, direction, 8, entryClose),
          bandNext1: outcomeFor(bars, index, direction, 1, entryBand),
          bandNext2: outcomeFor(bars, index, direction, 2, entryBand),
          bandNext4: outcomeFor(bars, index, direction, 4, entryBand),
          bandNext8: outcomeFor(bars, index, direction, 8, entryBand),
          session: sessionFor(bar.timestamp),
          bandWidthPct: (bar.upper - bar.lower) / bar.close,
          outsidePct:
            direction === "long"
              ? (bar.lower - bar.low) / bar.close
              : (bar.high - bar.upper) / bar.close,
          candleShape: candleShape(bar, direction),
        });
      }
    });
  }
  return signals.sort((a, b) => a.timestamp - b.timestamp);
}

function rowFor(label: string, signals: BrutusSignal[]): GroupRow {
  const usable1 = signals.filter((signal) => signal.next1.available);
  const usable2 = signals.filter((signal) => signal.next2.available);
  const usable4 = signals.filter((signal) => signal.next4.available);
  return {
    label,
    signals: signals.length,
    winRate1:
      usable1.length === 0
        ? 0
        : usable1.filter((signal) => signal.next1.closePoints > 0).length /
          usable1.length,
    avgClose1: mean(usable1.map((signal) => signal.next1.closePoints)),
    avgClose2: mean(usable2.map((signal) => signal.next2.closePoints)),
    avgClose4: mean(usable4.map((signal) => signal.next4.closePoints)),
    avgMfe4: mean(usable4.map((signal) => signal.next4.maxFavorable)),
    avgMae4: mean(usable4.map((signal) => signal.next4.maxAdverse)),
  };
}

function groupRows(
  signals: BrutusSignal[],
  labelFor: (signal: BrutusSignal) => string,
) {
  const groups = new Map<string, BrutusSignal[]>();
  for (const signal of signals) {
    const label = labelFor(signal);
    groups.set(label, [...(groups.get(label) ?? []), signal]);
  }
  return [...groups.entries()]
    .map(([label, group]) => rowFor(label, group))
    .sort((a, b) => b.signals - a.signals);
}

function modelRow(
  label: string,
  signals: BrutusSignal[],
  outcomeForSignal: (signal: BrutusSignal) => Outcome,
): ModelRow {
  const usable = signals.filter((signal) => outcomeForSignal(signal).available);
  const outcomes = usable.map(outcomeForSignal);
  const avgPoints = mean(outcomes.map((outcome) => outcome.closePoints));
  const avgBest = mean(outcomes.map((outcome) => outcome.maxFavorable));
  const avgWorst = mean(outcomes.map((outcome) => outcome.maxAdverse));
  const avgPct = mean(
    usable.map(
      (signal, index) => outcomes[index].closePoints / signal.entryClose,
    ),
  );
  const winRate =
    outcomes.length === 0
      ? 0
      : outcomes.filter((outcome) => outcome.closePoints > 0).length /
        outcomes.length;
  const plainRead =
    avgPoints > 0 && avgWorst > -Math.abs(avgBest)
      ? "Promising, but still needs stop testing."
      : avgPoints > 0
        ? "Positive average, but pullback risk is large."
        : "Weak as a default rule.";
  return {
    label,
    signals: usable.length,
    winRate,
    avgPoints,
    avgPct,
    avgBest,
    avgWorst,
    plainRead,
  };
}

function buildModelRows(signals: BrutusSignal[]) {
  return [
    modelRow(
      "Close entry, exit after 1 candle",
      signals,
      (signal) => signal.next1,
    ),
    modelRow(
      "Close entry, exit after 2 candles",
      signals,
      (signal) => signal.next2,
    ),
    modelRow(
      "Close entry, exit after 4 candles",
      signals,
      (signal) => signal.next4,
    ),
    modelRow(
      "Band touch entry, exit after 1 candle",
      signals,
      (signal) => signal.bandNext1,
    ),
    modelRow(
      "Band touch entry, exit after 2 candles",
      signals,
      (signal) => signal.bandNext2,
    ),
    modelRow(
      "Band touch entry, exit after 4 candles",
      signals,
      (signal) => signal.bandNext4,
    ),
    modelRow(
      "Scalp target: best move inside next candle",
      signals,
      (signal) => ({
        ...signal.next1,
        closePoints: signal.next1.maxFavorable,
      }),
    ),
    modelRow(
      "Ride test: close after 8 candles",
      signals,
      (signal) => signal.next8,
    ),
  ];
}

function buildAvoidRows(rows: GroupRow[]) {
  return rows
    .filter((row) => row.signals >= 80 && row.avgClose4 < 0)
    .map((row): AvoidRow => {
      const adversePressure =
        Math.abs(row.avgMae4) > Math.max(Math.abs(row.avgMfe4) * 0.9, 1);
      return {
        label: row.label,
        signals: row.signals,
        avgClose4: row.avgClose4,
        avgMae4: row.avgMae4,
        reason: adversePressure
          ? "Average 4-candle result is negative and downside pressure is heavy."
          : "Average 4-candle result is negative; only scalp or avoid until proven otherwise.",
      };
    })
    .sort((a, b) => a.avgClose4 - b.avgClose4)
    .slice(0, 10);
}

function exportJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function MiniChart({
  signal,
  bars,
}: { signal: BrutusSignal; bars: BrutusBar[] }) {
  const dataset = bars
    .filter(
      (bar) =>
        bar.symbol === signal.symbol && bar.timeframe === signal.timeframe,
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  const center = dataset.findIndex((bar) => bar.timestamp === signal.timestamp);
  const windowBars = dataset.slice(Math.max(0, center - 36), center + 37);
  const min = Math.min(
    ...windowBars.map((bar) => Math.min(bar.low, bar.lower)),
  );
  const max = Math.max(
    ...windowBars.map((bar) => Math.max(bar.high, bar.upper)),
  );
  const width = 920;
  const height = 260;
  const y = (value: number) =>
    height - ((value - min) / Math.max(max - min, 0.0001)) * height;
  const x = (index: number) =>
    (index / Math.max(windowBars.length - 1, 1)) * width;
  const priceLine = windowBars
    .map((bar, index) => `${x(index)},${y(bar.close)}`)
    .join(" ");
  const upperLine = windowBars
    .map((bar, index) => `${x(index)},${y(bar.upper)}`)
    .join(" ");
  const lowerLine = windowBars
    .map((bar, index) => `${x(index)},${y(bar.lower)}`)
    .join(" ");
  const signalIndex = windowBars.findIndex(
    (bar) => bar.timestamp === signal.timestamp,
  );
  return (
    <svg
      aria-label="Selected Brutus signal chart"
      className="h-72 w-full border border-border bg-background"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <title>Selected Brutus signal chart</title>
      <polyline
        fill="none"
        points={upperLine}
        stroke="#ef4444"
        strokeWidth="1"
      />
      <polyline
        fill="none"
        points={lowerLine}
        stroke="#22c55e"
        strokeWidth="1"
      />
      <polyline
        fill="none"
        points={priceLine}
        stroke="#22d3ee"
        strokeWidth="2"
      />
      {signalIndex >= 0 && (
        <line
          stroke="#facc15"
          strokeDasharray="5 5"
          strokeWidth="1"
          x1={x(signalIndex)}
          x2={x(signalIndex)}
          y1={0}
          y2={height}
        />
      )}
    </svg>
  );
}

function GroupTable({ rows }: { rows: GroupRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse font-mono text-xs">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-2 py-2">Group</th>
            <th className="px-2 py-2 text-right">Signals</th>
            <th className="px-2 py-2 text-right">1-bar win</th>
            <th className="px-2 py-2 text-right">1 close</th>
            <th className="px-2 py-2 text-right">2 close</th>
            <th className="px-2 py-2 text-right">4 close</th>
            <th className="px-2 py-2 text-right">4 best</th>
            <th className="px-2 py-2 text-right">4 worst</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-border/70" key={row.label}>
              <td className="px-2 py-2 text-foreground">{row.label}</td>
              <td className="px-2 py-2 text-right">{row.signals}</td>
              <td className="px-2 py-2 text-right">{pct(row.winRate1)}</td>
              <td className="px-2 py-2 text-right">
                {fmtPoints(row.avgClose1)}
              </td>
              <td className="px-2 py-2 text-right">
                {fmtPoints(row.avgClose2)}
              </td>
              <td className="px-2 py-2 text-right">
                {fmtPoints(row.avgClose4)}
              </td>
              <td className="px-2 py-2 text-right text-lime-300">
                {fmtPoints(row.avgMfe4)}
              </td>
              <td className="px-2 py-2 text-right text-destructive">
                {fmtPoints(row.avgMae4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelTable({ rows }: { rows: ModelRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse font-mono text-xs">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-2 py-2">Model</th>
            <th className="px-2 py-2 text-right">Signals</th>
            <th className="px-2 py-2 text-right">Win</th>
            <th className="px-2 py-2 text-right">Avg pts</th>
            <th className="px-2 py-2 text-right">Avg %</th>
            <th className="px-2 py-2 text-right">Best</th>
            <th className="px-2 py-2 text-right">Worst</th>
            <th className="px-2 py-2">Plain read</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-border/70" key={row.label}>
              <td className="px-2 py-2 text-foreground">{row.label}</td>
              <td className="px-2 py-2 text-right">{row.signals}</td>
              <td className="px-2 py-2 text-right">{pct(row.winRate)}</td>
              <td className="px-2 py-2 text-right">
                {fmtPoints(row.avgPoints)}
              </td>
              <td className="px-2 py-2 text-right">{pct(row.avgPct)}</td>
              <td className="px-2 py-2 text-right text-lime-300">
                {fmtPoints(row.avgBest)}
              </td>
              <td className="px-2 py-2 text-right text-destructive">
                {fmtPoints(row.avgWorst)}
              </td>
              <td className="px-2 py-2 text-muted-foreground">
                {row.plainRead}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AvoidTable({ rows }: { rows: AvoidRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse font-mono text-xs">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-2 py-2">Avoid candidate</th>
            <th className="px-2 py-2 text-right">Signals</th>
            <th className="px-2 py-2 text-right">4 close</th>
            <th className="px-2 py-2 text-right">4 worst</th>
            <th className="px-2 py-2">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-border/70" key={row.label}>
              <td className="px-2 py-2 text-foreground">{row.label}</td>
              <td className="px-2 py-2 text-right">{row.signals}</td>
              <td className="px-2 py-2 text-right text-destructive">
                {fmtPoints(row.avgClose4)}
              </td>
              <td className="px-2 py-2 text-right text-destructive">
                {fmtPoints(row.avgMae4)}
              </td>
              <td className="px-2 py-2 text-muted-foreground">{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BrutusResearchPage() {
  const [bars, setBars] = useState<BrutusBar[]>([]);
  const [fileNotes, setFileNotes] = useState<string[]>([]);
  const [selectedSignalId, setSelectedSignalId] = useState("");

  const signals = useMemo(() => buildSignals(bars), [bars]);
  const selectedSignal = signals.find(
    (signal) => signal.id === selectedSignalId,
  );
  const byAsset = useMemo(
    () =>
      groupRows(
        signals,
        (signal) =>
          `${signal.symbol} | ${signal.timeframe} | ${signal.direction}`,
      ),
    [signals],
  );
  const bySession = useMemo(
    () =>
      groupRows(
        signals,
        (signal) =>
          `${signal.session} | ${signal.timeframe} | ${signal.direction}`,
      ),
    [signals],
  );
  const byShape = useMemo(
    () =>
      groupRows(
        signals,
        (signal) =>
          `${signal.candleShape} | ${signal.timeframe} | ${signal.direction}`,
      ),
    [signals],
  );
  const bestRows = useMemo(
    () =>
      [...byAsset, ...bySession, ...byShape]
        .filter((row) => row.signals >= 20)
        .sort((a, b) => b.avgClose1 - a.avgClose1)
        .slice(0, 8),
    [byAsset, bySession, byShape],
  );
  const modelRows = useMemo(() => buildModelRows(signals), [signals]);
  const avoidRows = useMemo(
    () => buildAvoidRows([...byAsset, ...bySession, ...byShape]),
    [byAsset, bySession, byShape],
  );
  const newestSignals = signals.slice(-80).reverse();

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const imported: BrutusBar[] = [];
    const notes: string[] = [];
    for (const file of Array.from(files)) {
      const parsed = parseTradingViewCsv(await file.text(), file.name);
      imported.push(...parsed);
      const longs = parsed.filter((bar) => bar.longSignal).length;
      const shorts = parsed.filter((bar) => bar.shortSignal).length;
      notes.push(
        `${file.name}: ${parsed.length} bars, ${longs} long, ${shorts} short`,
      );
    }
    setBars(imported);
    setFileNotes(notes);
    setSelectedSignalId("");
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ importedAt: Date.now(), notes }),
    );
  }

  return (
    <div className="space-y-4 p-6" data-ocid="brutus.research.page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Brutus Research</h1>
          <p className="mt-1 max-w-5xl text-sm text-muted-foreground">
            TradingView Alchemy CSVs are the truth source here. The page imports
            exported Brutus bands and signals, then scores outcomes in
            chronological order without using future candles for signal
            discovery.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 border border-primary bg-primary px-4 py-2 font-mono text-xs text-primary-foreground">
            <Upload className="h-4 w-4" />
            Import TV CSVs
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
            disabled={signals.length === 0}
            onClick={() =>
              exportJson("ict-brutus-research.json", {
                files: fileNotes,
                totals: {
                  candles: bars.length,
                  signals: signals.length,
                },
                bestRows,
                modelRows,
                avoidRows,
                byAsset,
                bySession,
                byShape,
                sampleSignals: signals.slice(0, 200),
              })
            }
            type="button"
          >
            <Download className="h-4 w-4" />
            Export Research
          </button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Candles loaded
          </p>
          <p className="mt-2 font-display text-2xl font-bold">{bars.length}</p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Signals
          </p>
          <p className="mt-2 font-display text-2xl font-bold">
            {signals.length}
          </p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Datasets
          </p>
          <p className="mt-2 font-display text-2xl font-bold">
            {new Set(bars.map((bar) => `${bar.symbol}|${bar.timeframe}`)).size}
          </p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Render policy
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Tables are aggregated. Chart renders one selected signal window
            only.
          </p>
        </div>
      </section>

      {fileNotes.length > 0 && (
        <section className="border border-border bg-card p-4">
          <h2 className="font-display text-base font-bold">Imported Files</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {fileNotes.map((note) => (
              <p
                className="border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground"
                key={note}
              >
                {note}
              </p>
            ))}
          </div>
        </section>
      )}

      {signals.length === 0 ? (
        <section className="border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <Waves className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-display text-base font-bold">
                Import the eight Alchemy TradingView exports
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Use the files for DJ30.R, USTEC.R, US500.R, and JPN225.R on 15m
                and 1H. This lab does not use Yahoo proxy candles.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="border border-border bg-card p-4">
            <h2 className="font-display text-base font-bold">
              Early Clues, Not Final Rules
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These are ranked groups with at least 20 signals. Treat them as
              leads for walk-forward review, not proof.
            </p>
            <div className="mt-3">
              <GroupTable rows={bestRows} />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="border border-border bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Entry / Exit Model Comparison
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This compares close-entry, band-touch entry, quick scalp, and
                basic ride tests. It is still before spread/slippage and exact
                live first-touch timing.
              </p>
              <div className="mt-3">
                <ModelTable rows={modelRows} />
              </div>
            </div>
            <div className="border border-destructive/50 bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Avoid Candidates
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These groups are not proven dead, but they currently punish
                holding. They should be scalp-only or blocked until a better
                filter exists.
              </p>
              <div className="mt-3 max-h-[420px] overflow-y-auto">
                <AvoidTable rows={avoidRows} />
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="border border-border bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Asset / Timeframe / Side
              </h2>
              <div className="mt-3 max-h-[460px] overflow-y-auto">
                <GroupTable rows={byAsset} />
              </div>
            </div>
            <div className="border border-border bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Session Behavior
              </h2>
              <div className="mt-3 max-h-[460px] overflow-y-auto">
                <GroupTable rows={bySession} />
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="border border-border bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Walk-Forward Signal List
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Newest 80 only. Selecting one renders a capped chart window.
              </p>
              <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto">
                {newestSignals.map((signal) => (
                  <button
                    className={`block w-full border px-3 py-2 text-left font-mono text-xs ${
                      selectedSignalId === signal.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary"
                    }`}
                    key={signal.id}
                    onClick={() => setSelectedSignalId(signal.id)}
                    type="button"
                  >
                    <span className="text-foreground">
                      {fmtDate(signal.timestamp)} | {signal.symbol}{" "}
                      {signal.timeframe}
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {signal.direction.toUpperCase()} | 1-bar{" "}
                      {fmtPoints(signal.next1.closePoints)} | 4-bar best{" "}
                      {fmtPoints(signal.next4.maxFavorable)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border border-border bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Selected Replay Window
              </h2>
              {selectedSignal ? (
                <div className="mt-3 space-y-3">
                  <MiniChart bars={bars} signal={selectedSignal} />
                  <div className="grid gap-3 md:grid-cols-4">
                    {HORIZONS.map((horizon) => {
                      const outcome = selectedSignal[
                        `next${horizon}` as keyof Pick<
                          BrutusSignal,
                          "next1" | "next2" | "next4" | "next8"
                        >
                      ] as Outcome;
                      return (
                        <div
                          className="border border-border bg-background p-3"
                          key={horizon}
                        >
                          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            {horizon} candle(s)
                          </p>
                          <p className="mt-2 font-display text-lg font-bold">
                            {outcome.available
                              ? fmtPoints(outcome.closePoints)
                              : "n/a"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            best {fmtPoints(outcome.maxFavorable)} / worst{" "}
                            {fmtPoints(outcome.maxAdverse)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Select a signal to inspect the candles known around that
                  moment.
                </p>
              )}
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <h2 className="font-display text-base font-bold">
              Candle Shape Clues
            </h2>
            <div className="mt-3">
              <GroupTable rows={byShape} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
