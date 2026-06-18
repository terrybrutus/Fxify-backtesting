import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { classifyEvidence } from "@/lib/evidence";
import { exportCsv, exportJson } from "@/lib/strategyEngine";
import {
  type SignalAudit,
  TradeOutcome,
  type TradeResult,
} from "@/types/strategy";
import { Download } from "lucide-react";
import { useMemo } from "react";

type Breakdown = {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  open: number;
  totalR: number;
  avgR: number;
  winRate: number;
  maxDrawdownR: number;
  status: string;
  statusDetail: string;
};

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
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

function drawdownR(maxDrawdownUnits: number) {
  return maxDrawdownUnits / 100;
}

function fmtDate(value?: number) {
  return value ? new Date(value).toISOString() : "n/a";
}

function equityDrawdownR(trades: TradeResult[]) {
  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of trades) {
    const r = trade.rMultiple ?? 0;
    running += r;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);
  }
  return maxDrawdown;
}

function buildBreakdown(
  trades: TradeResult[],
  signalsById: Map<string, SignalAudit>,
  keyForTrade: (trade: TradeResult, signal?: SignalAudit) => string,
): Breakdown[] {
  const groups = new Map<string, TradeResult[]>();
  for (const trade of trades) {
    const signal = trade.auditId ? signalsById.get(trade.auditId) : undefined;
    const key = keyForTrade(trade, signal);
    const list = groups.get(key) ?? [];
    list.push(trade);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const closed = group.filter((trade) => trade.rMultiple !== undefined);
      const wins = group.filter((trade) => trade.outcome === TradeOutcome.Win);
      const losses = group.filter(
        (trade) => trade.outcome === TradeOutcome.Loss,
      );
      const open = group.filter((trade) => trade.outcome === TradeOutcome.Open);
      const totalR = group.reduce(
        (sum, trade) => sum + (trade.rMultiple ?? 0),
        0,
      );
      const avgR = closed.length ? totalR / closed.length : 0;
      const maxDrawdownR = equityDrawdownR(group);
      const evidence = classifyEvidence({
        trades: group.length,
        totalR,
        avgR,
        maxDrawdownR,
      });
      return {
        key,
        trades: group.length,
        wins: wins.length,
        losses: losses.length,
        open: open.length,
        totalR,
        avgR,
        winRate: closed.length ? wins.length / closed.length : 0,
        maxDrawdownR,
        status: evidence.status,
        statusDetail: evidence.detail,
      };
    })
    .sort((a, b) => b.totalR - a.totalR);
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: Breakdown[];
}) {
  return (
    <section className="border border-border bg-card p-4">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] font-mono text-xs">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="py-2 text-left">Group</th>
              <th className="py-2 text-right">Trades</th>
              <th className="py-2 text-right">W/L</th>
              <th className="py-2 text-right">Win rate</th>
              <th className="py-2 text-right">Total R</th>
              <th className="py-2 text-right">Avg R</th>
              <th className="py-2 text-right">Max DD</th>
              <th className="py-2 text-left">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border/40">
                <td className="py-2">{row.key}</td>
                <td className="py-2 text-right">{row.trades}</td>
                <td className="py-2 text-right">
                  {row.wins}/{row.losses}
                </td>
                <td className="py-2 text-right">
                  {(row.winRate * 100).toFixed(1)}%
                </td>
                <td className="py-2 text-right">{row.totalR.toFixed(2)}R</td>
                <td className="py-2 text-right">{row.avgR.toFixed(2)}R</td>
                <td className="py-2 text-right">
                  {row.maxDrawdownR.toFixed(2)}R
                </td>
                <td className="py-2">
                  <span title={row.statusDetail}>{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BacktestResultsPage() {
  const { run } = useStrategyWorkspace();
  const stats = run.stats;
  const allSignals = [...run.acceptedSignals, ...run.rejectedSignals];
  const signalsById = useMemo(
    () => new Map(run.acceptedSignals.map((signal) => [signal.id, signal])),
    [run.acceptedSignals],
  );
  const familyRows = useMemo(
    () =>
      buildBreakdown(
        run.trades,
        signalsById,
        (_trade, signal) => signal?.setupType ?? "Unknown setup",
      ),
    [run.trades, signalsById],
  );
  const symbolRows = useMemo(
    () =>
      buildBreakdown(
        run.trades,
        signalsById,
        (_trade, signal) => signal?.symbol ?? "Unknown symbol",
      ),
    [run.trades, signalsById],
  );
  const familySymbolRows = useMemo(
    () =>
      buildBreakdown(run.trades, signalsById, (_trade, signal) =>
        signal ? `${signal.setupType} | ${signal.symbol}` : "Unknown",
      ),
    [run.trades, signalsById],
  );
  const losingTrades = run.trades.filter(
    (trade) => trade.outcome === TradeOutcome.Loss,
  );
  const overallEvidence = classifyEvidence({
    trades: run.trades.length,
    totalR: stats.totalPnl / 100,
    avgR: stats.avgRR,
    maxDrawdownR: drawdownR(stats.maxDrawdown),
  });

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
              downloadFile(
                "ict-audit-log.json",
                exportJson(run),
                "application/json",
              )
            }
          >
            <Download className="mr-2 h-4 w-4" />
            JSON
          </Button>
          <Button
            type="button"
            disabled={!run.integrity.canRunBacktest}
            onClick={() =>
              downloadFile(
                "ict-signal-log.csv",
                exportCsv(allSignals),
                "text/csv",
              )
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
            <Stat
              label="Accepted signals"
              value={String(run.acceptedSignals.length)}
            />
            <Stat
              label="Rejected candidates"
              value={String(run.rejectedSignals.length)}
            />
            <Stat
              label="Win rate"
              value={`${(stats.winRate * 100).toFixed(1)}%`}
            />
            <Stat label="Profit factor" value={stats.profitFactor.toFixed(2)} />
            <Stat label="Total trades" value={stats.totalTrades.toString()} />
            <Stat
              label="Evidence status"
              value={overallEvidence.status}
              detail={overallEvidence.detail}
            />
            <Stat label="Avg R" value={`${stats.avgRR.toFixed(2)}R`} />
            <Stat
              label="Max drawdown"
              value={`${drawdownR(stats.maxDrawdown).toFixed(2)}R`}
              detail={`${stats.maxDrawdown.toFixed(2)} audit units`}
            />
            <Stat
              label="Net P/L"
              value={`${(stats.totalPnl / 100).toFixed(2)}R`}
              detail={`${stats.totalPnl.toFixed(2)} audit units`}
            />
          </div>

          <section className="border border-border bg-card p-4">
            <h2 className="font-display text-lg font-bold">
              Discovery vs Validation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {run.validation.method}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Discovery ends at {fmtDate(run.validation.discoveryEndTimestamp)}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="border border-border bg-background p-4">
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Discovery period
                </p>
                <div className="mt-3 grid gap-2 font-mono text-xs text-muted-foreground">
                  <p>Trades: {run.validation.discoveryTradeCount}</p>
                  <p>
                    Win rate:{" "}
                    {(run.validation.discoveryStats.winRate * 100).toFixed(1)}%
                  </p>
                  <p>
                    Net:{" "}
                    {(run.validation.discoveryStats.totalPnl / 100).toFixed(2)}R
                  </p>
                  <p>
                    Max DD:{" "}
                    {drawdownR(
                      run.validation.discoveryStats.maxDrawdown,
                    ).toFixed(2)}
                    R
                  </p>
                </div>
              </div>
              <div className="border border-border bg-background p-4">
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Validation period
                </p>
                <div className="mt-3 grid gap-2 font-mono text-xs text-muted-foreground">
                  <p>Trades: {run.validation.validationTradeCount}</p>
                  <p>
                    Win rate:{" "}
                    {(run.validation.validationStats.winRate * 100).toFixed(1)}%
                  </p>
                  <p>
                    Net:{" "}
                    {(run.validation.validationStats.totalPnl / 100).toFixed(2)}
                    R
                  </p>
                  <p>
                    Max DD:{" "}
                    {drawdownR(
                      run.validation.validationStats.maxDrawdown,
                    ).toFixed(2)}
                    R
                  </p>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-3">
            <BreakdownTable title="By Setup Family" rows={familyRows} />
            <BreakdownTable title="By Index" rows={symbolRows} />
            <BreakdownTable title="By Family + Index" rows={familySymbolRows} />
          </div>

          {losingTrades.length > 0 && (
            <section className="border border-destructive/40 bg-destructive/5 p-4">
              <h2 className="font-display text-lg font-bold">
                Loss Diagnostics
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[980px] font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Entry</th>
                      <th className="py-2 text-left">Setup</th>
                      <th className="py-2 text-left">Index</th>
                      <th className="py-2 text-right">R</th>
                      <th className="py-2 text-left">Missing factors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {losingTrades.map((trade) => {
                      const signal = trade.auditId
                        ? signalsById.get(trade.auditId)
                        : undefined;
                      const missing = signal?.reasons
                        .filter((reason) => !reason.passed)
                        .map((reason) => reason.label);
                      return (
                        <tr
                          key={trade.tradeId.toString()}
                          className="border-b border-border/40"
                        >
                          <td className="py-2">
                            {new Date(
                              Number(trade.entryTimestamp),
                            ).toISOString()}
                          </td>
                          <td className="py-2">
                            {signal?.setupType ?? "Unknown setup"}
                          </td>
                          <td className="py-2">
                            {signal?.symbol ?? "Unknown"}
                          </td>
                          <td className="py-2 text-right">
                            {trade.rMultiple?.toFixed(2) ?? "open"}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {missing?.join("; ") ||
                              "No missing factors captured"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="overflow-x-auto border border-border bg-card">
            <table className="w-full min-w-[1100px] font-mono text-xs">
              <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Entry</th>
                  <th className="px-3 py-2 text-left">Setup</th>
                  <th className="px-3 py-2 text-left">Index</th>
                  <th className="px-3 py-2 text-right">Entry price</th>
                  <th className="px-3 py-2 text-right">Stop</th>
                  <th className="px-3 py-2 text-right">TP1</th>
                  <th className="px-3 py-2 text-right">R</th>
                  <th className="px-3 py-2 text-left">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {run.trades.map((trade) => {
                  const signal = trade.auditId
                    ? signalsById.get(trade.auditId)
                    : undefined;
                  return (
                    <tr
                      key={trade.tradeId.toString()}
                      className="border-b border-border/40"
                    >
                      <td className="px-3 py-2">
                        {new Date(Number(trade.entryTimestamp)).toISOString()}
                      </td>
                      <td className="px-3 py-2">
                        {signal?.setupType ?? "Unknown setup"}
                      </td>
                      <td className="px-3 py-2">
                        {signal?.symbol ?? "Unknown"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {trade.entryPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {trade.stopPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {trade.tp1Price.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {trade.rMultiple?.toFixed(2) ?? "open"}
                      </td>
                      <td className="px-3 py-2">{trade.outcome}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
