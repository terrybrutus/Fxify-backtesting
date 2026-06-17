import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { Timeframe } from "@/types/strategy";
import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

export default function ReplayPage() {
  const { candles, run } = useStrategyWorkspace();
  const h1 = candles
    .filter((candle) => candle.timeframe === Timeframe.H1)
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const defaultTime = h1.at(-1)
    ? new Date(Number(h1.at(-1)!.timestamp)).toISOString().slice(0, 16)
    : "";
  const [replayTime, setReplayTime] = useState(defaultTime);

  const cutoff = replayTime ? Date.parse(replayTime) : 0;
  const visibleCandles = h1.filter(
    (candle) => Number(candle.timestamp) <= cutoff,
  );
  const visibleSignals = useMemo(
    () =>
      [...run.acceptedSignals, ...run.rejectedSignals]
        .filter((signal) => signal.availableAt <= cutoff)
        .slice(-12)
        .reverse(),
    [run, cutoff],
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
        <label
          htmlFor="replay-cutoff"
          className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
        >
          Replay cutoff
        </label>
        <input
          id="replay-cutoff"
          className="mt-2 block w-full max-w-sm border border-border bg-background px-3 py-2 font-mono text-sm"
          type="datetime-local"
          value={replayTime}
          onChange={(event) => setReplayTime(event.target.value)}
        />
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
              Candles known then: {visibleCandles.length}
            </div>
            <div className="h-[420px] overflow-auto border border-border bg-background">
              <table className="w-full min-w-[720px] font-mono text-xs">
                <thead className="sticky top-0 border-b border-border bg-card text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-right">Open</th>
                    <th className="px-3 py-2 text-right">High</th>
                    <th className="px-3 py-2 text-right">Low</th>
                    <th className="px-3 py-2 text-right">Close</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCandles.slice(-200).map((candle) => (
                    <tr
                      key={candle.timestamp.toString()}
                      className="border-b border-border/40"
                    >
                      <td className="px-3 py-1.5">
                        {new Date(Number(candle.timestamp)).toISOString()}
                      </td>
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
            {visibleSignals.map((signal) => (
              <div key={signal.id} className="border border-border bg-card p-3">
                <p className="font-mono text-[10px] text-muted-foreground">
                  {new Date(signal.timestamp).toISOString()}
                </p>
                <p className="mt-1 font-mono text-xs font-bold">
                  {signal.accepted ? "ACCEPTED" : "REJECTED"} | {signal.score}/7
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {signal.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
