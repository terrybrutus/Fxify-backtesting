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
  all: RiskStats;
  discovery: RiskStats;
  validation: RiskStats;
  sample: RiskTrade[];
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
    const discovery =
      splitTimestamp === undefined
        ? []
        : trades.filter((trade) => trade.signal.timestamp <= splitTimestamp);
    const validation =
      splitTimestamp === undefined
        ? []
        : trades.filter((trade) => trade.signal.timestamp > splitTimestamp);
    return {
      model,
      all: statsFor(trades),
      discovery: statsFor(discovery),
      validation: statsFor(validation),
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
  const weeklyRows = rows.filter((row) => row.model.id !== "engine-selected");
  const viableWeekly = weeklyRows.filter(
    (row) => row.validation.trades >= 10 && row.validation.totalR > 0,
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
