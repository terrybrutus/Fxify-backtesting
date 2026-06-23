import { Download, ShieldCheck, Upload } from "lucide-react";
import { useMemo, useState } from "react";

type Direction = "long" | "short";
type EntryPolicy = "band-touch" | "close";
type StopPolicy =
  | "band-25"
  | "band-50"
  | "atr-50"
  | "atr-100"
  | "signal-extreme";
type ExitReason =
  | "target"
  | "stop"
  | "timeout"
  | "signal-target"
  | "signal-stop"
  | "no-data";
type Realism = "realistic" | "optimistic" | "late";

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

type Signal = {
  id: string;
  symbol: string;
  timeframe: string;
  timestamp: number;
  direction: Direction;
  index: number;
  bar: BrutusBar;
  bandWidth: number;
  atr: number;
  pierceDepth: number;
  pierceRatio: number;
  rejectionRatio: number;
  session: string;
};

type ExecutionPlan = {
  id: string;
  label: string;
  entry: EntryPolicy;
  stop: StopPolicy;
  targetR: number;
  maxHold: number;
  filter: (signal: Signal) => boolean;
};

type TradeResult = {
  planId: string;
  signalId: string;
  symbol: string;
  timeframe: string;
  timestamp: number;
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  riskPoints: number;
  signalAdversePoints: number;
  signalFavorablePoints: number;
  touchToClosePoints: number;
  signalStopHit: boolean;
  signalTargetHit: boolean;
  exitPoints: number;
  r: number;
  reason: ExitReason;
  realism: Realism;
  barsHeld: number;
};

type PlanRow = {
  id: string;
  label: string;
  trades: number;
  winRate: number;
  avgR: number;
  totalR: number;
  profitFactor: number;
  maxDrawdownR: number;
  avgPoints: number;
  signalStopRate: number;
  signalTargetRate: number;
  avgTouchToClose: number;
  optimisticRate: number;
  targetRate: number;
  stopRate: number;
  timeoutRate: number;
  confidence: string;
  plainRead: string;
};

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

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function fmt(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
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

function bandWidth(bar: BrutusBar) {
  return Math.max(bar.upper - bar.lower, 0.0001);
}

function trueRange(bars: BrutusBar[], index: number) {
  const bar = bars[index];
  const previous = bars[index - 1];
  if (!previous) return bar.high - bar.low;
  return Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - previous.close),
    Math.abs(bar.low - previous.close),
  );
}

function atr(bars: BrutusBar[], index: number, length = 14) {
  const start = Math.max(0, index - length + 1);
  const ranges = bars
    .slice(start, index + 1)
    .map((_, offset) => trueRange(bars, start + offset));
  return Math.max(mean(ranges), 0.0001);
}

function pierceDepth(bar: BrutusBar, direction: Direction) {
  return Math.max(
    direction === "long" ? bar.lower - bar.low : bar.high - bar.upper,
    0,
  );
}

function rejectionPoints(bar: BrutusBar, direction: Direction) {
  return Math.max(
    direction === "long" ? bar.close - bar.low : bar.high - bar.close,
    0,
  );
}

function buildSignals(bars: BrutusBar[]) {
  const byDataset = new Map<string, BrutusBar[]>();
  for (const bar of bars) {
    const key = `${bar.symbol}|${bar.timeframe}`;
    byDataset.set(key, [...(byDataset.get(key) ?? []), bar]);
  }

  const signals: Signal[] = [];
  for (const dataset of byDataset.values()) {
    dataset.sort((a, b) => a.timestamp - b.timestamp);
    dataset.forEach((bar, index) => {
      const directions: Direction[] = [];
      if (bar.longSignal) directions.push("long");
      if (bar.shortSignal) directions.push("short");
      for (const direction of directions) {
        const width = bandWidth(bar);
        const depth = pierceDepth(bar, direction);
        signals.push({
          id: `${bar.symbol}-${bar.timeframe}-${bar.timestamp}-${direction}`,
          symbol: bar.symbol,
          timeframe: bar.timeframe,
          timestamp: bar.timestamp,
          direction,
          index,
          bar,
          bandWidth: width,
          atr: atr(dataset, index),
          pierceDepth: depth,
          pierceRatio: depth / width,
          rejectionRatio:
            depth > 0 ? rejectionPoints(bar, direction) / depth : 0,
          session: sessionFor(bar.timestamp),
        });
      }
    });
  }
  return signals.sort((a, b) => a.timestamp - b.timestamp);
}

