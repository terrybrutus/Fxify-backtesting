import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import type { Candle, SignalAudit, TargetCandidate } from "@/types/strategy";
import { Timeframe } from "@/types/strategy";
import { Download, Scale } from "lucide-react";
import { useMemo } from "react";

type RiskModelId =
  | "engine-selected"
  | "weekly-selected"
  | "weekly-nearest-1-5r"
  | "weekly-max-r"
  | "weekly-previous-day-high"
  | "weekly-prior-ny-high"
  | "weekly-prior-two-day-ny-high"
  | "weekly-old-sunday"
  | "weekly-fvg-fill";

type RiskModel = {
  id: RiskModelId;
  label: string;
  description: string;
};

type RiskTrade = {
  signal: SignalAudit;
  model: RiskModel;
  stopPrice: number;
  target: TargetCandidate;
  targetR: number;
  closed: boolean;
  won: boolean;
  ambiguous: boolean;
  rMultiple: number;
};

type RiskStats = {
  trades: number;
  wins: number;
  losses: number;
  open: number;
  ambiguous: number;
  totalR: number;
  avgR: number;
  winRate: number;
  maxDrawdownR: number;
};

type RiskRow = {
  model: RiskModel;
  trades: RiskTrade[];
  all: RiskStats;
  discovery: RiskStats;
  validation: RiskStats;
  sample: RiskTrade[];
};

type BreakdownSection = {
  title: string;
  rows: BreakdownRow[];
};

type BreakdownRow = {
  label: string;
  all: RiskStats;
  discovery: RiskStats;
  validation: RiskStats;
};

type PromotionCandidate = {
  id: string;
  label: string;
  rule: string;
  all: RiskStats;
  discovery: RiskStats;
  validation: RiskStats;
  decision: "Watch" | "Too thin" | "Reject";
};

const RISK_MODELS: RiskModel[] = [
  {
    id: "engine-selected",
    label: "Engine stop + selected TP",
    description: "Current active stop and current nearest TP selection.",
  },
  {
    id: "weekly-selected",
    label: "Weekly low + selected TP",
    description: "Coco weekly-low stop with the current selected TP.",
  },
  {
    id: "weekly-nearest-1-5r",
    label: "Weekly low + nearest >= 1.5R",
    description:
      "Coco weekly-low stop with the nearest target candidate that still gives at least 1.5R.",
  },
  {
    id: "weekly-max-r",
    label: "Weekly low + max R target",
    description:
      "Coco weekly-low stop with the farthest available target candidate.",
  },
  {
    id: "weekly-previous-day-high",
    label: "Weekly low + previous day high",
    description: "Coco weekly-low stop targeting prior daily high liquidity.",
  },
  {
    id: "weekly-prior-ny-high",
    label: "Weekly low + prior NY high",
    description: "Coco weekly-low stop targeting prior New York session high.",
  },
  {
    id: "weekly-prior-two-day-ny-high",
    label: "Weekly low + prior two-day NY high",
    description:
      "Coco weekly-low stop targeting the higher high across the prior two New York sessions.",
  },
  {
    id: "weekly-old-sunday",
    label: "Weekly low + old Sunday",
    description: "Coco weekly-low stop targeting the next old Sunday level.",
  },
  {
    id: "weekly-fvg-fill",
    label: "Weekly low + FVG fill",
    description: "Coco weekly-low stop targeting the nearest bullish FVG fill.",
  },
];

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

function selectedTarget(signal: SignalAudit): TargetCandidate | undefined {
  return (signal.targetCandidates ?? []).find(
    (candidate) =>
      candidate.model === signal.targetModel &&
      Math.abs(candidate.price - signal.tp1) < 0.01,
  );
}

function weeklyLowStop(signal: SignalAudit) {
  return signal.stopCandidates?.find(
    (candidate) => candidate.model === "Coco exact weekly low stop",
  );
}

