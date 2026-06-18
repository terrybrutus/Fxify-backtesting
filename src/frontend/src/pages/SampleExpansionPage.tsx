import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import {
  type ExperimentStats,
  type ExperimentTrade,
  sessionFor,
} from "@/pages/ExperimentLabPage";
import {
  type Candle,
  type SignalAudit,
  type TargetCandidate,
  Timeframe,
} from "@/types/strategy";
import { Download, Filter, ShieldAlert } from "lucide-react";
import { useMemo } from "react";

type ExpansionProfile = {
  id: string;
  label: string;
  hypothesis: string;
  predicate: (signal: SignalAudit) => boolean;
};

type ExpansionRow = {
  profile: ExpansionProfile;
  trades: ExperimentTrade[];
  discovery: ExperimentStats;
  validation: ExperimentStats;
  sampleLift: number;
  symbolBreakdown: SegmentRow[];
  sessionBreakdown: SegmentRow[];
  verdict: "No claim" | "Too loose" | "Watchlist" | "Candidate";
  notes: string[];
};

type SegmentRow = {
  label: string;
  trades: number;
  totalR: number;
  winRate: number;
  maxDrawdownR: number;
};

function passed(signal: SignalAudit, label: string) {
  return signal.reasons.some(
    (reason) => reason.label === label && reason.passed,
  );
}

function noHardBlocker(signal: SignalAudit) {
  return !signal.blockers.some((blocker) => blocker.passed);
}

function hasViableTarget(signal: SignalAudit) {
  return (
    signal.rMultipleToTp1 >= 0.8 ||
    (signal.targetCandidates ?? []).some(
      (candidate) => candidate.rMultiple >= 0.8,
    )
  );
}

function targetFor(signal: SignalAudit): TargetCandidate {
  return (
    signal.targetCandidates
      ?.filter((candidate) => candidate.rMultiple >= 0.8)
      .sort((a, b) => a.rMultiple - b.rMultiple)[0] ?? {
      model: signal.targetModel ?? "current TP1",
      price: signal.tp1,
      rMultiple: signal.rMultipleToTp1,
    }
  );
}

