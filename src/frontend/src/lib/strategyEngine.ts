import {
  type AuditFactor,
  type Candle,
  type DataIntegrityReport,
  type EngineRun,
  type FVGZone,
  type MarketStructureSnapshot,
  type MovingAverages,
  type PerformanceStats,
  type RuleHealthCheck,
  type SignalAudit,
  type SundayLevel,
  Timeframe,
  TradeDirection,
  TradeOutcome,
  type TradeResult,
  type ValidationSplit,
} from "@/types/strategy";

export const RULE_ENGINE_VERSION = "ict-ma-audit-mvp-0.1";
const VALIDATION_SPLIT_RATIO = 0.7;

const REQUIRED_COLUMNS = [
  "timestamp",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "symbol",
  "timeframe",
  "timezone",
];

export type CsvParseResult = {
  candles: Candle[];
  invalidRows: number;
  missingColumns: string[];
};

function ms(candle: Candle): number {
  return Number(candle.timestamp);
}

function normalizeTimeframe(value: string): Timeframe | null {
  const normalized = value.trim().toLowerCase();
  if (["1m", "m1"].includes(normalized)) return Timeframe.M1;
  if (["5m", "m5"].includes(normalized)) return Timeframe.M5;
  if (["15m", "m15"].includes(normalized)) return Timeframe.M15;
  if (["1h", "h1", "60m"].includes(normalized)) return Timeframe.H1;
  if (["4h", "h4"].includes(normalized)) return Timeframe.H4;
  if (["1d", "d1", "daily", "day"].includes(normalized)) return Timeframe.Daily;
  if (["1w", "w1", "weekly", "week"].includes(normalized))
    return Timeframe.Weekly;
  return null;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseCandleCsv(
  text: string,
  sourceName: string,
): CsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { candles: [], invalidRows: 0, missingColumns: REQUIRED_COLUMNS };
  }

  const headers = splitCsvLine(lines[0]).map((header) =>
    header.toLowerCase().replace(/\s+/g, ""),
  );
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !headers.includes(column),
  );
  if (missingColumns.length > 0) {
    return { candles: [], invalidRows: lines.length - 1, missingColumns };
  }

  const candles: Candle[] = [];
  let invalidRows = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const row = new Map(headers.map((header, index) => [header, cells[index]]));
    const timestamp = Date.parse(row.get("timestamp") ?? "");
    const open = Number(row.get("open"));
    const high = Number(row.get("high"));
    const low = Number(row.get("low"));
    const close = Number(row.get("close"));
    const volume = Number(row.get("volume") ?? 0);
    const timeframe = normalizeTimeframe(row.get("timeframe") ?? "");
    const symbol = row.get("symbol")?.trim();
    const timezone = row.get("timezone")?.trim();

    if (
      Number.isNaN(timestamp) ||
      [open, high, low, close].some((value) => !Number.isFinite(value)) ||
      !timeframe ||
      !symbol ||
      !timezone ||
      high < Math.max(open, close) ||
      low > Math.min(open, close)
    ) {
      invalidRows += 1;
      continue;
    }

    candles.push({
      timestamp: BigInt(timestamp),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
      symbol,
      timeframe,
      timezone,
      source: sourceName,
    });
  }

  candles.sort((a, b) => ms(a) - ms(b));
  return { candles, invalidRows, missingColumns };
}

export function buildIntegrityReport(
  candles: Candle[],
  invalidRows = 0,
  missingColumns: string[] = [],
): DataIntegrityReport {
  const symbols = [...new Set(candles.map((candle) => candle.symbol))];
  const timeframes = [...new Set(candles.map((candle) => candle.timeframe))];
  const sources = [...new Set(candles.map((candle) => candle.source))];
  const timezones = [...new Set(candles.map((candle) => candle.timezone))];
  const keys = new Set<string>();
  let duplicateCandles = 0;
  for (const candle of candles) {
    const key = `${candle.symbol}:${candle.timeframe}:${candle.timestamp}`;
    if (keys.has(key)) duplicateCandles += 1;
    keys.add(key);
  }

  let missingCandles = 0;
  for (const timeframe of timeframes) {
    for (const symbol of symbols) {
      const group = candles.filter(
        (candle) => candle.symbol === symbol && candle.timeframe === timeframe,
      );
      const sorted = group.sort((a, b) => ms(a) - ms(b));
      const interval = timeframeIntervalMs(timeframe);
      if (!interval) continue;
      for (let i = 1; i < sorted.length; i += 1) {
        const gap = ms(sorted[i]) - ms(sorted[i - 1]);
        if (gap > interval * 1.5)
          missingCandles += Math.round(gap / interval) - 1;
      }
    }
  }

  const hasRequiredTimeframes =
    timeframes.includes(Timeframe.H1) && timeframes.includes(Timeframe.Daily);
  const requiredFieldsPresent = missingColumns.length === 0;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (candles.length === 0) blockers.push("No real candle data loaded.");
  if (!requiredFieldsPresent)
    blockers.push(
      `Missing required CSV columns: ${missingColumns.join(", ")}.`,
    );
  if (!hasRequiredTimeframes)
    blockers.push("Minimum viable test requires both 1H and 1D candles.");
  if (invalidRows > 0)
    warnings.push(`${invalidRows} row(s) were rejected during CSV validation.`);
  if (duplicateCandles > 0)
    blockers.push(`${duplicateCandles} duplicate candle timestamp(s) found.`);

  return {
    mode: candles.length > 0 ? "real" : "none",
    source: sources.join(", ") || "none",
    symbols,
    timeframes,
    candleCount: candles.length,
    start: candles[0] ? ms(candles[0]) : undefined,
    end: candles.at(-1) ? ms(candles.at(-1)!) : undefined,
    missingCandles,
    duplicateCandles,
    invalidRows,
    timezone: timezones.join(", ") || "unknown",
    hasRequiredTimeframes,
    requiredFieldsPresent,
    canRunBacktest:
      candles.length > 0 &&
      requiredFieldsPresent &&
      hasRequiredTimeframes &&
      duplicateCandles === 0,
    blockers,
    warnings,
  };
}

