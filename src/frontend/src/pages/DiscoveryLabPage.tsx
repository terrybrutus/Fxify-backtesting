import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import {
  type AuditFactor,
  type SignalAudit,
  Timeframe,
} from "@/types/strategy";
import { FlaskConical, ShieldAlert, TrendingUp } from "lucide-react";
import { useMemo } from "react";

type InsightSeverity = "watch" | "promising" | "blocked";

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function rate(part: number, total: number) {
  return total === 0 ? 0 : part / total;
}

function passed(label: string, signal: SignalAudit) {
  return signal.reasons.some(
    (reason) => reason.label === label && reason.passed,
  );
}

function failed(label: string, signal: SignalAudit) {
  return signal.reasons.some(
    (reason) => reason.label === label && !reason.passed,
  );
}

function countFactors(
  signals: SignalAudit[],
  predicate: (factor: AuditFactor) => boolean,
) {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    for (const factor of signal.reasons) {
      if (!predicate(factor)) continue;
      counts.set(factor.label, (counts.get(factor.label) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function InsightCard({
  title,
  severity,
  children,
}: {
  title: string;
  severity: InsightSeverity;
  children: React.ReactNode;
}) {
  const styles = {
    promising: "border-chart-1/35 bg-chart-1/5",
    watch: "border-primary/30 bg-primary/5",
    blocked: "border-destructive/40 bg-destructive/5",
  };
  return (
    <article className={`border p-4 ${styles[severity]}`}>
      <p className="font-mono text-xs font-bold uppercase tracking-widest">
        {title}
      </p>
      <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </article>
  );
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

export default function DiscoveryLabPage() {
  const { run } = useStrategyWorkspace();
  const signals = useMemo(
    () => [...run.acceptedSignals, ...run.rejectedSignals],
    [run.acceptedSignals, run.rejectedSignals],
  );
  const accepted = run.acceptedSignals;
  const rejected = run.rejectedSignals;

  const discovery = useMemo(() => {
    const tp1Passes = signals.filter((signal) =>
      passed("TP1 buyside liquidity >= 0.8R", signal),
    ).length;
    const maHoldPasses = signals.filter((signal) =>
      passed("Moving average hold", signal),
    ).length;
    const fvgPasses = signals.filter((signal) =>
      passed("1H FVG overlap", signal),
    ).length;
    const sundayPasses = signals.filter((signal) =>
      passed("Sunday level within 0.12 ATR", signal),
    ).length;
    const acceptedWithMissingMa = accepted.filter((signal) =>
      failed("Moving average hold", signal),
    ).length;
    const acceptedWithMissingSunday = accepted.filter((signal) =>
      failed("Sunday level within 0.12 ATR", signal),
    ).length;
    const acceptedBySymbol = accepted.reduce<Record<string, number>>(
      (totals, signal) => {
        totals[signal.symbol] = (totals[signal.symbol] ?? 0) + 1;
        return totals;
      },
      {},
    );
    const rejectedBySymbol = rejected.reduce<Record<string, number>>(
      (totals, signal) => {
        totals[signal.symbol] = (totals[signal.symbol] ?? 0) + 1;
        return totals;
      },
      {},
    );
    const scoreCounts = rejected.reduce<Record<number, number>>(
      (totals, signal) => {
        totals[signal.score] = (totals[signal.score] ?? 0) + 1;
        return totals;
      },
      {},
    );
    const highScoreRejects = rejected.filter((signal) => signal.score >= 5);
    const activeRangeBlocks = rejected.filter((signal) =>
      signal.blockers.some(
        (blocker) => blocker.label === "Range state" && blocker.passed,
      ),
    ).length;
    const rrValues = signals
      .map((signal) => signal.rMultipleToTp1)
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    const medianR =
      rrValues.length === 0
        ? 0
        : rrValues[Math.floor((rrValues.length - 1) * 0.5)];

    return {
      tp1PassRate: rate(tp1Passes, signals.length),
      maHoldPassRate: rate(maHoldPasses, signals.length),
      fvgPassRate: rate(fvgPasses, signals.length),
      sundayPassRate: rate(sundayPasses, signals.length),
      acceptedWithMissingMa,
      acceptedWithMissingSunday,
      acceptedBySymbol,
      rejectedBySymbol,
      scoreCounts,
      highScoreRejects,
      activeRangeBlocks,
      medianR,
      topMissing: countFactors(rejected, (factor) => !factor.passed).slice(
        0,
        5,
      ),
    };
  }, [accepted, rejected, signals]);

  const hasLowerTimeframeContext = run.integrity.timeframes.some(
    (timeframe) => timeframe === Timeframe.M15 || timeframe === Timeframe.M5,
  );
  const hasHoldContext = run.integrity.timeframes.includes(Timeframe.H4);

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="discovery.page">
      <div>
        <h1 className="font-display text-2xl font-bold">Discovery Lab</h1>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
          This page is for finding hypotheses, not declaring a winning system.
          Anything discovered here should be promoted to a locked rule only
          after replay review, out-of-sample testing, and forward validation.
        </p>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Discovery is disabled until real 1H and 1D data is loaded.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Hypothesis candidates"
              value={String(signals.length)}
            />
            <Stat
              label="Accepted by current rules"
              value={String(accepted.length)}
            />
            <Stat
              label="High-score rejects"
              value={String(discovery.highScoreRejects.length)}
            />
            <Stat label="Median TP1 R" value={discovery.medianR.toFixed(2)} />
          </div>

          <section className="grid gap-3 lg:grid-cols-3">
            <InsightCard title="Do Not Trust Yet" severity="blocked">
              Only {accepted.length} accepted setup(s) exist under the current
              rule profile. That is not enough to claim an edge, even if the
              current sample shows wins. Treat accepted setups as review
              candidates, not proof.
            </InsightCard>
            <InsightCard title="Coco Profile Gap" severity="watch">
              {discovery.acceptedWithMissingMa} accepted setup(s) failed moving
              average hold and {discovery.acceptedWithMissingSunday} failed
              Sunday proximity. Coco described MAs and old Sunday levels as core
              context, so these should become structured setup rules, not loose
              score bonuses.
            </InsightCard>
            <InsightCard title="TP1 Bottleneck" severity="watch">
              TP1 liquidity passed on {pct(discovery.tp1PassRate)} of
              candidates. This is the main rejection pressure. Next discovery
              work should compare previous-day highs, session highs, old Sunday
              levels, and imbalance fills as separate TP models.
            </InsightCard>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <div className="border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                <h2 className="font-display text-lg font-bold">
                  Candidate Signals
                </h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Stat
                  label="TP1 pass rate"
                  value={pct(discovery.tp1PassRate)}
                />
                <Stat
                  label="MA hold pass rate"
                  value={pct(discovery.maHoldPassRate)}
                />
                <Stat
                  label="FVG overlap pass rate"
                  value={pct(discovery.fvgPassRate)}
                />
                <Stat
                  label="Sunday proximity rate"
                  value={pct(discovery.sundayPassRate)}
                />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Missing factor</th>
                      <th className="py-2 text-right">Rejected count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discovery.topMissing.map(([label, count]) => (
                      <tr key={label} className="border-b border-border/40">
                        <td className="py-2">{label}</td>
                        <td className="py-2 text-right">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <h2 className="font-display text-lg font-bold">
                  Anti-Overfit Guardrails
                </h2>
              </div>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <p>
                  Lock strategy rules before checking future periods. Discovery
                  findings should create hypotheses, then replay and
                  forward-test them without moving the goalposts.
                </p>
                <p>
                  Keep accepted and rejected setups visible together. A good lab
                  must explain skipped trades, late invalidations, and weak TP
                  targets instead of only showing winners.
                </p>
                <p>
                  Current data has {hasLowerTimeframeContext ? "some" : "no"}{" "}
                  lower timeframe context and{" "}
                  {hasHoldContext ? "has" : "does not have"} 4H context. Coco
                  described 15m scalp behavior and 4H hold behavior, so
                  timeframe-specific claims need matching candles.
                </p>
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Next Discovery Queue
              </h2>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <InsightCard
                title="Target Models To Compare"
                severity="promising"
              >
                Compare TP1 candidates independently: previous-day high/low,
                Asia/London/NY highs and lows, old Sunday levels, major FVG
                fill, and 15m 20 EMA when stretched. Do not merge these into one
                vague liquidity label.
              </InsightCard>
              <InsightCard
                title="Invalidation Models To Compare"
                severity="watch"
              >
                Default invalidation should use entry-timeframe candle closes,
                while higher timeframe MA, 200 EMA, weekly high/low, and Sunday
                breaks are checked on their own timeframe. Keep wick-through vs
                close-through visible in the audit log.
              </InsightCard>
              <InsightCard title="Setup Families" severity="promising">
                Separate continuation, old-Sunday reaction, 200 EMA reaction,
                15m retrace scalp, and higher-timeframe imbalance fill. Each
                family should have its own required rules, stops, and TP logic.
              </InsightCard>
              <InsightCard title="Forward Proof" severity="blocked">
                After a setup family looks promising, freeze its settings and
                track the next unseen signals. The app should mark them as
                pending, won, lost, skipped, or invalidated before using them in
                performance claims.
              </InsightCard>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