function h1BySymbol(candles: Candle[]) {
  const groups = new Map<string, Candle[]>();
  for (const candle of candles) {
    if (candle.timeframe !== Timeframe.H1) continue;
    const group = groups.get(candle.symbol) ?? [];
    group.push(candle);
    groups.set(candle.symbol, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  }
  return groups;
}

function simulateTrade(
  signal: SignalAudit,
  target: TargetCandidate,
  candles: Candle[],
): ExperimentTrade {
  const future = candles.filter(
    (candle) => Number(candle.timestamp) > signal.timestamp,
  );
  const exit = future.find(
    (candle) => candle.low <= signal.stop || candle.high >= target.price,
  );
  const won = exit ? exit.high >= target.price : false;
  return {
    signal,
    target,
    closed: !!exit,
    won,
    rMultiple: exit ? (won ? target.rMultiple : -1) : 0,
  };
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

function segmentBreakdown(
  trades: ExperimentTrade[],
  labelFor: (trade: ExperimentTrade) => string,
): SegmentRow[] {
  const groups = new Map<string, ExperimentTrade[]>();
  for (const trade of trades) {
    const label = labelFor(trade);
    const group = groups.get(label) ?? [];
    group.push(trade);
    groups.set(label, group);
  }
  return [...groups.entries()]
    .map(([label, group]) => {
      const stats = statsFor(group);
      return {
        label,
        trades: stats.trades,
        totalR: stats.totalR,
        winRate: stats.winRate,
        maxDrawdownR: stats.maxDrawdownR,
      };
    })
    .sort((a, b) => b.totalR - a.totalR || b.trades - a.trades);
}

function fmtR(value: number) {
  return `${value.toFixed(2)}R`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
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

const PROFILES: ExpansionProfile[] = [
  {
    id: "locked-accepted",
    label: "Current locked accepts",
    hypothesis: "Baseline only; this is the current strict rule output.",
    predicate: (signal) => signal.accepted,
  },
  {
    id: "score-5-no-hard-blocker",
    label: "Score 5+ no hard blocker",
    hypothesis:
      "Tests whether high-score rejected candidates are useful before choosing which gate to rewrite.",
    predicate: (signal) =>
      noHardBlocker(signal) && signal.score >= 5 && hasViableTarget(signal),
  },
  {
    id: "score-4-no-hard-blocker",
    label: "Score 4+ no hard blocker",
    hypothesis:
      "Stress test. If this improves sample but collapses validation, lower-score expansion is too loose.",
    predicate: (signal) =>
      noHardBlocker(signal) && signal.score >= 4 && hasViableTarget(signal),
  },
  {
    id: "ema200-family",
    label: "200 EMA reaction family",
    hypothesis:
      "Tests Coco-style 200 EMA reactions as their own family instead of forcing every confluence label.",
    predicate: (signal) =>
      noHardBlocker(signal) &&
      passed(signal, "200 EMA reaction") &&
      passed(signal, "Price above 200 EMA") &&
      hasViableTarget(signal),
  },
  {
    id: "daily-ema-target-no-sunday",
    label: "No Sunday proximity requirement",
    hypothesis:
      "Tests whether Sunday proximity is over-filtering otherwise clean continuation ideas.",
    predicate: (signal) =>
      noHardBlocker(signal) &&
      passed(signal, "Daily continuation bias") &&
      passed(signal, "Price above 200 EMA") &&
      passed(signal, "20 EMA > 50 SMA") &&
      hasViableTarget(signal),
  },
  {
    id: "daily-ema-target-no-ma-hold",
    label: "No MA-hold requirement",
    hypothesis:
      "Tests whether MA hold should be context instead of a hard requirement.",
    predicate: (signal) =>
      noHardBlocker(signal) &&
      passed(signal, "Daily continuation bias") &&
      passed(signal, "Price above 200 EMA") &&
      passed(signal, "1H FVG overlap") &&
      hasViableTarget(signal),
  },
  {
    id: "m15-scalp-family",
    label: "15m 20 EMA scalp family",
    hypothesis:
      "Tests lower-timeframe scalp behavior separately from 1H continuation rules.",
    predicate: (signal) =>
      noHardBlocker(signal) &&
      passed(signal, "15m 20 EMA hold") &&
      hasViableTarget(signal),
  },
];

function verdictFor(row: {
  validation: ExperimentStats;
  sampleLift: number;
}): ExpansionRow["verdict"] {
  if (row.validation.trades < 10) return "No claim";
  if (row.validation.totalR <= 0 || row.validation.maxDrawdownR > 6) {
    return "Too loose";
  }
  if (row.validation.trades >= 30 && row.validation.avgR > 0.1) {
    return "Candidate";
  }
  if (row.sampleLift > 1 && row.validation.totalR > 0) return "Watchlist";
  return "No claim";
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

export default function SampleExpansionPage() {
  const { candles, run } = useStrategyWorkspace();
  const signals = useMemo(
    () => [...run.acceptedSignals, ...run.rejectedSignals],
    [run.acceptedSignals, run.rejectedSignals],
  );
  const rows = useMemo<ExpansionRow[]>(() => {
    const candlesBySymbol = h1BySymbol(candles);
    const baselineCount = Math.max(1, run.acceptedSignals.length);
    return PROFILES.map((profile) => {
      const trades = signals.flatMap((signal) => {
        if (signal.stop >= signal.entry) return [];
        if (!profile.predicate(signal)) return [];
        const h1 = candlesBySymbol.get(signal.symbol) ?? [];
        return [simulateTrade(signal, targetFor(signal), h1)];
      });
      const discovery =
        run.validation.discoveryEndTimestamp === undefined
          ? statsFor([])
          : statsFor(
              trades.filter(
                (trade) =>
                  trade.signal.timestamp <=
                  (run.validation.discoveryEndTimestamp ?? 0),
              ),
            );
      const validation =
        run.validation.discoveryEndTimestamp === undefined
          ? statsFor([])
          : statsFor(
              trades.filter(
                (trade) =>
                  trade.signal.timestamp >
                  (run.validation.discoveryEndTimestamp ?? 0),
              ),
            );
      const sampleLift = trades.length / baselineCount;
      const notes = [
        `${trades.length} total simulated trade(s), ${sampleLift.toFixed(
          1,
        )}x current accepted sample.`,
        `Dominant sessions: ${
          [
            ...new Set(
              trades
                .slice(0, 8)
                .map((trade) => sessionFor(trade.signal.timestamp)),
            ),
          ]
            .slice(0, 4)
            .join(", ") || "n/a"
        }.`,
      ];
      return {
        profile,
        trades,
        discovery,
        validation,
        sampleLift,
        symbolBreakdown: segmentBreakdown(
          trades.filter(
            (trade) =>
              trade.signal.timestamp >
              (run.validation.discoveryEndTimestamp ?? 0),
          ),
          (trade) => trade.signal.symbol,
        ),
        sessionBreakdown: segmentBreakdown(
          trades.filter(
            (trade) =>
              trade.signal.timestamp >
              (run.validation.discoveryEndTimestamp ?? 0),
          ),
          (trade) => sessionFor(trade.signal.timestamp),
        ),
        verdict: verdictFor({ validation, sampleLift }),
        notes,
      };
    }).sort(
      (a, b) =>
        b.validation.totalR - a.validation.totalR ||
        b.validation.trades - a.validation.trades,
    );
  }, [
    candles,
    signals,
    run.acceptedSignals.length,
    run.validation.discoveryEndTimestamp,
  ]);
  const candidates = rows.filter((row) => row.verdict === "Candidate").length;
  const watchlist = rows.filter((row) => row.verdict === "Watchlist").length;
  const tooLoose = rows.filter((row) => row.verdict === "Too loose").length;
  const best = rows[0];

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="sample-expansion.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">
            Sample Expansion Lab
          </h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            This page tests controlled ways to expand the trade sample. It does
            not promote a looser rule unless validation survives.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!run.integrity.canRunBacktest}
          onClick={() =>
            downloadFile(
              "ict-sample-expansion.json",
              JSON.stringify(
                {
                  generatedAt: new Date().toISOString(),
                  integrity: run.integrity,
                  baselineAccepted: run.acceptedSignals.length,
                  rows: rows.map((row) => ({
                    id: row.profile.id,
                    label: row.profile.label,
                    hypothesis: row.profile.hypothesis,
                    verdict: row.verdict,
                    sampleLift: row.sampleLift,
                    discovery: row.discovery,
                    validation: row.validation,
                    symbolBreakdown: row.symbolBreakdown,
                    sessionBreakdown: row.sessionBreakdown,
                    notes: row.notes,
                  })),
                },
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Export Expansion
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Sample Expansion Lab is disabled until real 1H and 1D data is loaded.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Locked accepts"
              value={String(run.acceptedSignals.length)}
              detail="Current strict strategy sample"
            />
            <Stat
              label="Expansion candidates"
              value={String(candidates)}
              detail="Validation survived with larger sample"
            />
            <Stat
              label="Watchlist relaxations"
              value={String(watchlist)}
              detail="Useful, still not proof"
            />
            <Stat
              label="Too loose"
              value={String(tooLoose)}
              detail="Sample grew but validation failed"
            />
          </div>

          <section className="border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Anti-Overfit Rule
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  A larger sample is only useful if the validation side stays
                  positive. This page should create hypotheses for Experiment
                  Lab, not silently replace the locked rules.
                </p>
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Expansion Scoreboard
              </h2>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1120px] font-mono text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Profile</th>
                    <th className="py-2 text-left">Verdict</th>
                    <th className="py-2 text-right">Total</th>
                    <th className="py-2 text-right">Lift</th>
                    <th className="py-2 text-right">Discovery</th>
                    <th className="py-2 text-right">Discovery net</th>
                    <th className="py-2 text-right">Validation</th>
                    <th className="py-2 text-right">Validation net</th>
                    <th className="py-2 text-right">Val win</th>
                    <th className="py-2 text-right">Val DD</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.profile.id}
                      className="border-b border-border/40"
                    >
                      <td className="py-2">
                        <span title={row.profile.hypothesis}>
                          {row.profile.label}
                        </span>
                      </td>
                      <td className="py-2">{row.verdict}</td>
                      <td className="py-2 text-right">{row.trades.length}</td>
                      <td className="py-2 text-right">
                        {row.sampleLift.toFixed(1)}x
                      </td>
                      <td className="py-2 text-right">
                        {row.discovery.trades}
                      </td>
                      <td className="py-2 text-right">
                        {fmtR(row.discovery.totalR)}
                      </td>
                      <td className="py-2 text-right">
                        {row.validation.trades}
                      </td>
                      <td className="py-2 text-right">
                        {fmtR(row.validation.totalR)}
                      </td>
                      <td className="py-2 text-right">
                        {pct(row.validation.winRate)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtR(row.validation.maxDrawdownR)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {best && (
            <section className="grid gap-3 xl:grid-cols-[1fr_1.2fr]">
              <article className="border border-border bg-card p-4">
                <h2 className="font-display text-lg font-bold">
                  Current Best Expansion
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {best.profile.label}: {best.profile.hypothesis}
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {best.notes.map((note) => (
                    <div
                      key={note}
                      className="border border-border p-3 text-sm"
                    >
                      {note}
                    </div>
                  ))}
                </div>
              </article>
              <article className="border border-border bg-card p-4">
                <h2 className="font-display text-lg font-bold">
                  Best Expansion Segments
                </h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      By index
                    </p>
                    <table className="mt-2 w-full font-mono text-xs">
                      <tbody>
                        {best.symbolBreakdown.map((segment) => (
                          <tr
                            key={segment.label}
                            className="border-b border-border/40"
                          >
                            <td className="py-2">{segment.label}</td>
                            <td className="py-2 text-right">
                              {segment.trades}
                            </td>
                            <td className="py-2 text-right">
                              {fmtR(segment.totalR)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      By session
                    </p>
                    <table className="mt-2 w-full font-mono text-xs">
                      <tbody>
                        {best.sessionBreakdown.map((segment) => (
                          <tr
                            key={segment.label}
                            className="border-b border-border/40"
                          >
                            <td className="py-2">{segment.label}</td>
                            <td className="py-2 text-right">
                              {segment.trades}
                            </td>
                            <td className="py-2 text-right">
                              {fmtR(segment.totalR)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </article>
            </section>
          )}
        </>
      )}
    </div>
  );
}
