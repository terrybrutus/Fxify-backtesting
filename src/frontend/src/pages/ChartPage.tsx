import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { Timeframe } from "@/types/strategy";
import { useMemo, useState } from "react";
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

const TIMEFRAME_ORDER = [
  Timeframe.M1,
  Timeframe.M5,
  Timeframe.M15,
  Timeframe.H1,
  Timeframe.H4,
  Timeframe.Daily,
  Timeframe.Weekly,
];

export default function ChartPage() {
  const { candles, run } = useStrategyWorkspace();
  const symbols = useMemo(
    () => [...new Set(candles.map((candle) => candle.symbol))].sort(),
    [candles],
  );
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.H1);
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

  const visible = useMemo(
    () =>
      candles
        .filter(
          (candle) =>
            candle.symbol === symbol && candle.timeframe === activeTimeframe,
        )
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        .slice(-180),
    [candles, symbol, activeTimeframe],
  );

  const data = useMemo(
    () =>
      visible.map((candle, index) => ({
        index,
        time: new Date(Number(candle.timestamp)).toISOString().slice(5, 16),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    [visible],
  );

  const overlays = useMemo(
    () => ({
      fvgs: run.fvgZones
        .filter((zone) => !zone.symbol || zone.symbol === symbol)
        .slice(-12),
      sundayLevels: run.sundayLevels
        .filter((level) => !level.symbol || level.symbol === symbol)
        .slice(-8),
    }),
    [run.fvgZones, run.sundayLevels, symbol],
  );

  const domain = useMemo(() => {
    if (data.length === 0) return [0, 1];
    const lows = data.map((item) => item.low);
    const highs = data.map((item) => item.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const pad = Math.max((max - min) * 0.05, 1);
    return [min - pad, max + pad];
  }, [data]);

  return (
    <div className="flex h-screen flex-col" data-ocid="chart.page">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
        <div>
          <h1 className="font-display text-lg font-bold">Candle Viewer</h1>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {symbol || "No symbol"} | {visible.length} visible candles
          </p>
        </div>
        <select
          className="ml-auto border border-border bg-background px-3 py-2 font-mono text-xs"
          value={symbol}
          onChange={(event) => setSelectedSymbol(event.target.value)}
        >
          {symbols.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          className="border border-border bg-background px-3 py-2 font-mono text-xs"
          value={activeTimeframe}
          onChange={(event) => setTimeframe(event.target.value as Timeframe)}
        >
          {availableTimeframes.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {!run.integrity.canRunBacktest ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Import valid real candle data before chart/replay inspection.
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          No candles loaded for {symbol} {activeTimeframe}.
        </div>
      ) : (
        <div className="min-h-0 flex-1 bg-background p-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 20, right: 60, bottom: 20, left: 10 }}
            >
              <XAxis
                dataKey="index"
                tickFormatter={(value) => data[value]?.time ?? ""}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                domain={domain}
                orientation="right"
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  fontFamily: "JetBrains Mono",
                  fontSize: 12,
                }}
              />
              {overlays.fvgs.map((zone) => (
                <ReferenceArea
                  key={zone.id.toString()}
                  y1={zone.bottom}
                  y2={zone.top}
                  fill={
                    zone.isBullish
                      ? "rgba(34,197,94,0.10)"
                      : "rgba(239,68,68,0.10)"
                  }
                  stroke={
                    zone.isBullish
                      ? "rgba(34,197,94,0.45)"
                      : "rgba(239,68,68,0.45)"
                  }
                />
              ))}
              {overlays.sundayLevels.map((level) => (
                <ReferenceLine
                  key={level.id.toString()}
                  y={level.price}
                  stroke="#fbbf24"
                  strokeDasharray="6 4"
                  label={{
                    value: "Sunday",
                    fill: "#fbbf24",
                    fontSize: 10,
                  }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="close"
                stroke="#67e8f9"
                dot={false}
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="high"
                stroke="rgba(34,197,94,0.3)"
                dot={false}
                strokeWidth={0.8}
              />
              <Line
                type="monotone"
                dataKey="low"
                stroke="rgba(239,68,68,0.3)"
                dot={false}
                strokeWidth={0.8}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
