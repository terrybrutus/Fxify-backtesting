import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import type { Candle } from "@/types/strategy";
import { Timeframe } from "@/types/strategy";
import { Download, Play, Waves } from "lucide-react";
import { useEffect, useState } from "react";

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
  snapbackTimestamp?: number;
  snapbackEntry?: number;
  minutesToSnapback?: number;
  maxAdverseAfterSnapbackPoints?: number;
  snapbackOutcomePoints?: number;
  bandWidthPct: number;
  compression: boolean;
  snapback5m: boolean;
  outcomePoints: number;
  wickPoints: number;
  continuationFailure: boolean;
  targetResults: TargetResult[];
};

type TargetOutcome = "TP" | "STOP" | "CLOSE";

type TargetResult = {
  takeProfitPoints: number;
  stopPoints: number;
  outcome: TargetOutcome;
  outcomePoints: number;
  exitTimestamp: number;
  conservativeSameCandle: boolean;
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
  signalIds: string[];
  breakdowns: {
    bySymbol: ReturnType<typeof groupedStats>;
    byDirection: ReturnType<typeof groupedStats>;
    bySymbolDirection: ReturnType<typeof groupedStats>;
    byTriggerHourUtc: ReturnType<typeof groupedStats>;
    byEntryWindow: ReturnType<typeof groupedStats>;
    byAdverseBucket: ReturnType<typeof groupedStats>;
  };
  sample: BrutusSignal[];
};

type ExecutionEntryMode = "Immediate pierce" | "5m snapback confirm";

type ExecutionModel = {
  label: string;
  config: BandConfig;
  entryMode: ExecutionEntryMode;
  stopPoints: number | null;
};

type ExecutionRow = {
  model: ExecutionModel;
  stats: VariantStats;
  eligibleSignals: number;
  stoppedSignals: number;
  avgAdversePoints: number;
  breakdowns: VariantRow["breakdowns"];
};

type TargetModel = {
  label: string;
  config: BandConfig;
  takeProfitPoints: number;
  stopPoints: number;
};

