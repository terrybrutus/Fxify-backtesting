import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { Timeframe } from "@/types/strategy";
import { FileWarning } from "lucide-react";
import { useMemo, useState } from "react";

export default function RejectedSetupsPage() {
  const { run } = useStrategyWorkspace();
  const symbols = useMemo(
    () =>
      [...new Set(run.rejectedSignals.map((signal) => signal.symbol))].sort(),
    [run.rejectedSignals],
  );
  const [selectedSymbol, setSelectedSymbol] = useState("all");
  const [selectedTimeframe, setSelectedTimeframe] = useState("all");
  const timeframes = useMemo(
    () =>
      [...new Set(run.rejectedSignals.map((signal) => signal.timeframe))].sort(
        (a, b) =>
          Object.values(Timeframe).indexOf(a) -
          Object.values(Timeframe).indexOf(b),
      ),
    [run.rejectedSignals],
  );
  const rejected = useMemo(
    () =>
      run.rejectedSignals
        .filter(
          (signal) =>
            (selectedSymbol === "all" || signal.symbol === selectedSymbol) &&
            (selectedTimeframe === "all" ||
              signal.timeframe === selectedTimeframe),
        )
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 100),
    [run.rejectedSignals, selectedSymbol, selectedTimeframe],
  );

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="rejected.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Rejected Setups</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            A real backtester shows what it skipped. These records are the best
            place to catch over-filtering, range-day blocks, weak targets, and
            missing confluence.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="border border-border bg-background px-3 py-2 font-mono text-xs"
            value={selectedSymbol}
            onChange={(event) => setSelectedSymbol(event.target.value)}
          >
            <option value="all">All symbols</option>
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
          <select
            className="border border-border bg-background px-3 py-2 font-mono text-xs"
            value={selectedTimeframe}
            onChange={(event) => setSelectedTimeframe(event.target.value)}
          >
            <option value="all">All TFs</option>
            {timeframes.map((timeframe) => (
              <option key={timeframe} value={timeframe}>
                {timeframe}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Rejected setup logs are unavailable until real 1H and 1D data is
          imported.
        </div>
      ) : rejected.length === 0 ? (
        <div className="border border-border bg-card p-6 text-sm text-muted-foreground">
          No rejected candidates matched the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[980px] text-left font-mono text-xs">
            <thead className="border-b border-border bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">TF</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Market</th>
                <th className="px-3 py-2">Rejected Because</th>
              </tr>
            </thead>
            <tbody>
              {rejected.map((signal) => {
                const missing = signal.reasons
                  .filter((reason) => !reason.passed)
                  .map((reason) => `Missing: ${reason.label}`);
                const blockers = signal.blockers
                  .filter((blocker) => blocker.passed)
                  .map((blocker) => `Blocked: ${blocker.label}`);
                return (
                  <tr key={signal.id} className="border-b border-border/50">
                    <td className="px-3 py-2">
                      {new Date(signal.timestamp).toISOString()}
                    </td>
                    <td className="px-3 py-2">{signal.symbol}</td>
                    <td className="px-3 py-2">{signal.timeframe}</td>
                    <td className="px-3 py-2">{signal.score}/7</td>
                    <td className="px-3 py-2">{signal.marketState}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[...blockers, ...missing].join("; ") ||
                        "No reason captured"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileWarning className="h-4 w-4 text-primary" />
        Showing the latest 100 rejected candidates for the selected filters;
        export JSON for the complete log.
      </div>
    </div>
  );
}
