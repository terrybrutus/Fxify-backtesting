import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { loadFrozenVariants } from "@/lib/forwardTracker";
import {
  type ExperimentRow,
  buildExperimentRows,
} from "@/pages/ExperimentLabPage";
import {
  type WalkRow,
  buildWalkForwardRows,
  buildWindows,
  statsFor,
} from "@/pages/WalkForwardPage";
import { Download, ShieldAlert, Target, XCircle } from "lucide-react";
import { useMemo } from "react";

export type DecisionStatus =
  | "Do not trade"
  | "Needs evidence"
  | "Research candidate"
  | "Forward-test candidate";

export type DecisionRow = {
  id: string;
  ruleFamily: string;
  setup: string;
  symbolScope: string;
  sessionScope: string;
  targetModel: string;
  status: DecisionStatus;
  action: string;
  experiment: ExperimentRow;
  walk?: WalkRow;
  frozen: boolean;
  forwardTrades: number;
  forwardNetR: number;
  score: number;
  reasons: string[];
  blockers: string[];
};

function fmtR(value: number) {
  return `${value.toFixed(2)}R`;
}

function isValidationPositiveDivergence(experiment: ExperimentRow) {
  return (
    experiment.promotionGate === "Diverged" &&
    experiment.validation.trades > 0 &&
    experiment.validation.totalR > 0
  );
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

function statusFor({
  experiment,
  walk,
  frozen,
  forwardTrades,
  forwardNetR,
}: {
  experiment: ExperimentRow;
  walk?: WalkRow;
  frozen: boolean;
  forwardTrades: number;
  forwardNetR: number;
}): DecisionStatus {
  if (walk?.verdict === "Unstable" || experiment.validation.totalR < 0) {
    return "Do not trade";
  }
  if (experiment.promotionGate === "Diverged") {
    return isValidationPositiveDivergence(experiment)
      ? "Needs evidence"
      : "Do not trade";
  }
  if (
    frozen &&
    forwardTrades >= 10 &&
    forwardNetR > 0 &&
    walk?.verdict === "Repeatable candidate"
  ) {
    return "Forward-test candidate";
  }
  if (
    (experiment.promotionGate === "Watchlist" ||
      experiment.promotionGate === "Forward-test candidate") &&
    (walk?.verdict === "Watchlist" || walk?.verdict === "Repeatable candidate")
  ) {
    return "Research candidate";
  }
  return "Needs evidence";
}

function actionFor(status: DecisionStatus, frozen: boolean) {
  if (status === "Do not trade") return "Avoid";
  if (status === "Forward-test candidate") return "Paper/prop-demo review";
  if (status === "Research candidate")
    return frozen ? "Track forward" : "Freeze";
  return "Keep testing";
}

export function buildDecisionRows({
  experiments,
  walkRows,
}: {
  experiments: ExperimentRow[];
  walkRows: WalkRow[];
}): DecisionRow[] {
  const frozen = loadFrozenVariants();
  const walkById = new Map(walkRows.map((row) => [row.id, row]));
  return experiments
    .map((experiment) => {
      const walk = walkById.get(experiment.variant.id);
      const frozenMatches = frozen.filter(
        (variant) => variant.variantId === experiment.variant.id,
      );
      const forwardTrades = frozenMatches.flatMap((variant) =>
        experiment.trades.filter(
          (trade) => trade.signal.timestamp > variant.frozenAt,
        ),
      );
      const forwardStats = statsFor(forwardTrades);
      const status = statusFor({
        experiment,
        walk,
        frozen: frozenMatches.length > 0,
        forwardTrades: forwardStats.trades,
        forwardNetR: forwardStats.totalR,
      });
      const reasons = [
        `Experiment gate: ${experiment.promotionGate}`,
        `Validation: ${experiment.validation.trades} trade(s), ${fmtR(
          experiment.validation.totalR,
        )}`,
        walk
          ? `Walk-forward: ${walk.verdict}, ${walk.survivedWindows}/${walk.eligibleWindows} survived`
          : "Walk-forward: unavailable",
        frozenMatches.length
          ? `Frozen variants: ${frozenMatches.length}`
          : "Frozen variants: none",
      ];
      const blockers = [
        experiment.promotionGate === "Diverged"
          ? isValidationPositiveDivergence(experiment)
            ? "Discovery and validation diverged; treat as regime-shift evidence, not proof."
            : "Experiment gate diverged."
          : undefined,
        experiment.consistencyRisk !== "Low"
          ? `Consistency risk is ${experiment.consistencyRisk}.`
          : undefined,
        experiment.validation.trades < 10
          ? "Validation sample below 10 trades."
          : undefined,
        walk && walk.eligibleWindows < 2
          ? "Walk-forward has fewer than two eligible windows."
          : undefined,
        !frozenMatches.length
          ? "Rule has not been frozen for future imports."
          : undefined,
        frozenMatches.length && forwardStats.trades < 10
          ? "Forward evidence below 10 post-freeze trades."
          : undefined,
      ].filter(Boolean) as string[];
      const score =
        experiment.validation.totalR +
        (walk?.forwardNetR ?? 0) +
        forwardStats.totalR -
        blockers.length * 0.25;
      return {
        id: experiment.variant.id,
        ruleFamily: experiment.variant.ruleFamily,
        setup: experiment.variant.setup,
        symbolScope: experiment.variant.symbolScope,
        sessionScope: experiment.variant.sessionScope,
        targetModel: experiment.variant.targetModel,
        status,
        action: actionFor(status, frozenMatches.length > 0),
        experiment,
        walk,
        frozen: frozenMatches.length > 0,
        forwardTrades: forwardStats.trades,
        forwardNetR: forwardStats.totalR,
        score,
        reasons,
        blockers,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.experiment.validation.trades - a.experiment.validation.trades,
    );
}

export default function DecisionConsolePage() {
  const { candles, run } = useStrategyWorkspace();
  const signals = useMemo(
    () => [...run.acceptedSignals, ...run.rejectedSignals],
    [run.acceptedSignals, run.rejectedSignals],
  );
  const experiments = useMemo(
    () =>
      buildExperimentRows({
        signals,
        candles,
        splitTimestamp: run.validation.discoveryEndTimestamp,
      }),
    [signals, candles, run.validation.discoveryEndTimestamp],
  );
  const walkRows = useMemo(
    () =>
      buildWalkForwardRows({
        experimentRows: experiments,
        windows: buildWindows(run.integrity.start, run.integrity.end),
      }),
    [experiments, run.integrity.start, run.integrity.end],
  );
  const decisions = useMemo(
    () => buildDecisionRows({ experiments, walkRows }),
    [experiments, walkRows],
  );
  const forwardReady = decisions.filter(
    (row) => row.status === "Forward-test candidate",
  );
  const researchCandidates = decisions.filter(
    (row) => row.status === "Research candidate",
  );
  const avoid = decisions.filter((row) => row.status === "Do not trade");
  const top = decisions.slice(0, 12);

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="decision.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Decision Console</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            This page translates the labs into guarded actions. It can promote a
            setup to research or forward-test review, but it refuses live trade
            claims without post-freeze evidence.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!run.integrity.canRunBacktest}
          onClick={() =>
            downloadFile(
              "ict-decision-console.json",
              JSON.stringify(
                {
                  generatedAt: new Date().toISOString(),
                  integrity: run.integrity,
                  decisions: decisions.map((row) => ({
                    id: row.id,
                    setup: row.setup,
                    ruleFamily: row.ruleFamily,
                    symbolScope: row.symbolScope,
                    sessionScope: row.sessionScope,
                    targetModel: row.targetModel,
                    status: row.status,
                    action: row.action,
                    experimentGate: row.experiment.promotionGate,
                    consistencyRisk: row.experiment.consistencyRisk,
                    score: row.score,
                    validationTrades: row.experiment.validation.trades,
                    validationNetR: row.experiment.validation.totalR,
                    walkVerdict: row.walk?.verdict ?? "Unavailable",
                    forwardTrades: row.forwardTrades,
                    forwardNetR: row.forwardNetR,
                    reasons: row.reasons,
                    blockers: row.blockers,
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
          Export Decisions
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Decision Console is disabled until real 1H and 1D data is loaded.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Forward-test candidates"
              value={String(forwardReady.length)}
              detail="Requires frozen post-import evidence"
            />
            <Stat
              label="Research candidates"
              value={String(researchCandidates.length)}
              detail="Needs freeze or more forward proof"
            />
            <Stat
              label="Avoid"
              value={String(avoid.length)}
              detail="Diverged or unstable evidence"
            />
            <Stat
              label="Best score"
              value={top[0] ? top[0].score.toFixed(2) : "0.00"}
              detail={top[0]?.id ?? "No variant"}
            />
          </div>

          <section className="border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Live Entry Gate
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  A research candidate is not a live signal. The app needs a
                  frozen rule plus enough newer post-freeze trades before a
                  setup can move toward actual entry/exit guidance.
                </p>
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Ranked Decisions
              </h2>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1220px] font-mono text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Setup</th>
                    <th className="py-2 text-left">Rule family</th>
                    <th className="py-2 text-left">Index</th>
                    <th className="py-2 text-left">Session</th>
                    <th className="py-2 text-left">Target</th>
                    <th className="py-2 text-left">Status</th>
                    <th className="py-2 text-left">Action</th>
                    <th className="py-2 text-left">Gate</th>
                    <th className="py-2 text-right">Val trades</th>
                    <th className="py-2 text-right">Val net</th>
                    <th className="py-2 text-left">Walk</th>
                    <th className="py-2 text-right">Forward</th>
                    <th className="py-2 text-right">Forward net</th>
                    <th className="py-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((row) => (
                    <tr key={row.id} className="border-b border-border/40">
                      <td className="py-2">{row.setup}</td>
                      <td className="py-2">{row.ruleFamily}</td>
                      <td className="py-2">{row.symbolScope}</td>
                      <td className="py-2">{row.sessionScope}</td>
                      <td className="py-2">{row.targetModel}</td>
                      <td className="py-2">{row.status}</td>
                      <td className="py-2">{row.action}</td>
                      <td className="py-2">{row.experiment.promotionGate}</td>
                      <td className="py-2 text-right">
                        {row.experiment.validation.trades}
                      </td>
                      <td className="py-2 text-right">
                        {fmtR(row.experiment.validation.totalR)}
                      </td>
                      <td className="py-2">
                        {row.walk?.verdict ?? "Unavailable"}
                      </td>
                      <td className="py-2 text-right">{row.forwardTrades}</td>
                      <td className="py-2 text-right">
                        {fmtR(row.forwardNetR)}
                      </td>
                      <td className="py-2 text-right">
                        {row.score.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-3 xl:grid-cols-2">
            <article className="border border-primary/30 bg-primary/5 p-4">
              <h2 className="font-display text-lg font-bold">
                Top Evidence Notes
              </h2>
              <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                {top.slice(0, 3).map((row) => (
                  <div key={row.id} className="border-b border-border/40 pb-3">
                    <p className="font-mono text-foreground">{row.id}</p>
                    <p className="mt-1">{row.reasons.join(" | ")}</p>
                  </div>
                ))}
              </div>
            </article>
            <article className="border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                <h2 className="font-display text-lg font-bold">
                  Main Blockers
                </h2>
              </div>
              <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                {top.slice(0, 5).map((row) => (
                  <div key={row.id} className="border-b border-border/40 pb-3">
                    <p className="font-mono text-foreground">{row.id}</p>
                    <p className="mt-1">
                      {row.blockers.length
                        ? row.blockers.join(" ")
                        : "No major blocker beyond ongoing forward review."}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
