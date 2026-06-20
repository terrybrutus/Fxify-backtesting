import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import {
  type FrozenVariant,
  loadFrozenVariants,
  saveFrozenVariants,
} from "@/lib/forwardTracker";
import {
  type ExperimentRow,
  type ExperimentTrade,
  buildExperimentRows,
  sessionFor,
} from "@/pages/ExperimentLabPage";
import type { Candle, SignalAudit, TargetCandidate } from "@/types/strategy";
import { Timeframe } from "@/types/strategy";
import { Download, Lock, ShieldAlert, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

function fmtR(value: number) {
  return `${value.toFixed(2)}R`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtDate(value?: number) {
  return value ? new Date(value).toISOString() : "n/a";
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

function forwardTradesFor(frozen: FrozenVariant, row?: ExperimentRow) {
  if (!row) return [];
  return row.trades.filter((trade) => trade.signal.timestamp > frozen.frozenAt);
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

function weeklyLowStop(signal: SignalAudit) {
  return signal.stopCandidates?.find(
    (candidate) => candidate.model === "Coco exact weekly low stop",
  );
}

function oldSundayTarget(signal: SignalAudit, stopPrice: number) {
  return (signal.targetCandidates ?? [])
    .map((candidate) => ({
      ...candidate,
      rMultiple: (candidate.price - signal.entry) / (signal.entry - stopPrice),
    }))
    .find(
      (candidate) =>
        candidate.model === "old Sunday level" &&
        candidate.price > signal.entry &&
        candidate.rMultiple > 0,
    );
}

function symbolMatchesFrozen(signal: SignalAudit, frozen: FrozenVariant) {
  if (frozen.symbolScope === "All") return true;
  return frozen.symbolScope
    .split(",")
    .map((symbol) => symbol.trim())
    .includes(signal.symbol);
}

function signalMatchesCocoFrozen(signal: SignalAudit, frozen: FrozenVariant) {
  if (frozen.sourceType !== "coco-risk-promotion") return false;
  if (signal.setupType !== "HTF Bullish Continuation") return false;
  if (signal.blockers.some((blocker) => blocker.passed)) return false;
  if (!symbolMatchesFrozen(signal, frozen)) return false;
  if (
    frozen.sessionScope !== "All" &&
    sessionFor(signal.timestamp) !== frozen.sessionScope
  )
    return false;
  return true;
}

function simulateCocoTrade(
  signal: SignalAudit,
  target: TargetCandidate,
  stopPrice: number,
  candles: Candle[],
): ExperimentTrade {
  const future = candles.filter(
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
    target,
    closed: !!exit,
    won,
    rMultiple: exit ? (won ? target.rMultiple : -1) : 0,
  };
}

function cocoForwardTradesFor({
  frozen,
  signals,
  candles,
}: {
  frozen: FrozenVariant;
  signals: SignalAudit[];
  candles: Candle[];
}) {
  const candlesBySymbol = h1BySymbol(candles);
  return signals.flatMap((signal) => {
    if (signal.timestamp <= frozen.frozenAt) return [];
    if (!signalMatchesCocoFrozen(signal, frozen)) return [];
    const stop = weeklyLowStop(signal);
    if (!stop || stop.price >= signal.entry) return [];
    const target = oldSundayTarget(signal, stop.price);
    if (!target) return [];
    const h1 = candlesBySymbol.get(signal.symbol) ?? [];
    return [simulateCocoTrade(signal, target, stop.price, h1)];
  });
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

export default function ForwardTrackerPage() {
  const { candles, run } = useStrategyWorkspace();
  const [frozenVariants, setFrozenVariants] = useState<FrozenVariant[]>(() =>
    loadFrozenVariants(),
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
  const rowById = useMemo(
    () => new Map(rows.map((row) => [row.variant.id, row])),
    [rows],
  );
  const tracked = frozenVariants.map((frozen) => {
    const row = rowById.get(frozen.variantId);
    const forwardTrades =
      frozen.sourceType === "coco-risk-promotion"
        ? cocoForwardTradesFor({ frozen, signals, candles })
        : forwardTradesFor(frozen, row);
    const closed = forwardTrades.filter((trade) => trade.closed);
    const wins = closed.filter((trade) => trade.won).length;
    const losses = closed.length - wins;
    const open = forwardTrades.length - closed.length;
    const netR = closed.reduce((sum, trade) => sum + trade.rMultiple, 0);
    return {
      frozen,
      row,
      forwardTrades,
      wins,
      losses,
      open,
      netR,
      winRate: closed.length ? wins / closed.length : 0,
    };
  });
  const forwardTradeCount = tracked.reduce(
    (sum, item) => sum + item.forwardTrades.length,
    0,
  );
  const forwardNetR = tracked.reduce((sum, item) => sum + item.netR, 0);

  function persist(next: FrozenVariant[]) {
    setFrozenVariants(next);
    saveFrozenVariants(next);
  }

  function removeFrozen(id: string) {
    persist(frozenVariants.filter((variant) => variant.id !== id));
  }

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="forward.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Forward Tracker</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Freeze a variant before judging newer candles. Forward evidence only
            counts after the freeze timestamp, so the app cannot silently
            promote hindsight.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={tracked.length === 0}
          onClick={() =>
            downloadFile(
              "ict-forward-tracker.json",
              JSON.stringify(
                {
                  generatedAt: new Date().toISOString(),
                  integrity: run.integrity,
                  tracked: tracked.map((item) => ({
                    ...item.frozen,
                    currentRulePresent:
                      item.frozen.sourceType === "coco-risk-promotion" ||
                      Boolean(item.row),
                    forwardTrades: item.forwardTrades.map((trade) => ({
                      timestamp: new Date(trade.signal.timestamp).toISOString(),
                      symbol: trade.signal.symbol,
                      setupType: trade.signal.setupType,
                      targetModel: trade.target.model,
                      outcome: !trade.closed
                        ? "Pending"
                        : trade.won
                          ? "Won"
                          : "Lost",
                      rMultiple: trade.rMultiple,
                    })),
                    wins: item.wins,
                    losses: item.losses,
                    open: item.open,
                    netR: item.netR,
                    winRate: item.winRate,
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
          Export Tracker
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Forward tracking is disabled until real 1H and 1D data is loaded.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Frozen variants"
              value={String(frozenVariants.length)}
              detail="Locked before future scoring"
            />
            <Stat
              label="Forward trades"
              value={String(forwardTradeCount)}
              detail="Signals after freeze timestamps"
            />
            <Stat label="Forward net" value={fmtR(forwardNetR)} />
            <Stat
              label="Latest candle"
              value={fmtDate(run.integrity.end)}
              detail="New CSVs extend forward evidence"
            />
          </div>

          <section className="border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Forward Rule
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Anything frozen today will probably show zero forward trades
                  until you import newer candles. That is expected. It means the
                  tracker is refusing to grade past data as future proof.
                </p>
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Frozen Variants
              </h2>
            </div>
            {tracked.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No variants are frozen yet. Freeze a watchlist or forward-test
                candidate from Experiment Lab, then future imports will score
                only candles after the freeze time.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[1080px] font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Frozen rule</th>
                      <th className="py-2 text-left">Rule family</th>
                      <th className="py-2 text-left">Index</th>
                      <th className="py-2 text-left">Session</th>
                      <th className="py-2 text-left">Target</th>
                      <th className="py-2 text-left">Frozen at</th>
                      <th className="py-2 text-right">Forward</th>
                      <th className="py-2 text-right">W/L/P</th>
                      <th className="py-2 text-right">Net</th>
                      <th className="py-2 text-right">Win</th>
                      <th className="py-2 text-left">Source gate</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracked.map((item) => (
                      <tr
                        key={item.frozen.id}
                        className="border-b border-border/40"
                      >
                        <td className="py-2">
                          <span title={item.frozen.ruleHash}>
                            {item.frozen.setup}
                          </span>
                        </td>
                        <td className="py-2">{item.frozen.ruleFamily}</td>
                        <td className="py-2">{item.frozen.symbolScope}</td>
                        <td className="py-2">{item.frozen.sessionScope}</td>
                        <td className="py-2">{item.frozen.targetModel}</td>
                        <td className="py-2">
                          {new Date(item.frozen.frozenAt).toISOString()}
                        </td>
                        <td className="py-2 text-right">
                          {item.forwardTrades.length}
                        </td>
                        <td className="py-2 text-right">
                          {item.wins}/{item.losses}/{item.open}
                        </td>
                        <td className="py-2 text-right">{fmtR(item.netR)}</td>
                        <td className="py-2 text-right">{pct(item.winRate)}</td>
                        <td className="py-2">
                          {item.frozen.sourcePromotionGate}
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeFrozen(item.frozen.id)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
