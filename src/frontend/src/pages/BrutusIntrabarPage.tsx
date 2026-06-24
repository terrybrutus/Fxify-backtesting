import { Download, Trash2, Upload, ZoomIn } from "lucide-react";
import { useMemo, useState } from "react";

type Direction = "long" | "short";
type TargetTf = "15m" | "1H";
type SourceTf = "1m" | "15m" | "1H";
type Outcome = "target" | "stop" | "timeout" | "no-data";
type MomentumStretch = "upper" | "lower" | "none" | "unknown";
type MomentumSlope = "rising" | "falling" | "flat" | "unknown";
type EntryModel =
  | "touch"
  | "next-minute"
  | "rejection-minute"
  | "close-back-through-band";

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

type SourceBar = {
  symbol: string;
  timeframe: SourceTf;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  rsi?: number;
  rsiMa?: number;
  rsiUpper?: number;
  rsiLower?: number;
  rsiSlope?: MomentumSlope;
};

type MinuteBar = SourceBar & {
  timeframe: "1m";
};

type DatasetCoverage = {
  symbol: string;
  timeframe: SourceTf;
  bars: number;
  start: number;
  end: number;
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
  momentum: MomentumContext;
  plainRead: string;
};

type TouchContext = IntrabarTouch & {
  sourceIndex: number;
  bars: MinuteBar[];
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

type ExecutionRule = {
  id: string;
  label: string;
  entryModel: EntryModel;
  targetR: number;
  maxHoldMinutes: number;
  filter: (touch: TouchContext) => boolean;
  plainIntent: string;
};

type RuleResult = {
  ruleId: string;
  touchId: string;
  symbol: string;
  timeframe: TargetTf;
  direction: Direction;
  timestamp: number;
  session: string;
  entry: number;
  stop: number;
  target: number;
  risk: number;
  r: number;
  outcome: Outcome;
  minutesHeld: number;
};

type RuleRow = {
  id: string;
  label: string;
  trades: number;
  targetRate: number;
  stopRate: number;
  avgR: number;
  totalR: number;
  profitFactor: number;
  maxDrawdownR: number;
  avgMinutesHeld: number;
  confidence: string;
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
const STORAGE_KEY = "ict.brutus.intrabar.source-bars.v2";

const EXECUTION_RULES: ExecutionRule[] = [
  {
    id: "touch-all",
    label: "Enter on first 1m touch",
    entryModel: "touch",
    targetR: 1.5,
    maxHoldMinutes: 15,
    filter: () => true,
    plainIntent:
      "Tests the raw idea: touch the developing band and enter immediately.",
  },
  {
    id: "next-minute",
    label: "Wait one minute",
    entryModel: "next-minute",
    targetR: 1.5,
    maxHoldMinutes: 15,
    filter: () => true,
    plainIntent:
      "Checks whether letting the first touch breathe reduces bad early entries.",
  },
  {
    id: "rejection-minute",
    label: "Wait for 1m rejection",
    entryModel: "rejection-minute",
    targetR: 1.5,
    maxHoldMinutes: 15,
    filter: () => true,
    plainIntent:
      "Requires the touch minute or next minutes to actually snap away from the band.",
  },
  {
    id: "skip-early",
    label: "Skip first 0-2m touches",
    entryModel: "touch",
    targetR: 1.5,
    maxHoldMinutes: 15,
    filter: (touch) => touch.minuteOffset > 2,
    plainIntent:
      "Tests the current clue that earliest touches may be continuation traps.",
  },
  {
    id: "london-ny-15m",
    label: "15m London/NY only",
    entryModel: "touch",
    targetR: 1.5,
    maxHoldMinutes: 15,
    filter: (touch) =>
      touch.timeframe === "15m" &&
      (touch.session === "London" || touch.session === "NY open"),
    plainIntent:
      "Focuses on the sessions that showed better snapback in the intrabar sample.",
  },
  {
    id: "dj30-15m",
    label: "DJ30 15m only",
    entryModel: "touch",
    targetR: 1.5,
    maxHoldMinutes: 15,
    filter: (touch) => touch.symbol === "DJ30.R" && touch.timeframe === "15m",
    plainIntent:
      "Tests the strongest current single-asset bucket instead of mixing all indices.",
  },
  {
    id: "avoid-jpn-longs",
    label: "Avoid JPN225 longs",
    entryModel: "touch",
    targetR: 1.5,
    maxHoldMinutes: 15,
    filter: (touch) =>
      !(touch.symbol === "JPN225.R" && touch.direction === "long"),
    plainIntent:
      "Removes the weakest visible group from the first intrabar run.",
  },
];

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
  bar: Pick<SourceBar, "rsi" | "rsiMa" | "rsiUpper" | "rsiLower" | "rsiSlope">,
  direction: Direction,
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
    rsiSlope: bar.rsiSlope ?? "unknown",
    rsiStretch,
    rsiPosition: rsiDelta >= 0 ? "above-ma" : "below-ma",
    alignedWithTouch,
    plainRead,
  };
}