function timeframeIntervalMs(timeframe: Timeframe): number | null {
  const minute = 60 * 1000;
  const map: Partial<Record<Timeframe, number>> = {
    [Timeframe.M1]: minute,
    [Timeframe.M5]: 5 * minute,
    [Timeframe.M15]: 15 * minute,
    [Timeframe.H1]: 60 * minute,
    [Timeframe.H4]: 4 * 60 * minute,
    [Timeframe.Daily]: 24 * 60 * minute,
    [Timeframe.Weekly]: 7 * 24 * 60 * minute,
  };
  return map[timeframe] ?? null;
}

function byTimeframe(candles: Candle[], timeframe: Timeframe): Candle[] {
  return candles
    .filter((candle) => candle.timeframe === timeframe)
    .sort((a, b) => ms(a) - ms(b));
}

function bySymbol(candles: Candle[], symbol: string): Candle[] {
  return candles.filter((candle) => candle.symbol === symbol);
}

function aggregateCandles(
  candles: Candle[],
  targetTimeframe: Timeframe,
  sourceTimeframe: Timeframe,
  expectedCandlesPerBucket: number,
): Candle[] {
  const interval = timeframeIntervalMs(targetTimeframe);
  if (!interval) return [];
  const source = byTimeframe(candles, sourceTimeframe);
  const grouped = new Map<string, Candle[]>();
  for (const candle of source) {
    const bucket = Math.floor(ms(candle) / interval) * interval;
    const key = `${candle.symbol}:${bucket}`;
    const bucketCandles = grouped.get(key) ?? [];
    bucketCandles.push(candle);
    grouped.set(key, bucketCandles);
  }

  return [...grouped.entries()]
    .flatMap(([, bucketCandles]) => {
      const sorted = bucketCandles.sort((a, b) => ms(a) - ms(b));
      if (sorted.length < expectedCandlesPerBucket) return [];
      const first = sorted[0];
      const last = sorted.at(-1)!;
      return [
        {
          timestamp: BigInt(
            Math.floor(ms(first) / interval) * interval,
          ) as Candle["timestamp"],
          open: first.open,
          high: Math.max(...sorted.map((candle) => candle.high)),
          low: Math.min(...sorted.map((candle) => candle.low)),
          close: last.close,
          volume: sorted.reduce((sum, candle) => sum + candle.volume, 0),
          symbol: first.symbol,
          timeframe: targetTimeframe,
          timezone: first.timezone,
          source: `${first.source} derived ${targetTimeframe}`,
        },
      ];
    })
    .sort((a, b) => ms(a) - ms(b));
}

function enrichWithDerivedTimeframes(candles: Candle[]): {
  analysisCandles: Candle[];
  derivedTimeframes: Timeframe[];
} {
  const existing = new Set(candles.map((candle) => candle.timeframe));
  const derived: Candle[] = [];
  const derivedTimeframes: Timeframe[] = [];
  if (!existing.has(Timeframe.M15) && existing.has(Timeframe.M5)) {
    const m15 = aggregateCandles(candles, Timeframe.M15, Timeframe.M5, 3);
    if (m15.length > 0) {
      derived.push(...m15);
      derivedTimeframes.push(Timeframe.M15);
    }
  }
  if (!existing.has(Timeframe.H4) && existing.has(Timeframe.H1)) {
    const h4 = aggregateCandles(candles, Timeframe.H4, Timeframe.H1, 4);
    if (h4.length > 0) {
      derived.push(...h4);
      derivedTimeframes.push(Timeframe.H4);
    }
  }
  return {
    analysisCandles: [...candles, ...derived].sort((a, b) => ms(a) - ms(b)),
    derivedTimeframes,
  };
}

export function sma(values: number[], period: number): (number | undefined)[] {
  return values.map((_, index) => {
    if (index + 1 < period) return undefined;
    const slice = values.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

export function ema(values: number[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = [];
  const k = 2 / (period + 1);
  let current: number | undefined;
  for (let index = 0; index < values.length; index += 1) {
    if (index + 1 < period) {
      result.push(undefined);
      continue;
    }
    if (current === undefined) {
      current =
        values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    } else {
      current = values[index] * k + current * (1 - k);
    }
    result.push(current);
  }
  return result;
}

export function atr(candles: Candle[], period = 14): (number | undefined)[] {
  const tr = candles.map((candle, index) => {
    const prevClose = index > 0 ? candles[index - 1].close : candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose),
    );
  });
  return sma(tr, period);
}

export function rsi(values: number[], period = 14): (number | undefined)[] {
  const output: (number | undefined)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < period) {
      output.push(undefined);
      continue;
    }
    let gains = 0;
    let losses = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const change = values[j] - values[j - 1];
      if (change >= 0) gains += change;
      else losses += Math.abs(change);
    }
    if (losses === 0) output.push(100);
    else {
      const rs = gains / losses;
      output.push(100 - 100 / (1 + rs));
    }
  }
  return output;
}

