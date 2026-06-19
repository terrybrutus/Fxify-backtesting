import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import type {
  Candle,
  MarketStructureSnapshot,
  SignalAudit,
} from "@/types/strategy";
import { Timeframe } from "@/types/strategy";
import { Download, FileSearch, ShieldAlert } from "lucide-react";
import { useMemo } from "react";

type TruthAuditRow = {
  signal: SignalAudit;
  entryCandle?: Candle;
  structure?: MarketStructureSnapshot;
  checks: {
    entryCandleFound: boolean;
    noLookaheadBoundary: boolean;
    structureKnownAtEntry: boolean;
    hasTargetCandidates: boolean;
    selectedTargetInCandidates: boolean;
    stopBelowEntry: boolean;
    selectedTpAboveEntry: boolean;
  };
  cocoFit: {
    weeklyLow?: number;
    weeklyLowStopGap?: number;
    weeklyLowStopMatch: "Exact" | "Approximate" | "Not weekly-low stop";
    selectedTarget: string;
    targetCandidates: string;
    stopCandidates: string;
    exactWeeklyLowRisk?: number;
    selectedTargetRWithWeeklyLow?: number;
    stopModel: string;
  };
};

function fmtPrice(value?: number) {
  return value === undefined ? "n/a" : value.toFixed(2);
}

function fmtR(value?: number) {
  return value === undefined ? "n/a" : `${value.toFixed(2)}R`;
}

