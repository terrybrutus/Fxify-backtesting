import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import type { Candle } from "@/types/strategy";
import { Timeframe } from "@/types/strategy";
import { useMemo, useState } from "react";

const TIMEFRAME_ORDER = [
  Timeframe.M1,
  Timeframe.M5,
  Timeframe.M15,
  Timeframe.H1,
  Timeframe.H4,
  Timeframe.Daily,
  Timeframe.Weekly,
];

const PRICE_SOURCES = ["open", "high", "low", "close"] as const;
type PriceSource = (typeof PRICE_SOURCES)[number];

interface BrutusPoint {
  candle: Candle;
  index: number;
  timestamp: number;
  timeLabel: string;
  upper?: number;
  lower?: number;
  longSignal: boolean;
  shortSignal: boolean;
}

interface SvgPoint {
  x: number;
  y: number;
}

const CHART_WIDTH = 1200;
const CHART_HEIGHT = 560;
const CHART_PAD = { top: 28, right: 76, bottom: 48, left: 16 };

function getPrice(candle: Candle, source: PriceSource) {
  return candle[source];
}

function ema(values: number[], length: number) {
  const result = new Array<number | undefined>(values.length).fill(undefined);
  if (length < 1 || values.length < length) return result;
  const seed =
    values.slice(0, length).reduce((total, value) => total + value, 0) / length;
  const multiplier = 2 / (length + 1);
  result[length - 1] = seed;
  for (let index = length; index < values.length; index += 1) {
    const previous = result[index - 1] ?? seed;
    result[index] = (values[index] - previous) * multiplier + previous;
  }
  return result;
}

function rollingStdev(values: number[], length: number) {
  const result = new Array<number | undefined>(values.length).fill(undefined);
  if (length < 1 || values.length < length) return result;
  for (let index = length - 1; index < values.length; index += 1) {
    const window = values.slice(index - length + 1, index + 1);
    const average =
      window.reduce((total, value) => total + value, 0) / window.length;
    const variance =
      window.reduce((total, value) => total + (value - average) ** 2, 0) /
      window.length;
    result[index] = Math.sqrt(variance);
  }
  return result;
}

