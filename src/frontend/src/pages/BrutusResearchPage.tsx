import { Download, Upload, Waves } from "lucide-react";
import { useMemo, useState } from "react";

type Direction = "long" | "short";
type MomentumStretch = "upper" | "lower" | "none" | "unknown";
type MomentumSlope = "rising" | "falling" | "flat" | "unknown";

type MomentumContext = {
  rsi?: number;
  rsiMa?: number;
  rsiUpper?: number;
  rsiLower?: number;
  rsiDelta?: number;
  rsiSlope?: MomentumSlope;
  rsiStretch: MomentumStretch;
  rsiPosition: "above-ma" | "below-ma" | "unknown";
  alignedWithTouch: boolean;
  plainRead: string;
};

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
  rsi?: number;
  rsiMa?: number;
  rsiUpper?: number;
  rsiLower?: number;
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
  bandExpansionPct: number;
  outsidePct: number;
  pierceDepth: number;
  pierceDepthRatio: number;
  rejectionPoints: number;
  rejectionRatio: number;
  repeatedPierces5: number;
  candleShape: string;
  momentum: MomentumContext;
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

type AnatomyRow = {
  label: string;
  signals: number;
  avgPierceDepth: number;
  avgPierceRatio: number;
  avgRejectionRatio: number;
  avgBandExpansion: number;
  avgRepeatedPierces: number;
  avgClose1: number;
  avgClose4: number;
  plainRead: string;
};

const STORAGE_KEY = "ict.brutus.tv.csv.v1";
const HORIZONS = [1, 2, 4, 8] as const;