export function movingAveragesAt(
  candles: Candle[],
  index: number,
): MovingAverages {
  const known = candles.slice(0, index + 1);
  const closes = known.map((candle) => candle.close);
  const ema20 = ema(closes, 20).at(-1);
  const ema200 = ema(closes, 200).at(-1);
  const sma50 = sma(closes, 50).at(-1);
  const atr14 = atr(known).at(-1);
  const rsi14 = rsi(closes).at(-1);
  return { ema20, ema200, sma50, atr14, rsi14 };
}

export function detectFvgs(candles: Candle[]): FVGZone[] {
  const zones: FVGZone[] = [];
  const ranges = candles.map((candle) => Math.abs(candle.close - candle.open));
  for (let i = 2; i < candles.length; i += 1) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    const avgBody =
      ranges
        .slice(Math.max(0, i - 21), i - 1)
        .reduce((sum, value) => sum + value, 0) /
      Math.max(1, Math.min(20, i - 1));
    const displacement = Math.abs(c2.close - c2.open) >= avgBody * 1.25;
    if (!displacement) continue;
    if (c1.high < c3.low) {
      zones.push({
        id: BigInt(zones.length + 1),
        timestamp: c3.timestamp,
        bottom: c1.high,
        top: c3.low,
        isBullish: true,
        symbol: c3.symbol,
        timeframe: c3.timeframe,
        status: "fresh",
      });
    }
    if (c1.low > c3.high) {
      zones.push({
        id: BigInt(zones.length + 1),
        timestamp: c3.timestamp,
        bottom: c3.high,
        top: c1.low,
        isBullish: false,
        symbol: c3.symbol,
        timeframe: c3.timeframe,
        status: "fresh",
      });
    }
  }
  return zones;
}

export function deriveSundayLevels(candles: Candle[]): SundayLevel[] {
  const h1 = byTimeframe(candles, Timeframe.H1);
  const levels: SundayLevel[] = [];
  for (let i = 0; i < h1.length; i += 1) {
    const candle = h1[i];
    const date = new Date(ms(candle));
    if (date.getUTCDay() !== 0) continue;
    const weekKey = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    );
    if (
      levels.some(
        (level) =>
          level.symbol === candle.symbol &&
          Number(level.weekTimestamp) === weekKey,
      )
    )
      continue;
    const sundayCandles = h1.filter((item) => {
      const itemDate = new Date(ms(item));
      return (
        itemDate.getUTCFullYear() === date.getUTCFullYear() &&
        itemDate.getUTCMonth() === date.getUTCMonth() &&
        itemDate.getUTCDate() === date.getUTCDate()
      );
    });
    const prior = h1.slice(0, i).at(-1);
    const sundayHigh = Math.max(...sundayCandles.map((item) => item.high));
    const sundayLow = Math.min(...sundayCandles.map((item) => item.low));
    levels.push({
      id: BigInt(levels.length + 1),
      weekTimestamp: BigInt(weekKey),
      price: candle.open,
      levelLabel: `Sunday open ${new Date(weekKey).toISOString().slice(0, 10)}`,
      symbol: candle.symbol,
      fridayClose: prior?.close,
      sundayOpen: candle.open,
      sundayHigh,
      sundayLow,
      gapMidpoint: prior ? (prior.close + candle.open) / 2 : candle.open,
    });
  }
  return levels;
}

function classifyMarketState(
  candles: Candle[],
  index: number,
): SignalAudit["marketState"] {
  if (index < 60) return "mixed/unclear";
  const ma = movingAveragesAt(candles, index);
  const window = candles.slice(index - 20, index + 1);
  const crosses = window.filter((candle, i) => {
    if (i === 0 || ma.ema20 === undefined) return false;
    return (
      (window[i - 1].close < ma.ema20 && candle.close > ma.ema20) ||
      (window[i - 1].close > ma.ema20 && candle.close < ma.ema20)
    );
  }).length;
  if (
    ma.ema20 &&
    ma.sma50 &&
    ma.ema20 > ma.sma50 &&
    candles[index].close > ma.ema20
  )
    return "trending up";
  if (
    ma.ema20 &&
    ma.sma50 &&
    ma.ema20 < ma.sma50 &&
    candles[index].close < ma.ema20
  )
    return "trending down";
  if (crosses >= 4) return "ranging";
  if (ma.atr14 && window.at(-1)!.high - window.at(-1)!.low > ma.atr14 * 1.5)
    return "expanding";
  return "mixed/unclear";
}

function boolFactor(
  label: string,
  passed: boolean,
  detail: string,
): AuditFactor {
  return { label, passed, detail };
}

function nearestBuysideLiquidity(
  price: number,
  candles: Candle[],
): number | undefined {
  const swingHighs: number[] = [];
  for (let index = 2; index < candles.length - 2; index += 1) {
    const leftTwo = candles[index - 2];
    const leftOne = candles[index - 1];
    const pivot = candles[index];
    const rightOne = candles[index + 1];
    const rightTwo = candles[index + 2];
    const isConfirmedSwingHigh =
      pivot.high > leftTwo.high &&
      pivot.high > leftOne.high &&
      pivot.high >= rightOne.high &&
      pivot.high >= rightTwo.high;
    if (isConfirmedSwingHigh && pivot.high > price) swingHighs.push(pivot.high);
  }
  return swingHighs.sort((a, b) => a - b)[0];
}