function datasetKey(signal: Signal) {
  return `${signal.symbol}|${signal.timeframe}`;
}

function entryPrice(signal: Signal, policy: EntryPolicy) {
  if (policy === "close") return signal.bar.close;
  return signal.direction === "long" ? signal.bar.lower : signal.bar.upper;
}

function riskPoints(signal: Signal, entry: number, policy: StopPolicy) {
  if (policy === "band-25") return Math.max(signal.bandWidth * 0.25, 0.0001);
  if (policy === "band-50") return Math.max(signal.bandWidth * 0.5, 0.0001);
  if (policy === "atr-50") return Math.max(signal.atr * 0.5, 0.0001);
  if (policy === "atr-100") return Math.max(signal.atr, 0.0001);
  const buffer = signal.bandWidth * 0.05;
  return Math.max(
    signal.direction === "long"
      ? entry - (signal.bar.low - buffer)
      : signal.bar.high + buffer - entry,
    0.0001,
  );
}

function signalCandleStress(
  signal: Signal,
  entry: number,
  stop: number,
  target: number,
) {
  const signalAdversePoints =
    signal.direction === "long"
      ? Math.max(entry - signal.bar.low, 0)
      : Math.max(signal.bar.high - entry, 0);
  const signalFavorablePoints =
    signal.direction === "long"
      ? Math.max(signal.bar.high - entry, 0)
      : Math.max(entry - signal.bar.low, 0);
  const touchToClosePoints =
    signal.direction === "long"
      ? signal.bar.close - entry
      : entry - signal.bar.close;
  const signalStopHit =
    signal.direction === "long"
      ? signal.bar.low <= stop
      : signal.bar.high >= stop;
  const signalTargetHit =
    signal.direction === "long"
      ? signal.bar.high >= target
      : signal.bar.low <= target;
  return {
    signalAdversePoints,
    signalFavorablePoints,
    touchToClosePoints,
    signalStopHit,
    signalTargetHit,
  };
}