function iso(value?: number | bigint) {
  if (value === undefined) return "n/a";
  return new Date(Number(value)).toISOString();
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

function warningValue(signal: SignalAudit, prefix: string) {
  return signal.warnings.find((warning) => warning.startsWith(prefix));
}

function buildTruthRows({
  candles,
  structures,
  signals,
}: {
  candles: Candle[];
  structures: MarketStructureSnapshot[];
  signals: SignalAudit[];
}): TruthAuditRow[] {
  const h1ByKey = new Map(
    candles
      .filter((candle) => candle.timeframe === Timeframe.H1)
      .map((candle) => [
        `${candle.symbol}-${Number(candle.timestamp)}`,
        candle,
      ]),
  );
  const structureByKey = new Map(
    structures.map((structure) => [
      `${structure.symbol}-${structure.timestamp}`,
      structure,
    ]),
  );

  return signals.map((signal) => {
    const entryCandle = h1ByKey.get(`${signal.symbol}-${signal.timestamp}`);
    const structure = structureByKey.get(
      `${signal.symbol}-${signal.timestamp}`,
    );
    const targetCandidates = signal.targetCandidates ?? [];
    const selectedTargetInCandidates = targetCandidates.some(
      (candidate) =>
        candidate.model === signal.targetModel &&
        Math.abs(candidate.price - signal.tp1) < 0.01,
    );
    const weeklyLow = structure?.currentWeekLow;
    const exactWeeklyLowStop = signal.stopCandidates?.find(
      (candidate) => candidate.model === "Coco exact weekly low stop",
    );
    const weeklyLowStopGap =
      weeklyLow === undefined ? undefined : signal.stop - weeklyLow;
    const weeklyLowStopMatch =
      weeklyLow === undefined || weeklyLow >= signal.entry
        ? "Not weekly-low stop"
        : Math.abs(signal.stop - weeklyLow) <=
            Math.max(signal.entry * 0.0002, 2)
          ? "Exact"
          : signal.stop > weeklyLow
            ? "Not weekly-low stop"
            : "Approximate";
    return {
      signal,
      entryCandle,
      structure,
      checks: {
        entryCandleFound: Boolean(entryCandle),
        noLookaheadBoundary: signal.availableAt <= signal.timestamp,
        structureKnownAtEntry: structure
          ? structure.timestamp <= signal.availableAt
          : false,
        hasTargetCandidates: targetCandidates.length > 0,
        selectedTargetInCandidates,
        stopBelowEntry: signal.stop < signal.entry,
        selectedTpAboveEntry: signal.tp1 > signal.entry,
      },
      cocoFit: {
        weeklyLow,
        weeklyLowStopGap,
        weeklyLowStopMatch,
        selectedTarget: signal.targetModel ?? "unknown",
        targetCandidates: targetCandidates
          .map(
            (candidate) =>
              `${candidate.model}: ${fmtPrice(candidate.price)} (${fmtR(
                candidate.rMultiple,
              )})`,
          )
          .join(" | "),
        stopCandidates: (signal.stopCandidates ?? [])
          .map(
            (candidate) =>
              `${candidate.active ? "ACTIVE " : ""}${candidate.model}: ${fmtPrice(
                candidate.price,
              )} (${fmtR(candidate.risk)})`,
          )
          .join(" | "),
        exactWeeklyLowRisk: exactWeeklyLowStop?.risk,
        selectedTargetRWithWeeklyLow:
          exactWeeklyLowStop && signal.tp1 > signal.entry
            ? (signal.tp1 - signal.entry) / exactWeeklyLowStop.risk
            : undefined,
        stopModel:
          warningValue(signal, "Coco context:") ??
          warningValue(signal, "Coco stop model") ??
          "No explicit Coco stop model warning.",
      },
    };
  });
}

function CheckPill({ passed }: { passed: boolean }) {
  return (
    <span className={passed ? "text-chart-1" : "font-bold text-destructive"}>
      {passed ? "PASS" : "FAIL"}
    </span>
  );
}

export default function TruthAuditPage() {
  const { candles, run } = useStrategyWorkspace();
  const rows = useMemo(() => {
    const signals = [...run.acceptedSignals, ...run.rejectedSignals]
      .filter((signal) => signal.accepted || signal.score >= 5)
      .sort((a, b) => {
        if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
        return b.score - a.score || b.timestamp - a.timestamp;
      })
      .slice(0, 80);
    return buildTruthRows({
      candles,
      structures: run.marketStructure,
      signals,
    });
  }, [candles, run.acceptedSignals, run.rejectedSignals, run.marketStructure]);

  const failedRows = rows.filter((row) =>
    Object.values(row.checks).some((passed) => !passed),
  );
  const weeklyLowExact = rows.filter(
    (row) => row.cocoFit.weeklyLowStopMatch === "Exact",
  ).length;
  const weeklyLowApprox = rows.filter(
    (row) => row.cocoFit.weeklyLowStopMatch === "Approximate",
  ).length;

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="truth-audit.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Truth Audit</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            This page audits whether generated setups can be traced back to real
            candles, known-at-entry structure, explicit target candidates, and
            Coco-style stop/target context.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!run.integrity.canRunBacktest}
          onClick={() =>
            downloadFile(
              "ict-truth-audit.json",
              JSON.stringify(
                {
                  generatedAt: new Date().toISOString(),
                  integrity: run.integrity,
                  summary: {
                    auditedRows: rows.length,
                    failedRows: failedRows.length,
                    weeklyLowExact,
                    weeklyLowApprox,
                  },
                  rows: rows.map((row) => ({
                    timestamp: iso(row.signal.timestamp),
                    symbol: row.signal.symbol,
                    accepted: row.signal.accepted,
                    score: row.signal.score,
                    setupType: row.signal.setupType,
                    entry: row.signal.entry,
                    stop: row.signal.stop,
                    tp1: row.signal.tp1,
                    targetModel: row.signal.targetModel,
                    checks: row.checks,
                    cocoFit: row.cocoFit,
                    stopCandidates: row.signal.stopCandidates,
                    entryCandle: row.entryCandle
                      ? {
                          timestamp: iso(row.entryCandle.timestamp),
                          open: row.entryCandle.open,
                          high: row.entryCandle.high,
                          low: row.entryCandle.low,
                          close: row.entryCandle.close,
                        }
                      : undefined,
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
          Export Truth Audit
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Truth Audit is disabled until real 1H and 1D data is loaded.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="border border-border bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Audited rows
              </p>
              <p className="mt-2 font-mono text-xl font-bold">{rows.length}</p>
            </div>
            <div className="border border-border bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Failed trace checks
              </p>
              <p className="mt-2 font-mono text-xl font-bold">
                {failedRows.length}
              </p>
            </div>
            <div className="border border-border bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Exact weekly-low stops
              </p>
              <p className="mt-2 font-mono text-xl font-bold">
                {weeklyLowExact}
              </p>
            </div>
            <div className="border border-border bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Approx weekly-low stops
              </p>
              <p className="mt-2 font-mono text-xl font-bold">
                {weeklyLowApprox}
              </p>
            </div>
          </div>

          <section className="border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Important QA Meaning
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  If weekly-low stops are not exact, the current engine is not
                  fully modeling Coco&apos;s SL rule yet. That is not a pass or
                  fail on the strategy; it tells us the rule needs a stricter
                  stop/target module before live-readiness can rise.
                </p>
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Traceable Setup Rows
              </h2>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1500px] font-mono text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Time</th>
                    <th className="py-2 text-left">Index</th>
                    <th className="py-2 text-left">Setup</th>
                    <th className="py-2 text-left">State</th>
                    <th className="py-2 text-right">Entry</th>
                    <th className="py-2 text-right">Stop</th>
                    <th className="py-2 text-right">TP1</th>
                    <th className="py-2 text-left">TP model</th>
                    <th className="py-2 text-left">Trace</th>
                    <th className="py-2 text-left">Weekly low stop</th>
                    <th className="py-2 text-left">Stop candidates</th>
                    <th className="py-2 text-left">Known targets</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.signal.id}-${row.signal.accepted}`}
                      className="border-b border-border/40 align-top"
                    >
                      <td className="py-2">{iso(row.signal.timestamp)}</td>
                      <td className="py-2">{row.signal.symbol}</td>
                      <td className="py-2">{row.signal.setupType}</td>
                      <td className="py-2">
                        {row.signal.accepted ? "Accepted" : "Rejected"}{" "}
                        {row.signal.score}/7
                      </td>
                      <td className="py-2 text-right">
                        {fmtPrice(row.signal.entry)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPrice(row.signal.stop)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPrice(row.signal.tp1)}
                      </td>
                      <td className="py-2">{row.cocoFit.selectedTarget}</td>
                      <td className="max-w-[250px] py-2">
                        <div className="space-y-1">
                          <p>
                            Candle:{" "}
                            <CheckPill passed={row.checks.entryCandleFound} />
                          </p>
                          <p>
                            No lookahead:{" "}
                            <CheckPill
                              passed={row.checks.noLookaheadBoundary}
                            />
                          </p>
                          <p>
                            Structure:{" "}
                            <CheckPill
                              passed={row.checks.structureKnownAtEntry}
                            />
                          </p>
                          <p>
                            Target list:{" "}
                            <CheckPill
                              passed={row.checks.hasTargetCandidates}
                            />
                          </p>
                          <p>
                            TP matched:{" "}
                            <CheckPill
                              passed={row.checks.selectedTargetInCandidates}
                            />
                          </p>
                        </div>
                      </td>
                      <td className="max-w-[230px] py-2">
                        <p>{row.cocoFit.weeklyLowStopMatch}</p>
                        <p className="text-muted-foreground">
                          Weekly low {fmtPrice(row.cocoFit.weeklyLow)}
                        </p>
                        <p className="text-muted-foreground">
                          Stop gap {fmtPrice(row.cocoFit.weeklyLowStopGap)}
                        </p>
                        <p className="text-muted-foreground">
                          Weekly-low TP R{" "}
                          {fmtR(row.cocoFit.selectedTargetRWithWeeklyLow)}
                        </p>
                      </td>
                      <td className="max-w-[330px] py-2 text-muted-foreground">
                        {row.cocoFit.stopCandidates || "No stop candidates"}
                      </td>
                      <td className="max-w-[360px] py-2 text-muted-foreground">
                        {row.cocoFit.targetCandidates || "No target candidates"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