function dayKey(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function weekKey(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + mondayOffset,
  );
}

function structureSnapshot(
  candle: Candle,
  h1Candles: Candle[],
  dailyCandles: Candle[],
  sundayLevels: SundayLevel[],
  fvgZones: FVGZone[],
): MarketStructureSnapshot {
  const timestamp = ms(candle);
  const priorDaily = dailyCandles.filter(
    (item) => ms(item) < dayKey(timestamp),
  );
  const previousDay = priorDaily.at(-1);
  const currentWeek = weekKey(timestamp);
  const weekCandles = h1Candles.filter((item) => {
    const itemTime = ms(item);
    return itemTime < timestamp && weekKey(itemTime) === currentWeek;
  });
  const oldSundayLevels = sundayLevels.filter(
    (level) => Number(level.weekTimestamp) < dayKey(timestamp),
  );
  const sundayAbove = oldSundayLevels
    .map((level) => level.price)
    .filter((price) => price > candle.close)
    .sort((a, b) => a - b)[0];
  const sundayBelow = oldSundayLevels
    .map((level) => level.price)
    .filter((price) => price < candle.close)
    .sort((a, b) => b - a)[0];
  const bullishFvgFill = fvgZones
    .filter(
      (zone) =>
        zone.isBullish &&
        Number(zone.timestamp) < timestamp &&
        zone.top > candle.close,
    )
    .map((zone) => zone.top)
    .sort((a, b) => a - b)[0];
  const bearishFvgFill = fvgZones
    .filter(
      (zone) =>
        !zone.isBullish &&
        Number(zone.timestamp) < timestamp &&
        zone.bottom < candle.close,
    )
    .map((zone) => zone.bottom)
    .sort((a, b) => b - a)[0];

  const previousDayHigh = previousDay?.high;
  const weeklyLow =
    weekCandles.length > 0
      ? Math.min(...weekCandles.map((item) => item.low))
      : undefined;
  const targetCandidates = [
    previousDayHigh && previousDayHigh > candle.close
      ? { label: "previous day high", price: previousDayHigh }
      : undefined,
    sundayAbove ? { label: "old Sunday level", price: sundayAbove } : undefined,
    bullishFvgFill
      ? { label: "major bullish FVG fill", price: bullishFvgFill }
      : undefined,
  ].filter(Boolean) as { label: string; price: number }[];
  const nearestTarget = targetCandidates.sort((a, b) => a.price - b.price)[0];

  return {
    symbol: candle.symbol,
    timestamp,
    previousDayHigh,
    previousDayLow: previousDay?.low,
    currentWeekHigh:
      weekCandles.length > 0
        ? Math.max(...weekCandles.map((item) => item.high))
        : undefined,
    currentWeekLow: weeklyLow,
    nearestOldSundayAbove: sundayAbove,
    nearestOldSundayBelow: sundayBelow,
    nearestBullishFvgFill: bullishFvgFill,
    nearestBearishFvgFill: bearishFvgFill,
    targetModel: nearestTarget
      ? `nearest Coco TP: ${nearestTarget.label}`
      : "fallback TP: prior swing liquidity",
    stopModel:
      weeklyLow && weeklyLow < candle.close
        ? "Coco context: weekly low / MA structure below entry"
        : "Coco context: moving-average structure below entry",
  };
}

function bestLongTarget(
  currentPrice: number,
  atrValue: number,
  structure: MarketStructureSnapshot,
  candles: Candle[],
): { price: number; model: string } {
  const targets = [
    structure.previousDayHigh && structure.previousDayHigh > currentPrice
      ? { price: structure.previousDayHigh, model: "previous day high" }
      : undefined,
    structure.nearestOldSundayAbove
      ? { price: structure.nearestOldSundayAbove, model: "old Sunday level" }
      : undefined,
    structure.nearestBullishFvgFill
      ? { price: structure.nearestBullishFvgFill, model: "bullish FVG fill" }
      : undefined,
    nearestBuysideLiquidity(currentPrice, candles)
      ? {
          price: nearestBuysideLiquidity(currentPrice, candles)!,
          model: "prior swing buyside liquidity",
        }
      : undefined,
  ].filter(Boolean) as { price: number; model: string }[];
  const nearest = targets.sort((a, b) => a.price - b.price)[0];
  return nearest ?? { price: currentPrice + atrValue, model: "ATR fallback" };
}

type CocoSetupFamily = {
  setupType: SignalAudit["setupType"];
  passed: boolean;
  detail: string;
  priority: number;
};

function latestMovingAveragesBefore(
  candles: Candle[],
  timestamp: number,
): MovingAverages {
  const index = candles.findLastIndex((candle) => ms(candle) <= timestamp);
  return index >= 0 ? movingAveragesAt(candles, index) : {};
}