function simulateTrade(
  signal: Signal,
  plan: ExecutionPlan,
  byDataset: Map<string, BrutusBar[]>,
): TradeResult {
  const bars = byDataset.get(datasetKey(signal)) ?? [];
  const entry = entryPrice(signal, plan.entry);
  const risk = riskPoints(signal, entry, plan.stop);
  const stop = signal.direction === "long" ? entry - risk : entry + risk;
  const target =
    signal.direction === "long"
      ? entry + risk * plan.targetR
      : entry - risk * plan.targetR;
  const stress =
    plan.entry === "band-touch"
      ? signalCandleStress(signal, entry, stop, target)
      : {
          signalAdversePoints: 0,
          signalFavorablePoints: 0,
          touchToClosePoints: 0,
          signalStopHit: false,
          signalTargetHit: false,
        };

  if (plan.entry === "band-touch" && stress.signalStopHit) {
    return {
      planId: plan.id,
      signalId: signal.id,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      timestamp: signal.timestamp,
      direction: signal.direction,
      entry,
      stop,
      target,
      riskPoints: risk,
      ...stress,
      exitPoints: -risk,
      r: -1,
      reason: "signal-stop",
      realism: "realistic",
      barsHeld: 0,
    };
  }

  if (plan.entry === "band-touch" && stress.signalTargetHit) {
    return {
      planId: plan.id,
      signalId: signal.id,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      timestamp: signal.timestamp,
      direction: signal.direction,
      entry,
      stop,
      target,
      riskPoints: risk,
      ...stress,
      exitPoints: risk * plan.targetR,
      r: plan.targetR,
      reason: "signal-target",
      realism: "optimistic",
      barsHeld: 0,
    };
  }

  const future = bars.slice(signal.index + 1, signal.index + 1 + plan.maxHold);

  if (future.length === 0) {
    return {
      planId: plan.id,
      signalId: signal.id,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      timestamp: signal.timestamp,
      direction: signal.direction,
      entry,
      stop,
      target,
      riskPoints: risk,
      ...stress,
      exitPoints: 0,
      r: 0,
      reason: "no-data",
      realism: plan.entry === "close" ? "late" : "realistic",
      barsHeld: 0,
    };
  }

  for (let index = 0; index < future.length; index += 1) {
    const bar = future[index];
    const stopHit =
      signal.direction === "long" ? bar.low <= stop : bar.high >= stop;
    const targetHit =
      signal.direction === "long" ? bar.high >= target : bar.low <= target;
    if (stopHit) {
      return {
        planId: plan.id,
        signalId: signal.id,
        symbol: signal.symbol,
        timeframe: signal.timeframe,
        timestamp: signal.timestamp,
        direction: signal.direction,
        entry,
        stop,
        target,
        riskPoints: risk,
        ...stress,
        exitPoints: -risk,
        r: -1,
        reason: "stop",
        realism: plan.entry === "close" ? "late" : "realistic",
        barsHeld: index + 1,
      };
    }
    if (targetHit) {
      return {
        planId: plan.id,
        signalId: signal.id,
        symbol: signal.symbol,
        timeframe: signal.timeframe,
        timestamp: signal.timestamp,
        direction: signal.direction,
        entry,
        stop,
        target,
        riskPoints: risk,
        ...stress,
        exitPoints: risk * plan.targetR,
        r: plan.targetR,
        reason: "target",
        realism: plan.entry === "close" ? "late" : "realistic",
        barsHeld: index + 1,
      };
    }
  }

  const last = future[future.length - 1];
  const exitPoints =
    signal.direction === "long" ? last.close - entry : entry - last.close;
  return {
    planId: plan.id,
    signalId: signal.id,
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    timestamp: signal.timestamp,
    direction: signal.direction,
    entry,
    stop,
    target,
    riskPoints: risk,
    ...stress,
    exitPoints,
    r: exitPoints / risk,
    reason: "timeout",
    realism: plan.entry === "close" ? "late" : "realistic",
    barsHeld: future.length,
  };
}

function maxDrawdown(values: number[]) {
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, equity - peak);
  }
  return drawdown;
}

function confidenceFor(trades: number) {
  if (trades >= 500) return "strong sample";
  if (trades >= 150) return "useful sample";
  if (trades >= 50) return "early sample";
  return "too thin";
}

function summarizePlan(plan: ExecutionPlan, results: TradeResult[]): PlanRow {
  const usable = results.filter((result) => result.reason !== "no-data");
  const wins = usable.filter((result) => result.r > 0);
  const grossWin = usable
    .filter((result) => result.r > 0)
    .reduce((sum, result) => sum + result.r, 0);
  const grossLoss = Math.abs(
    usable
      .filter((result) => result.r < 0)
      .reduce((sum, result) => sum + result.r, 0),
  );
  const avgR = mean(usable.map((result) => result.r));
  const stopRate =
    usable.length === 0
      ? 0
      : usable.filter(
          (result) =>
            result.reason === "stop" || result.reason === "signal-stop",
        ).length / usable.length;
  const targetRate =
    usable.length === 0
      ? 0
      : usable.filter(
          (result) =>
            result.reason === "target" || result.reason === "signal-target",
        ).length / usable.length;
  const timeoutRate =
    usable.length === 0
      ? 0
      : usable.filter((result) => result.reason === "timeout").length /
        usable.length;
  const signalStopRate =
    usable.length === 0
      ? 0
      : usable.filter((result) => result.signalStopHit).length / usable.length;
  const signalTargetRate =
    usable.length === 0
      ? 0
      : usable.filter((result) => result.signalTargetHit).length /
        usable.length;
  const optimisticRate =
    usable.length === 0
      ? 0
      : usable.filter((result) => result.realism === "optimistic").length /
        usable.length;
  const avgTouchToClose = mean(
    usable.map((result) => result.touchToClosePoints),
  );
  const plainRead =
    usable.length < 50
      ? "Too few trades to trust."
      : optimisticRate > 0.35
        ? "Too optimistic; needs tick/lower-TF proof."
        : plan.entry === "band-touch" && signalStopRate > 0.45
          ? "Too many touch entries fail immediately."
          : avgR > 0.15 && grossWin > grossLoss
            ? "Candidate rule. Review examples."
            : avgR > 0
              ? "Small edge, needs tighter filter."
              : "Do not trade as-is.";
  return {
    id: plan.id,
    label: plan.label,
    trades: usable.length,
    winRate: usable.length === 0 ? 0 : wins.length / usable.length,
    avgR,
    totalR: usable.reduce((sum, result) => sum + result.r, 0),
    profitFactor: grossLoss === 0 ? grossWin : grossWin / grossLoss,
    maxDrawdownR: maxDrawdown(usable.map((result) => result.r)),
    avgPoints: mean(usable.map((result) => result.exitPoints)),
    signalStopRate,
    signalTargetRate,
    avgTouchToClose,
    optimisticRate,
    targetRate,
    stopRate,
    timeoutRate,
    confidence: confidenceFor(usable.length),
    plainRead,
  };
}

