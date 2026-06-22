import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import type { Candle } from "@/types/strategy";
import { Timeframe } from "@/types/strategy";
import { Download, Waves } from "lucide-react";
import { useMemo } from "react";

type Direction = "Long" | "Short";

type BandConfig = {
  length: number;
  deviation: number;
};

type BrutusVariant = {
  id: string;
  label: string;
  requiresCompression: boolean;
  requiresSnapback: boolean;
};

type BrutusSignal = {
  id: string;
  symbol: string;
  timestamp: number;
  triggerTimestamp: number;
  direction: Direction;
  timeframe: Timeframe;
  lowerTimeframe: Timeframe;
  length: number;
  deviation: number;
  entry: number;
  close: number;
  high: number;
  low: number;
  upperBand: number;
  lowerBand: number;
  triggerBand: number;
  finalBand: number;
  bandStretchPoints: number;
  minutesIntoCandle: number;
  maxAdversePoints: number;
  bandWidthPct: number;
  compression: boolean;
  snapback5m: boolean;
  outcomePoints: number;
  wickPoints: number;
  continuationFailure: boolean;
};

type VariantStats = {
  signals: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPoints: number;
  totalPoints: number;
  avgWickPoints: number;
  avgBandStretchPoints: number;
  avgMaxAdversePoints: number;
  continuationFailures: number;
  continuationRate: number;
  estimatedDollarPnl: number;
};

type VariantRow = {
  config: BandConfig;
  variant: BrutusVariant;
  stats: VariantStats;
  signals: BrutusSignal[];
  sample: BrutusSignal[];
};

const BAND_CONFIGS: BandConfig[] = [
  { length: 9, deviation: 2 },
  { length: 9, deviation: 1.5 },
  { length: 9, deviation: 2.5 },
  { length: 7, deviation: 2 },
  { length: 12, deviation: 2 },
  { length: 14, deviation: 1.5 },
  { length: 20, deviation: 1.5 },
  { length: 20, deviation: 2 },
];

const VARIANTS: BrutusVariant[] = [
  {
    id: "raw-pierce",
    label: "Raw band pierce",
    requiresCompression: false,
    requiresSnapback: false,
  },
  {
    id: "compression",
    label: "Only after compression",
    requiresCompression: true,
    requiresSnapback: false,
  },
  {
    id: "snapback-5m",
    label: "Only with 5m snapback",
    requiresCompression: false,
    requiresSnapback: true,
  },
  {
    id: "compression-snapback-5m",
    label: "Compression + 5m snapback",
    requiresCompression: true,
    requiresSnapback: true,
  },
];

const POINT_VALUE = 10;
const HOUR_MS = 60 * 60 * 1000;