type TargetRow = {
  model: TargetModel;
  stats: VariantStats;
  tpHits: number;
  stopHits: number;
  closeExits: number;
  conservativeSameCandle: number;
  breakdowns: VariantRow["breakdowns"];
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
const EXECUTION_CONFIGS: BandConfig[] = [
  { length: 7, deviation: 2 },
  { length: 9, deviation: 2 },
];
const STOP_TESTS = [null, 25, 50, 75];
const TARGET_TESTS = [10, 20, 30, 50];
const TARGET_STOP_TESTS = [25, 50, 75];

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

function simulateTargetResults({
  direction,
  entry,
  close,
  later,
}: {
  direction: Direction;
  entry: number;
  close: number;
  later: Candle[];
}): TargetResult[] {
  return TARGET_TESTS.flatMap((takeProfitPoints) =>
    TARGET_STOP_TESTS.map((stopPoints) => {
      const takeProfit =
        direction === "Long"
          ? entry + takeProfitPoints
          : entry - takeProfitPoints;
      const stop =
        direction === "Long" ? entry - stopPoints : entry + stopPoints;

      for (const candle of later) {
        const hitStop =
          direction === "Long" ? candle.low <= stop : candle.high >= stop;
        const hitTarget =
          direction === "Long"
            ? candle.high >= takeProfit
            : candle.low <= takeProfit;
        if (hitStop || hitTarget) {
          const conservativeStop = hitStop && hitTarget;
          return {
            takeProfitPoints,
            stopPoints,
            outcome: conservativeStop || hitStop ? "STOP" : "TP",
            outcomePoints:
              conservativeStop || hitStop ? -stopPoints : takeProfitPoints,
            exitTimestamp: Number(candle.timestamp),
            conservativeSameCandle: conservativeStop,
          };
        }
      }

      return {
        takeProfitPoints,
        stopPoints,
        outcome: "CLOSE",
        outcomePoints: direction === "Long" ? close - entry : entry - close,
        exitTimestamp: later.length
          ? Number(later[later.length - 1].timestamp)
          : Date.now(),
        conservativeSameCandle: false,
      };
    }),
  );
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
      const snapbackCandle = later.find((item) => item.close > liveBand.lower);
      const snapbackTimestamp = snapbackCandle
        ? Number(snapbackCandle.timestamp)
        : undefined;
      const afterSnapback = snapbackTimestamp
        ? later.filter((item) => Number(item.timestamp) >= snapbackTimestamp)
        : [];
      const snapbackEntry = snapbackCandle?.close;
      const minLowAfterSnapback = afterSnapback.length
        ? Math.min(...afterSnapback.map((item) => item.low))
        : undefined;
      const maxLowAfterTrigger = Math.min(...later.map((item) => item.low));
      const outcomePoints = candle.close - liveBand.lower;
      const targetResults = simulateTargetResults({
        direction: "Long",
        entry: liveBand.lower,
        close: candle.close,
        later,
      });
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
        snapbackTimestamp,
        snapbackEntry,
        minutesToSnapback: snapbackTimestamp
          ? Math.round((snapbackTimestamp - triggerTimestamp) / 60000)
          : undefined,
        maxAdverseAfterSnapbackPoints:
          snapbackEntry !== undefined && minLowAfterSnapback !== undefined
            ? Math.max(0, snapbackEntry - minLowAfterSnapback)
            : undefined,
        snapbackOutcomePoints:
          snapbackEntry !== undefined
            ? candle.close - snapbackEntry
            : undefined,
        bandWidthPct: liveBand.widthPct,
        compression,
        snapback5m: Boolean(snapbackCandle),
        outcomePoints,
        wickPoints: Math.max(0, candle.close - candle.low),
        continuationFailure: outcomePoints < 0,
        targetResults,
      };
    }

    if (!found.Short && (shortByRedPierce || shortByCross)) {
      const later = insideHour.filter(
        (item) => Number(item.timestamp) >= triggerTimestamp,
      );
      const snapbackCandle = later.find((item) => item.close < liveBand.upper);
      const snapbackTimestamp = snapbackCandle
        ? Number(snapbackCandle.timestamp)
        : undefined;
      const afterSnapback = snapbackTimestamp
        ? later.filter((item) => Number(item.timestamp) >= snapbackTimestamp)
        : [];
      const snapbackEntry = snapbackCandle?.close;
      const maxHighAfterSnapback = afterSnapback.length
        ? Math.max(...afterSnapback.map((item) => item.high))
        : undefined;
      const maxHighAfterTrigger = Math.max(...later.map((item) => item.high));
      const outcomePoints = liveBand.upper - candle.close;
      const targetResults = simulateTargetResults({
        direction: "Short",
        entry: liveBand.upper,
        close: candle.close,
        later,
      });
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
        snapbackTimestamp,
        snapbackEntry,
        minutesToSnapback: snapbackTimestamp
          ? Math.round((snapbackTimestamp - triggerTimestamp) / 60000)
          : undefined,
        maxAdverseAfterSnapbackPoints:
          snapbackEntry !== undefined && maxHighAfterSnapback !== undefined
            ? Math.max(0, maxHighAfterSnapback - snapbackEntry)
            : undefined,
        snapbackOutcomePoints:
          snapbackEntry !== undefined
            ? snapbackEntry - candle.close
            : undefined,
        bandWidthPct: liveBand.widthPct,
        compression,
        snapback5m: Boolean(snapbackCandle),
        outcomePoints,
        wickPoints: Math.max(0, candle.high - candle.close),
        continuationFailure: outcomePoints < 0,
        targetResults,
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

function executionSignal(
  signal: BrutusSignal,
  model: ExecutionModel,
): BrutusSignal | undefined {
  if (
    signal.length !== model.config.length ||
    signal.deviation !== model.config.deviation
  ) {
    return undefined;
  }

  const isSnapback = model.entryMode === "5m snapback confirm";
  const outcomePoints = isSnapback
    ? signal.snapbackOutcomePoints
    : signal.outcomePoints;
  const adversePoints = isSnapback
    ? signal.maxAdverseAfterSnapbackPoints
    : signal.maxAdversePoints;
  if (outcomePoints === undefined || adversePoints === undefined) {
    return undefined;
  }

  const stopPoints = model.stopPoints;
  const stopped = stopPoints !== null && adversePoints > stopPoints;
  return {
    ...signal,
    entry: isSnapback ? (signal.snapbackEntry ?? signal.entry) : signal.entry,
    outcomePoints: stopped && stopPoints !== null ? -stopPoints : outcomePoints,
    maxAdversePoints: adversePoints,
    continuationFailure: stopped || outcomePoints <= 0,
  };
}

function executionBreakdowns(signals: BrutusSignal[]) {
  return {
    bySymbol: groupedStats(signals, (signal) => signal.symbol),
    byDirection: groupedStats(signals, (signal) => signal.direction),
    bySymbolDirection: groupedStats(
      signals,
      (signal) => `${signal.symbol} ${signal.direction}`,
    ),
    byTriggerHourUtc: groupedStats(signals, (signal) =>
      String(new Date(signal.triggerTimestamp).getUTCHours()),
    ),
    byEntryWindow: groupedStats(signals, (signal) => {
      if (signal.minutesIntoCandle < 15) return "00-14m";
      if (signal.minutesIntoCandle < 30) return "15-29m";
      if (signal.minutesIntoCandle < 45) return "30-44m";
      return "45-59m";
    }),
    byAdverseBucket: groupedStats(signals, (signal) => {
      if (signal.maxAdversePoints < 10) return "<10 pts";
      if (signal.maxAdversePoints < 25) return "10-24 pts";
      if (signal.maxAdversePoints < 50) return "25-49 pts";
      return "50+ pts";
    }),
  };
}

function buildExecutionRows(signals: BrutusSignal[]): ExecutionRow[] {
  const models = EXECUTION_CONFIGS.flatMap((config) =>
    (["Immediate pierce", "5m snapback confirm"] as const).flatMap(
      (entryMode) =>
        STOP_TESTS.map((stopPoints) => ({
          label: `${config.length}/${config.deviation} ${entryMode}${
            stopPoints ? `, ${stopPoints} pt stop` : ", no stop"
          }`,
          config,
          entryMode,
          stopPoints,
        })),
    ),
  );

  return models
    .map((model) => {
      const executed = signals
        .map((signal) => executionSignal(signal, model))
        .filter((signal): signal is BrutusSignal => Boolean(signal));
      const stoppedSignals = executed.filter(
        (signal) =>
          model.stopPoints !== null &&
          signal.outcomePoints === -model.stopPoints,
      ).length;
      return {
        model,
        stats: statsFor(executed),
        eligibleSignals: executed.length,
        stoppedSignals,
        avgAdversePoints: executed.length
          ? executed.reduce((sum, signal) => sum + signal.maxAdversePoints, 0) /
            executed.length
          : 0,
        breakdowns: executionBreakdowns(executed),
      };
    })
    .sort(
      (a, b) =>
        b.stats.avgPoints - a.stats.avgPoints ||
        b.stats.signals - a.stats.signals,
    );
}

function buildTargetRows(signals: BrutusSignal[]): TargetRow[] {
  const models = EXECUTION_CONFIGS.flatMap((config) =>
    TARGET_TESTS.flatMap((takeProfitPoints) =>
      TARGET_STOP_TESTS.map((stopPoints) => ({
        label: `${config.length}/${config.deviation} TP ${takeProfitPoints} / stop ${stopPoints}`,
        config,
        takeProfitPoints,
        stopPoints,
      })),
    ),
  );

  return models
    .map((model) => {
      const targetSignals = signals
        .filter(
          (signal) =>
            signal.length === model.config.length &&
            signal.deviation === model.config.deviation,
        )
        .map((signal) => {
          const target = signal.targetResults.find(
            (result) =>
              result.takeProfitPoints === model.takeProfitPoints &&
              result.stopPoints === model.stopPoints,
          );
          if (!target) return undefined;
          return {
            ...signal,
            outcomePoints: target.outcomePoints,
            continuationFailure: target.outcome !== "TP",
          };
        })
        .filter((signal): signal is BrutusSignal => Boolean(signal));

      const matchingTargets = signals
        .filter(
          (signal) =>
            signal.length === model.config.length &&
            signal.deviation === model.config.deviation,
        )
        .flatMap((signal) =>
          signal.targetResults.filter(
            (result) =>
              result.takeProfitPoints === model.takeProfitPoints &&
              result.stopPoints === model.stopPoints,
          ),
        );

      return {
        model,
        stats: statsFor(targetSignals),
        tpHits: matchingTargets.filter((result) => result.outcome === "TP")
          .length,
        stopHits: matchingTargets.filter((result) => result.outcome === "STOP")
          .length,
        closeExits: matchingTargets.filter(
          (result) => result.outcome === "CLOSE",
        ).length,
        conservativeSameCandle: matchingTargets.filter(
          (result) => result.conservativeSameCandle,
        ).length,
        breakdowns: executionBreakdowns(targetSignals),
      };
    })
    .sort(
      (a, b) =>
        b.stats.avgPoints - a.stats.avgPoints ||
        b.stats.signals - a.stats.signals,
    );
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
    snapbackTimestamp: signal.snapbackTimestamp
      ? new Date(signal.snapbackTimestamp).toISOString()
      : null,
    snapbackEntry: signal.snapbackEntry ?? null,
    minutesToSnapback: signal.minutesToSnapback ?? null,
    maxAdverseAfterSnapbackPoints: signal.maxAdverseAfterSnapbackPoints ?? null,
    snapbackOutcomePoints: signal.snapbackOutcomePoints ?? null,
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
    const group = groups.get(key);
    if (group) {
      group.push(signal);
    } else {
      groups.set(key, [signal]);
    }
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
        signalIds: matching.map((signal) => signal.id),
        breakdowns: executionBreakdowns(matching),
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
  const dataSignature = `${run.integrity.source}:${run.integrity.candleCount}:${run.integrity.end}`;
  const [analysis, setAnalysis] = useState<{
    signature: string;
    signals: BrutusSignal[];
    rows: VariantRow[];
    executionRows: ExecutionRow[];
    targetRows: TargetRow[];
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const signals = analysis?.signals ?? [];
  const rows = analysis?.rows ?? [];
  const executionRows = analysis?.executionRows ?? [];
  const targetRows = analysis?.targetRows ?? [];
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

  useEffect(() => {
    setAnalysis((current) =>
      current?.signature === dataSignature ? current : null,
    );
    setIsAnalyzing(false);
  }, [dataSignature]);

  const runAnalysis = () => {
    setIsAnalyzing(true);
    window.setTimeout(() => {
      const nextSignals = buildSignals(candles);
      setAnalysis({
        signature: dataSignature,
        signals: nextSignals,
        rows: buildRows(nextSignals),
        executionRows: buildExecutionRows(nextSignals),
        targetRows: buildTargetRows(nextSignals),
      });
      setIsAnalyzing(false);
    }, 0);
  };

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
          disabled={
            !run.integrity.canRunBacktest ||
            isAnalyzing ||
            analysis?.signature !== dataSignature
          }
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
                    "Times are UTC. First alert values are 5m replay approximations, not tick-level TradingView alert truth. The signalLedger is compact; targetRows contain the audited TP/stop summaries.",
                  signalLedger: signals.map(serializeSignal),
                  executionRows: executionRows.map((row) => ({
                    model: row.model,
                    stats: row.stats,
                    eligibleSignals: row.eligibleSignals,
                    stoppedSignals: row.stoppedSignals,
                    avgAdversePoints: row.avgAdversePoints,
                    breakdowns: row.breakdowns,
                  })),
                  targetRows: targetRows.map((row) => ({
                    model: row.model,
                    stats: row.stats,
                    tpHits: row.tpHits,
                    stopHits: row.stopHits,
                    closeExits: row.closeExits,
                    conservativeSameCandle: row.conservativeSameCandle,
                    breakdowns: row.breakdowns,
                  })),
                  rows: rows.map((row) => ({
                    variant: row.variant,
                    config: row.config,
                    stats: row.stats,
                    signalIds: row.signalIds,
                    breakdowns: row.breakdowns,
                    sample: row.sample.map(serializeSignal),
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
              value={analysis ? String(signals.length) : "not run"}
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

          <section className="border border-border bg-card p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-display text-lg font-bold">
                  Replay Control
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  This screen now opens first, then runs the heavy 5m replay
                  only when requested. That keeps the tab from freezing just
                  because you clicked into Brutus Band Lab.
                </p>
              </div>
              <Button
                type="button"
                onClick={runAnalysis}
                disabled={!run.integrity.canRunBacktest || isAnalyzing}
              >
                <Play className="mr-2 h-4 w-4" />
                {isAnalyzing ? "Running Replay..." : "Run Brutus Replay"}
              </Button>
            </div>
          </section>

          {analysis ? (
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
          ) : (
            <section className="border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
              Press Run Brutus Replay to calculate the scoreboard and enable the
              export. No strategy result is generated until the real imported
              candles are analyzed.
            </section>
          )}

          {analysis && (
            <section className="border border-border bg-card p-4">
              <h2 className="font-display text-lg font-bold">
                Brutus Band Scoreboard
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This pass approximates the live alert by rebuilding each 1H
                candle from 5m candles and recalculating the moving band at each
                step.
              </p>
              <div className="mt-3 border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                <span className="font-mono font-bold uppercase tracking-widest text-amber-300">
                  Exactness note:
                </span>{" "}
                5m replay cannot know the exact tick where TradingView alerted.
                It approximates the live band every 5 minutes. 1m or tick data
                would tighten this.
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
          )}

          {analysis && (
            <section className="border border-primary/30 bg-card p-4">
              <h2 className="font-display text-lg font-bold">
                Brutus Execution Lab
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This compares whether the edge comes from entering immediately
                at the approximate band pierce or waiting for a 5m candle to
                snap back inside the band. Outcomes are still measured to the 1H
                close, with optional fixed adverse stops.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[1180px] font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Execution model</th>
                      <th className="py-2 text-right">Signals</th>
                      <th className="py-2 text-right">W/L</th>
                      <th className="py-2 text-right">Win</th>
                      <th className="py-2 text-right">Avg</th>
                      <th className="py-2 text-right">Total</th>
                      <th className="py-2 text-right">Avg against</th>
                      <th className="py-2 text-right">Stopped</th>
                      <th className="py-2 text-right">$ est.</th>
                      <th className="py-2 text-left">Plain read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executionRows.slice(0, 16).map((row) => {
                      const enough = row.stats.signals >= 30;
                      const good =
                        enough &&
                        row.stats.avgPoints > 10 &&
                        row.stats.winRate >= 0.6;
                      const weak =
                        row.stats.avgPoints <= 0 || row.stats.winRate < 0.5;
                      return (
                        <tr
                          key={`${row.model.label}`}
                          className="border-b border-border/40"
                        >
                          <td className="py-2">{row.model.label}</td>
                          <td className="py-2 text-right">
                            {row.stats.signals}
                          </td>
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
                            {fmtPoints(row.avgAdversePoints)}
                          </td>
                          <td className="py-2 text-right">
                            {row.stoppedSignals}
                          </td>
                          <td className="py-2 text-right">
                            {fmtMoney(row.stats.estimatedDollarPnl)}
                          </td>
                          <td className="py-2">
                            {good
                              ? "Research candidate"
                              : weak
                                ? "Avoid for now"
                                : "Needs more filtering"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {analysis && (
            <section className="border border-border bg-card p-4">
              <h2 className="font-display text-lg font-bold">
                Brutus Target Lab
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This tests the wick-scalp idea directly: enter at the
                approximate pierce, then use 5m candles to see whether a fixed
                target or stop is hit first. If target and stop both appear
                inside the same 5m candle, the app counts it as a stop.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[1180px] font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Target model</th>
                      <th className="py-2 text-right">Signals</th>
                      <th className="py-2 text-right">TP</th>
                      <th className="py-2 text-right">Stop</th>
                      <th className="py-2 text-right">Close</th>
                      <th className="py-2 text-right">Win</th>
                      <th className="py-2 text-right">Avg</th>
                      <th className="py-2 text-right">Total</th>
                      <th className="py-2 text-right">Same 5m</th>
                      <th className="py-2 text-right">$ est.</th>
                      <th className="py-2 text-left">Plain read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetRows.slice(0, 18).map((row) => {
                      const enough = row.stats.signals >= 30;
                      const good =
                        enough &&
                        row.stats.avgPoints > 5 &&
                        row.stats.winRate >= 0.58;
                      const weak =
                        row.stats.avgPoints <= 0 || row.stats.winRate < 0.45;
                      return (
                        <tr
                          key={row.model.label}
                          className="border-b border-border/40"
                        >
                          <td className="py-2">{row.model.label}</td>
                          <td className="py-2 text-right">
                            {row.stats.signals}
                          </td>
                          <td className="py-2 text-right">{row.tpHits}</td>
                          <td className="py-2 text-right">{row.stopHits}</td>
                          <td className="py-2 text-right">{row.closeExits}</td>
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
                            {row.conservativeSameCandle}
                          </td>
                          <td className="py-2 text-right">
                            {fmtMoney(row.stats.estimatedDollarPnl)}
                          </td>
                          <td className="py-2">
                            {good
                              ? "Scalp candidate"
                              : weak
                                ? "Avoid for now"
                                : "Needs tighter filter"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

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