const SYMBOL_MAP: Record<string, string> = {
  "DJ30.R": "DJ30.R",
  "USTEC.R": "USTEC.R",
  "US500.R": "US500.R",
  "JPN225.R": "JPN225.R",
  "RUS2000.R": "RUS2000.R",
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

function optionalNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function momentumFor(
  bar: Pick<BrutusBar, "rsi" | "rsiMa" | "rsiUpper" | "rsiLower">,
  direction: Direction,
  previous?: Pick<BrutusBar, "rsi">,
): MomentumContext {
  const hasBands =
    bar.rsi != null &&
    bar.rsiMa != null &&
    bar.rsiUpper != null &&
    bar.rsiLower != null;
  if (!hasBands) {
    return {
      rsiStretch: "unknown",
      rsiPosition: "unknown",
      alignedWithTouch: false,
      plainRead: "RSI context not exported.",
    };
  }

  const rsi = bar.rsi as number;
  const rsiMa = bar.rsiMa as number;
  const rsiUpper = bar.rsiUpper as number;
  const rsiLower = bar.rsiLower as number;
  const rsiDelta = rsi - rsiMa;
  const rsiStretch =
    rsi >= rsiUpper ? "upper" : rsi <= rsiLower ? "lower" : "none";
  const rsiPosition = rsiDelta >= 0 ? "above-ma" : "below-ma";
  const slopeDelta = previous?.rsi == null ? undefined : rsi - previous.rsi;
  const rsiSlope =
    slopeDelta == null
      ? "unknown"
      : Math.abs(slopeDelta) < 0.01
        ? "flat"
        : slopeDelta > 0
          ? "rising"
          : "falling";
  const alignedWithTouch =
    (direction === "long" && rsiStretch === "lower") ||
    (direction === "short" && rsiStretch === "upper");
  const plainRead = alignedWithTouch
    ? "RSI is stretched with the Brutus touch."
    : rsiStretch === "none"
      ? "RSI is not stretched."
      : "RSI stretch is against this touch.";

  return {
    rsi,
    rsiMa,
    rsiUpper,
    rsiLower,
    rsiDelta,
    rsiSlope,
    rsiStretch,
    rsiPosition,
    alignedWithTouch,
    plainRead,
  };
}

function inferMeta(fileName: string) {
  const upper = fileName.toUpperCase();
  const symbol =
    Object.keys(SYMBOL_MAP).find((candidate) => upper.includes(candidate)) ??
    "UNKNOWN";
  const normalized = upper.replace(/\s+/g, " ");
  const match = normalized.match(
    /(?:,|_|-|\s)(60|45|30|15|5|3|1)(?:\s*\(\d+\))?_?\.CSV$/,
  );
  const value = match?.[1];
  const timeframe =
    value === "60"
      ? "1H"
      : value === "45"
        ? "45m"
        : value === "30"
          ? "30m"
          : value === "15"
            ? "15m"
            : value === "5"
              ? "5m"
              : value === "3"
                ? "3m"
                : "1m";
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
    const rsi = optionalNumber(row[index.get("rsi") ?? -1]);
    const rsiMa = optionalNumber(row[index.get("rsi-based ma") ?? -1]);
    const rsiUpper = optionalNumber(
      row[index.get("upper bollinger band") ?? -1],
    );
    const rsiLower = optionalNumber(
      row[index.get("lower bollinger band") ?? -1],
    );
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
        rsi,
        rsiMa,
        rsiUpper,
        rsiLower,
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

function bandWidth(bar: BrutusBar) {
  return Math.max(bar.upper - bar.lower, 0.0001);
}

function pierceDepthFor(bar: BrutusBar, direction: Direction) {
  return Math.max(
    direction === "long" ? bar.lower - bar.low : bar.high - bar.upper,
    0,
  );
}

function rejectionPointsFor(bar: BrutusBar, direction: Direction) {
  return Math.max(
    direction === "long" ? bar.close - bar.low : bar.high - bar.close,
    0,
  );
}

function bandExpansionFor(bars: BrutusBar[], index: number) {
  const currentWidth = bandWidth(bars[index]);
  const priorWidth = index > 0 ? bandWidth(bars[index - 1]) : currentWidth;
  return (currentWidth - priorWidth) / priorWidth;
}

function repeatedPiercesFor(
  bars: BrutusBar[],
  index: number,
  direction: Direction,
) {
  const lookback = bars.slice(Math.max(0, index - 5), index);
  return lookback.filter((bar) =>
    direction === "long" ? bar.low < bar.lower : bar.high > bar.upper,
  ).length;
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
        const currentBandWidth = bandWidth(bar);
        const pierceDepth = pierceDepthFor(bar, direction);
        const rejectionPoints = rejectionPointsFor(bar, direction);
        const pierceDepthRatio = pierceDepth / currentBandWidth;
        const rejectionRatio =
          pierceDepth > 0 ? rejectionPoints / pierceDepth : 0;
        const momentum = momentumFor(bar, direction, bars[index - 1]);
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
          bandWidthPct: currentBandWidth / bar.close,
          bandExpansionPct: bandExpansionFor(bars, index),
          outsidePct:
            direction === "long"
              ? (bar.lower - bar.low) / bar.close
              : (bar.high - bar.upper) / bar.close,
          pierceDepth,
          pierceDepthRatio,
          rejectionPoints,
          rejectionRatio,
          repeatedPierces5: repeatedPiercesFor(bars, index, direction),
          candleShape: candleShape(bar, direction),
          momentum,
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

function anatomyBucket(signal: BrutusSignal) {
  if (signal.pierceDepth <= 0) return "touch only";
  if (signal.pierceDepthRatio < 0.02) return "tiny pierce";
  if (signal.pierceDepthRatio < 0.08) return "clean pierce";
  return "deep pierce";
}

function rejectionBucket(signal: BrutusSignal) {
  if (signal.rejectionRatio >= 2) return "strong rejection";
  if (signal.rejectionRatio >= 1) return "full rejection";
  if (signal.rejectionRatio >= 0.4) return "partial rejection";
  return "weak/no rejection";
}

function expansionBucket(signal: BrutusSignal) {
  if (signal.bandExpansionPct > 0.12) return "band expanding fast";
  if (signal.bandExpansionPct > 0.03) return "band expanding";
  if (signal.bandExpansionPct < -0.03) return "band compressing";
  return "band stable";
}

function repeatBucket(signal: BrutusSignal) {
  if (signal.repeatedPierces5 >= 3) return "3+ recent same-side pierces";
  if (signal.repeatedPierces5 >= 1) return "1-2 recent same-side pierces";
  return "first recent pierce";
}

function momentumBucket(signal: BrutusSignal) {
  if (signal.momentum.rsiStretch === "unknown")
    return `RSI not exported | ${signal.timeframe} | ${signal.direction}`;
  if (signal.momentum.alignedWithTouch)
    return `RSI stretch with touch | ${signal.timeframe} | ${signal.direction}`;
  if (signal.momentum.rsiStretch === "none")
    return `RSI not stretched | ${signal.timeframe} | ${signal.direction}`;
  return `RSI stretch against touch | ${signal.timeframe} | ${signal.direction}`;
}

function anatomyRow(label: string, signals: BrutusSignal[]): AnatomyRow {
  const usable1 = signals.filter((signal) => signal.next1.available);
  const usable4 = signals.filter((signal) => signal.next4.available);
  const avgPierceDepth = mean(signals.map((signal) => signal.pierceDepth));
  const avgPierceRatio = mean(signals.map((signal) => signal.pierceDepthRatio));
  const avgRejectionRatio = mean(
    signals.map((signal) => signal.rejectionRatio),
  );
  const avgBandExpansion = mean(
    signals.map((signal) => signal.bandExpansionPct),
  );
  const avgRepeatedPierces = mean(
    signals.map((signal) => signal.repeatedPierces5),
  );
  const avgClose1 = mean(usable1.map((signal) => signal.next1.closePoints));
  const avgClose4 = mean(usable4.map((signal) => signal.next4.closePoints));
  const plainRead =
    avgClose1 > 0 && avgRejectionRatio >= 1
      ? "Useful snapback profile."
      : avgClose4 < 0 && avgBandExpansion > 0.03
        ? "Expansion risk. Avoid holding."
        : avgClose1 > 0
          ? "Scalp candidate, not a hold rule."
          : "Weak evidence.";
  return {
    label,
    signals: signals.length,
    avgPierceDepth,
    avgPierceRatio,
    avgRejectionRatio,
    avgBandExpansion,
    avgRepeatedPierces,
    avgClose1,
    avgClose4,
    plainRead,
  };
}

function anatomyRows(
  signals: BrutusSignal[],
  labelFor: (signal: BrutusSignal) => string,
) {
  const groups = new Map<string, BrutusSignal[]>();
  for (const signal of signals) {
    const label = labelFor(signal);
    groups.set(label, [...(groups.get(label) ?? []), signal]);
  }
  return [...groups.entries()]
    .map(([label, group]) => anatomyRow(label, group))
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

function AnatomyTable({ rows }: { rows: AnatomyRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse font-mono text-xs">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-2 py-2">Anatomy group</th>
            <th className="px-2 py-2 text-right">Signals</th>
            <th className="px-2 py-2 text-right">Pierce</th>
            <th className="px-2 py-2 text-right">Pierce/band</th>
            <th className="px-2 py-2 text-right">Rejection</th>
            <th className="px-2 py-2 text-right">Band exp</th>
            <th className="px-2 py-2 text-right">Repeat</th>
            <th className="px-2 py-2 text-right">1 close</th>
            <th className="px-2 py-2 text-right">4 close</th>
            <th className="px-2 py-2">Plain read</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-border/70" key={row.label}>
              <td className="px-2 py-2 text-foreground">{row.label}</td>
              <td className="px-2 py-2 text-right">{row.signals}</td>
              <td className="px-2 py-2 text-right">
                {fmtPoints(row.avgPierceDepth)}
              </td>
              <td className="px-2 py-2 text-right">
                {pct(row.avgPierceRatio)}
              </td>
              <td className="px-2 py-2 text-right">
                {row.avgRejectionRatio.toFixed(2)}x
              </td>
              <td className="px-2 py-2 text-right">
                {pct(row.avgBandExpansion)}
              </td>
              <td className="px-2 py-2 text-right">
                {row.avgRepeatedPierces.toFixed(1)}
              </td>
              <td className="px-2 py-2 text-right">
                {fmtPoints(row.avgClose1)}
              </td>
              <td className="px-2 py-2 text-right">
                {fmtPoints(row.avgClose4)}
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
  const byPierceDepth = useMemo(
    () =>
      anatomyRows(
        signals,
        (signal) =>
          `${anatomyBucket(signal)} | ${signal.timeframe} | ${signal.direction}`,
      ),
    [signals],
  );
  const byRejection = useMemo(
    () =>
      anatomyRows(
        signals,
        (signal) =>
          `${rejectionBucket(signal)} | ${signal.timeframe} | ${signal.direction}`,
      ),
    [signals],
  );
  const byBandExpansion = useMemo(
    () =>
      anatomyRows(
        signals,
        (signal) =>
          `${expansionBucket(signal)} | ${signal.timeframe} | ${signal.direction}`,
      ),
    [signals],
  );
  const byRepeatPierce = useMemo(
    () =>
      anatomyRows(
        signals,
        (signal) =>
          `${repeatBucket(signal)} | ${signal.timeframe} | ${signal.direction}`,
      ),
    [signals],
  );
  const byMomentum = useMemo(
    () => groupRows(signals, (signal) => momentumBucket(signal)),
    [signals],
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
                pierceAnatomy: {
                  byPierceDepth,
                  byRejection,
                  byBandExpansion,
                  byRepeatPierce,
                },
                momentumContext: {
                  rule: "RSI is a research label only. It does not create Brutus signals or force entries.",
                  byMomentum,
                },
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
                Use the Alchemy files for DJ30.R, USTEC.R, US500.R, JPN225.R,
                and RUS2000.R across 1m, 3m, 5m, 15m, 30m, 45m, and 1H. This lab
                does not use Yahoo proxy candles.
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
              <h2 className="font-display text-base font-bold">Pierce Depth</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Touches, tiny pierces, clean pierces, and deep pierces are
                measured against the current band width, not treated as the same
                setup.
              </p>
              <div className="mt-3 max-h-[420px] overflow-y-auto">
                <AnatomyTable rows={byPierceDepth} />
              </div>
            </div>
            <div className="border border-border bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Rejection Quality
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This looks for the difference between a clean snapback and a
                weak touch that keeps pushing against the trade.
              </p>
              <div className="mt-3 max-h-[420px] overflow-y-auto">
                <AnatomyTable rows={byRejection} />
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="border border-border bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Band Expansion Risk
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Fast widening can mean the band is being pulled with price. That
                is where reversals can become continuation traps.
              </p>
              <div className="mt-3 max-h-[420px] overflow-y-auto">
                <AnatomyTable rows={byBandExpansion} />
              </div>
            </div>
            <div className="border border-border bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Repeated Pierce Pressure
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This checks whether the same side has been hit repeatedly in the
                last five bars, which can warn that strength is building.
              </p>
              <div className="mt-3 max-h-[420px] overflow-y-auto">
                <AnatomyTable rows={byRepeatPierce} />
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <h2 className="font-display text-base font-bold">
              Momentum Context
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              RSI is only a research label here. It does not create Brutus
              signals or force entries.
            </p>
            <div className="mt-3 max-h-[420px] overflow-y-auto">
              <GroupTable rows={byMomentum} />
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
                    <span className="mt-1 block text-muted-foreground">
                      {signal.momentum.plainRead}
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
                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="border border-border bg-background p-3">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Pierce depth
                      </p>
                      <p className="mt-2 font-display text-lg font-bold">
                        {fmtPoints(selectedSignal.pierceDepth)}
                      </p>
                    </div>
                    <div className="border border-border bg-background p-3">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Pierce / band
                      </p>
                      <p className="mt-2 font-display text-lg font-bold">
                        {pct(selectedSignal.pierceDepthRatio)}
                      </p>
                    </div>
                    <div className="border border-border bg-background p-3">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Rejection
                      </p>
                      <p className="mt-2 font-display text-lg font-bold">
                        {selectedSignal.rejectionRatio.toFixed(2)}x
                      </p>
                    </div>
                    <div className="border border-border bg-background p-3">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Band expansion
                      </p>
                      <p className="mt-2 font-display text-lg font-bold">
                        {pct(selectedSignal.bandExpansionPct)}
                      </p>
                    </div>
                    <div className="border border-border bg-background p-3">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Recent pierces
                      </p>
                      <p className="mt-2 font-display text-lg font-bold">
                        {selectedSignal.repeatedPierces5}
                      </p>
                    </div>
                    <div className="border border-border bg-background p-3 md:col-span-5">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        RSI context
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {selectedSignal.momentum.plainRead}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        RSI {selectedSignal.momentum.rsi?.toFixed(1) ?? "n/a"} |
                        MA {selectedSignal.momentum.rsiMa?.toFixed(1) ?? "n/a"}{" "}
                        | stretch {selectedSignal.momentum.rsiStretch} |{" "}
                        {selectedSignal.momentum.rsiSlope}
                      </p>
                    </div>
                  </div>
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
