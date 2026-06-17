import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { exportCsv, exportJson } from "@/lib/strategyEngine";
import { Download } from "lucide-react";

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-xl font-bold">{value}</p>
    </div>
  );
}

export default function BacktestResultsPage() {
  const { run } = useStrategyWorkspace();
  const stats = run.stats;
  const allSignals = [...run.acceptedSignals, ...run.rejectedSignals];

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="results.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Results Export</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Summaries are generated from imported candles only. Export the full
            audit log to inspect whether the nervous system is firing correctly.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!run.integrity.canRunBacktest}
            onClick={() =>
              downloadFile("ict-audit-log.json", exportJson(run), "application/json")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            JSON
          </Button>
          <Button
            type="button"
            disabled={!run.integrity.canRunBacktest}
            onClick={() =>
              downloadFile("ict-signal-log.csv", exportCsv(allSignals), "text/csv")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Results are disabled because the integrity gate is closed.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Accepted signals" value={String(run.acceptedSignals.length)} />
            <Stat label="Rejected candidates" value={String(run.rejectedSignals.length)} />
            <Stat label="Win rate" value={`${(stats.winRate * 100).toFixed(1)}%`} />
            <Stat label="Profit factor" value={stats.profitFactor.toFixed(2)} />
            <Stat label="Total trades" value={stats.totalTrades.toString()} />
            <Stat label="Avg R" value={stats.avgRR.toFixed(2)} />
            <Stat label="Max drawdown" value={stats.maxDrawdown.toFixed(2)} />
            <Stat label="Net P/L units" value={stats.totalPnl.toFixed(2)} />
          </div>

          <div className="overflow-x-auto border border-border bg-card">
            <table className="w-full min-w-[900px] font-mono text-xs">
              <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Entry</th>
                  <th className="px-3 py-2 text-right">Entry price</th>
                  <th className="px-3 py-2 text-right">Stop</th>
                  <th className="px-3 py-2 text-right">TP1</th>
                  <th className="px-3 py-2 text-right">R</th>
                  <th className="px-3 py-2 text-left">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {run.trades.map((trade) => (
                  <tr key={trade.tradeId.toString()} className="border-b border-border/40">
                    <td className="px-3 py-2">
                      {new Date(Number(trade.entryTimestamp)).toISOString()}
                    </td>
                    <td className="px-3 py-2 text-right">{trade.entryPrice.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{trade.stopPrice.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{trade.tp1Price.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">
                      {trade.rMultiple?.toFixed(2) ?? "open"}
                    </td>
                    <td className="px-3 py-2">{trade.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