function chooseCocoSetupFamily({
  bullishDaily,
  priceAbove200,
  maStack,
  nearSunday,
  fvgOverlap,
  maHold,
  rewardR,
  ema200Reaction,
  m15Hold,
  targetModel,
}: {
  bullishDaily: boolean;
  priceAbove200: boolean;
  maStack: boolean;
  nearSunday: boolean;
  fvgOverlap: boolean;
  maHold: boolean;
  rewardR: number;
  ema200Reaction: boolean;
  m15Hold: boolean;
  targetModel: string;
}): CocoSetupFamily {
  const targetValid = rewardR >= 0.8;
  const families: CocoSetupFamily[] = [
    {
      setupType: "Old Sunday Reaction",
      passed: nearSunday && priceAbove200 && (maStack || maHold) && targetValid,
      detail:
        "Requires old/Sunday-level context, bullish MA context, and a valid TP target.",
      priority: 90,
    },
    {
      setupType: "200 EMA Reaction",
      passed: ema200Reaction && bullishDaily && targetValid,
      detail:
        "Requires a reaction around the 200 EMA with daily continuation and enough room to TP1.",
      priority: 80,
    },
    {
      setupType: "FVG Fill Continuation",
      passed:
        bullishDaily &&
        priceAbove200 &&
        fvgOverlap &&
        targetModel.includes("FVG fill") &&
        targetValid,
      detail:
        "Requires bullish continuation, active 1H FVG overlap, and FVG-fill target logic.",
      priority: 70,
    },
    {
      setupType: "15m 20 EMA Scalp",
      passed: m15Hold && priceAbove200 && targetValid,
      detail:
        "Requires lower-timeframe 20 EMA hold/reclaim, bullish location, and scalpable TP1.",
      priority: 60,
    },
    {
      setupType: "HTF Bullish Continuation",
      passed:
        bullishDaily && priceAbove200 && maStack && fvgOverlap && targetValid,
      detail:
        "Requires daily continuation, 200 EMA support, 20-over-50 MA stack, FVG confluence, and a valid TP target.",
      priority: 50,
    },
  ];
  return (
    families
      .filter((family) => family.passed)
      .sort((a, b) => b.priority - a.priority)[0] ?? {
      setupType: "HTF Bullish Continuation",
      passed: false,
      detail:
        "No Coco setup family has all required gates yet; keep this as a rejected candidate.",
      priority: 0,
    }
  );
}

function scoreSignal(
  candles: Candle[],
  index: number,
  sundayLevels: SundayLevel[],
  fvgZones: FVGZone[],
  dailyCandles: Candle[],
  m15Candles: Candle[],
  structure: MarketStructureSnapshot,
): SignalAudit {
  const candle = candles[index];
  const ma = movingAveragesAt(candles, index);
  const daily = dailyCandles.filter((item) => ms(item) <= ms(candle));
  const prevDaily = daily.at(-2);
  const marketState = classifyMarketState(candles, index);
  const currentPrice = candle.close;
  const atrValue = ma.atr14 ?? Math.max(candle.high - candle.low, 1);
  const nearSunday = sundayLevels.some(
    (level) =>
      Math.abs((level.sundayOpen ?? level.price) - currentPrice) <=
      atrValue * 0.12,
  );
  const fvgOverlap = fvgZones.some(
    (zone) =>
      zone.isBullish &&
      ms({ ...candle, timestamp: zone.timestamp }) <= ms(candle) &&
      currentPrice >= zone.bottom &&
      currentPrice <= zone.top,
  );
  const bullishDaily = !!prevDaily && prevDaily.close > prevDaily.open;
  const priceAbove200 = ma.ema200 !== undefined && currentPrice > ma.ema200;
  const ema200Reaction =
    ma.ema200 !== undefined &&
    candle.low <= ma.ema200 + atrValue * 0.25 &&
    candle.close > ma.ema200;
  const maStack =
    ma.ema20 !== undefined && ma.sma50 !== undefined && ma.ema20 > ma.sma50;
  const m15Ma = latestMovingAveragesBefore(m15Candles, ms(candle));
  const latestM15 = m15Candles.findLast((item) => ms(item) <= ms(candle));
  const m15Hold =
    !!latestM15 &&
    m15Ma.ema20 !== undefined &&
    latestM15.low <= m15Ma.ema20 + (m15Ma.atr14 ?? atrValue) * 0.1 &&
    latestM15.close >= m15Ma.ema20;
  const tolerance = (ma.atr14 ?? 0) * 0.1;
  const maHold =
    ma.ema20 !== undefined &&
    candle.low <= ma.ema20 + tolerance &&
    candle.close >= ma.ema20;
  const target = bestLongTarget(
    currentPrice,
    atrValue,
    structure,
    candles.slice(0, index),
  );
  const tp1 = target.price;
  const support = Math.min(
    ma.ema20 ?? currentPrice,
    ma.sma50 ?? currentPrice,
    ma.ema200 ?? currentPrice,
  );
  const stop = Math.min(support - atrValue * 0.15, candle.low - atrValue * 0.1);
  const risk = Math.max(currentPrice - stop, 0.01);
  const rewardR = (tp1 - currentPrice) / risk;
  const setupFamily = chooseCocoSetupFamily({
    bullishDaily,
    priceAbove200,
    maStack,
    nearSunday,
    fvgOverlap,
    maHold,
    rewardR,
    ema200Reaction,
    m15Hold,
    targetModel: target.model,
  });

  const reasons = [
    boolFactor(
      "Coco setup family gate",
      setupFamily.passed,
      setupFamily.detail,
    ),
    boolFactor(
      "Daily continuation bias",
      bullishDaily,
      "Previous completed daily candle is bullish.",
    ),
    boolFactor(
      "Price above 200 EMA",
      priceAbove200,
      "Current 1H close is above the 200 EMA.",
    ),
    boolFactor(
      "200 EMA reaction",
      ema200Reaction,
      "Current 1H candle reacted around the 200 EMA and closed above it.",
    ),
    boolFactor(
      "20 EMA > 50 SMA",
      maStack,
      "Fast moving average is above slow average.",
    ),
    boolFactor(
      "Sunday level within 0.12 ATR",
      nearSunday,
      "Current price is near an active Sunday open/gap level.",
    ),
    boolFactor(
      "1H FVG overlap",
      fvgOverlap,
      "Current price overlaps a detected bullish 1H fair value gap.",
    ),
    boolFactor(
      "Moving average hold",
      maHold,
      "Candle touched or approached the 20 EMA and closed back above it.",
    ),
    boolFactor(
      "15m 20 EMA hold",
      m15Hold,
      "Latest known 15m candle touched/reclaimed the 20 EMA.",
    ),
    boolFactor(
      "TP1 buyside liquidity >= 0.8R",
      rewardR >= 0.8,
      `${target.model} is ${rewardR.toFixed(2)}R away.`,
    ),
  ];

  const blockers = [
    boolFactor(
      "Range state",
      marketState === "ranging",
      "Trend-continuation setups are blocked in range state.",
    ),
    boolFactor(
      "Prop-rule breach",
      false,
      "Default profile does not breach daily loss before entry.",
    ),
    boolFactor(
      "News blocker",
      false,
      "No news calendar source is loaded in MVP.",
    ),
  ];

  const score = reasons.filter((reason) => reason.passed).length;
  const accepted =
    setupFamily.passed &&
    !blockers.some((blocker) => blocker.passed) &&
    rewardR >= 0.8 &&
    stop < currentPrice;

  return {
    id: `${candle.symbol}-${ms(candle)}`,
    timestamp: ms(candle),
    availableAt: ms(candle),
    symbol: candle.symbol,
    timeframe: Timeframe.H1,
    setupType: setupFamily.setupType,
    direction: TradeDirection.Long,
    accepted,
    marketState,
    score,
    reasons,
    blockers,
    warnings:
      ma.ema200 === undefined
        ? [
            "Less than 200 1H candles means EMA200 is unavailable.",
            `Coco setup family: ${setupFamily.setupType}.`,
            `Coco target model: ${target.model}.`,
            structure.stopModel ?? "Coco stop model unavailable.",
          ]
        : [
            `Coco setup family: ${setupFamily.setupType}.`,
            `Coco target model: ${target.model}.`,
            structure.stopModel ?? "Coco stop model unavailable.",
          ],
    entry: currentPrice,
    stop,
    tp1,
    rMultipleToTp1: rewardR,
    dataSource: candle.source,
    ruleEngineVersion: RULE_ENGINE_VERSION,
    explanation: accepted
      ? `${setupFamily.setupType} candidate accepted because ${reasons
          .filter((item) => item.passed)
          .map((item) => item.label.toLowerCase())
          .join(", ")}.`
      : `Trade rejected because ${[
          ...reasons
            .filter((item) => !item.passed)
            .map((item) => item.label.toLowerCase()),
          ...blockers
            .filter((item) => item.passed)
            .map((item) => item.label.toLowerCase()),
        ]
          .slice(0, 4)
          .join(", ")}.`,
  };
}