function inferSymbol(fileName: string) {
  const upper = fileName.toUpperCase();
  return (
    Object.keys(SYMBOL_MAP).find((candidate) => upper.includes(candidate)) ??
    "UNKNOWN"
  );
}

function inferTimeframe(fileName: string): SourceTf {
  const normalized = fileName.toUpperCase().replace(/\s+/g, " ");
  if (/[, _-]60(?:\s*\(\d+\))?\.CSV$/.test(normalized)) return "1H";
  if (/[, _-]15(?:\s*\(\d+\))?\.CSV$/.test(normalized)) return "15m";
  if (/[, _-]1(?:\s*\(\d+\))?\.CSV$/.test(normalized)) return "1m";
  return "1m";
}

function barKey(bar: SourceBar) {
  return `${bar.symbol}|${bar.timeframe}|${bar.timestamp}`;
}

function dedupeBars(bars: SourceBar[]) {
  const byKey = new Map<string, SourceBar>();
  for (const bar of bars) {
    byKey.set(barKey(bar), bar);
  }
  return Array.from(byKey.values()).sort(
    (a, b) =>
      a.symbol.localeCompare(b.symbol) ||
      a.timeframe.localeCompare(b.timeframe) ||
      a.timestamp - b.timestamp,
  );
}

function loadStoredBars() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeBars(
      parsed.filter(
        (bar): bar is SourceBar =>
          typeof bar?.symbol === "string" &&
          (bar.timeframe === "1m" ||
            bar.timeframe === "15m" ||
            bar.timeframe === "1H") &&
          Number.isFinite(bar.timestamp) &&
          Number.isFinite(bar.open) &&
          Number.isFinite(bar.high) &&
          Number.isFinite(bar.low) &&
          Number.isFinite(bar.close),
      ),
    );
  } catch {
    return [];
  }
}

function saveStoredBars(bars: SourceBar[]) {
  if (typeof window === "undefined") return true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bars));
    return true;
  } catch {
    return false;
  }
}

function clearStoredBars() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function isMinuteBar(bar: SourceBar): bar is MinuteBar {
  return bar.timeframe === "1m";
}

function parseSourceCsv(text: string, fileName: string) {
  const records = parseCsvRecords(text);
  const [header, ...rows] = records;
  if (!header) return [];
  const index = new Map(
    header.map((cell, cellIndex) => [cell.trim().toLowerCase(), cellIndex]),
  );
  const symbol = inferSymbol(fileName);
  const timeframe = inferTimeframe(fileName);
  return rows.flatMap((row): SourceBar[] => {
    const timestamp = asNumber(row[index.get("time") ?? -1]);
    const open = asNumber(row[index.get("open") ?? -1]);
    const high = asNumber(row[index.get("high") ?? -1]);
    const low = asNumber(row[index.get("low") ?? -1]);
    const close = asNumber(row[index.get("close") ?? -1]);
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
      close == null
    ) {
      return [];
    }
    return [
      {
        symbol,
        timeframe,
        timestamp: timestamp * 1000,
        open,
        high,
        low,
        close,
        rsi,
        rsiMa,
        rsiUpper,
        rsiLower,
      },
    ];
  });
}