function targetForModel(
  signal: SignalAudit,
  model: RiskModel,
  stopPrice: number,
): TargetCandidate | undefined {
  const candidates = (signal.targetCandidates ?? [])
    .map((candidate) => ({
      ...candidate,
      rMultiple: (candidate.price - signal.entry) / (signal.entry - stopPrice),
    }))
    .filter((candidate) => candidate.price > signal.entry);

  if (model.id === "engine-selected") return selectedTarget(signal);
  if (model.id === "weekly-selected") return selectedTarget(signal);
  if (model.id === "weekly-nearest-1-5r") {
    return candidates
      .filter((candidate) => candidate.rMultiple >= 1.5)
      .sort((a, b) => a.price - b.price)[0];
  }
  if (model.id === "weekly-max-r") {
    return candidates.sort((a, b) => b.rMultiple - a.rMultiple)[0];
  }

  const targetNameByModel: Partial<Record<RiskModelId, string>> = {
    "weekly-previous-day-high": "previous day high",
    "weekly-prior-ny-high": "prior NY high",
    "weekly-prior-two-day-ny-high": "prior two-day NY high",
    "weekly-old-sunday": "old Sunday level",
    "weekly-fvg-fill": "bullish FVG fill",
  };
  const targetName = targetNameByModel[model.id];
  return candidates.find((candidate) => candidate.model === targetName);
}

function simulateRiskTrade(
  signal: SignalAudit,
  model: RiskModel,
  h1: Candle[],
): RiskTrade | undefined {
  const stopPrice =
    model.id === "engine-selected" ? signal.stop : weeklyLowStop(signal)?.price;
  if (stopPrice === undefined || stopPrice >= signal.entry) return undefined;
  const target = targetForModel(signal, model, stopPrice);
  if (!target || target.price <= signal.entry) return undefined;
  const risk = signal.entry - stopPrice;
  const targetR = (target.price - signal.entry) / risk;
  if (targetR <= 0) return undefined;
  const future = h1.filter(
    (candle) => Number(candle.timestamp) > signal.timestamp,
  );
  const exit = future.find(
    (candle) => candle.low <= stopPrice || candle.high >= target.price,
  );
  const ambiguous =
    !!exit && exit.low <= stopPrice && exit.high >= target.price;
  const won = !!exit && !ambiguous && exit.high >= target.price;
  return {
    signal,
    model,
    stopPrice,
    target,
    targetR,
    closed: !!exit,
    won,
    ambiguous,
    rMultiple: exit ? (won ? targetR : -1) : 0,
  };
}

function statsFor(trades: RiskTrade[]): RiskStats {
  const closed = trades.filter((trade) => trade.closed);
  const wins = closed.filter((trade) => trade.won);
  const ambiguous = closed.filter((trade) => trade.ambiguous);
  const losses = closed.length - wins.length;
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
    losses,
    open: trades.length - closed.length,
    ambiguous: ambiguous.length,
    totalR,
    avgR: closed.length ? totalR / closed.length : 0,
    winRate: closed.length ? wins.length / closed.length : 0,
    maxDrawdownR,
  };
}

function sessionFor(timestamp: number) {
  const hour = new Date(timestamp).getUTCHours();
  if (hour >= 0 && hour < 7) return "Asia";
  if (hour >= 7 && hour < 13) return "London";
  if (hour >= 13 && hour < 21) return "New York";
  return "Off session";
}

function splitStats(trades: RiskTrade[], splitTimestamp?: number) {
  const discovery =
    splitTimestamp === undefined
      ? []
      : trades.filter((trade) => trade.signal.timestamp <= splitTimestamp);
  const validation =
    splitTimestamp === undefined
      ? []
      : trades.filter((trade) => trade.signal.timestamp > splitTimestamp);
  return {
    all: statsFor(trades),
    discovery: statsFor(discovery),
    validation: statsFor(validation),
  };
}