function fmtPoints(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function fmtMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(0)}`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values: number[]) {
  const avg = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length,
  );
}

function ema(values: number[], length: number) {
  const alpha = 2 / (length + 1);
  return values.reduce((average, value, index) => {
    if (index === 0) return value;
    return value * alpha + average * (1 - alpha);
  }, values[0]);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function groupCandles(candles: Candle[], timeframe: Timeframe) {
  const groups = new Map<string, Candle[]>();
  for (const candle of candles) {
    if (candle.timeframe !== timeframe) continue;
    const group = groups.get(candle.symbol) ?? [];
    group.push(candle);
    groups.set(candle.symbol, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  }
  return groups;
}

function bandAt(candles: Candle[], index: number, config: BandConfig) {
  if (index + 1 < config.length) return undefined;
  const history = candles.slice(0, index + 1);
  const window = history.slice(-config.length);
  const upper =
    ema(
      history.map((candle) => candle.high),
      config.length,
    ) +
    stdev(window.map((candle) => candle.high)) * config.deviation;
  const lower =
    ema(
      history.map((candle) => candle.low),
      config.length,
    ) -
    stdev(window.map((candle) => candle.low)) * config.deviation;
  return {
    upper,
    lower,
    widthPct: ((upper - lower) / candles[index].close) * 100,
  };
}

function bandForSeries(
  candles: Pick<Candle, "open" | "high" | "low" | "close">[],
  config: BandConfig,
) {
  if (candles.length < config.length) return undefined;
  const window = candles.slice(-config.length);
  const last = candles[candles.length - 1];
  const upper =
    ema(
      candles.map((candle) => candle.high),
      config.length,
    ) +
    stdev(window.map((candle) => candle.high)) * config.deviation;
  const lower =
    ema(
      candles.map((candle) => candle.low),
      config.length,
    ) -
    stdev(window.map((candle) => candle.low)) * config.deviation;
  return {
    upper,
    lower,
    widthPct: ((upper - lower) / last.close) * 100,
  };
}

function widthHistory(candles: Candle[], index: number, config: BandConfig) {
  const widths: number[] = [];
  const start = Math.max(config.length, index - 100);
  for (let i = start; i < index; i += 1) {
    const band = bandAt(candles, i, config);
    if (band) widths.push(band.widthPct);
  }
  return widths;
}

function intrabarReplaySignal({
  symbol,
  h1,
  m5,
  index,
  config,
}: {
  symbol: string;
  h1: Candle[];
  m5: Candle[];
  index: number;
  config: BandConfig;
}): BrutusSignal[] {
  const candle = h1[index];
  const start = Number(candle.timestamp);
  const end = start + HOUR_MS;
  const insideHour = m5.filter((item) => {
    const timestamp = Number(item.timestamp);
    return timestamp >= start && timestamp < end;
  });
  if (insideHour.length === 0) return [];

  const prior = h1.slice(0, index);
  const finalBand = bandForSeries([...prior, candle], config);
  if (!finalBand) return [];
  const widths = widthHistory(h1, index, config);
  const compression =
    widths.length >= 20 && finalBand.widthPct <= median(widths) * 0.8;

  let partialHigh = candle.open;
  let partialLow = candle.open;
  let partialClose = candle.open;
  let previousLower: number | undefined;
  let previousUpper: number | undefined;
  let previousLow = candle.open;
  let previousHigh = candle.open;
  const found: Partial<Record<Direction, BrutusSignal>> = {};

  for (const lowerCandle of insideHour) {
    partialHigh = Math.max(partialHigh, lowerCandle.high);
    partialLow = Math.min(partialLow, lowerCandle.low);
    partialClose = lowerCandle.close;
    const partial = {
      ...candle,
      high: partialHigh,
      low: partialLow,
      close: partialClose,
    };
    const liveBand = bandForSeries([...prior, partial], config);
    if (!liveBand) continue;

    const longByGreenPierce =
      partial.low <= liveBand.lower && partial.close > partial.open;
    const longByCross =
      previousLower !== undefined &&
      previousLow > previousLower &&
      partial.low <= liveBand.lower;
    const shortByRedPierce =
      partial.high >= liveBand.upper && partial.close < partial.open;
    const shortByCross =
      previousUpper !== undefined &&
      previousHigh < previousUpper &&
      partial.high >= liveBand.upper;
    const triggerTimestamp = Number(lowerCandle.timestamp);
    const minutesIntoCandle = Math.round((triggerTimestamp - start) / 60000);

    if (!found.Long && (longByGreenPierce || longByCross)) {
      const later = insideHour.filter(
        (item) => Number(item.timestamp) >= triggerTimestamp,
      );
      const maxLowAfterTrigger = Math.min(...later.map((item) => item.low));
      const outcomePoints = candle.close - liveBand.lower;
      found.Long = {
        id: `${symbol}-${start}-${config.length}-${config.deviation}-long-live`,
        symbol,
        timestamp: start,
        triggerTimestamp,
        direction: "Long",
        timeframe: Timeframe.H1,
        lowerTimeframe: Timeframe.M5,
        length: config.length,
        deviation: config.deviation,
        entry: liveBand.lower,
        close: candle.close,
        high: candle.high,
        low: candle.low,
        upperBand: liveBand.upper,
        lowerBand: liveBand.lower,
        triggerBand: liveBand.lower,
        finalBand: finalBand.lower,
        bandStretchPoints: Math.abs(finalBand.lower - liveBand.lower),
        minutesIntoCandle,
        maxAdversePoints: Math.max(0, liveBand.lower - maxLowAfterTrigger),
        bandWidthPct: liveBand.widthPct,
        compression,
        snapback5m: later.some((item) => item.close > liveBand.lower),
        outcomePoints,
        wickPoints: Math.max(0, candle.close - candle.low),
        continuationFailure: outcomePoints < 0,
      };
    }

    if (!found.Short && (shortByRedPierce || shortByCross)) {
      const later = insideHour.filter(
        (item) => Number(item.timestamp) >= triggerTimestamp,
      );
      const maxHighAfterTrigger = Math.max(...later.map((item) => item.high));
      const outcomePoints = liveBand.upper - candle.close;
      found.Short = {
        id: `${symbol}-${start}-${config.length}-${config.deviation}-short-live`,
        symbol,
        timestamp: start,
        triggerTimestamp,
        direction: "Short",
        timeframe: Timeframe.H1,
        lowerTimeframe: Timeframe.M5,
        length: config.length,
        deviation: config.deviation,
        entry: liveBand.upper,
        close: candle.close,
        high: candle.high,
        low: candle.low,
        upperBand: liveBand.upper,
        lowerBand: liveBand.lower,
        triggerBand: liveBand.upper,
        finalBand: finalBand.upper,
        bandStretchPoints: Math.abs(finalBand.upper - liveBand.upper),
        minutesIntoCandle,
        maxAdversePoints: Math.max(0, maxHighAfterTrigger - liveBand.upper),
        bandWidthPct: liveBand.widthPct,
        compression,
        snapback5m: later.some((item) => item.close < liveBand.upper),
        outcomePoints,
        wickPoints: Math.max(0, candle.high - candle.close),
        continuationFailure: outcomePoints < 0,
      };
    }

    previousLower = liveBand.lower;
    previousUpper = liveBand.upper;
    previousLow = partial.low;
    previousHigh = partial.high;
  }

  return [found.Long, found.Short].filter((signal): signal is BrutusSignal =>
    Boolean(signal),
  );
}

function buildSignals(candles: Candle[]) {
  const h1BySymbol = groupCandles(candles, Timeframe.H1);
  const m5BySymbol = groupCandles(candles, Timeframe.M5);
  const signals: BrutusSignal[] = [];

  for (const [symbol, h1] of h1BySymbol.entries()) {
    const m5 = m5BySymbol.get(symbol) ?? [];
    for (const config of BAND_CONFIGS) {
      for (let index = config.length - 1; index < h1.length; index += 1) {
        signals.push(
          ...intrabarReplaySignal({ symbol, h1, m5, index, config }),
        );
      }
    }
  }

  return signals;
}

function statsFor(signals: BrutusSignal[]): VariantStats {
  const wins = signals.filter((signal) => signal.outcomePoints > 0);
  const losses = signals.filter((signal) => signal.outcomePoints <= 0);
  const totalPoints = signals.reduce(
    (sum, signal) => sum + signal.outcomePoints,
    0,
  );
  const continuationFailures = signals.filter(
    (signal) => signal.continuationFailure,
  ).length;
  return {
    signals: signals.length,
    wins: wins.length,
    losses: losses.length,
    winRate: signals.length ? wins.length / signals.length : 0,
    avgPoints: signals.length ? totalPoints / signals.length : 0,
    totalPoints,
    avgWickPoints: signals.length
      ? signals.reduce((sum, signal) => sum + signal.wickPoints, 0) /
        signals.length
      : 0,
    avgBandStretchPoints: signals.length
      ? signals.reduce((sum, signal) => sum + signal.bandStretchPoints, 0) /
        signals.length
      : 0,
    avgMaxAdversePoints: signals.length
      ? signals.reduce((sum, signal) => sum + signal.maxAdversePoints, 0) /
        signals.length
      : 0,
    continuationFailures,
    continuationRate: signals.length
      ? continuationFailures / signals.length
      : 0,
    estimatedDollarPnl: totalPoints * POINT_VALUE,
  };
}

function serializeSignal(signal: BrutusSignal) {
  return {
    id: signal.id,
    timestamp: new Date(signal.timestamp).toISOString(),
    symbol: signal.symbol,
    direction: signal.direction,
    timeframe: signal.timeframe,
    lowerTimeframe: signal.lowerTimeframe,
    triggerTimestamp: new Date(signal.triggerTimestamp).toISOString(),
    triggerHourUtc: new Date(signal.triggerTimestamp).getUTCHours(),
    minutesIntoCandle: signal.minutesIntoCandle,
    length: signal.length,
    deviation: signal.deviation,
    entry: signal.entry,
    triggerBand: signal.triggerBand,
    finalBand: signal.finalBand,
    bandStretchPoints: signal.bandStretchPoints,
    maxAdversePoints: signal.maxAdversePoints,
    close: signal.close,
    high: signal.high,
    low: signal.low,
    upperBand: signal.upperBand,
    lowerBand: signal.lowerBand,
    bandWidthPct: signal.bandWidthPct,
    outcomePoints: signal.outcomePoints,
    wickPoints: signal.wickPoints,
    compression: signal.compression,
    snapback5m: signal.snapback5m,
    continuationFailure: signal.continuationFailure,
  };
}

function groupedStats(
  signals: BrutusSignal[],
  groupBy: (signal: BrutusSignal) => string,
) {
  const groups = new Map<string, BrutusSignal[]>();
  for (const signal of signals) {
    const key = groupBy(signal);
    groups.set(key, [...(groups.get(key) ?? []), signal]);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      stats: statsFor(group),
    }))
    .sort(
      (a, b) =>
        b.stats.avgPoints - a.stats.avgPoints ||
        b.stats.signals - a.stats.signals,
    );
}

function buildRows(signals: BrutusSignal[]): VariantRow[] {
  return BAND_CONFIGS.flatMap((config) =>
    VARIANTS.map((variant) => {
      const matching = signals.filter((signal) => {
        if (signal.length !== config.length) return false;
        if (signal.deviation !== config.deviation) return false;
        if (variant.requiresCompression && !signal.compression) return false;
        if (variant.requiresSnapback && !signal.snapback5m) return false;
        return true;
      });
      return {
        config,
        variant,
        stats: statsFor(matching),
        signals: matching,
        sample: matching.slice(0, 20),
      };
    }),
  ).sort(
    (a, b) =>
      b.stats.avgPoints - a.stats.avgPoints ||
      b.stats.signals - a.stats.signals,
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-xl font-bold">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export default function BrutusBandLabPage() {
  const { candles, run } = useStrategyWorkspace();
  const signals = useMemo(() => buildSignals(candles), [candles]);
  const rows = useMemo(() => buildRows(signals), [signals]);
  const usableRows = rows.filter((row) => row.stats.signals >= 20);
  const best = usableRows[0] ?? rows[0];
  const rawBest = rows.find(
    (row) =>
      row.variant.id === "raw-pierce" &&
      row.config.length === best?.config.length &&
      row.config.deviation === best?.config.deviation,
  );

  const plainFinding = best
    ? `${best.variant.label} was the strongest 5m replay approximation on the current data: ${fmtPoints(
        best.stats.avgPoints,
      )} average per signal across ${best.stats.signals} signals.`
    : "Load real index candles to test Brutus Band pierces.";
  const technicalFinding =
    best && rawBest
      ? `Compared with raw first-alert approximations using the same ${best.config.length} / ${best.config.deviation} bands, this version changed continuation failures from ${pct(
          rawBest.stats.continuationRate,
        )} to ${pct(best.stats.continuationRate)}.`
      : "The lab rebuilds each 1H candle from available 5m candles, estimates the first live band pierce, then grades what happened after that trigger.";

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="brutus-band.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Brutus Band Lab</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Historical replay for your PineScript-style high/low EMA Bollinger
            bands. The lab uses 5m candles to approximate the first live alert
            inside each 1H candle, then checks whether price snapped back or ran
            through.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!run.integrity.canRunBacktest}
          onClick={() =>
            downloadFile(
              "ict-brutus-band-lab.json",
              JSON.stringify(
                {
                  generatedAt: new Date().toISOString(),
                  integrity: run.integrity,
                  pointValueAssumption: POINT_VALUE,
                  findings: { plainFinding, technicalFinding },
                  exportNote:
                    "Rows include every matching signal, not just UI samples. Times are UTC. First alert values are 5m replay approximations, not tick-level TradingView alert truth.",
                  rows: rows.map((row) => ({
                    variant: row.variant,
                    config: row.config,
                    stats: row.stats,
                    breakdowns: {
                      bySymbol: groupedStats(
                        row.signals,
                        (signal) => signal.symbol,
                      ),
                      byDirection: groupedStats(
                        row.signals,
                        (signal) => signal.direction,
                      ),
                      bySymbolDirection: groupedStats(
                        row.signals,
                        (signal) => `${signal.symbol} ${signal.direction}`,
                      ),
                      byTriggerHourUtc: groupedStats(row.signals, (signal) =>
                        String(new Date(signal.triggerTimestamp).getUTCHours()),
                      ),
                      byEntryWindow: groupedStats(row.signals, (signal) => {
                        if (signal.minutesIntoCandle < 15) return "00-14m";
                        if (signal.minutesIntoCandle < 30) return "15-29m";
                        if (signal.minutesIntoCandle < 45) return "30-44m";
                        return "45-59m";
                      }),
                      byAdverseBucket: groupedStats(row.signals, (signal) => {
                        if (signal.maxAdversePoints < 10) return "<10 pts";
                        if (signal.maxAdversePoints < 25) return "10-24 pts";
                        if (signal.maxAdversePoints < 50) return "25-49 pts";
                        return "50+ pts";
                      }),
                    },
                    sample: row.sample.map(serializeSignal),
                    allSignals: row.signals.map(serializeSignal),
                  })),
                },
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Export Brutus Lab
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Brutus Band Lab is disabled until real 1H and 5m candles are loaded.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Band pierces"
              value={String(signals.length)}
              detail="All tested configs combined"
            />
            <Stat
              label="Best avg"
              value={best ? fmtPoints(best.stats.avgPoints) : "0.0 pts"}
              detail={best?.variant.label ?? "No result"}
            />
            <Stat
              label="Best win rate"
              value={best ? pct(best.stats.winRate) : "0.0%"}
              detail="Exit approximation: 1H candle close"
            />
            <Stat
              label="$10/point estimate"
              value={best ? fmtMoney(best.stats.estimatedDollarPnl) : "$0"}
              detail="Adjust later for broker contract value"
            />
          </div>

          <section className="border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Waves className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  What it means
                </p>
                <p className="mt-2 text-sm text-foreground">{plainFinding}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {technicalFinding}
                </p>
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <h2 className="font-display text-lg font-bold">
              Brutus Band Scoreboard
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This pass approximates the live alert by rebuilding each 1H candle
              from 5m candles and recalculating the moving band at each step.
            </p>
            <div className="mt-3 border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">
              <span className="font-mono font-bold uppercase tracking-widest text-amber-300">
                Exactness note:
              </span>{" "}
              5m replay cannot know the exact tick where TradingView alerted. It
              approximates the live band every 5 minutes. 1m or tick data would
              tighten this.
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1280px] font-mono text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Variant</th>
                    <th className="py-2 text-right">Length</th>
                    <th className="py-2 text-right">Dev</th>
                    <th className="py-2 text-right">Signals</th>
                    <th className="py-2 text-right">W/L</th>
                    <th className="py-2 text-right">Win</th>
                    <th className="py-2 text-right">Avg</th>
                    <th className="py-2 text-right">Total</th>
                    <th className="py-2 text-right">Avg wick</th>
                    <th className="py-2 text-right">Band stretch</th>
                    <th className="py-2 text-right">Went against</th>
                    <th className="py-2 text-right">Ran through</th>
                    <th className="py-2 text-right">$ est.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 24).map((row) => (
                    <tr
                      key={`${row.variant.id}-${row.config.length}-${row.config.deviation}`}
                      className="border-b border-border/40"
                    >
                      <td className="py-2">{row.variant.label}</td>
                      <td className="py-2 text-right">{row.config.length}</td>
                      <td className="py-2 text-right">
                        {row.config.deviation.toFixed(1)}
                      </td>
                      <td className="py-2 text-right">{row.stats.signals}</td>
                      <td className="py-2 text-right">
                        {row.stats.wins}/{row.stats.losses}
                      </td>
                      <td className="py-2 text-right">
                        {pct(row.stats.winRate)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPoints(row.stats.avgPoints)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPoints(row.stats.totalPoints)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPoints(row.stats.avgWickPoints)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPoints(row.stats.avgBandStretchPoints)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPoints(row.stats.avgMaxAdversePoints)}
                      </td>
                      <td className="py-2 text-right">
                        {pct(row.stats.continuationRate)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtMoney(row.stats.estimatedDollarPnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {best && (
            <section className="border border-border bg-card p-4">
              <h2 className="font-display text-lg font-bold">
                Sample Triggers
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[980px] font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Time</th>
                      <th className="py-2 text-left">Alert approx.</th>
                      <th className="py-2 text-left">Index</th>
                      <th className="py-2 text-left">Side</th>
                      <th className="py-2 text-right">Entry</th>
                      <th className="py-2 text-right">Close</th>
                      <th className="py-2 text-right">Outcome</th>
                      <th className="py-2 text-right">Wick</th>
                      <th className="py-2 text-right">Stretch</th>
                      <th className="py-2 text-right">Against</th>
                      <th className="py-2 text-left">Filters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {best.sample.slice(0, 12).map((signal) => (
                      <tr key={signal.id} className="border-b border-border/40">
                        <td className="py-2">
                          {new Date(signal.timestamp).toISOString()}
                        </td>
                        <td className="py-2">
                          {new Date(signal.triggerTimestamp).toISOString()}
                        </td>
                        <td className="py-2">{signal.symbol}</td>
                        <td className="py-2">{signal.direction}</td>
                        <td className="py-2 text-right">
                          {signal.entry.toFixed(2)}
                        </td>
                        <td className="py-2 text-right">
                          {signal.close.toFixed(2)}
                        </td>
                        <td className="py-2 text-right">
                          {fmtPoints(signal.outcomePoints)}
                        </td>
                        <td className="py-2 text-right">
                          {fmtPoints(signal.wickPoints)}
                        </td>
                        <td className="py-2 text-right">
                          {fmtPoints(signal.bandStretchPoints)}
                        </td>
                        <td className="py-2 text-right">
                          {fmtPoints(signal.maxAdversePoints)}
                        </td>
                        <td className="py-2">
                          {[
                            signal.compression ? "compression" : "",
                            signal.snapback5m ? "5m snapback" : "",
                          ]
                            .filter(Boolean)
                            .join(", ") || "raw touch"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