function withMomentumSlope(bars: SourceBar[]) {
  const byDataset = new Map<string, SourceBar[]>();
  for (const bar of bars) {
    const key = `${bar.symbol}|${bar.timeframe}`;
    byDataset.set(key, [...(byDataset.get(key) ?? []), bar]);
  }
  const output: SourceBar[] = [];
  for (const dataset of byDataset.values()) {
    const sorted = [...dataset].sort((a, b) => a.timestamp - b.timestamp);
    sorted.forEach((bar, index) => {
      const previous = sorted[index - 1];
      const slopeDelta =
        previous?.rsi == null || bar.rsi == null
          ? undefined
          : bar.rsi - previous.rsi;
      const rsiSlope =
        slopeDelta == null
          ? undefined
          : Math.abs(slopeDelta) < 0.01
            ? "flat"
            : slopeDelta > 0
              ? "rising"
              : "falling";
      output.push({ ...bar, rsiSlope });
    });
  }
  return output;
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
  if (window.length === 0)
    return { outcome: "no-data" as Outcome, r: 0, minutesHeld: 0 };
  for (const [offset, bar] of window.entries()) {
    const stopHit = direction === "long" ? bar.low <= stop : bar.high >= stop;
    const targetHit =
      direction === "long" ? bar.high >= target : bar.low <= target;
    if (stopHit)
      return { outcome: "stop" as Outcome, r: -1, minutesHeld: offset + 1 };
    if (targetHit)
      return {
        outcome: "target" as Outcome,
        r: 1.5,
        minutesHeld: offset + 1,
      };
  }
  const last = window[window.length - 1];
  const points = direction === "long" ? last.close - entry : entry - last.close;
  return {
    outcome: "timeout" as Outcome,
    r: points / risk,
    minutesHeld: window.length,
  };
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
  const momentum =
    touch.momentum.rsiStretch === "unknown"
      ? ""
      : ` ${touch.momentum.plainRead}`;
  return `${touch.symbol} ${touch.timeframe} ${touch.direction}: ${fast} ${depth} touch, ${rejection}.${momentum}`;
}

function detectForDataset(
  bars: MinuteBar[],
  timeframe: TargetTf,
  targetMs: number,
  momentumByBucket: Map<string, SourceBar>,
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
      const targetMomentumBar = momentumByBucket.get(
        `${bar.symbol}|${timeframe}|${currentBucket}`,
      );
      const momentum = momentumFor(
        targetMomentumBar ?? bar,
        candidate.direction,
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
        momentum,
      };
      events.push({ ...eventBase, plainRead: buildPlainRead(eventBase) });
    }
  }

  return events;
}

function buildTouches(sourceBars: SourceBar[]) {
  const barsWithSlope = withMomentumSlope(sourceBars);
  const minuteBars = barsWithSlope.filter(isMinuteBar);
  const momentumByBucket = new Map<string, SourceBar>();
  for (const bar of barsWithSlope) {
    momentumByBucket.set(
      `${bar.symbol}|${bar.timeframe}|${bar.timestamp}`,
      bar,
    );
  }
  const bySymbol = new Map<string, MinuteBar[]>();
  for (const bar of minuteBars) {
    bySymbol.set(bar.symbol, [...(bySymbol.get(bar.symbol) ?? []), bar]);
  }
  const all: IntrabarTouch[] = [];
  for (const dataset of bySymbol.values()) {
    dataset.sort((a, b) => a.timestamp - b.timestamp);
    for (const target of TARGETS) {
      all.push(
        ...detectForDataset(dataset, target.label, target.ms, momentumByBucket),
      );
    }
  }
  return all.sort((a, b) => b.touchTime - a.touchTime);
}

function entryForRule(touch: TouchContext, rule: ExecutionRule) {
  const { bars, sourceIndex } = touch;
  if (rule.entryModel === "touch") {
    return { entry: touch.entryBand, index: sourceIndex };
  }
  if (rule.entryModel === "next-minute") {
    const next = bars[sourceIndex + 1];
    if (!next) return undefined;
    return { entry: next.open, index: sourceIndex + 1 };
  }
  const search = bars.slice(sourceIndex, sourceIndex + 6);
  for (const [offset, bar] of search.entries()) {
    const rejection =
      touch.direction === "long"
        ? bar.close > touch.entryBand && bar.close > bar.open
        : bar.close < touch.entryBand && bar.close < bar.open;
    const closeBack =
      touch.direction === "long"
        ? bar.close > touch.entryBand
        : bar.close < touch.entryBand;
    if (
      (rule.entryModel === "rejection-minute" && rejection) ||
      (rule.entryModel === "close-back-through-band" && closeBack)
    ) {
      return { entry: bar.close, index: sourceIndex + offset };
    }
  }
  return undefined;
}