function buildPlans(): ExecutionPlan[] {
  const filters: Array<[string, (signal: Signal) => boolean]> = [
    ["all", () => true],
    ["15m only", (signal) => signal.timeframe === "15m"],
    ["1H only", (signal) => signal.timeframe === "1H"],
    [
      "15m shorts",
      (signal) => signal.timeframe === "15m" && signal.direction === "short",
    ],
    [
      "clean pierces",
      (signal) => signal.pierceRatio >= 0.02 && signal.pierceRatio < 0.08,
    ],
    ["deep pierces", (signal) => signal.pierceRatio >= 0.08],
    ["good rejection", (signal) => signal.rejectionRatio >= 1],
  ];
  const entries: EntryPolicy[] = ["band-touch", "close"];
  const stops: StopPolicy[] = ["band-25", "band-50", "atr-50", "atr-100"];
  const targets = [0.5, 1, 1.5, 2];
  const holds = [1, 2, 4, 8];
  const plans: ExecutionPlan[] = [];

  for (const [filterLabel, filter] of filters) {
    for (const entry of entries) {
      for (const stop of stops) {
        for (const targetR of targets) {
          for (const maxHold of holds) {
            plans.push({
              id: `${filterLabel}-${entry}-${stop}-${targetR}r-${maxHold}`,
              label: `${filterLabel} | ${entry} | ${stop} stop | ${targetR}R | ${maxHold} bars`,
              entry,
              stop,
              targetR,
              maxHold,
              filter,
            });
          }
        }
      }
    }
  }

  return plans;
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

function PlanTable({ rows }: { rows: PlanRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] border-collapse font-mono text-xs">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-2 py-2">Execution plan</th>
            <th className="px-2 py-2 text-right">Trades</th>
            <th className="px-2 py-2 text-right">Win</th>
            <th className="px-2 py-2 text-right">Avg R</th>
            <th className="px-2 py-2 text-right">Total R</th>
            <th className="px-2 py-2 text-right">PF</th>
            <th className="px-2 py-2 text-right">DD R</th>
            <th className="px-2 py-2 text-right">Avg pts</th>
            <th className="px-2 py-2 text-right">Touch-close</th>
            <th className="px-2 py-2 text-right">Sig stop</th>
            <th className="px-2 py-2 text-right">Optimism</th>
            <th className="px-2 py-2 text-right">Target</th>
            <th className="px-2 py-2 text-right">Stop</th>
            <th className="px-2 py-2">Read</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-border/70" key={row.id}>
              <td className="px-2 py-2 text-foreground">{row.label}</td>
              <td className="px-2 py-2 text-right">{row.trades}</td>
              <td className="px-2 py-2 text-right">{pct(row.winRate)}</td>
              <td className="px-2 py-2 text-right">{fmt(row.avgR)}</td>
              <td className="px-2 py-2 text-right">{fmt(row.totalR)}</td>
              <td className="px-2 py-2 text-right">
                {row.profitFactor.toFixed(2)}
              </td>
              <td className="px-2 py-2 text-right text-destructive">
                {fmt(row.maxDrawdownR)}
              </td>
              <td className="px-2 py-2 text-right">{fmt(row.avgPoints)}</td>
              <td className="px-2 py-2 text-right">
                {fmt(row.avgTouchToClose)}
              </td>
              <td className="px-2 py-2 text-right">
                {pct(row.signalStopRate)}
              </td>
              <td className="px-2 py-2 text-right">
                {pct(row.optimisticRate)}
              </td>
              <td className="px-2 py-2 text-right">{pct(row.targetRate)}</td>
              <td className="px-2 py-2 text-right">{pct(row.stopRate)}</td>
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

function TradeTable({ rows }: { rows: TradeResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse font-mono text-xs">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-2 py-2">Time</th>
            <th className="px-2 py-2">Symbol</th>
            <th className="px-2 py-2">Side</th>
            <th className="px-2 py-2 text-right">Entry</th>
            <th className="px-2 py-2 text-right">Stop</th>
            <th className="px-2 py-2 text-right">Target</th>
            <th className="px-2 py-2 text-right">Touch-close</th>
            <th className="px-2 py-2 text-right">Sig adverse</th>
            <th className="px-2 py-2 text-right">R</th>
            <th className="px-2 py-2">Exit</th>
            <th className="px-2 py-2">Realism</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-border/70" key={row.signalId}>
              <td className="px-2 py-2 text-foreground">
                {fmtDate(row.timestamp)}
              </td>
              <td className="px-2 py-2">
                {row.symbol} {row.timeframe}
              </td>
              <td className="px-2 py-2">{row.direction}</td>
              <td className="px-2 py-2 text-right">{row.entry.toFixed(2)}</td>
              <td className="px-2 py-2 text-right">{row.stop.toFixed(2)}</td>
              <td className="px-2 py-2 text-right">{row.target.toFixed(2)}</td>
              <td className="px-2 py-2 text-right">
                {fmt(row.touchToClosePoints)}
              </td>
              <td className="px-2 py-2 text-right">
                {fmt(row.signalAdversePoints)}
              </td>
              <td className="px-2 py-2 text-right">{fmt(row.r)}</td>
              <td className="px-2 py-2">{row.reason}</td>
              <td className="px-2 py-2">{row.realism}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BrutusExecutionPage() {
  const [bars, setBars] = useState<BrutusBar[]>([]);
  const [fileNotes, setFileNotes] = useState<string[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const byDataset = useMemo(() => {
    const map = new Map<string, BrutusBar[]>();
    for (const bar of bars) {
      const key = `${bar.symbol}|${bar.timeframe}`;
      map.set(key, [...(map.get(key) ?? []), bar]);
    }
    for (const dataset of map.values()) {
      dataset.sort((a, b) => a.timestamp - b.timestamp);
    }
    return map;
  }, [bars]);
  const signals = useMemo(() => buildSignals(bars), [bars]);
  const plans = useMemo(() => buildPlans(), []);
  const evaluated = useMemo(() => {
    return plans.map((plan) => {
      const results = signals
        .filter(plan.filter)
        .map((signal) => simulateTrade(signal, plan, byDataset));
      return { plan, results, row: summarizePlan(plan, results) };
    });
  }, [byDataset, plans, signals]);
  const candidateRows = evaluated
    .map((item) => item.row)
    .filter((row) => row.trades >= 50 && row.avgR > 0)
    .sort((a, b) => b.avgR - a.avgR)
    .slice(0, 25);
  const saferRows = evaluated
    .map((item) => item.row)
    .filter((row) => row.trades >= 150 && row.profitFactor > 1)
    .sort((a, b) => b.totalR - a.totalR)
    .slice(0, 25);
  const realismRows = evaluated
    .map((item) => item.row)
    .filter(
      (row) =>
        row.trades >= 150 &&
        row.avgR > 0 &&
        row.optimisticRate <= 0.2 &&
        row.signalStopRate <= 0.35,
    )
    .sort((a, b) => b.avgR - a.avgR)
    .slice(0, 25);
  const optimismRows = evaluated
    .map((item) => item.row)
    .filter((row) => row.trades >= 50 && row.optimisticRate > 0.35)
    .sort((a, b) => b.avgR - a.avgR)
    .slice(0, 15);
  const trapRows = evaluated
    .map((item) => item.row)
    .filter((row) => row.trades >= 50)
    .sort((a, b) => a.avgR - b.avgR)
    .slice(0, 15);
  const selected = evaluated.find((item) => item.plan.id === selectedPlanId);
  const selectedTrades =
    selected?.results
      .filter((result) => result.reason !== "no-data")
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 80) ?? [];

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const imported: BrutusBar[] = [];
    const notes: string[] = [];
    for (const file of Array.from(files)) {
      const parsed = parseTradingViewCsv(await file.text(), file.name);
      imported.push(...parsed);
      const signalsInFile = parsed.filter(
        (bar) => bar.longSignal || bar.shortSignal,
      ).length;
      notes.push(
        `${file.name}: ${parsed.length} bars, ${signalsInFile} signals`,
      );
    }
    setBars(imported);
    setFileNotes(notes);
    setSelectedPlanId("");
  }

  return (
    <div className="space-y-4 p-6" data-ocid="brutus.execution.page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">
            Brutus Execution Lab
          </h1>
          <p className="mt-1 max-w-5xl text-sm text-muted-foreground">
            This page tests trade management plans against the Alchemy
            TradingView Brutus signals. It is for deciding how to enter, where
            to stop, where to take profit, and which plans should be avoided.
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
              exportJson("ict-brutus-execution-lab.json", {
                files: fileNotes,
                totals: {
                  candles: bars.length,
                  signals: signals.length,
                  plans: evaluated.length,
                },
                candidateRows,
                saferRows,
                realismRows,
                optimismRows,
                trapRows,
                selectedPlan: selected?.row,
                selectedTrades,
              })
            }
            type="button"
          >
            <Download className="h-4 w-4" />
            Export Execution Lab
          </button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Candles
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
            Plans tested
          </p>
          <p className="mt-2 font-display text-2xl font-bold">
            {evaluated.length}
          </p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Truth policy
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Stop-first if target and stop touch inside the same future candle.
          </p>
        </div>
      </section>

      {signals.length === 0 ? (
        <section className="border border-border bg-card p-6">
          <div className="flex gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-display text-base font-bold">
                Import the same eight Alchemy CSVs
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Use DJ30.R, USTEC.R, US500.R, and JPN225.R on 15m and 1H. This
                lab does not auto-load Yahoo proxy data.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          {fileNotes.length > 0 && (
            <section className="border border-border bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Imported Files
              </h2>
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

          <section className="border border-border bg-card p-4">
            <h2 className="font-display text-base font-bold">
              Candidate Execution Plans
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sorted by average R. These are not automatic rules yet; they are
              the plans most worth reviewing candle by candle.
            </p>
            <div className="mt-3 max-h-[520px] overflow-y-auto">
              <PlanTable rows={candidateRows} />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="border border-border bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Stronger Sample Survivors
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These require at least 150 trades and profit factor above 1.
              </p>
              <div className="mt-3 max-h-[420px] overflow-y-auto">
                <PlanTable rows={saferRows} />
              </div>
            </div>
            <div className="border border-primary/50 bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Realism Survivors
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These still have positive R after requiring low same-candle
                optimism and manageable immediate stop pressure.
              </p>
              <div className="mt-3 max-h-[420px] overflow-y-auto">
                <PlanTable rows={realismRows} />
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="border border-destructive/50 bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Execution Traps
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These plans had enough sample to matter and performed worst.
              </p>
              <div className="mt-3 max-h-[420px] overflow-y-auto">
                <PlanTable rows={trapRows} />
              </div>
            </div>
            <div className="border border-amber-500/50 bg-card p-4">
              <h2 className="font-display text-base font-bold">
                Too-Optimistic Plans
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These can look profitable, but too much of the result depends on
                signal-candle target assumptions.
              </p>
              <div className="mt-3 max-h-[420px] overflow-y-auto">
                <PlanTable rows={optimismRows} />
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <h2 className="font-display text-base font-bold">
              Review One Plan
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {candidateRows.slice(0, 12).map((row) => (
                <button
                  className={`border px-3 py-2 font-mono text-xs ${
                    selectedPlanId === row.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:border-primary"
                  }`}
                  key={row.id}
                  onClick={() => setSelectedPlanId(row.id)}
                  type="button"
                >
                  {row.label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {selected ? (
                <TradeTable rows={selectedTrades} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a candidate plan to inspect its most recent trades.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