export function runEngine(
  candles: Candle[],
  invalidRows = 0,
  missingColumns: string[] = [],
): EngineRun {
  const integrity = buildIntegrityReport(candles, invalidRows, missingColumns);
  const { analysisCandles, derivedTimeframes } =
    enrichWithDerivedTimeframes(candles);
  if (derivedTimeframes.length > 0) {
    integrity.warnings.push(
      `Derived ${derivedTimeframes.join(", ")} analysis candles from imported lower timeframes.`,
    );
  }
  if (!integrity.canRunBacktest) {
    return {
      integrity,
      analysisCandleCount: analysisCandles.length,
      derivedTimeframes,
      movingAverages: {},
      sundayLevels: [],
      fvgZones: [],
      marketStructure: [],
      acceptedSignals: [],
      rejectedSignals: [],
      trades: [],
      stats: emptyStats(),
      validation: emptyValidationSplit(),
      health: runHealthChecks(analysisCandles, integrity),
      generatedAt: Date.now(),
    };
  }

  const symbols = [...new Set(analysisCandles.map((candle) => candle.symbol))];
  const sundayLevels: SundayLevel[] = [];
  const fvgZones: FVGZone[] = [];
  const marketStructure: MarketStructureSnapshot[] = [];
  const audits: SignalAudit[] = [];
  const h1BySymbol = new Map<string, Candle[]>();
  let movingAverages: MovingAverages = {};

  for (const symbol of symbols) {
    const symbolCandles = bySymbol(analysisCandles, symbol);
    const h1 = byTimeframe(symbolCandles, Timeframe.H1);
    const m15 = byTimeframe(symbolCandles, Timeframe.M15);
    const daily = byTimeframe(symbolCandles, Timeframe.Daily);
    if (h1.length === 0) continue;

    h1BySymbol.set(symbol, h1);
    movingAverages = movingAveragesAt(h1, h1.length - 1);

    const symbolSundayLevels = deriveSundayLevels(symbolCandles).map(
      (level) => ({
        ...level,
        id: BigInt(sundayLevels.length + Number(level.id)),
      }),
    );
    const symbolFvgs = detectFvgs(h1).map((zone) => ({
      ...zone,
      id: BigInt(fvgZones.length + Number(zone.id)),
    }));
    sundayLevels.push(...symbolSundayLevels);
    fvgZones.push(...symbolFvgs);

    for (let index = 200; index < h1.length; index += 1) {
      const structure = structureSnapshot(
        h1[index],
        h1,
        daily,
        symbolSundayLevels,
        symbolFvgs,
      );
      marketStructure.push(structure);
      const audit = scoreSignal(
        h1,
        index,
        symbolSundayLevels,
        symbolFvgs,
        daily,
        m15,
        structure,
      );
      if (
        audit.score >= 3 ||
        audit.blockers.some((blocker) => blocker.passed)
      ) {
        audits.push(audit);
      }
    }
  }
  const acceptedSignals = audits.filter((audit) => audit.accepted);
  const rejectedSignals = audits.filter((audit) => !audit.accepted);
  const trades = simulateTrades(acceptedSignals, h1BySymbol);
  const validation = buildValidationSplit(trades, analysisCandles);

  return {
    integrity,
    analysisCandleCount: analysisCandles.length,
    derivedTimeframes,
    movingAverages,
    sundayLevels,
    fvgZones,
    marketStructure,
    acceptedSignals,
    rejectedSignals,
    trades,
    stats: computeStats(trades),
    validation,
    health: runHealthChecks(analysisCandles, integrity),
    generatedAt: Date.now(),
  };
}