function breakdownFor(
  trades: RiskTrade[],
  splitTimestamp: number | undefined,
  labelFor: (trade: RiskTrade) => string,
): BreakdownRow[] {
  const groups = new Map<string, RiskTrade[]>();
  for (const trade of trades) {
    const label = labelFor(trade);
    const group = groups.get(label) ?? [];
    group.push(trade);
    groups.set(label, group);
  }
  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      ...splitStats(group, splitTimestamp),
    }))
    .sort(
      (a, b) =>
        b.validation.totalR - a.validation.totalR ||
        b.validation.trades - a.validation.trades,
    );
}

function candidateDecision(stats: RiskStats): PromotionCandidate["decision"] {
  if (stats.trades < 10) return "Too thin";
  if (stats.totalR <= 0 || stats.avgR <= 0) return "Reject";
  return "Watch";
}

function promotionCandidatesFor(
  trades: RiskTrade[],
  splitTimestamp: number | undefined,
): PromotionCandidate[] {
  const candidates = [
    {
      id: "htf-all",
      label: "HTF old-Sunday, all indices",
      rule: "Setup is HTF Bullish Continuation; stop is weekly low; TP is old Sunday.",
      filter: (trade: RiskTrade) =>
        trade.signal.setupType === "HTF Bullish Continuation",
    },
    {
      id: "htf-nas-us500",
      label: "HTF old-Sunday, NAS100 + US500",
      rule: "Same HTF old-Sunday model, excluding US30 after subgroup underperformance.",
      filter: (trade: RiskTrade) =>
        trade.signal.setupType === "HTF Bullish Continuation" &&
        (trade.signal.symbol === "NAS100" || trade.signal.symbol === "US500"),
    },
    {
      id: "htf-us500",
      label: "HTF old-Sunday, US500 only",
      rule: "US500-only version of the HTF old-Sunday candidate.",
      filter: (trade: RiskTrade) =>
        trade.signal.setupType === "HTF Bullish Continuation" &&
        trade.signal.symbol === "US500",
    },
    {
      id: "htf-nas100",
      label: "HTF old-Sunday, NAS100 only",
      rule: "NAS100-only version of the HTF old-Sunday candidate.",
      filter: (trade: RiskTrade) =>
        trade.signal.setupType === "HTF Bullish Continuation" &&
        trade.signal.symbol === "NAS100",
    },
    {
      id: "htf-new-york",
      label: "HTF old-Sunday, New York only",
      rule: "HTF old-Sunday signals whose entry candle appears in the UTC New York session bucket.",
      filter: (trade: RiskTrade) =>
        trade.signal.setupType === "HTF Bullish Continuation" &&
        sessionFor(trade.signal.timestamp) === "New York",
    },
  ];

  return candidates
    .map((candidate) => {
      const candidateTrades = trades.filter(candidate.filter);
      const stats = splitStats(candidateTrades, splitTimestamp);
      return {
        id: candidate.id,
        label: candidate.label,
        rule: candidate.rule,
        ...stats,
        decision: candidateDecision(stats.validation),
      };
    })
    .sort(
      (a, b) =>
        b.validation.totalR - a.validation.totalR ||
        b.validation.trades - a.validation.trades,
    );
}