function simulateRule(touch: TouchContext, rule: ExecutionRule) {
  const entryPoint = entryForRule(touch, rule);
  if (!entryPoint) return undefined;
  const risk = touch.bandWidth * 0.5;
  const sim = simulateR(
    touch.bars,
    entryPoint.index,
    touch.direction,
    entryPoint.entry,
    risk,
    rule.maxHoldMinutes,
  );
  const stop =
    touch.direction === "long"
      ? entryPoint.entry - risk
      : entryPoint.entry + risk;
  const target =
    touch.direction === "long"
      ? entryPoint.entry + risk * rule.targetR
      : entryPoint.entry - risk * rule.targetR;
  return {
    ruleId: rule.id,
    touchId: touch.id,
    symbol: touch.symbol,
    timeframe: touch.timeframe,
    direction: touch.direction,
    timestamp: touch.touchTime,
    session: touch.session,
    entry: entryPoint.entry,
    stop,
    target,
    risk,
    r: sim.r,
    outcome: sim.outcome,
    minutesHeld: sim.minutesHeld,
  } satisfies RuleResult;
}

function profitFactor(results: RuleResult[]) {
  const wins = results
    .filter((result) => result.r > 0)
    .reduce((sum, result) => sum + result.r, 0);
  const losses = Math.abs(
    results
      .filter((result) => result.r < 0)
      .reduce((sum, result) => sum + result.r, 0),
  );
  if (losses === 0) return wins > 0 ? 99 : 0;
  return wins / losses;
}

function maxDrawdown(results: RuleResult[]) {
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const result of results) {
    equity += result.r;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, equity - peak);
  }
  return drawdown;
}

function summarizeRule(rule: ExecutionRule, results: RuleResult[]): RuleRow {
  const trades = results.length;
  const targets = results.filter(
    (result) => result.outcome === "target",
  ).length;
  const stops = results.filter((result) => result.outcome === "stop").length;
  const avgR = mean(results.map((result) => result.r));
  const totalR = results.reduce((sum, result) => sum + result.r, 0);
  const pf = profitFactor(results);
  const confidence =
    trades >= 50 ? "medium" : trades >= 20 ? "early" : "too small";
  const plainRead =
    trades < 20
      ? "Interesting, but too few trades to trust."
      : avgR > 0.25 && stops / trades <= 0.2
        ? "This is one of the better draft execution rules."
        : avgR < 0
          ? "This is not behaving well enough yet."
          : "Mixed; useful for comparison, not ready as a rule.";
  return {
    id: rule.id,
    label: rule.label,
    trades,
    targetRate: trades ? targets / trades : 0,
    stopRate: trades ? stops / trades : 0,
    avgR,
    totalR,
    profitFactor: pf,
    maxDrawdownR: maxDrawdown(results),
    avgMinutesHeld: mean(results.map((result) => result.minutesHeld)),
    confidence,
    plainRead,
  };
}

function buildExecutionComparisons(touches: TouchContext[]) {
  return EXECUTION_RULES.map((rule) => {
    const results = touches
      .filter(rule.filter)
      .map((touch) => simulateRule(touch, rule))
      .filter((result): result is RuleResult => Boolean(result));
    return { rule, results, row: summarizeRule(rule, results) };
  }).sort((a, b) => b.row.avgR - a.row.avgR);
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

function buildCoverage(bars: SourceBar[]): DatasetCoverage[] {
  const groups = new Map<string, SourceBar[]>();
  for (const bar of bars) {
    const key = `${bar.symbol}|${bar.timeframe}`;
    groups.set(key, [...(groups.get(key) ?? []), bar]);
  }
  return Array.from(groups.values())
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.timestamp - b.timestamp);
      return {
        symbol: sorted[0].symbol,
        timeframe: sorted[0].timeframe,
        bars: sorted.length,
        start: sorted[0].timestamp,
        end: sorted[sorted.length - 1].timestamp,
      };
    })
    .sort(
      (a, b) =>
        a.symbol.localeCompare(b.symbol) ||
        a.timeframe.localeCompare(b.timeframe),
    );
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
                  Import Alchemy CSVs to populate this section.
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