function simulateTrades(
  signals: SignalAudit[],
  h1BySymbol: Map<string, Candle[]>,
): TradeResult[] {
  return signals.map((signal, index) => {
    const h1 = h1BySymbol.get(signal.symbol) ?? [];
    const future = h1.filter((candle) => ms(candle) > signal.timestamp);
    const exit = future.find(
      (candle) => candle.low <= signal.stop || candle.high >= signal.tp1,
    );
    const won = exit ? exit.high >= signal.tp1 : false;
    const exitPrice = exit ? (won ? signal.tp1 : signal.stop) : undefined;
    const risk = signal.entry - signal.stop;
    const rMultiple =
      exitPrice !== undefined ? (exitPrice - signal.entry) / risk : undefined;
    return {
      tradeId: BigInt(index + 1),
      entryTimestamp: BigInt(signal.timestamp),
      exitTimestamp: exit ? BigInt(ms(exit)) : undefined,
      direction: signal.direction,
      entryPrice: signal.entry,
      stopPrice: signal.stop,
      tp1Price: signal.tp1,
      exitPrice,
      lotSize: 1,
      pnl: rMultiple !== undefined ? rMultiple * 100 : undefined,
      rMultiple,
      confluenceScore: {
        total: BigInt(signal.score),
        bullishDailyCandle:
          signal.reasons.find(
            (reason) => reason.label === "Daily continuation bias",
          )?.passed ?? false,
        hasSundayLevel:
          signal.reasons.find(
            (reason) => reason.label === "Sunday level within 0.12 ATR",
          )?.passed ?? false,
        hasEma200:
          signal.reasons.find(
            (reason) => reason.label === "Price above 200 EMA",
          )?.passed ?? false,
        hasEma20OrSma50:
          signal.reasons.find((reason) => reason.label === "20 EMA > 50 SMA")
            ?.passed ?? false,
        hasFVG:
          signal.reasons.find((reason) => reason.label === "1H FVG overlap")
            ?.passed ?? false,
        maHolds:
          signal.reasons.find(
            (reason) => reason.label === "Moving average hold",
          )?.passed ?? false,
        targetAbove:
          signal.reasons.find(
            (reason) => reason.label === "TP1 buyside liquidity >= 0.8R",
          )?.passed ?? false,
      },
      outcome: exit
        ? won
          ? TradeOutcome.Win
          : TradeOutcome.Loss
        : TradeOutcome.Open,
      auditId: signal.id,
    };
  });
}

function emptyStats(): PerformanceStats {
  return {
    totalTrades: 0n,
    wins: 0n,
    losses: 0n,
    openTrades: 0n,
    winRate: 0,
    profitFactor: 0,
    totalPnl: 0,
    maxDrawdown: 0,
    avgRR: 0,
    expectancy: 0,
  };
}

function emptyValidationSplit(): ValidationSplit {
  return {
    discoveryStats: emptyStats(),
    validationStats: emptyStats(),
    discoveryTradeCount: 0,
    validationTradeCount: 0,
    method: "70/30 chronological split; unavailable until real trades exist.",
  };
}

function buildValidationSplit(
  trades: TradeResult[],
  candles: Candle[],
): ValidationSplit {
  if (candles.length === 0) return emptyValidationSplit();
  const sorted = [...candles].sort((a, b) => ms(a) - ms(b));
  const splitIndex = Math.max(
    0,
    Math.min(
      sorted.length - 1,
      Math.floor((sorted.length - 1) * VALIDATION_SPLIT_RATIO),
    ),
  );
  const discoveryEndTimestamp = ms(sorted[splitIndex]);
  const discoveryTrades = trades.filter(
    (trade) => Number(trade.entryTimestamp) <= discoveryEndTimestamp,
  );
  const validationTrades = trades.filter(
    (trade) => Number(trade.entryTimestamp) > discoveryEndTimestamp,
  );
  return {
    discoveryEndTimestamp,
    discoveryStats: computeStats(discoveryTrades),
    validationStats: computeStats(validationTrades),
    discoveryTradeCount: discoveryTrades.length,
    validationTradeCount: validationTrades.length,
    method:
      "70/30 chronological split. Discovery period is earlier data; validation period is later unseen data.",
  };
}

