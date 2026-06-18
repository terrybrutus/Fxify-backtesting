import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { classifyEvidence } from "@/lib/evidence";
import {
  freezeVariant,
  loadFrozenVariants,
  saveFrozenVariants,
} from "@/lib/forwardTracker";
import {
  type Candle,
  type EngineRun,
  type SignalAudit,
  type TargetCandidate,
  Timeframe,
} from "@/types/strategy";
import { Download, FlaskConical, Lock, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

export type ExperimentVariant = {
  id: string;
  setup: string;
  targetModel: string;
  symbolScope: "All" | "NAS100" | "US30" | "US500";
  sessionScope: "All" | "Asia" | "London" | "New York" | "Off session";
  description: string;
  predicate: (signal: SignalAudit) => boolean;
};

export type ExperimentTrade = {
  signal: SignalAudit;
  target: TargetCandidate;
  rMultiple: number;
  won: boolean;
  closed: boolean;
};

export type ExperimentStats = {
  trades: number;
  wins: number;
  losses: number;
  open: number;
  totalR: number;
  avgR: number;
  winRate: number;
  maxDrawdownR: number;
};

export type ExperimentRow = {
  variant: ExperimentVariant;
  trades: ExperimentTrade[];
  discovery: ExperimentStats;
  validation: ExperimentStats;
  all: ExperimentStats;
  evidenceStatus: string;
  evidenceDetail: string;
  promotionGate: PromotionGate;
  consistencyRisk: "Low" | "Medium" | "High";
};

export type PromotionGate =
  | "No validation"
  | "Needs sample"
  | "Diverged"
  | "Watchlist"
  | "Forward-test candidate";

type ReadinessReport = {
  score: number;
  level:
    | "Blocked"
    | "Early Discovery"
    | "Research-Ready"
    | "Forward-Test Ready";
  blockers: string[];
  strengths: string[];
};

type BaseVariant = Omit<
  ExperimentVariant,
  "id" | "symbolScope" | "sessionScope"
> & {
  id: string;
};

const SYMBOL_SCOPES: ExperimentVariant["symbolScope"][] = [
  "All",
  "NAS100",
  "US30",
  "US500",
];

const SESSION_SCOPES: ExperimentVariant["sessionScope"][] = [
  "All",
  "Asia",
  "London",
  "New York",
  "Off session",
];

const BASE_VARIANTS: BaseVariant[] = [
  {
    id: "ema200-prev-day-high",
    setup: "200 EMA Reaction",
    targetModel: "previous day high",
    description:
      "Tests the core 200 EMA reaction setup against the prior daily high target.",
    predicate: (signal) =>
      passed(signal, "200 EMA reaction") &&
      passed(signal, "Daily continuation bias"),
  },
  {
    id: "ema200-old-sunday",
    setup: "200 EMA Reaction",
    targetModel: "old Sunday level",
    description:
      "Tests whether the old Sunday level is a better fixed TP for 200 EMA reactions.",
    predicate: (signal) =>
      passed(signal, "200 EMA reaction") &&
      passed(signal, "Daily continuation bias"),
  },
  {
    id: "ema200-prior-ny",
    setup: "200 EMA Reaction",
    targetModel: "prior NY high",
    description:
      "Tests 200 EMA reactions into prior New York session liquidity.",
    predicate: (signal) =>
      passed(signal, "200 EMA reaction") &&
      passed(signal, "Daily continuation bias"),
  },
  {
    id: "ema200-prior-two-day-ny",
    setup: "200 EMA Reaction",
    targetModel: "prior two-day NY high",
    description:
      "Tests whether the prior two-day New York high gives cleaner target room.",
    predicate: (signal) =>
      passed(signal, "200 EMA reaction") &&
      passed(signal, "Daily continuation bias"),
  },
  {
    id: "old-sunday-reaction-old-sunday",
    setup: "Old Sunday Reaction",
    targetModel: "old Sunday level",
    description:
      "Requires Sunday proximity plus bullish MA context, then targets the next old Sunday level.",
    predicate: (signal) =>
      passed(signal, "Sunday level within 0.12 ATR") &&
      passed(signal, "Price above 200 EMA") &&
      (passed(signal, "20 EMA > 50 SMA") ||
        passed(signal, "Moving average hold")),
  },
  {
    id: "fvg-continuation-fvg-fill",
    setup: "FVG Fill Continuation",
    targetModel: "bullish FVG fill",
    description:
      "Tests bullish continuation with active 1H FVG overlap into a bullish FVG fill.",
    predicate: (signal) =>
      passed(signal, "Daily continuation bias") &&
      passed(signal, "Price above 200 EMA") &&
      passed(signal, "1H FVG overlap"),
  },
  {
    id: "m15-scalp-prev-day-high",
    setup: "15m 20 EMA Scalp",
    targetModel: "previous day high",
    description:
      "Tests lower-timeframe 20 EMA reclaim behavior against the prior daily high.",
    predicate: (signal) =>
      passed(signal, "15m 20 EMA hold") &&
      passed(signal, "Price above 200 EMA"),
  },
  {
    id: "ma-stack-prev-day-high",
    setup: "HTF MA Stack",
    targetModel: "previous day high",
    description:
      "Tests a broader higher-timeframe continuation profile with MA stack and daily bias.",
    predicate: (signal) =>
      passed(signal, "Daily continuation bias") &&
      passed(signal, "Price above 200 EMA") &&
      passed(signal, "20 EMA > 50 SMA"),
  },
];

const VARIANTS: ExperimentVariant[] = BASE_VARIANTS.flatMap((variant) =>
  SYMBOL_SCOPES.flatMap((symbolScope) =>
    SESSION_SCOPES.map((sessionScope) => ({
      ...variant,
      symbolScope,
      sessionScope,
      id: `${variant.id}-${symbolScope.toLowerCase()}-${sessionScope
        .toLowerCase()
        .replace(/\s+/g, "-")}`,
    })),
  ),
);

function passed(signal: SignalAudit, label: string) {
  return signal.reasons.some(
    (reason) => reason.label === label && reason.passed,
  );
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtR(value: number) {
  return `${value.toFixed(2)}R`;
}

export function sessionFor(
  timestamp: number,
): ExperimentVariant["sessionScope"] {
  const hour = new Date(timestamp).getUTCHours();
  if (hour >= 0 && hour < 7) return "Asia";
  if (hour >= 7 && hour < 13) return "London";
  if (hour >= 13 && hour < 21) return "New York";
  return "Off session";
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

function targetFor(signal: SignalAudit, model: string) {
  return signal.targetCandidates?.find(
    (candidate) => candidate.model === model && candidate.rMultiple >= 0.8,
  );
}

function simulateExperimentTrade(
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

function computeExperimentStats(trades: ExperimentTrade[]): ExperimentStats {
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

function promotionGate(
  discovery: ExperimentStats,
  validation: ExperimentStats,
): PromotionGate {
  if (validation.trades === 0) return "No validation";
  if (validation.trades < 10) return "Needs sample";
  if (validation.totalR <= 0 || validation.avgR <= 0) return "Diverged";
  if (validation.trades >= 30 && validation.avgR > 0.15) {
    return "Forward-test candidate";
  }
  if (discovery.totalR > 0 && validation.totalR > 0) return "Watchlist";
  return "Diverged";
}

function consistencyRisk(
  discovery: ExperimentStats,
  validation: ExperimentStats,
): ExperimentRow["consistencyRisk"] {
  if (validation.trades < 10) return "High";
  if (discovery.totalR > 0 && validation.totalR <= 0) return "High";
  if (Math.abs(discovery.avgR - validation.avgR) > 0.75) return "Medium";
  if (validation.maxDrawdownR > 4) return "Medium";
  return "Low";
}

export function buildExperimentRows({
  signals,
  candles,
  splitTimestamp,
}: {
  signals: SignalAudit[];
  candles: Candle[];
  splitTimestamp?: number;
}): ExperimentRow[] {
  const candlesBySymbol = h1BySymbol(candles);
  return VARIANTS.map((variant) => {
    const trades = signals.flatMap((signal) => {
      if (signal.blockers.some((blocker) => blocker.passed)) return [];
      if (signal.stop >= signal.entry) return [];
      if (
        variant.symbolScope !== "All" &&
        signal.symbol !== variant.symbolScope
      )
        return [];
      if (
        variant.sessionScope !== "All" &&
        sessionFor(signal.timestamp) !== variant.sessionScope
      )
        return [];
      if (!variant.predicate(signal)) return [];
      const target = targetFor(signal, variant.targetModel);
      if (!target) return [];
      const h1 = candlesBySymbol.get(signal.symbol) ?? [];
      return [simulateExperimentTrade(signal, target, h1)];
    });
    const discoveryTrades =
      splitTimestamp === undefined
        ? []
        : trades.filter((trade) => trade.signal.timestamp <= splitTimestamp);
    const validationTrades =
      splitTimestamp === undefined
        ? []
        : trades.filter((trade) => trade.signal.timestamp > splitTimestamp);
    const all = computeExperimentStats(trades);
    const discovery = computeExperimentStats(discoveryTrades);
    const validation = computeExperimentStats(validationTrades);
    const evidence = classifyEvidence({
      trades: validationTrades.length,
      totalR: validation.totalR,
      avgR: validation.avgR,
      maxDrawdownR: validation.maxDrawdownR,
    });
    return {
      variant,
      trades,
      discovery,
      validation,
      all,
      evidenceStatus: evidence.status,
      evidenceDetail: evidence.detail,
      promotionGate: promotionGate(discovery, validation),
      consistencyRisk: consistencyRisk(discovery, validation),
    };
  }).sort(
    (a, b) =>
      b.validation.totalR - a.validation.totalR ||
      b.validation.trades - a.validation.trades,
  );
}

function readinessReport(
  run: EngineRun,
  rows: ExperimentRow[],
): ReadinessReport {
  if (!run.integrity.canRunBacktest) {
    return {
      score: 0,
      level: "Blocked",
      blockers: run.integrity.blockers,
      strengths: [],
    };
  }

  const bestValidation = rows[0];
  const validationReady = rows.filter((row) => row.validation.trades >= 10);
  const forwardReady = rows.filter(
    (row) =>
      row.validation.trades >= 30 &&
      row.validation.avgR > 0.15 &&
      row.validation.maxDrawdownR <= 4,
  );
  const scoreParts = [
    15,
    run.integrity.candleCount >= 40000 ? 10 : 5,
    run.derivedTimeframes.includes(Timeframe.M15) ? 5 : 0,
    run.derivedTimeframes.includes(Timeframe.H4) ? 5 : 0,
    run.rejectedSignals.length >= 1000 ? 10 : 5,
    run.acceptedSignals.length >= 20
      ? 10
      : run.acceptedSignals.length >= 5
        ? 5
        : 2,
    validationReady.length > 0 ? 15 : bestValidation?.validation.trades ? 5 : 0,
    bestValidation && bestValidation.validation.totalR > 0 ? 10 : 0,
    forwardReady.length > 0 ? 20 : 0,
  ];
  const score = Math.min(
    100,
    Math.round(scoreParts.reduce((sum, value) => sum + value, 0)),
  );
  const blockers = [
    run.acceptedSignals.length < 20
      ? "Current locked rules still produce too few accepted trades."
      : undefined,
    validationReady.length === 0
      ? "No experiment variant has at least 10 validation trades yet."
      : undefined,
    forwardReady.length === 0
      ? "No variant has enough validation evidence to graduate to forward-test ready."
      : undefined,
    "Forward tracking is available, but live-readiness still requires newer candles after a rule is frozen.",
  ].filter(Boolean) as string[];
  const strengths = [
    "Real CSV data is loaded and the integrity gate is open.",
    "The app is testing rejected candidates instead of only accepted winners.",
    bestValidation && bestValidation.validation.totalR > 0
      ? "At least one variant has positive validation-period R."
      : undefined,
  ].filter(Boolean) as string[];
  return {
    score,
    level:
      score >= 75
        ? "Forward-Test Ready"
        : score >= 55
          ? "Research-Ready"
          : "Early Discovery",
    blockers,
    strengths,
  };
}

function experimentReportJson(
  run: EngineRun,
  rows: ExperimentRow[],
  readiness: ReadinessReport,
) {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      readiness,
      integrity: run.integrity,
      validation: run.validation,
      variants: rows.map((row) => ({
        id: row.variant.id,
        setup: row.variant.setup,
        symbolScope: row.variant.symbolScope,
        sessionScope: row.variant.sessionScope,
        targetModel: row.variant.targetModel,
        description: row.variant.description,
        evidenceStatus: row.evidenceStatus,
        evidenceDetail: row.evidenceDetail,
        promotionGate: row.promotionGate,
        consistencyRisk: row.consistencyRisk,
        all: row.all,
        discovery: row.discovery,
        validation: row.validation,
        sampleTrades: row.trades.slice(0, 20).map((trade) => ({
          timestamp: new Date(trade.signal.timestamp).toISOString(),
          symbol: trade.signal.symbol,
          session: sessionFor(trade.signal.timestamp),
          setupType: trade.signal.setupType,
          targetModel: trade.target.model,
          targetR: trade.target.rMultiple,
          outcome: !trade.closed ? "Open" : trade.won ? "Win" : "Loss",
          rMultiple: trade.rMultiple,
        })),
      })),
    },
    null,
    2,
  );
}

function TradeMiniTable({ trades }: { trades: ExperimentTrade[] }) {
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[860px] font-mono text-xs">
        <thead className="border-b border-border text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Time</th>
            <th className="px-3 py-2 text-left">Index</th>
            <th className="px-3 py-2 text-left">Setup</th>
            <th className="px-3 py-2 text-left">Target</th>
            <th className="px-3 py-2 text-right">Target R</th>
            <th className="px-3 py-2 text-left">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {trades.slice(0, 12).map((trade) => (
            <tr
              key={`${trade.signal.id}-${trade.target.model}`}
              className="border-b border-border/40"
            >
              <td className="px-3 py-2">
                {new Date(trade.signal.timestamp).toISOString()}
              </td>
              <td className="px-3 py-2">{trade.signal.symbol}</td>
              <td className="px-3 py-2">{trade.signal.setupType}</td>
              <td className="px-3 py-2">{trade.target.model}</td>
              <td className="px-3 py-2 text-right">
                {fmtR(trade.target.rMultiple)}
              </td>
              <td className="px-3 py-2">
                {!trade.closed ? "Open" : trade.won ? "Win" : "Loss"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ExperimentLabPage() {
  const { candles, run } = useStrategyWorkspace();
  const [frozenVariantIds, setFrozenVariantIds] = useState(
    () => new Set(loadFrozenVariants().map((variant) => variant.variantId)),
  );
  const signals = useMemo(
    () => [...run.acceptedSignals, ...run.rejectedSignals],
    [run.acceptedSignals, run.rejectedSignals],
  );
  const rows = useMemo(
    () =>
      buildExperimentRows({
        signals,
        candles,
        splitTimestamp: run.validation.discoveryEndTimestamp,
      }),
    [signals, candles, run.validation.discoveryEndTimestamp],
  );
  const bestValidation = rows[0];
  const variantsWithSample = rows.filter(
    (row) => row.validation.trades >= 10,
  ).length;
  const readiness = useMemo(() => readinessReport(run, rows), [run, rows]);
  const watchlistCount = rows.filter(
    (row) =>
      row.promotionGate === "Watchlist" ||
      row.promotionGate === "Forward-test candidate",
  ).length;

  function freezeRow(row: ExperimentRow) {
    const existing = loadFrozenVariants();
    if (existing.some((variant) => variant.variantId === row.variant.id)) {
      return;
    }
    const next = [
      ...existing,
      freezeVariant(row, run.validation.discoveryEndTimestamp),
    ];
    saveFrozenVariants(next);
    setFrozenVariantIds(new Set(next.map((variant) => variant.variantId)));
  }

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="experiment.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Experiment Lab</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            This page runs fixed what-if variants against the candidate pool. It
            is for finding testable rule sets, not declaring a live trading
            edge.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!run.integrity.canRunBacktest}
          onClick={() =>
            downloadFile(
              "ict-experiment-report.json",
              experimentReportJson(run, rows, readiness),
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
          Experiment Lab is disabled until real 1H and 1D data is loaded.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Readiness"
              value={`${readiness.score}/100`}
              detail={readiness.level}
            />
            <Stat label="Variants tested" value={String(rows.length)} />
            <Stat
              label="Candidate pool"
              value={String(signals.length)}
              detail="Accepted plus rejected audit candidates"
            />
            <Stat
              label="Validation-ready variants"
              value={String(variantsWithSample)}
              detail="Requires at least 10 validation trades"
            />
            <Stat
              label="Watchlist variants"
              value={String(watchlistCount)}
              detail="Positive validation, still gated by sample"
            />
            <Stat
              label="Best validation net"
              value={
                bestValidation
                  ? fmtR(bestValidation.validation.totalR)
                  : "0.00R"
              }
              detail={bestValidation?.variant.id ?? "No variant"}
            />
          </div>

          <section className="grid gap-3 lg:grid-cols-2">
            <article className="border border-primary/30 bg-primary/5 p-4">
              <p className="font-mono text-xs font-bold uppercase tracking-widest">
                Readiness Drivers
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {readiness.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="border border-destructive/40 bg-destructive/5 p-4">
              <p className="font-mono text-xs font-bold uppercase tracking-widest">
                Current Blockers
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {readiness.blockers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <article className="border border-destructive/40 bg-destructive/5 p-4">
              <p className="font-mono text-xs font-bold uppercase tracking-widest">
                Still Not Proof
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                A variant must survive the validation side with meaningful
                sample size before it can graduate. Strong discovery results
                alone are treated as overfit risk.
              </p>
            </article>
            <article className="border border-primary/30 bg-primary/5 p-4">
              <p className="font-mono text-xs font-bold uppercase tracking-widest">
                What This Automates
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                The app now replays fixed setup and target combinations from the
                same signal pool, then separates discovery-period behavior from
                later validation behavior.
              </p>
            </article>
          </section>

          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Variant Scoreboard
              </h2>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1180px] font-mono text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Variant</th>
                    <th className="py-2 text-left">Index</th>
                    <th className="py-2 text-left">Session</th>
                    <th className="py-2 text-left">Target</th>
                    <th className="py-2 text-right">All trades</th>
                    <th className="py-2 text-right">All net</th>
                    <th className="py-2 text-right">Discovery</th>
                    <th className="py-2 text-right">Discovery net</th>
                    <th className="py-2 text-right">Validation</th>
                    <th className="py-2 text-right">Validation net</th>
                    <th className="py-2 text-right">Val win</th>
                    <th className="py-2 text-left">Gate</th>
                    <th className="py-2 text-left">Risk</th>
                    <th className="py-2 text-left">Evidence</th>
                    <th className="py-2 text-right">Freeze</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.variant.id}
                      className="border-b border-border/40"
                    >
                      <td className="py-2">
                        <span title={row.variant.description}>
                          {row.variant.setup}
                        </span>
                      </td>
                      <td className="py-2">{row.variant.symbolScope}</td>
                      <td className="py-2">{row.variant.sessionScope}</td>
                      <td className="py-2">{row.variant.targetModel}</td>
                      <td className="py-2 text-right">{row.all.trades}</td>
                      <td className="py-2 text-right">
                        {fmtR(row.all.totalR)}
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
                      <td className="py-2">{row.promotionGate}</td>
                      <td className="py-2">{row.consistencyRisk}</td>
                      <td className="py-2">
                        <span title={row.evidenceDetail}>
                          {row.evidenceStatus}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            frozenVariantIds.has(row.variant.id) ||
                            row.promotionGate === "No validation" ||
                            row.promotionGate === "Diverged"
                          }
                          onClick={() => freezeRow(row)}
                        >
                          <Lock className="mr-2 h-3.5 w-3.5" />
                          {frozenVariantIds.has(row.variant.id)
                            ? "Frozen"
                            : "Freeze"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {bestValidation && (
            <section className="grid gap-3 xl:grid-cols-[1fr_1.3fr]">
              <article className="border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-lg font-bold">
                    Current Front-Runner
                  </h2>
                </div>
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <p>
                    <span className="font-mono text-foreground">
                      {bestValidation.variant.setup}
                    </span>{" "}
                    targeting{" "}
                    <span className="font-mono text-foreground">
                      {bestValidation.variant.symbolScope}
                    </span>{" "}
                    during{" "}
                    <span className="font-mono text-foreground">
                      {bestValidation.variant.sessionScope}
                    </span>{" "}
                    into{" "}
                    <span className="font-mono text-foreground">
                      {bestValidation.variant.targetModel}
                    </span>{" "}
                    currently has the strongest validation net.
                  </p>
                  <p>
                    Validation sample: {bestValidation.validation.trades} trade
                    (s), {fmtR(bestValidation.validation.totalR)},{" "}
                    {pct(bestValidation.validation.winRate)} win rate.
                  </p>
                  <p>
                    This is still not promotion-ready unless the sample grows
                    and survives forward tracking without changing its rules.
                  </p>
                </div>
              </article>
              <TradeMiniTable trades={bestValidation.trades} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