function toPath(points: SvgPoint[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
}

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function toDatetimeLocal(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalDateTime(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function ChartPage() {
  const { candles, run } = useStrategyWorkspace();
  const symbols = useMemo(
    () => [...new Set(candles.map((candle) => candle.symbol))].sort(),
    [candles],
  );
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.H1);
  const [length, setLength] = useState(9);
  const [stdDev, setStdDev] = useState(2);
  const [upperSource, setUpperSource] = useState<PriceSource>("high");
  const [lowerSource, setLowerSource] = useState<PriceSource>("low");
  const [visibleCount, setVisibleCount] = useState(180);
  const [markerInput, setMarkerInput] = useState("2026-06-21T18:10");
  const [showSundayLevels, setShowSundayLevels] = useState(false);
  const symbol = selectedSymbol || symbols[0] || "";

  const availableTimeframes = useMemo(() => {
    const set = new Set(
      candles
        .filter((candle) => !symbol || candle.symbol === symbol)
        .map((candle) => candle.timeframe),
    );
    return TIMEFRAME_ORDER.filter((item) => set.has(item));
  }, [candles, symbol]);
  const activeTimeframe = availableTimeframes.includes(timeframe)
    ? timeframe
    : (availableTimeframes[0] ?? timeframe);

  const fullSeries = useMemo(
    () =>
      candles
        .filter(
          (candle) =>
            candle.symbol === symbol && candle.timeframe === activeTimeframe,
        )
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp)),
    [candles, symbol, activeTimeframe],
  );

  const brutusSeries = useMemo<BrutusPoint[]>(() => {
    const safeLength = clampNumber(Math.floor(length), 1, 250);
    const upperValues = fullSeries.map((candle) =>
      getPrice(candle, upperSource),
    );
    const lowerValues = fullSeries.map((candle) =>
      getPrice(candle, lowerSource),
    );
    const upperBasis = ema(upperValues, safeLength);
    const lowerBasis = ema(lowerValues, safeLength);
    const upperDeviation = rollingStdev(upperValues, safeLength);
    const lowerDeviation = rollingStdev(lowerValues, safeLength);

    return fullSeries.map((candle, index) => {
      const upper =
        upperBasis[index] != null && upperDeviation[index] != null
          ? upperBasis[index] + stdDev * upperDeviation[index]
          : undefined;
      const lower =
        lowerBasis[index] != null && lowerDeviation[index] != null
          ? lowerBasis[index] - stdDev * lowerDeviation[index]
          : undefined;
      const previous = fullSeries[index - 1];
      const previousUpperBasis = upperBasis[index - 1];
      const previousUpperDeviation = upperDeviation[index - 1];
      const previousLowerBasis = lowerBasis[index - 1];
      const previousLowerDeviation = lowerDeviation[index - 1];
      const previousUpper =
        previousUpperBasis != null && previousUpperDeviation != null
          ? previousUpperBasis + stdDev * previousUpperDeviation
          : undefined;
      const previousLower =
        previousLowerBasis != null && previousLowerDeviation != null
          ? previousLowerBasis - stdDev * previousLowerDeviation
          : undefined;
      const lowerPrice = getPrice(candle, lowerSource);
      const upperPrice = getPrice(candle, upperSource);
      const previousLowerPrice = previous
        ? getPrice(previous, lowerSource)
        : undefined;
      const previousUpperPrice = previous
        ? getPrice(previous, upperSource)
        : undefined;
      const longSignal =
        lower != null &&
        ((lowerPrice <= lower && candle.close > candle.open) ||
          (previousLowerPrice != null &&
            previousLower != null &&
            previousLowerPrice > previousLower &&
            lowerPrice <= lower));
      const shortSignal =
        upper != null &&
        ((upperPrice >= upper && candle.close < candle.open) ||
          (previousUpperPrice != null &&
            previousUpper != null &&
            previousUpperPrice < previousUpper &&
            upperPrice >= upper));

      return {
        candle,
        index,
        timestamp: Number(candle.timestamp),
        timeLabel: formatDateTime(Number(candle.timestamp)),
        upper,
        lower,
        longSignal,
        shortSignal,
      };
    });
  }, [fullSeries, length, lowerSource, stdDev, upperSource]);

  const visible = useMemo(
    () => brutusSeries.slice(-clampNumber(visibleCount, 40, 600)),
    [brutusSeries, visibleCount],
  );

  const markerTimestamp = parseLocalDateTime(markerInput);
  const markerPoint = useMemo(() => {
    if (markerTimestamp == null || visible.length === 0) return undefined;
    return visible.reduce((best, point) =>
      Math.abs(point.timestamp - markerTimestamp) <
      Math.abs(best.timestamp - markerTimestamp)
        ? point
        : best,
    );
  }, [markerTimestamp, visible]);

  const overlays = useMemo(
    () => ({
      sundayLevels: run.sundayLevels
        .filter((level) => !level.symbol || level.symbol === symbol)
        .slice(-8),
    }),
    [run.sundayLevels, symbol],
  );

  const chart = useMemo(() => {
    if (visible.length === 0) {
      return {
        domain: [0, 1] as const,
        scaleX: () => 0,
        scaleY: () => 0,
        candleWidth: 3,
      };
    }
    const values = visible.flatMap((point) => [
      point.candle.high,
      point.candle.low,
      point.upper ?? point.candle.high,
      point.lower ?? point.candle.low,
    ]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.08, 1);
    const yMin = min - pad;
    const yMax = max + pad;
    const innerWidth = CHART_WIDTH - CHART_PAD.left - CHART_PAD.right;
    const innerHeight = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
    const scaleX = (index: number) =>
      CHART_PAD.left +
      (visible.length <= 1 ? 0 : (index / (visible.length - 1)) * innerWidth);
    const scaleY = (value: number) =>
      CHART_PAD.top + ((yMax - value) / (yMax - yMin)) * innerHeight;
    return {
      domain: [yMin, yMax] as const,
      scaleX,
      scaleY,
      candleWidth: clampNumber(
        innerWidth / Math.max(visible.length, 1) - 2,
        2,
        9,
      ),
    };
  }, [visible]);

  const upperPath = toPath(
    visible
      .map((point, index) =>
        point.upper == null
          ? undefined
          : { x: chart.scaleX(index), y: chart.scaleY(point.upper) },
      )
      .filter((point): point is SvgPoint => point != null),
  );
  const lowerPath = toPath(
    visible
      .map((point, index) =>
        point.lower == null
          ? undefined
          : { x: chart.scaleX(index), y: chart.scaleY(point.lower) },
      )
      .filter((point): point is SvgPoint => point != null),
  );
  const closePath = toPath(
    visible.map((point, index) => ({
      x: chart.scaleX(index),
      y: chart.scaleY(point.candle.close),
    })),
  );
  const markerVisibleIndex = markerPoint
    ? visible.findIndex((point) => point.timestamp === markerPoint.timestamp)
    : -1;
  const signalCounts = visible.reduce(
    (counts, point) => ({
      longs: counts.longs + (point.longSignal ? 1 : 0),
      shorts: counts.shorts + (point.shortSignal ? 1 : 0),
    }),
    { longs: 0, shorts: 0 },
  );

  return (
    <div className="flex h-screen flex-col" data-ocid="chart.page">
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <h1 className="font-display text-lg font-bold">
              Brutus Band Verifier
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {symbol || "No symbol"} | {activeTimeframe} | {visible.length} of{" "}
              {fullSeries.length} candles
            </p>
          </div>
          <label className="ml-auto grid gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Symbol
            <select
              className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
              value={symbol}
              onChange={(event) => setSelectedSymbol(event.target.value)}
            >
              {symbols.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Timeframe
            <select
              className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
              value={activeTimeframe}
              onChange={(event) =>
                setTimeframe(event.target.value as Timeframe)
              }
            >
              {availableTimeframes.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <label className="grid gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Length
            <input
              className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
              min={1}
              max={250}
              type="number"
              value={length}
              onChange={(event) =>
                setLength(clampNumber(Number(event.target.value), 1, 250))
              }
            />
          </label>
          <label className="grid gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Std Dev
            <input
              className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
              min={0.1}
              max={8}
              step={0.1}
              type="number"
              value={stdDev}
              onChange={(event) =>
                setStdDev(clampNumber(Number(event.target.value), 0.1, 8))
              }
            />
          </label>
          <label className="grid gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Upper Source
            <select
              className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
              value={upperSource}
              onChange={(event) =>
                setUpperSource(event.target.value as PriceSource)
              }
            >
              {PRICE_SOURCES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Lower Source
            <select
              className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
              value={lowerSource}
              onChange={(event) =>
                setLowerSource(event.target.value as PriceSource)
              }
            >
              {PRICE_SOURCES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Candles
            <input
              className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
              min={40}
              max={600}
              step={20}
              type="number"
              value={visibleCount}
              onChange={(event) =>
                setVisibleCount(
                  clampNumber(Number(event.target.value), 40, 600),
                )
              }
            />
          </label>
          <label className="grid gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:col-span-2">
            Compare Marker
            <input
              className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
              type="datetime-local"
              value={markerInput}
              onChange={(event) => setMarkerInput(event.target.value)}
            />
          </label>
          <label className="flex items-end gap-2 border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
            <input
              checked={showSundayLevels}
              onChange={(event) => setShowSundayLevels(event.target.checked)}
              type="checkbox"
            />
            Sunday levels
          </label>
        </div>
      </div>
      {!run.integrity.canRunBacktest ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Import valid real candle data before chart/replay inspection.
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          No candles loaded for {symbol} {activeTimeframe}.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto bg-background p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-[620px] border border-border bg-black/40">
              <svg
                aria-label="Brutus Bollinger Band verification chart"
                className="h-full min-h-[620px] w-full"
                preserveAspectRatio="none"
                role="img"
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              >
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y =
                    CHART_PAD.top +
                    ratio * (CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom);
                  const value =
                    chart.domain[1] -
                    ratio * (chart.domain[1] - chart.domain[0]);
                  return (
                    <g key={ratio}>
                      <line
                        stroke="rgba(148,163,184,0.12)"
                        x1={CHART_PAD.left}
                        x2={CHART_WIDTH - CHART_PAD.right}
                        y1={y}
                        y2={y}
                      />
                      <text
                        fill="rgba(148,163,184,0.7)"
                        fontFamily="JetBrains Mono, monospace"
                        fontSize="11"
                        x={CHART_WIDTH - CHART_PAD.right + 8}
                        y={y + 4}
                      >
                        {value.toFixed(2)}
                      </text>
                    </g>
                  );
                })}
                {showSundayLevels &&
                  overlays.sundayLevels.map((level) => {
                    const y = chart.scaleY(level.price);
                    return (
                      <g key={level.id.toString()}>
                        <line
                          stroke="#fbbf24"
                          strokeDasharray="6 5"
                          strokeOpacity="0.7"
                          x1={CHART_PAD.left}
                          x2={CHART_WIDTH - CHART_PAD.right}
                          y1={y}
                          y2={y}
                        />
                        <text
                          fill="#fbbf24"
                          fontFamily="JetBrains Mono, monospace"
                          fontSize="10"
                          x={CHART_WIDTH / 2}
                          y={y - 4}
                        >
                          {level.levelLabel}
                        </text>
                      </g>
                    );
                  })}
                <path
                  d={upperPath}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.6"
                />
                <path
                  d={lowerPath}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.6"
                />
                <path
                  d={closePath}
                  fill="none"
                  stroke="rgba(103,232,249,0.75)"
                  strokeWidth="1.2"
                />
                {visible.map((point, index) => {
                  const x = chart.scaleX(index);
                  const yHigh = chart.scaleY(point.candle.high);
                  const yLow = chart.scaleY(point.candle.low);
                  const yOpen = chart.scaleY(point.candle.open);
                  const yClose = chart.scaleY(point.candle.close);
                  const isBullish = point.candle.close >= point.candle.open;
                  const color = isBullish ? "#2dd4bf" : "#f87171";
                  const bodyTop = Math.min(yOpen, yClose);
                  const bodyHeight = Math.max(1.4, Math.abs(yOpen - yClose));
                  return (
                    <g key={point.timestamp}>
                      <line
                        stroke={color}
                        strokeWidth="1"
                        x1={x}
                        x2={x}
                        y1={yHigh}
                        y2={yLow}
                      />
                      <rect
                        fill={isBullish ? "rgba(45,212,191,0.55)" : "#f87171"}
                        height={bodyHeight}
                        stroke={color}
                        strokeWidth="0.5"
                        width={chart.candleWidth}
                        x={x - chart.candleWidth / 2}
                        y={bodyTop}
                      />
                      <title>
                        {`${point.timeLabel} O:${point.candle.open.toFixed(2)} H:${point.candle.high.toFixed(2)} L:${point.candle.low.toFixed(2)} C:${point.candle.close.toFixed(2)} Upper:${point.upper?.toFixed(2) ?? "n/a"} Lower:${point.lower?.toFixed(2) ?? "n/a"}`}
                      </title>
                    </g>
                  );
                })}
                {visible.map((point, index) => {
                  if (!point.longSignal && !point.shortSignal) return null;
                  const x = chart.scaleX(index);
                  if (point.longSignal) {
                    const y = chart.scaleY(point.candle.low) + 15;
                    return (
                      <polygon
                        fill="#22c55e"
                        key={`long-${point.timestamp}`}
                        points={`${x},${y - 12} ${x - 8},${y + 4} ${x + 8},${y + 4}`}
                      />
                    );
                  }
                  const y = chart.scaleY(point.candle.high) - 15;
                  return (
                    <polygon
                      fill="#ef4444"
                      key={`short-${point.timestamp}`}
                      points={`${x},${y + 12} ${x - 8},${y - 4} ${x + 8},${y - 4}`}
                    />
                  );
                })}
                {markerVisibleIndex >= 0 && (
                  <g>
                    <line
                      stroke="#22d3ee"
                      strokeWidth="1.8"
                      x1={chart.scaleX(markerVisibleIndex)}
                      x2={chart.scaleX(markerVisibleIndex)}
                      y1={CHART_PAD.top}
                      y2={CHART_HEIGHT - CHART_PAD.bottom}
                    />
                    <text
                      fill="#22d3ee"
                      fontFamily="JetBrains Mono, monospace"
                      fontSize="11"
                      x={chart.scaleX(markerVisibleIndex) + 6}
                      y={CHART_HEIGHT - CHART_PAD.bottom - 8}
                    >
                      marker
                    </text>
                  </g>
                )}
                {visible
                  .filter((_, index) => {
                    const step = Math.max(1, Math.floor(visible.length / 8));
                    return index % step === 0;
                  })
                  .map((point) => {
                    const index = visible.findIndex(
                      (item) => item.timestamp === point.timestamp,
                    );
                    return (
                      <text
                        fill="rgba(148,163,184,0.65)"
                        fontFamily="JetBrains Mono, monospace"
                        fontSize="10"
                        key={`tick-${point.timestamp}`}
                        x={chart.scaleX(index) - 22}
                        y={CHART_HEIGHT - 16}
                      >
                        {new Date(point.timestamp).toISOString().slice(5, 13)}
                      </text>
                    );
                  })}
              </svg>
            </div>
            <aside className="grid content-start gap-3">
              <div className="border border-border bg-card p-4">
                <h2 className="font-display text-sm font-bold">
                  Pine Parity Check
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  This plots your Brutus formula from completed candles:
                  EMA(source, length) plus/minus population standard deviation.
                  It can verify chart structure and closed-candle signals, but
                  not the exact intrabar alert tick where TradingView first saw
                  a live moving band pierce.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-border bg-card p-4">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Long signals
                  </p>
                  <p className="mt-2 font-display text-2xl font-bold text-[#22c55e]">
                    {signalCounts.longs}
                  </p>
                </div>
                <div className="border border-border bg-card p-4">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Short signals
                  </p>
                  <p className="mt-2 font-display text-2xl font-bold text-[#ef4444]">
                    {signalCounts.shorts}
                  </p>
                </div>
              </div>
              {markerPoint ? (
                <div className="border border-border bg-card p-4">
                  <h2 className="font-display text-sm font-bold">
                    Nearest Marker Candle
                  </h2>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs">
                    <span className="text-muted-foreground">Time</span>
                    <span>{markerPoint.timeLabel}</span>
                    <span className="text-muted-foreground">Open</span>
                    <span>{markerPoint.candle.open.toFixed(2)}</span>
                    <span className="text-muted-foreground">High</span>
                    <span>{markerPoint.candle.high.toFixed(2)}</span>
                    <span className="text-muted-foreground">Low</span>
                    <span>{markerPoint.candle.low.toFixed(2)}</span>
                    <span className="text-muted-foreground">Close</span>
                    <span>{markerPoint.candle.close.toFixed(2)}</span>
                    <span className="text-muted-foreground">Upper</span>
                    <span>{markerPoint.upper?.toFixed(2) ?? "n/a"}</span>
                    <span className="text-muted-foreground">Lower</span>
                    <span>{markerPoint.lower?.toFixed(2) ?? "n/a"}</span>
                  </div>
                  <button
                    className="mt-4 w-full border border-border bg-background px-3 py-2 font-mono text-xs text-foreground hover:border-primary"
                    onClick={() => setMarkerInput(toDatetimeLocal(Date.now()))}
                    type="button"
                  >
                    Move marker to now
                  </button>
                </div>
              ) : (
                <div className="border border-border bg-card p-4 text-sm text-muted-foreground">
                  Marker is outside the visible candle window. Increase Candles
                  or choose a visible date.
                </div>
              )}
              <div className="border border-border bg-card p-4">
                <h2 className="font-display text-sm font-bold">
                  What This Proves
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  If this does not visually match TradingView using the same
                  symbol, timeframe, length, deviation, and sources, we should
                  distrust the Brutus lab results until the feed or formula is
                  corrected.
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