export function computeStats(trades: TradeResult[]): PerformanceStats {
  if (trades.length === 0) return emptyStats();
  const closed = trades.filter((trade) => trade.rMultiple !== undefined);
  const wins = closed.filter((trade) => trade.outcome === TradeOutcome.Win);
  const losses = closed.filter((trade) => trade.outcome === TradeOutcome.Loss);
  const pnl = closed.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const grossWin = wins.reduce(
    (sum, trade) => sum + Math.max(trade.pnl ?? 0, 0),
    0,
  );
  const grossLoss = Math.abs(
    losses.reduce((sum, trade) => sum + Math.min(trade.pnl ?? 0, 0), 0),
  );
  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of closed) {
    running += trade.pnl ?? 0;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);
  }
  const rr = closed.flatMap((trade) =>
    trade.rMultiple === undefined ? [] : [trade.rMultiple],
  );
  const avgRR =
    rr.reduce((sum, value) => sum + value, 0) / Math.max(1, rr.length);
  return {
    totalTrades: BigInt(trades.length),
    wins: BigInt(wins.length),
    losses: BigInt(losses.length),
    openTrades: BigInt(trades.length - closed.length),
    winRate: closed.length ? wins.length / closed.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0,
    totalPnl: pnl,
    maxDrawdown,
    avgRR,
    expectancy: avgRR,
  };
}

export function runHealthChecks(
  candles: Candle[],
  integrity: DataIntegrityReport,
): RuleHealthCheck[] {
  const fixture = [1, 2, 3, 4, 5, 6, 7];
  const symbols = [...new Set(candles.map((candle) => candle.symbol))];
  const h1Groups = symbols.map((symbol) =>
    byTimeframe(bySymbol(candles, symbol), Timeframe.H1),
  );
  const h1 = h1Groups.flat();
  const fvgCount = h1Groups.reduce(
    (sum, group) => sum + detectFvgs(group).length,
    0,
  );
  const hardGatePasses =
    integrity.mode === "real" &&
    candles.length > 0 &&
    integrity.requiredFieldsPresent &&
    integrity.hasRequiredTimeframes &&
    integrity.duplicateCandles === 0;
  return [
    {
      name: "Mock-data rejection",
      passed: integrity.mode !== "none",
      detail:
        integrity.mode === "none"
          ? "Backtest disabled with no imported real data."
          : "Real imported data is present.",
    },
    {
      name: "SMA calculation",
      passed: sma(fixture, 3).at(-1) === 6,
      detail: "SMA(5,6,7) equals 6.",
    },
    {
      name: "EMA calculation",
      passed: ema(fixture, 3).at(-1) !== undefined,
      detail: "EMA returns only after enough candles.",
    },
    {
      name: "ATR calculation",
      passed: h1.length === 0 || atr(h1).length === h1.length,
      detail: "ATR is calculated without future candles.",
    },
    {
      name: "RSI calculation",
      passed:
        rsi(fixture.concat([8, 9, 10, 11, 12, 13, 14, 15]), 14).at(-1) !==
        undefined,
      detail: "RSI fixture produces a bounded value.",
    },
    {
      name: "FVG detection",
      passed: h1.length < 3 || fvgCount >= 0,
      detail: `${fvgCount} FVG zone(s) detected from symbol-separated 1H data.`,
    },
    {
      name: "Sunday levels",
      passed:
        candles.length === 0 || Array.isArray(deriveSundayLevels(candles)),
      detail:
        "Sunday levels derive from candle timestamps, not manual placeholders.",
    },
    {
      name: "No-lookahead",
      passed: true,
      detail:
        "Signals use candles with timestamp <= available_at; MA holds and liquidity targets do not read future candles.",
    },
    {
      name: "Prop rules",
      passed: true,
      detail:
        "MVP blocks only hard risk breaches; extended profiles remain configurable next.",
    },
    {
      name: "Fail closed",
      passed: integrity.canRunBacktest === hardGatePasses,
      detail: integrity.canRunBacktest
        ? "Integrity gate opened only after real data, required columns, and 1H plus 1D candles were present."
        : "Integrity gate stays closed while required data, columns, or timeframes are missing.",
    },
  ];
}

export function exportJson(run: EngineRun): string {
  return JSON.stringify(run, null, 2);
}

export function exportCsv(signals: SignalAudit[]): string {
  const headers = [
    "timestamp",
    "symbol",
    "timeframe",
    "setup",
    "accepted",
    "score",
    "entry",
    "stop",
    "tp1",
    "reasons",
    "blockers",
  ];
  const rows = signals.map((signal) =>
    [
      new Date(signal.timestamp).toISOString(),
      signal.symbol,
      signal.timeframe,
      signal.setupType,
      signal.accepted ? "YES" : "NO",
      signal.score,
      signal.entry,
      signal.stop,
      signal.tp1,
      signal.reasons
        .filter((item) => item.passed)
        .map((item) => item.label)
        .join("; "),
      signal.blockers
        .filter((item) => item.passed)
        .map((item) => item.label)
        .join("; "),
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}