function buildRiskRows({
  signals,
  candles,
  splitTimestamp,
}: {
  signals: SignalAudit[];
  candles: Candle[];
  splitTimestamp?: number;
}): RiskRow[] {
  const candlesBySymbol = h1BySymbol(candles);
  const candidates = signals.filter(
    (signal) =>
      !signal.blockers.some((blocker) => blocker.passed) &&
      (signal.accepted || signal.score >= 5) &&
      signal.entry > 0,
  );

  return RISK_MODELS.map((model) => {
    const trades = candidates.flatMap((signal) => {
      const h1 = candlesBySymbol.get(signal.symbol) ?? [];
      const trade = simulateRiskTrade(signal, model, h1);
      return trade ? [trade] : [];
    });
    return {
      model,
      trades,
      ...splitStats(trades, splitTimestamp),
      sample: trades.slice(0, 20),
    };
  }).sort(
    (a, b) =>
      b.validation.totalR - a.validation.totalR ||
      b.validation.trades - a.validation.trades,
  );
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

export default function CocoRiskLabPage() {
  const { candles, run } = useStrategyWorkspace();
  const signals = useMemo(
    () => [...run.acceptedSignals, ...run.rejectedSignals],
    [run.acceptedSignals, run.rejectedSignals],
  );
  const rows = useMemo(
    () =>
      buildRiskRows({
        signals,
        candles,
        splitTimestamp: run.validation.discoveryEndTimestamp,
      }),
    [signals, candles, run.validation.discoveryEndTimestamp],
  );
  const best = rows[0];
  const bestBreakdowns: BreakdownSection[] = useMemo(() => {
    if (!best) return [];
    const splitTimestamp = run.validation.discoveryEndTimestamp;
    return [
      {
        title: "By Index",
        rows: breakdownFor(
          best.trades,
          splitTimestamp,
          (trade) => trade.signal.symbol,
        ),
      },
      {
        title: "By Setup",
        rows: breakdownFor(
          best.trades,
          splitTimestamp,
          (trade) => trade.signal.setupType,
        ),
      },
      {
        title: "By Session",
        rows: breakdownFor(best.trades, splitTimestamp, (trade) =>
          sessionFor(trade.signal.timestamp),
        ),
      },
      {
        title: "Accepted vs Rejected",
        rows: breakdownFor(best.trades, splitTimestamp, (trade) =>
          trade.signal.accepted
            ? "Accepted signals"
            : "High-score rejected candidates",
        ),
      },
      {
        title: "Index + Setup",
        rows: breakdownFor(
          best.trades,
          splitTimestamp,
          (trade) => `${trade.signal.symbol} | ${trade.signal.setupType}`,
        ),
      },
    ];
  }, [best, run.validation.discoveryEndTimestamp]);
  const weeklyRows = rows.filter((row) => row.model.id !== "engine-selected");
  const viableWeekly = weeklyRows.filter(
    (row) => row.validation.trades >= 10 && row.validation.totalR > 0,
  );
  const promotionCandidates = useMemo(
    () =>
      best && best.model.id === "weekly-old-sunday"
        ? promotionCandidatesFor(
            best.trades,
            run.validation.discoveryEndTimestamp,
          )
        : [],
    [best, run.validation.discoveryEndTimestamp],
  );

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="coco-risk.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Coco Risk Lab</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            This page compares stop/target models without changing live scoring.
            Ambiguous candles that touch stop and target are counted as losses
            to avoid optimistic backtest claims.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!run.integrity.canRunBacktest}
          onClick={() =>
            downloadFile(
              "ict-coco-risk-lab.json",
              JSON.stringify(
                {
                  generatedAt: new Date().toISOString(),
                  integrity: run.integrity,
                  split: run.validation,
                  rows: rows.map((row) => ({
                    id: row.model.id,
                    label: row.model.label,
                    description: row.model.description,
                    all: row.all,
                    discovery: row.discovery,
                    validation: row.validation,
                    sample: row.sample.map((trade) => ({
                      timestamp: new Date(trade.signal.timestamp).toISOString(),
                      symbol: trade.signal.symbol,
                      setup: trade.signal.setupType,
                      score: trade.signal.score,
                      accepted: trade.signal.accepted,
                      entry: trade.signal.entry,
                      stop: trade.stopPrice,
                      target: trade.target.price,
                      targetModel: trade.target.model,
                      targetR: trade.targetR,
                      outcome: !trade.closed
                        ? "Open"
                        : trade.won
                          ? "Win"
                          : trade.ambiguous
                            ? "Ambiguous stop-first loss"
                            : "Loss",
                      rMultiple: trade.rMultiple,
                    })),
                  })),
                  bestBreakdowns: bestBreakdowns.map((section) => ({
                    title: section.title,
                    rows: section.rows.map((row) => ({
                      label: row.label,
                      all: row.all,
                      discovery: row.discovery,
                      validation: row.validation,
                    })),
                  })),
                  promotionCandidates: promotionCandidates.map((candidate) => ({
                    id: candidate.id,
                    label: candidate.label,
                    rule: candidate.rule,
                    decision: candidate.decision,
                    all: candidate.all,
                    discovery: candidate.discovery,
                    validation: candidate.validation,
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
          Export Coco Risk Lab
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Coco Risk Lab is disabled until real 1H and 1D data is loaded.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Risk models"
              value={String(rows.length)}
              detail="Stop/TP combinations tested"
            />
            <Stat
              label="Viable weekly models"
              value={String(viableWeekly.length)}
              detail="10+ validation trades and positive validation R"
            />
            <Stat
              label="Best validation"
              value={best ? fmtR(best.validation.totalR) : "0.00R"}
              detail={best?.model.label ?? "No model"}
            />
            <Stat
              label="Best sample"
              value={best ? String(best.validation.trades) : "0"}
              detail="Validation-period trades"
            />
          </div>

          <section className="border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Scale className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Interpretation
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  If weekly-low + selected TP performs poorly while weekly-low +
                  farther targets performs well, the strategy issue is target
                  selection rather than the weekly-low stop itself.
                </p>
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <h2 className="font-display text-lg font-bold">
              Risk Model Scoreboard
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1120px] font-mono text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Model</th>
                    <th className="py-2 text-right">All trades</th>
                    <th className="py-2 text-right">All net</th>
                    <th className="py-2 text-right">Discovery</th>
                    <th className="py-2 text-right">Discovery net</th>
                    <th className="py-2 text-right">Validation</th>
                    <th className="py-2 text-right">Validation net</th>
                    <th className="py-2 text-right">Val win</th>
                    <th className="py-2 text-right">Val avg</th>
                    <th className="py-2 text-right">Val DD</th>
                    <th className="py-2 text-right">Ambig</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.model.id}
                      className="border-b border-border/40"
                    >
                      <td className="max-w-[260px] py-2">
                        <span title={row.model.description}>
                          {row.model.label}
                        </span>
                      </td>
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
                      <td className="py-2 text-right">
                        {fmtR(row.validation.avgR)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtR(row.validation.maxDrawdownR)}
                      </td>
                      <td className="py-2 text-right">
                        {row.validation.ambiguous}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {best && bestBreakdowns.length > 0 && (
            <section className="border border-border bg-card p-4">
              <h2 className="font-display text-lg font-bold">
                Best Model Breakdown
              </h2>
              <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
                This checks whether the current best model is broad or carried
                by one index, setup, session, or accepted/rejected bucket.
              </p>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {bestBreakdowns.map((section) => (
                  <div key={section.title} className="border border-border p-3">
                    <h3 className="font-mono text-xs font-bold uppercase tracking-widest">
                      {section.title}
                    </h3>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[720px] font-mono text-xs">
                        <thead className="border-b border-border text-muted-foreground">
                          <tr>
                            <th className="py-2 text-left">Group</th>
                            <th className="py-2 text-right">All</th>
                            <th className="py-2 text-right">All net</th>
                            <th className="py-2 text-right">Val</th>
                            <th className="py-2 text-right">Val net</th>
                            <th className="py-2 text-right">Val win</th>
                            <th className="py-2 text-right">Val avg</th>
                            <th className="py-2 text-right">Val DD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.slice(0, 8).map((row) => (
                            <tr
                              key={`${section.title}-${row.label}`}
                              className="border-b border-border/40"
                            >
                              <td className="max-w-[220px] py-2">
                                {row.label}
                              </td>
                              <td className="py-2 text-right">
                                {row.all.trades}
                              </td>
                              <td className="py-2 text-right">
                                {fmtR(row.all.totalR)}
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
                                {fmtR(row.validation.avgR)}
                              </td>
                              <td className="py-2 text-right">
                                {fmtR(row.validation.maxDrawdownR)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {promotionCandidates.length > 0 && (
            <section className="border border-primary/30 bg-primary/5 p-4">
              <h2 className="font-display text-lg font-bold">
                Promotion Candidates
              </h2>
              <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
                These are narrower forward-watch candidates derived from the
                best model. Watch means evidence is worth tracking next; it is
                not a live-trade approval.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[1080px] font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Candidate</th>
                      <th className="py-2 text-left">Decision</th>
                      <th className="py-2 text-right">All</th>
                      <th className="py-2 text-right">All net</th>
                      <th className="py-2 text-right">Validation</th>
                      <th className="py-2 text-right">Val net</th>
                      <th className="py-2 text-right">Val win</th>
                      <th className="py-2 text-right">Val avg</th>
                      <th className="py-2 text-right">Val DD</th>
                      <th className="py-2 text-left">Rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promotionCandidates.map((candidate) => (
                      <tr
                        key={candidate.id}
                        className="border-b border-border/40"
                      >
                        <td className="py-2">{candidate.label}</td>
                        <td className="py-2">{candidate.decision}</td>
                        <td className="py-2 text-right">
                          {candidate.all.trades}
                        </td>
                        <td className="py-2 text-right">
                          {fmtR(candidate.all.totalR)}
                        </td>
                        <td className="py-2 text-right">
                          {candidate.validation.trades}
                        </td>
                        <td className="py-2 text-right">
                          {fmtR(candidate.validation.totalR)}
                        </td>
                        <td className="py-2 text-right">
                          {pct(candidate.validation.winRate)}
                        </td>
                        <td className="py-2 text-right">
                          {fmtR(candidate.validation.avgR)}
                        </td>
                        <td className="py-2 text-right">
                          {fmtR(candidate.validation.maxDrawdownR)}
                        </td>
                        <td className="max-w-[360px] py-2 text-muted-foreground">
                          {candidate.rule}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {best && (
            <section className="border border-border bg-card p-4">
              <h2 className="font-display text-lg font-bold">
                Best Model Sample
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[980px] font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Time</th>
                      <th className="py-2 text-left">Index</th>
                      <th className="py-2 text-left">Setup</th>
                      <th className="py-2 text-right">Score</th>
                      <th className="py-2 text-right">Entry</th>
                      <th className="py-2 text-right">Stop</th>
                      <th className="py-2 text-left">Target</th>
                      <th className="py-2 text-right">Target R</th>
                      <th className="py-2 text-left">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {best.sample.slice(0, 12).map((trade) => (
                      <tr
                        key={`${trade.model.id}-${trade.signal.id}-${trade.target.model}`}
                        className="border-b border-border/40"
                      >
                        <td className="py-2">
                          {new Date(trade.signal.timestamp).toISOString()}
                        </td>
                        <td className="py-2">{trade.signal.symbol}</td>
                        <td className="py-2">{trade.signal.setupType}</td>
                        <td className="py-2 text-right">
                          {trade.signal.score}/10
                        </td>
                        <td className="py-2 text-right">
                          {trade.signal.entry.toFixed(2)}
                        </td>
                        <td className="py-2 text-right">
                          {trade.stopPrice.toFixed(2)}
                        </td>
                        <td className="py-2">{trade.target.model}</td>
                        <td className="py-2 text-right">
                          {fmtR(trade.targetR)}
                        </td>
                        <td className="py-2">
                          {!trade.closed
                            ? "Open"
                            : trade.won
                              ? "Win"
                              : trade.ambiguous
                                ? "Ambiguous loss"
                                : "Loss"}
                        </td>
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
