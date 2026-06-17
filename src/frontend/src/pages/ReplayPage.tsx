import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { Timeframe } from "@/types/strategy";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const TIMEFRAME_ORDER = [
  Timeframe.M1,
  Timeframe.M5,
  Timeframe.M15,
  Timeframe.H1,
  Timeframe.H4,
  Timeframe.Daily,
  Timeframe.Weekly,
];

export default function ReplayPage() {
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
  const replayCandles = useMemo(
    () =>
      candles
        .filter(
          (candle) =>
            candle.symbol === symbol && candle.timeframe === activeTimeframe,
        )
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp)),
    [candles, symbol, activeTimeframe],
  );
  const defaultTime = replayCandles.at(-1)
    ? new Date(Number(replayCandles.at(-1)!.timestamp))
        .toISOString()
        .slice(0, 16)
    : "";
  const [replayTime, setReplayTime] = useState("");

  useEffect(() => {
    if (!replayTime && defaultTime) setReplayTime(defaultTime);
  }, [defaultTime, replayTime]);

  const cutoff = replayTime ? Date.parse(replayTime) : 0;
  const visibleCandles = replayCandles.filter(
    (candle) => Number(candle.timestamp) <= cutoff,
  );
  const visibleSignals = useMemo(
    () =>
      [...run.acceptedSignals, ...run.rejectedSignals]
        .filter(
          (signal) =>
            signal.symbol === symbol &&
            signal.timeframe === activeTimeframe &&
            signal.availableAt <= cutoff,
        )
        .slice(-12)
        .reverse(),
    [run, cutoff, symbol, activeTimeframe],
  );

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="replay.page">
      <div>
        <h1 className="font-display text-2xl font-bold">Replay Mode</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Select a date/time and inspect only candles and signals available at
          that moment. This is the lookahead-bias tripwire.
        </p>
      </div>
      <div className="border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_160px_140px]">
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Replay cutoff
            </span>
            <input
              className="mt-2 block w-full border border-border bg-background px-3 py-2 font-mono text-sm"
              type="datetime-local"
              value={replayTime}
              onChange={(event) => setReplayTime(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Symbol
            </span>
            <select
              className="mt-2 block w-full border border-border bg-background px-3 py-2 font-mono text-sm"
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
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Timeframe
            </span>
            <select
              className="mt-2 block w-full border border-border bg-background px-3 py-2 font-mono text-sm"
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
      </div>
      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Replay is disabled until real 1H and 1D data is loaded.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <RotateCcw className="h-4 w-4 text-primary" />
              {symbol} {activeTimeframe} candles known then:{" "}
              {visibleCandles.length}
            </div>
            <div className="h-[420px] overflow-auto border border-border bg-background">
              <table className="w-full min-w-[820px] font-mono text-xs">
                <thead className="sticky top-0 border-b border-border bg-card text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Symbol</th>
                    <th className="px-3 py-2 text-left">TF</th>
                    <th className="px-3 py-2 text-right">Open</th>
                    <th className="px-3 py-2 text-right">High</th>
                    <th className="px-3 py-2 text-right">Low</th>
                    <th className="px-3 py-2 text-right">Close</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCandles.slice(-200).map((candle) => (
                    <tr
                      key={`${candle.symbol}-${candle.timeframe}-${candle.timestamp.toString()}`}
                      className="border-b border-border/40"
                    >
                      <td className="px-3 py-1.5">
                        {new Date(Number(candle.timestamp)).toISOString()}
                      </td>
                      <td className="px-3 py-1.5">{candle.symbol}</td>
                      <td className="px-3 py-1.5">{candle.timeframe}</td>
                      <td className="px-3 py-1.5 text-right">
                        {candle.open.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {candle.high.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {candle.low.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {candle.close.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-3">
            {visibleSignals.length === 0 ? (
              <div className="border border-border bg-card p-4 text-sm text-muted-foreground">
                No {symbol} {activeTimeframe} signal candidates existed by this
                cutoff.
              </div>
            ) : (
              visibleSignals.map((signal) => (
                <div
                  key={signal.id}
                  className="border border-border bg-card p-3"
                >
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {new Date(signal.timestamp).toISOString()} | {signal.symbol}
                  </p>
                  <p className="mt-1 font-mono text-xs font-bold">
                    {signal.accepted ? "ACCEPTED" : "REJECTED"} | {signal.score}
                    /7
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {signal.explanation}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
