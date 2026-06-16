import type {
  Candle,
  FVGZone,
  MovingAverages as MAs,
  SundayLevel,
  TradeResult,
} from "@/types/strategy";
import { TradeOutcome } from "@/types/strategy";
import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChartPoint {
  idx: number;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema200?: number;
  ema20?: number;
  sma50?: number;
  // phantom lines for tooltip coloring
  bullEntry?: number;
  tp1?: number;
}

interface RechartsChartProps {
  candles: Candle[];
  sundayLevels: SundayLevel[];
  fvgZones: FVGZone[];
  movingAverages: MAs;
  trades: TradeResult[];
  showFVG: boolean;
  showLevels: boolean;
  showMA: boolean;
}

// ─── Custom Candlestick Bar ────────────────────────────────────────────────────

const CandleBar = (props: Record<string, unknown>) => {
  const {
    x,
    y: _y,
    width: _width,
    height: _height,
    open,
    close,
    high,
    low,
    yAxis: _yAxis,
  } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    open: number;
    close: number;
    high: number;
    low: number;
    yAxis: { scale: (v: number) => number };
  };

  if (!_yAxis?.scale || open == null) return null;

  const bullish = close >= open;
  const color = bullish ? "#2dd4bf" : "#f87171";
  const fillColor = bullish
    ? "rgba(45,212,191,0.72)"
    : "rgba(248,113,113,0.72)";

  const candleW = Math.max(2, _width ?? 6);
  const cx = x + (_width ?? 6) / 2;

  const yHigh = _yAxis.scale(high);
  const yLow = _yAxis.scale(low);
  const yOpen = _yAxis.scale(open);
  const yClose = _yAxis.scale(close);

  const bodyTop = Math.min(yOpen, yClose);
  const bodyH = Math.max(1, Math.abs(yClose - yOpen));

  return (
    <g>
      {/* Wick */}
      <line
        x1={cx}
        y1={yHigh}
        x2={cx}
        y2={yLow}
        stroke={color}
        strokeWidth={1}
      />
      {/* Body */}
      <rect
        x={cx - candleW / 2}
        y={bodyTop}
        width={candleW}
        height={bodyH}
        fill={fillColor}
        stroke={color}
        strokeWidth={0.5}
      />
    </g>
  );
};

// ─── Entry / Exit Marker ──────────────────────────────────────────────────────

const EntryDot = (props: Record<string, unknown>) => {
  const { cx, cy } = props as { cx: number; cy: number };
  if (!cx || !cy) return null;
  // Upward triangle — green
  return (
    <polygon
      points={`${cx},${cy - 8} ${cx - 6},${cy + 4} ${cx + 6},${cy + 4}`}
      fill="#22c55e"
      opacity={0.9}
    />
  );
};

