import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import {
  type ExperimentStats,
  type ExperimentTrade,
  buildExperimentRows,
} from "@/pages/ExperimentLabPage";
import { Download, GitCompareArrows, ShieldAlert } from "lucide-react";
import { useMemo } from "react";

type WalkWindow = {
  index: number;
  start: number;
  end: number;
};

type WindowResult = {
  window: WalkWindow;
  prior: ExperimentStats;
  forward: ExperimentStats;
  eligible: boolean;
  status: "Warmup" | "Under-sampled" | "Survived" | "Failed";
};

type WalkRow = {
  id: string;
  setup: string;
  symbolScope: string;
  sessionScope: string;
  targetModel: string;
  windows: WindowResult[];
  eligibleWindows: number;
  survivedWindows: number;
  forwardTrades: number;
  forwardNetR: number;
  positiveWindowRate: number;
  worstWindowR: number;
  verdict: "No claim" | "Unstable" | "Watchlist" | "Repeatable candidate";
};

function fmtR(value: number) {
  return `${value.toFixed(2)}R`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtDate(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function statsFor(trades: ExperimentTrade[]): ExperimentStats {
  const closed = trades.filter((trade) => trade.closed);
  const wins = closed.filter((trade) => trade.won);
  const losses = closed.filter((trade) => !trade.won);
  const totalR = closed.reduce((sum, trade) => sum + trade.rMultiple, 0);
  let running = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  for (const trade of closed) {
    running += trade.rMultiple;
    peak = Math.max(peak, running);
    maxDrawdownR = Math.max(maxDrawdownR, peak - running);
  }
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    open: trades.length - closed.length,
    totalR,
    avgR: closed.length ? totalR / closed.length : 0,
    winRate: closed.length ? wins.length / closed.length : 0,
    maxDrawdownR,
  };
}

function buildWindows(start?: number, end?: number): WalkWindow[] {
  if (!start || !end || end <= start) return [];
  const count = 6;
  const size = Math.floor((end - start) / count);
  return Array.from({ length: count }, (_, index) => ({
    index,
    start: start + size * index,
    end: index === count - 1 ? end + 1 : start + size * (index + 1),
  }));
}

function verdictFor({
  eligibleWindows,
  survivedWindows,
  forwardNetR,
  positiveWindowRate,
  forwardTrades,
}: Pick<
  WalkRow,
  | "eligibleWindows"
  | "survivedWindows"
  | "forwardNetR"
  | "positiveWindowRate"
  | "forwardTrades"
>): WalkRow["verdict"] {
  if (eligibleWindows < 2 || forwardTrades < 5) return "No claim";
  if (forwardNetR <= 0 || positiveWindowRate < 0.5) return "Unstable";
  if (
    eligibleWindows >= 3 &&
    survivedWindows >= 2 &&
    positiveWindowRate >= 0.6
  ) {
    return "Repeatable candidate";
  }
  return "Watchlist";
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

export default function WalkForwardPage() {
  const { candles, run } = useStrategyWorkspace();
  const signals = useMemo(
    () => [...run.acceptedSignals, ...run.rejectedSignals],
    [run.acceptedSignals, run.rejectedSignals],
  );
  const experimentRows = useMemo(
    () =>
      buildExperimentRows({
        signals,
        candles,
        splitTimestamp: run.validation.discoveryEndTimestamp,
      }),
    [signals, candles, run.validation.discoveryEndTimestamp],
  );
  const windows = useMemo(
    () => buildWindows(run.integrity.start, run.integrity.end),
    [run.integrity.start, run.integrity.end],
  );
  const rows = useMemo<WalkRow[]>(
    () =>
      experimentRows
        .map((row) => {
          const windowResults = windows.slice(1).map((window) => {
            const prior = statsFor(
              row.trades.filter(
                (trade) => trade.signal.timestamp < window.start,
              ),
            );
            const forward = statsFor(
              row.trades.filter(
                (trade) =>
                  trade.signal.timestamp >= window.start &&
                  trade.signal.timestamp < window.end,
              ),
            );
            const eligible = prior.trades >= 3 && prior.totalR > 0;
            const status: WindowResult["status"] =
              window.index === 0
                ? "Warmup"
                : !eligible
                  ? "Under-sampled"
                  : forward.totalR > 0
                    ? "Survived"
                    : "Failed";
            return {
              window,
              prior,
              forward,
              eligible,
              status,
            };
          });
          const eligible = windowResults.filter((item) => item.eligible);
          const survived = eligible.filter((item) => item.forward.totalR > 0);
          const forwardTrades = eligible.reduce(
            (sum, item) => sum + item.forward.trades,
            0,
          );
          const forwardNetR = eligible.reduce(
            (sum, item) => sum + item.forward.totalR,
            0,
          );
          const positiveWindowRate = eligible.length
            ? survived.length / eligible.length
            : 0;
          const worstWindowR = eligible.length
            ? Math.min(...eligible.map((item) => item.forward.totalR))
            : 0;
          return {
            id: row.variant.id,
            setup: row.variant.setup,
            symbolScope: row.variant.symbolScope,
            sessionScope: row.variant.sessionScope,
            targetModel: row.variant.targetModel,
            windows: windowResults,
            eligibleWindows: eligible.length,
            survivedWindows: survived.length,
            forwardTrades,
            forwardNetR,
            positiveWindowRate,
            worstWindowR,
            verdict: verdictFor({
              eligibleWindows: eligible.length,
              survivedWindows: survived.length,
              forwardNetR,
              positiveWindowRate,
              forwardTrades,
            }),
          };
        })
        .sort(
          (a, b) =>
            b.forwardNetR - a.forwardNetR ||
            b.eligibleWindows - a.eligibleWindows ||
            b.forwardTrades - a.forwardTrades,
        ),
    [experimentRows, windows],
  );
  const repeatableCount = rows.filter(
    (row) => row.verdict === "Repeatable candidate",
  ).length;
  const watchlistCount = rows.filter(
    (row) => row.verdict === "Watchlist",
  ).length;
  const best = rows[0];

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="walk-forward.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Walk-Forward Lab</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            This page repeats the discovery-to-validation test across multiple
            chronological windows. A rule must keep surviving later windows
            before it earns more trust.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!run.integrity.canRunBacktest}
          onClick={() =>
            downloadFile(
              "ict-walk-forward-report.json",
              JSON.stringify(
                {
                  generatedAt: new Date().toISOString(),
                  integrity: run.integrity,
                  windows,
                  rows,
                },
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Export Report
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Walk-forward testing is disabled until real 1H and 1D data is loaded.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Walk windows"
              value={String(Math.max(0, windows.length - 1))}
              detail="Each window grades rules using later data"
            />
            <Stat
              label="Repeatable candidates"
              value={String(repeatableCount)}
              detail="Survived multiple eligible windows"
            />
            <Stat
              label="Watchlist"
              value={String(watchlistCount)}
              detail="Positive but still fragile"
            />
            <Stat
              label="Best walk-forward net"
              value={best ? fmtR(best.forwardNetR) : "0.00R"}
              detail={best?.id ?? "No variant"}
            />
          </div>

          <section className="border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Still Not Live Proof
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Walk-forward evidence is stronger than one split, but it is
                  still historical. A repeatable candidate must still be frozen
                  and tracked on newer imported candles before it can be treated
                  as forward-tested.
                </p>
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Walk-Forward Scoreboard
              </h2>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1120px] font-mono text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Variant</th>
                    <th className="py-2 text-left">Index</th>
                    <th className="py-2 text-left">Session</th>
                    <th className="py-2 text-left">Target</th>
                    <th className="py-2 text-right">Eligible</th>
                    <th className="py-2 text-right">Survived</th>
                    <th className="py-2 text-right">Forward trades</th>
                    <th className="py-2 text-right">Forward net</th>
                    <th className="py-2 text-right">Positive windows</th>
                    <th className="py-2 text-right">Worst window</th>
                    <th className="py-2 text-left">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/40">
                      <td className="py-2">{row.setup}</td>
                      <td className="py-2">{row.symbolScope}</td>
                      <td className="py-2">{row.sessionScope}</td>
                      <td className="py-2">{row.targetModel}</td>
                      <td className="py-2 text-right">{row.eligibleWindows}</td>
                      <td className="py-2 text-right">{row.survivedWindows}</td>
                      <td className="py-2 text-right">{row.forwardTrades}</td>
                      <td className="py-2 text-right">
                        {fmtR(row.forwardNetR)}
                      </td>
                      <td className="py-2 text-right">
                        {pct(row.positiveWindowRate)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtR(row.worstWindowR)}
                      </td>
                      <td className="py-2">{row.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {best && (
            <section className="border border-border bg-card p-4">
              <h2 className="font-display text-lg font-bold">
                Best Variant Window Detail
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {best.setup} | {best.symbolScope} | {best.sessionScope} |{" "}
                {best.targetModel}
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[820px] font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Window</th>
                      <th className="py-2 text-right">Prior trades</th>
                      <th className="py-2 text-right">Prior net</th>
                      <th className="py-2 text-right">Forward trades</th>
                      <th className="py-2 text-right">Forward net</th>
                      <th className="py-2 text-right">Forward win</th>
                      <th className="py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {best.windows.map((windowResult) => (
                      <tr
                        key={windowResult.window.index}
                        className="border-b border-border/40"
                      >
                        <td className="py-2">
                          {fmtDate(windowResult.window.start)} to{" "}
                          {fmtDate(windowResult.window.end)}
                        </td>
                        <td className="py-2 text-right">
                          {windowResult.prior.trades}
                        </td>
                        <td className="py-2 text-right">
                          {fmtR(windowResult.prior.totalR)}
                        </td>
                        <td className="py-2 text-right">
                          {windowResult.forward.trades}
                        </td>
                        <td className="py-2 text-right">
                          {fmtR(windowResult.forward.totalR)}
                        </td>
                        <td className="py-2 text-right">
                          {pct(windowResult.forward.winRate)}
                        </td>
                        <td className="py-2">{windowResult.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
