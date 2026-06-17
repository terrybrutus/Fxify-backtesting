import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { FileWarning } from "lucide-react";

export default function RejectedSetupsPage() {
  const { run } = useStrategyWorkspace();
  const rejected = run.rejectedSignals.slice(0, 100);

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="rejected.page">
      <div>
        <h1 className="font-display text-2xl font-bold">Rejected Setups</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          A real backtester shows what it skipped. These records are the best
          place to catch over-filtering, range-day blocks, weak targets, and
          missing confluence.
        </p>
      </div>
      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Rejected setup logs are unavailable until real 1H and 1D data is
          imported.
        </div>
      ) : rejected.length === 0 ? (
        <div className="border border-border bg-card p-6 text-sm text-muted-foreground">
          No rejected candidates were logged with the current data and threshold.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[900px] text-left font-mono text-xs">
            <thead className="border-b border-border bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Market</th>
                <th className="px-3 py-2">Missing / Blockers</th>
              </tr>
            </thead>
            <tbody>
              {rejected.map((signal) => {
                const missing = signal.reasons
                  .filter((reason) => !reason.passed)
                  .map((reason) => reason.label);
                const blockers = signal.blockers
                  .filter((blocker) => blocker.passed)
                  .map((blocker) => blocker.label);
                return (
                  <tr key={signal.id} className="border-b border-border/50">
                    <td className="px-3 py-2">
                      {new Date(signal.timestamp).toISOString()}
                    </td>
                    <td className="px-3 py-2">{signal.symbol}</td>
                    <td className="px-3 py-2">{signal.score}/7</td>
                    <td className="px-3 py-2">{signal.marketState}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[...blockers, ...missing].join("; ") || "No reason captured"}
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
        Showing the first 100 rejected candidates for scanability; export JSON
        for the complete log.
      </div>
    </div>
  );
}