const ExitDot = (props: Record<string, unknown>) => {
  const { cx, cy } = props as { cx: number; cy: number };
  if (!cx || !cy) return null;
  // Downward triangle — red
  return (
    <polygon
      points={`${cx},${cy + 8} ${cx - 6},${cy - 4} ${cx + 6},${cy - 4}`}
      fill="#ef4444"
      opacity={0.9}
    />
  );
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const ChartTooltip = ({
  active,
  payload,
}: { active?: boolean; payload?: { payload: ChartPoint }[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const bullish = d.close >= d.open;
  const change = ((d.close - d.open) / d.open) * 100;
  const ts = new Date(d.ts);
  return (
    <div className="bg-card border border-border px-3 py-2 font-mono text-xs shadow-lg">
      <div className="text-muted-foreground mb-1">
        {ts.toLocaleDateString()} {ts.toLocaleTimeString()}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-muted-foreground">O</span>
        <span className="text-foreground">{d.open.toFixed(2)}</span>
        <span className="text-muted-foreground">H</span>
        <span className="text-foreground">{d.high.toFixed(2)}</span>
        <span className="text-muted-foreground">L</span>
        <span className="text-foreground">{d.low.toFixed(2)}</span>
        <span className="text-muted-foreground">C</span>
        <span className={bullish ? "text-[#2dd4bf]" : "text-[#f87171]"}>
          {d.close.toFixed(2)}
        </span>
        <span className="text-muted-foreground">Chg</span>
        <span className={bullish ? "text-[#2dd4bf]" : "text-[#f87171]"}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(2)}%
        </span>
      </div>
      {d.ema200 && (
        <div className="mt-1 pt-1 border-t border-border/40 space-y-0.5">
          {d.ema200 && (
            <div className="text-[#67e8f9]">EMA200: {d.ema200.toFixed(2)}</div>
          )}
          {d.ema20 && (
            <div className="text-[#818cf8]">EMA20: {d.ema20.toFixed(2)}</div>
          )}
          {d.sma50 && (
            <div className="text-[#a855f7]">SMA50: {d.sma50.toFixed(2)}</div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Legend ───────────────────────────────────────────────────────────────────

export function ChartLegend({
  showMA,
  showFVG,
  showLevels,
}: {
  showMA: boolean;
  showFVG: boolean;
  showLevels: boolean;
}) {
  const items = [
    ...(showMA
      ? [
          { color: "#67e8f9", label: "EMA 200", dash: false },
          { color: "#818cf8", label: "EMA 20", dash: false },
          { color: "#a855f7", label: "SMA 50", dash: false },
        ]
      : []),
    ...(showLevels
      ? [{ color: "#fbbf24", label: "Sunday Level", dash: true }]
      : []),
    ...(showFVG
      ? [
          {
            color: "rgba(45,212,191,0.5)",
            label: "Bullish FVG",
            dash: false,
            box: true,
          },
          {
            color: "rgba(239,68,68,0.5)",
            label: "Bearish FVG",
            dash: false,
            box: true,
          },
        ]
      : []),
    { color: "#22c55e", label: "Entry", triangle: "up" as const },
    { color: "#ef4444", label: "Exit", triangle: "down" as const },
    { color: "#fbbf24", label: "TP1", dash: true },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-t border-border bg-card/60 font-mono text-xs text-muted-foreground">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          {item.box ? (
            <span
              className="w-3 h-3 border"
              style={{ background: item.color, borderColor: item.color }}
            />
          ) : item.triangle === "up" ? (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              role="img"
              aria-hidden="true"
            >
              <polygon points="5,1 9,9 1,9" fill={item.color} />
            </svg>
          ) : item.triangle === "down" ? (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              role="img"
              aria-hidden="true"
            >
              <polygon points="5,9 9,1 1,1" fill={item.color} />
            </svg>
          ) : (
            <span
              className="block h-px w-5"
              style={{
                background: item.color,
                borderTop: item.dash ? `1px dashed ${item.color}` : undefined,
                opacity: item.dash ? 0.9 : 1,
              }}
            />
          )}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Recharts Chart ──────────────────────────────────────────────────────

export default function RechartsChart({
  candles,
  sundayLevels,
  fvgZones,
  movingAverages,
  trades,
  showFVG,
  showLevels,
  showMA,
}: RechartsChartProps) {
  const visible = candles.slice(-120);

  // Build chart data points
  const data = useMemo<ChartPoint[]>(() => {
    return visible.map((c, i) => ({
      idx: i,
      ts: Number(c.timestamp),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      ema200: movingAverages.ema200,
      ema20: movingAverages.ema20,
      sma50: movingAverages.sma50,
    }));
  }, [visible, movingAverages]);

  // Price domain with padding
  const [yMin, yMax] = useMemo(() => {
    if (!data.length) return [0, 1];
    const lows = data.map((d) => d.low);
    const highs = data.map((d) => d.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const pad = (max - min) * 0.04;
    return [min - pad, max + pad];
  }, [data]);

  // Map trade timestamps to index
  const tsToIdx = useMemo(() => {
    const map = new Map<number, number>();
    visible.forEach((c, i) => map.set(Number(c.timestamp), i));
    return map;
  }, [visible]);

  // Entry and TP1 reference lines from most recent session trades
  const tradeLines = useMemo(() => {
    const result: {
      entryIdx: number;
      entryPrice: number;
      tp1Price: number;
      exitIdx?: number;
      exitPrice?: number;
      outcome?: string;
    }[] = [];
    for (const t of trades) {
      const entryIdx = tsToIdx.get(Number(t.entryTimestamp));
      if (entryIdx == null) continue;
      const exitIdx =
        t.exitTimestamp != null
          ? tsToIdx.get(Number(t.exitTimestamp))
          : undefined;
      result.push({
        entryIdx,
        entryPrice: t.entryPrice,
        tp1Price: t.tp1Price,
        exitIdx,
        exitPrice: t.exitPrice,
        outcome: t.outcome,
      });
    }
    return result;
  }, [trades, tsToIdx]);

  // Entry/exit line data (sparse)
  const entryLineData = useMemo(() => {
    const pts: (number | undefined)[] = new Array(data.length).fill(undefined);
    for (const tl of tradeLines) {
      pts[tl.entryIdx] = tl.entryPrice;
    }
    return data.map((d, i) => ({ ...d, bullEntry: pts[i] }));
  }, [data, tradeLines]);

  const exitLineData = useMemo(() => {
    const pts: (number | undefined)[] = new Array(data.length).fill(undefined);
    for (const tl of tradeLines) {
      if (tl.exitIdx != null) pts[tl.exitIdx] = tl.exitPrice;
    }
    return data.map((d, i) => ({ ...d, exitMark: pts[i] }));
  }, [data, tradeLines]);

  // TP1 lines (dashed horizontal reference lines from last session)
  const tp1Prices = useMemo(
    () => [...new Set(tradeLines.map((t) => t.tp1Price))],
    [tradeLines],
  );

  const formatXAxis = (idx: number) => {
    const pt = data[idx];
    if (!pt) return "";
    const d = new Date(pt.ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:00`;
  };

  const xTicks = useMemo(() => {
    const step = Math.max(1, Math.floor(data.length / 8));
    return data.map((_, i) => i).filter((i) => i % step === 0);
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={entryLineData}
        margin={{ top: 10, right: 60, bottom: 0, left: 0 }}
      >
        {/* FVG Zones */}
        {showFVG &&
          fvgZones.map((z) => (
            <ReferenceArea
              key={z.id.toString()}
              y1={z.bottom}
              y2={z.top}
              fill={
                z.isBullish ? "rgba(45,212,191,0.10)" : "rgba(239,68,68,0.10)"
              }
              stroke={
                z.isBullish ? "rgba(45,212,191,0.45)" : "rgba(239,68,68,0.45)"
              }
              strokeDasharray="4 4"
              strokeWidth={1}
              ifOverflow="visible"
            />
          ))}

        {/* Sunday Levels */}
        {showLevels &&
          sundayLevels.map((lvl) => (
            <ReferenceLine
              key={lvl.id.toString()}
              y={lvl.price}
              stroke="#fbbf24"
              strokeDasharray="6 3"
              strokeWidth={1.5}
              strokeOpacity={0.75}
              label={{
                value: lvl.levelLabel,
                position: "right",
                fontSize: 9,
                fill: "#fbbf24",
                fontFamily: "JetBrains Mono, monospace",
              }}
              ifOverflow="visible"
            />
          ))}

        {/* TP1 dashed lines */}
        {tp1Prices.map((tp) => (
          <ReferenceLine
            key={`tp1-${tp}`}
            y={tp}
            stroke="#fbbf24"
            strokeDasharray="8 4"
            strokeWidth={1}
            strokeOpacity={0.6}
            label={{
              value: `TP1 ${tp.toFixed(2)}`,
              position: "right",
              fontSize: 9,
              fill: "#fbbf24",
              fontFamily: "JetBrains Mono, monospace",
            }}
            ifOverflow="visible"
          />
        ))}

        <XAxis
          dataKey="idx"
          type="number"
          scale="linear"
          domain={[0, data.length - 1]}
          ticks={xTicks}
          tickFormatter={formatXAxis}
          tick={{
            fontSize: 9,
            fill: "rgba(148,163,184,0.6)",
            fontFamily: "JetBrains Mono, monospace",
          }}
          axisLine={{ stroke: "rgba(148,163,184,0.15)" }}
          tickLine={false}
        />
        <YAxis
          domain={[yMin, yMax]}
          orientation="right"
          tickFormatter={(v: number) => v.toFixed(1)}
          tick={{
            fontSize: 9,
            fill: "rgba(148,163,184,0.6)",
            fontFamily: "JetBrains Mono, monospace",
          }}
          axisLine={false}
          tickLine={false}
          width={58}
        />
        <Tooltip
          content={(p) => (
            <ChartTooltip
              active={p.active}
              payload={p.payload as { payload: ChartPoint }[] | undefined}
            />
          )}
          cursor={{ stroke: "rgba(148,163,184,0.15)", strokeWidth: 1 }}
        />

        {/* Candlestick bars rendered via custom Line with customized dot */}
        {/* We use a hidden Line to anchor the CandleBar shape per bar */}
        <Line
          dataKey="high"
          stroke="transparent"
          dot={(props: Record<string, unknown>) => {
            const p = props as {
              cx: number;
              cy: number;
              index: number;
              payload: ChartPoint;
              xAxis: { width: number };
              dataKey: string;
            };
            const d = data[p.index];
            if (!d) return <g key={p.index} />;
            const barW = Math.max(
              2,
              Math.floor((p.xAxis?.width ?? 600) / data.length) - 1,
            );
            return (
              <CandleBar
                key={p.index}
                x={p.cx - barW / 2}
                y={p.cy}
                width={barW}
                height={0}
                open={d.open}
                close={d.close}
                high={d.high}
                low={d.low}
                yAxis={
                  (props as { yAxis: { scale: (v: number) => number } }).yAxis
                }
              />
            );
          }}
          activeDot={false}
          isAnimationActive={false}
        />

        {/* Moving Averages */}
        {showMA && movingAverages.ema200 != null && (
          <Line
            dataKey="ema200"
            stroke="#67e8f9"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        )}
        {showMA && movingAverages.ema20 != null && (
          <Line
            dataKey="ema20"
            stroke="#818cf8"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        )}
        {showMA && movingAverages.sma50 != null && (
          <Line
            dataKey="sma50"
            stroke="#a855f7"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        )}

        {/* Entry markers */}
        <Line
          data={entryLineData}
          dataKey="bullEntry"
          stroke="transparent"
          dot={(props: Record<string, unknown>) => {
            const p = props as { cx: number; cy: number; value: number };
            if (!p.value) return <g />;
            return <EntryDot key={`entry-${p.cx}`} cx={p.cx} cy={p.cy} />;
          }}
          activeDot={false}
          isAnimationActive={false}
        />

        {/* Exit markers */}
        <Line
          data={exitLineData}
          dataKey="exitMark"
          stroke="transparent"
          dot={(props: Record<string, unknown>) => {
            const p = props as { cx: number; cy: number; value: number };
            if (!p.value) return <g />;
            return <ExitDot key={`exit-${p.cx}`} cx={p.cx} cy={p.cy} />;
          }}
          activeDot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