function RuleTable({
  rows,
}: {
  rows: { rule: ExecutionRule; row: RuleRow }[];
}) {
  return (
    <section className="border border-border bg-card p-4">
      <h2 className="font-display text-lg font-bold">
        Execution Rule Comparison
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Same reconstructed touches, different ways to enter. This is where we
        test whether first touch, waiting, or filtering behaves better.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Rule</th>
              <th className="px-2 py-2 text-right">Trades</th>
              <th className="px-2 py-2 text-right">Target</th>
              <th className="px-2 py-2 text-right">Stop</th>
              <th className="px-2 py-2 text-right">Avg R</th>
              <th className="px-2 py-2 text-right">Total R</th>
              <th className="px-2 py-2 text-right">PF</th>
              <th className="px-2 py-2 text-right">DD</th>
              <th className="px-2 py-2">Read</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-2 py-5 text-muted-foreground" colSpan={9}>
                  Import Alchemy CSVs to compare execution rules.
                </td>
              </tr>
            ) : (
              rows.map(({ rule, row }) => (
                <tr className="border-b border-border/70" key={row.id}>
                  <td className="px-2 py-2">
                    <p className="font-mono text-xs text-foreground">
                      {row.label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rule.plainIntent}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {row.trades}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {pct(row.targetRate)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {pct(row.stopRate)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {fmt(row.avgR)}R
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {fmt(row.totalR)}R
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {row.profitFactor.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {fmt(row.maxDrawdownR)}R
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {row.plainRead}{" "}
                    <span className="font-mono text-xs">
                      ({row.confidence})
                    </span>
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
  const [bars, setBars] = useState<SourceBar[]>(() => loadStoredBars());
  const [fileNotes, setFileNotes] = useState<string[]>([]);

  const minuteBars = useMemo(() => bars.filter(isMinuteBar), [bars]);
  const coverage = useMemo(() => buildCoverage(bars), [bars]);
  const touches = useMemo(() => buildTouches(bars), [bars]);
  const contexts = useMemo(() => {
    const bySymbol = new Map<string, MinuteBar[]>();
    for (const bar of minuteBars) {
      bySymbol.set(bar.symbol, [...(bySymbol.get(bar.symbol) ?? []), bar]);
    }
    for (const dataset of bySymbol.values()) {
      dataset.sort((a, b) => a.timestamp - b.timestamp);
    }
    return touches
      .map((touch) => {
        const dataset = bySymbol.get(touch.symbol) ?? [];
        const sourceIndex = dataset.findIndex(
          (bar) => bar.timestamp === touch.touchTime,
        );
        if (sourceIndex < 0) return undefined;
        return { ...touch, sourceIndex, bars: dataset };
      })
      .filter((touch): touch is TouchContext => Boolean(touch));
  }, [minuteBars, touches]);
  const executionComparisons = useMemo(
    () => buildExecutionComparisons(contexts),
    [contexts],
  );
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
  const byMomentum = useMemo(
    () =>
      groupRows(touches, (touch) => {
        if (touch.momentum.rsiStretch === "unknown")
          return `${touch.timeframe} | RSI not exported`;
        if (touch.momentum.alignedWithTouch)
          return `${touch.timeframe} | RSI stretch with touch`;
        if (touch.momentum.rsiStretch === "none")
          return `${touch.timeframe} | RSI not stretched`;
        return `${touch.timeframe} | RSI stretch against touch`;
      }),
    [touches],
  );

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const imported: SourceBar[] = [];
    const notes: string[] = [];
    for (const file of Array.from(files)) {
      const parsed = parseSourceCsv(await file.text(), file.name);
      imported.push(...parsed);
      const timeframe = inferTimeframe(file.name);
      notes.push(`${file.name}: ${parsed.length} ${timeframe} bars`);
    }
    const before = bars.length;
    const merged = withMomentumSlope(dedupeBars([...bars, ...imported]));
    const skipped = before + imported.length - merged.length;
    setBars(merged);
    const saved = saveStoredBars(merged);
    setFileNotes([
      ...notes,
      `Merged dataset: ${merged.length} total bars (${skipped} overlap duplicate${skipped === 1 ? "" : "s"} skipped)`,
      ...(saved
        ? []
        : [
            "Browser storage is full, so this batch is available now but may need re-upload after refresh.",
          ]),
    ]);
  }

  function clearImportedData() {
    setBars([]);
    setFileNotes([]);
    clearStoredBars();
  }

  return (
    <div className="space-y-4 p-6" data-ocid="brutus.intrabar.page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">
            Brutus Intrabar Lab
          </h1>
          <p className="mt-1 max-w-5xl text-sm text-muted-foreground">
            Import Alchemy TradingView CSVs for 1m, 15m, and 1H together. The
            page keeps prior imports, removes overlapping duplicates, uses 1m
            bars for intrabar reconstruction, and exports one combined research
            packet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 border border-primary bg-primary px-4 py-2 font-mono text-xs text-primary-foreground">
            <Upload className="h-4 w-4" />
            Import CSV batch
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
                  source: "Alchemy TradingView CSV exports",
                  length: LENGTH,
                  stdDev: MULT,
                  targetTimeframes: TARGETS.map((target) => target.label),
                  truthWarning:
                    "This is a 1m developing-band approximation, not tick-level live alert truth.",
                },
                totals: {
                  importedBars: bars.length,
                  minuteBars: minuteBars.length,
                  fifteenMinuteBars: bars.filter(
                    (bar) => bar.timeframe === "15m",
                  ).length,
                  hourBars: bars.filter((bar) => bar.timeframe === "1H").length,
                  intrabarTouches: touches.length,
                },
                coverage,
                bySymbol,
                bySession,
                byTiming,
                byDepth,
                momentumContext: {
                  rule: "RSI is a research label only. It does not create Brutus touches or force entries.",
                  byMomentum,
                },
                executionComparisons: executionComparisons.map(
                  ({ rule, row, results }) => ({
                    rule: {
                      id: rule.id,
                      label: rule.label,
                      entryModel: rule.entryModel,
                      targetR: rule.targetR,
                      maxHoldMinutes: rule.maxHoldMinutes,
                      plainIntent: rule.plainIntent,
                    },
                    row,
                    sampleTrades: results.slice(0, 40),
                  }),
                ),
                latestTouches,
              })
            }
            type="button"
          >
            <Download className="h-4 w-4" />
            Export Intrabar Lab
          </button>
          <button
            className="inline-flex items-center gap-2 border border-red-700/70 bg-red-950/20 px-4 py-2 font-mono text-xs text-red-200 hover:border-red-500 disabled:opacity-40"
            disabled={bars.length === 0}
            onClick={clearImportedData}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
            Clear imported data
          </button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Imported bars
          </p>
          <p className="mt-2 font-display text-2xl font-bold">{bars.length}</p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            1m bars used
          </p>
          <p className="mt-2 font-display text-2xl font-bold">
            {minuteBars.length}
          </p>
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
              back or kept pushing. The 15m and 1H uploads are kept with the
              export for cross-checking, while the 1m bars are what make the
              intrabar reconstruction possible.
            </p>
          </div>
        </div>
      </section>

      <section className="border border-border bg-card p-4">
        <h2 className="font-display text-lg font-bold">Imported Dataset</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload newer overlapping windows any time. The app keeps the old rows
          and skips duplicate symbol/timeframe/timestamp bars.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Symbol</th>
                <th className="px-2 py-2">TF</th>
                <th className="px-2 py-2 text-right">Bars</th>
                <th className="px-2 py-2">Start</th>
                <th className="px-2 py-2">End</th>
              </tr>
            </thead>
            <tbody>
              {coverage.length === 0 ? (
                <tr>
                  <td className="px-2 py-5 text-muted-foreground" colSpan={5}>
                    Import the 1m, 15m, and 1H TradingView CSV exports here.
                  </td>
                </tr>
              ) : (
                coverage.map((row) => (
                  <tr
                    className="border-b border-border/70"
                    key={`${row.symbol}-${row.timeframe}`}
                  >
                    <td className="px-2 py-2 font-mono text-xs">
                      {row.symbol}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {row.timeframe}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {row.bars}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {fmtDate(row.start)}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {fmtDate(row.end)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
      <RuleTable
        rows={executionComparisons.map(({ rule, row }) => ({ rule, row }))}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Table rows={byTiming} title="Touch Timing" />
        <Table rows={byDepth} title="Touch Depth" />
      </div>
      <Table rows={byMomentum} title="Momentum Context" />
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
                <th className="px-2 py-2">Momentum</th>
                <th className="px-2 py-2 text-right">15m R</th>
                <th className="px-2 py-2 text-right">60m R</th>
                <th className="px-2 py-2">Plain read</th>
              </tr>
            </thead>
            <tbody>
              {latestTouches.length === 0 ? (
                <tr>
                  <td className="px-2 py-5 text-muted-foreground" colSpan={8}>
                    Import Alchemy CSVs to inspect intrabar touch events.
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
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {touch.momentum.plainRead}
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
