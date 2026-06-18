import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import {
  type DecisionRow,
  buildDecisionRows,
} from "@/pages/DecisionConsolePage";
import { buildExperimentRows, sessionFor } from "@/pages/ExperimentLabPage";
import { buildWalkForwardRows, buildWindows } from "@/pages/WalkForwardPage";
import type { SignalAudit } from "@/types/strategy";
import { AlertTriangle, Download, Radio, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

type LiveCandidate = {
  signal: SignalAudit;
  decision?: DecisionRow;
  state: "Blocked" | "Research only" | "Forward-test review";
  action: string;
  blockers: string[];
};

function fmtPrice(value: number) {
  return value.toFixed(2);
}

function fmtR(value: number) {
  return `${value.toFixed(2)}R`;
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

function signalMatchesDecision(signal: SignalAudit, decision: DecisionRow) {
  const session = sessionFor(signal.timestamp);
  const targetModels = new Set([
    signal.targetModel,
    ...(signal.targetCandidates ?? []).map((candidate) => candidate.model),
  ]);
  return (
    signal.setupType === decision.setup &&
    (decision.symbolScope === "All" ||
      decision.symbolScope === signal.symbol) &&
    (decision.sessionScope === "All" || decision.sessionScope === session) &&
    targetModels.has(decision.targetModel)
  );
}

function buildCandidate({
  signal,
  decisions,
}: {
  signal: SignalAudit;
  decisions: DecisionRow[];
}): LiveCandidate {
  const decision = decisions.find((row) => signalMatchesDecision(signal, row));
  const hardBlockers = signal.blockers
    .filter((blocker) => blocker.passed)
    .map((blocker) => blocker.label);
  const blockers = [
    ...hardBlockers,
    ...(decision?.blockers ?? ["No matching decision rule found."]),
  ];
  if (
    hardBlockers.length > 0 ||
    !decision ||
    decision.status === "Do not trade"
  ) {
    return {
      signal,
      decision,
      state: "Blocked",
      action: "Avoid",
      blockers,
    };
  }
  if (decision.status === "Forward-test candidate") {
    return {
      signal,
      decision,
      state: "Forward-test review",
      action: "Review paper/prop-demo entry",
      blockers,
    };
  }
  return {
    signal,
    decision,
    state: "Research only",
    action:
      decision.status === "Research candidate"
        ? "Track, do not live-trade"
        : "Keep testing",
    blockers,
  };
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

export default function LiveCandidatePage() {
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
  const decisions = useMemo(
    () =>
      buildDecisionRows({
        experiments,
        walkRows: buildWalkForwardRows({
          experimentRows: experiments,
          windows: buildWindows(run.integrity.start, run.integrity.end),
        }),
      }),
    [experiments, run.integrity.start, run.integrity.end],
  );
  const latestTimestamp = run.integrity.end ?? 0;
  const recentSignals = useMemo(
    () =>
      signals
        .filter((signal) => signal.timestamp <= latestTimestamp)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 24),
    [signals, latestTimestamp],
  );
  const candidates = useMemo(
    () => recentSignals.map((signal) => buildCandidate({ signal, decisions })),
    [recentSignals, decisions],
  );
  const forwardReview = candidates.filter(
    (candidate) => candidate.state === "Forward-test review",
  ).length;
  const researchOnly = candidates.filter(
    (candidate) => candidate.state === "Research only",
  ).length;
  const blocked = candidates.filter(
    (candidate) => candidate.state === "Blocked",
  ).length;

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="live-candidate.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">
            Live Candidate Replay
          </h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            This page applies the current decision rules to the latest imported
            candidates. It shows entries and exits, but blocks anything that has
            not earned enough evidence.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!run.integrity.canRunBacktest}
          onClick={() =>
            downloadFile(
              "ict-live-candidates.json",
              JSON.stringify(
                {
                  generatedAt: new Date().toISOString(),
                  latestCandle: latestTimestamp
                    ? new Date(latestTimestamp).toISOString()
                    : null,
                  candidates: candidates.map((candidate) => ({
                    timestamp: new Date(
                      candidate.signal.timestamp,
                    ).toISOString(),
                    symbol: candidate.signal.symbol,
                    setupType: candidate.signal.setupType,
                    entry: candidate.signal.entry,
                    stop: candidate.signal.stop,
                    tp1: candidate.signal.tp1,
                    state: candidate.state,
                    action: candidate.action,
                    decisionStatus: candidate.decision?.status ?? "No match",
                    decisionId: candidate.decision?.id ?? null,
                    blockers: candidate.blockers,
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
          Export Candidates
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Live Candidate Replay is disabled until real 1H and 1D data is loaded.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Latest candle"
              value={
                latestTimestamp
                  ? new Date(latestTimestamp).toISOString().slice(0, 16)
                  : "n/a"
              }
              detail="Latest imported data point"
            />
            <Stat
              label="Forward-test review"
              value={String(forwardReview)}
              detail="Still not live execution"
            />
            <Stat
              label="Research only"
              value={String(researchOnly)}
              detail="Track, freeze, or gather evidence"
            />
            <Stat
              label="Blocked"
              value={String(blocked)}
              detail="Avoid based on current proof"
            />
          </div>

          <section className="border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Execution Guard
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  These are latest-candle replay candidates, not broker orders.
                  A setup is blocked unless its matching rule passes the
                  Decision Console and has no active signal blocker.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            {candidates.length === 0 ? (
              <div className="border border-border bg-card p-6 text-sm text-muted-foreground">
                No recent candidates were generated from the imported data.
              </div>
            ) : (
              candidates.map((candidate) => (
                <article
                  key={candidate.signal.id}
                  className="border border-border bg-card p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        {new Date(candidate.signal.timestamp).toISOString()} |{" "}
                        {candidate.signal.symbol} | {candidate.signal.timeframe}
                      </p>
                      <h2 className="mt-1 font-display text-lg font-bold">
                        {candidate.signal.setupType}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Decision: {candidate.decision?.id ?? "No matching rule"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs">
                      {candidate.state === "Forward-test review" ? (
                        <ShieldCheck className="h-4 w-4 text-chart-1" />
                      ) : (
                        <Radio className="h-4 w-4 text-primary" />
                      )}
                      <span>{candidate.state}</span>
                      <span className="border border-border px-2 py-1">
                        {candidate.action}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-5">
                    <p className="font-mono text-xs">
                      Entry: {fmtPrice(candidate.signal.entry)}
                    </p>
                    <p className="font-mono text-xs">
                      Stop: {fmtPrice(candidate.signal.stop)}
                    </p>
                    <p className="font-mono text-xs">
                      TP1: {fmtPrice(candidate.signal.tp1)}
                    </p>
                    <p className="font-mono text-xs">
                      R: {fmtR(candidate.signal.rMultipleToTp1)}
                    </p>
                    <p className="font-mono text-xs">
                      Score: {candidate.signal.score}/7
                    </p>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                        Why
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {(
                          candidate.decision?.reasons ?? [
                            "No decision evidence matched this candidate.",
                          ]
                        ).map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-destructive">
                        Blockers
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {candidate.blockers.length ? (
                          candidate.blockers.map((blocker) => (
                            <li key={blocker}>{blocker}</li>
                          ))
                        ) : (
                          <li>No active blocker for paper review.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
