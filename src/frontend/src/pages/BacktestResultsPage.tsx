import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useBacktestSessions,
  useBacktestTrades,
  useDeleteBacktestSession,
  usePerformanceStats,
  useRunBacktest,
} from "@/hooks/useBackend";
import type {
  BacktestSession,
  BacktestSettings,
  ConfluenceScore,
  TradeResult,
} from "@/types/strategy";
import { TradeOutcome } from "@/types/strategy";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Info,
  Play,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: bigint | number | undefined): string {
  if (ts === undefined || ts === null) return "—";
  const ms = typeof ts === "bigint" ? Number(ts) : ts;
  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function fmtPrice(p: number | undefined): string {
  if (p === undefined) return "—";
  return p.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  });
}

function fmtPnl(n: number): string {
  return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
  ocid,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: "positive" | "negative" | "neutral";
  ocid?: string;
}) {
  const valueColor =
    accent === "positive"
      ? "text-chart-1"
      : accent === "negative"
        ? "text-destructive"
        : "text-primary";
  return (
    <Card
      className="border border-border bg-card relative overflow-hidden"
      data-ocid={ocid}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      <CardContent className="p-4 space-y-2 relative">
        <div className="flex items-center gap-2">
          <div className="text-primary/60">{icon}</div>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
            {label}
          </p>
        </div>
        <p
          className={`font-mono text-2xl font-bold tracking-tight ${valueColor}`}
        >
          {value}
        </p>
        {sub && (
          <p className="font-mono text-[10px] text-muted-foreground">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Outcome Badge ──────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: TradeOutcome }) {
  const map: Record<TradeOutcome, { cls: string; label: string }> = {
    [TradeOutcome.Win]: {
      cls: "border-chart-1/60 text-chart-1 bg-chart-1/10",
      label: "WIN",
    },
    [TradeOutcome.Loss]: {
      cls: "border-destructive/60 text-destructive bg-destructive/10",
      label: "LOSS",
    },
    [TradeOutcome.Open]: {
      cls: "border-primary/40 text-primary bg-primary/10",
      label: "OPEN",
    },
  };
  const { cls, label } = map[outcome];
  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] px-1.5 py-0 ${cls}`}
    >
      {label}
    </Badge>
  );
}

// ─── Confluence Badge + Popover ─────────────────────────────────────────────

const CONFLUENCE_FACTORS: {
  key: keyof ConfluenceScore;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "bullishDailyCandle",
    label: "Bullish Daily Candle",
    icon: <TrendingUp className="w-3 h-3" />,
  },
  {
    key: "hasSundayLevel",
    label: "Sunday Level",
    icon: <Target className="w-3 h-3" />,
  },
  {
    key: "hasEma200",
    label: "200 EMA",
    icon: <Activity className="w-3 h-3" />,
  },
  {
    key: "hasEma20OrSma50",
    label: "20 EMA / 50 SMA",
    icon: <BarChart2 className="w-3 h-3" />,
  },
  {
    key: "hasFVG",
    label: "1H Fair Value Gap",
    icon: <Zap className="w-3 h-3" />,
  },
  {
    key: "maHolds",
    label: "MA Holds",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  {
    key: "targetAbove",
    label: "Buy-side Target",
    icon: <CircleDollarSign className="w-3 h-3" />,
  },
];

function ConfluenceBadge({ score }: { score: ConfluenceScore }) {
  const total = Number(score.total);
  const maxScore = 7;
  const barColor =
    total >= 5 ? "bg-chart-1" : total >= 3 ? "bg-primary" : "bg-destructive/70";
  const badgeCls =
    total >= 5
      ? "border-chart-1/60 text-chart-1 bg-chart-1/10"
      : total >= 3
        ? "border-primary/50 text-primary bg-primary/10"
        : "border-destructive/40 text-destructive/80 bg-destructive/10";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-colors"
          data-ocid="results.confluence_badge"
        >
          <Badge
            variant="outline"
            className={`font-mono text-[10px] px-1.5 py-0 ${badgeCls}`}
          >
            {total}/{maxScore}
          </Badge>
          <Info className="w-3 h-3 text-muted-foreground/40" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-3 bg-card border-border font-mono"
        data-ocid="results.confluence_popover"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Confluence Score
            </p>
            <p className="text-xs font-bold text-primary">
              {total}/{maxScore}
            </p>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} rounded-full transition-all`}
              style={{ width: `${(total / maxScore) * 100}%` }}
            />
          </div>
          <Separator className="bg-border" />
          <div className="space-y-1">
            {CONFLUENCE_FACTORS.map((f) => {
              const active = score[f.key] === true;
              return (
                <div
                  key={f.key}
                  className={`flex items-center gap-2 text-[10px] ${
                    active ? "text-foreground" : "text-muted-foreground/40"
                  }`}
                >
                  <span
                    className={
                      active ? "text-chart-1" : "text-muted-foreground/30"
                    }
                  >
                    {active ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                  </span>
                  <span className={active ? "text-primary/70" : ""}>
                    {f.icon}
                  </span>
                  <span>{f.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Row color helper ────────────────────────────────────────────────────────

function rowClass(outcome: TradeOutcome): string {
  if (outcome === TradeOutcome.Win)
    return "border-border bg-chart-1/5 hover:bg-chart-1/10";
  if (outcome === TradeOutcome.Loss)
    return "border-border bg-destructive/5 hover:bg-destructive/10";
  return "border-border bg-primary/5 hover:bg-primary/10";
}

// ─── Session List Item ────────────────────────────────────────────────────────

function SessionItem({
  session,
  isSelected,
  index,
  onSelect,
  onDelete,
}: {
  session: BacktestSession;
  isSelected: boolean;
  index: number;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const wr = session.stats.winRate;
  const date = new Date(Number(session.createdAt)).toLocaleDateString();
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 border transition-colors ${
        isSelected
          ? "border-primary/60 bg-primary/10 text-primary"
          : "border-border hover:border-primary/30 hover:bg-muted/30 text-foreground"
      }`}
      data-ocid={`results.session.${index}`}
    >
      <div className="flex items-start gap-2">
        <ChevronRight
          className={`w-3 h-3 mt-0.5 shrink-0 transition-transform ${
            isSelected ? "rotate-90 text-primary" : "text-muted-foreground/50"
          }`}
        />
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-xs font-medium truncate">
              {session.sessionLabel}
            </span>
            <button
              type="button"
              onClick={onDelete}
              className="shrink-0 text-muted-foreground/30 hover:text-destructive transition-colors"
              data-ocid={`results.session_delete_button.${index}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-mono text-[10px]">{date}</span>
            <span className="font-mono text-[10px]">
              {session.tradeCount.toString()} trades
            </span>
            <span
              className={`font-mono text-[10px] ${
                wr >= 0.5 ? "text-chart-1" : "text-destructive/70"
              }`}
            >
              {(wr * 100).toFixed(0)}% WR
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Settings Form ────────────────────────────────────────────────────────────

function BacktestSettingsForm({
  settings,
  sessionLabel,
  onSettingsChange,
  onLabelChange,
  onRun,
  isPending,
}: {
  settings: BacktestSettings;
  sessionLabel: string;
  onSettingsChange: <K extends keyof BacktestSettings>(
    key: K,
    val: BacktestSettings[K],
  ) => void;
  onLabelChange: (v: string) => void;
  onRun: () => void;
  isPending: boolean;
}) {
  return (
    <Card
      className="border border-border bg-card"
      data-ocid="results.settings_panel"
    >
      <CardHeader className="pb-3">
        <CardTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-primary" />
          Backtest Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            Session Label
          </Label>
          <Input
            value={sessionLabel}
            onChange={(e) => onLabelChange(e.target.value)}
            className="font-mono text-xs h-8 bg-background border-border"
            placeholder="e.g. BTCUSD June 2024"
            data-ocid="results.session_label_input"
          />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Confluence Min (1–7)
            </Label>
            <Input
              type="number"
              min={1}
              max={7}
              value={settings.confluenceThreshold.toString()}
              onChange={(e) =>
                onSettingsChange(
                  "confluenceThreshold",
                  BigInt(
                    Math.max(
                      1,
                      Math.min(7, Number.parseInt(e.target.value) || 1),
                    ),
                  ),
                )
              }
              className="font-mono text-xs h-8 bg-background border-border"
              data-ocid="results.confluence_threshold_input"
            />
          </div>
          <div className="space-y-1">
            <Label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Stop Buffer %
            </Label>
            <Input
              type="number"
              value={settings.stopBufferPct}
              onChange={(e) =>
                onSettingsChange(
                  "stopBufferPct",
                  Number.parseFloat(e.target.value) || 0,
                )
              }
              step="0.1"
              min={0}
              className="font-mono text-xs h-8 bg-background border-border"
              data-ocid="results.stop_buffer_input"
            />
          </div>
          <div className="space-y-1">
            <Label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              TP1 R-Multiple
            </Label>
            <Input
              type="number"
              value={settings.tp1MultiplierR}
              onChange={(e) =>
                onSettingsChange(
                  "tp1MultiplierR",
                  Number.parseFloat(e.target.value) || 2,
                )
              }
              step="0.5"
              min={0.5}
              className="font-mono text-xs h-8 bg-background border-border"
              data-ocid="results.tp1_input"
            />
          </div>
          <div className="space-y-1">
            <Label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Min Candles MA
            </Label>
            <Input
              type="number"
              value={settings.minCandlesForMA.toString()}
              onChange={(e) =>
                onSettingsChange(
                  "minCandlesForMA",
                  BigInt(Math.max(1, Number.parseInt(e.target.value) || 200)),
                )
              }
              min={1}
              className="font-mono text-xs h-8 bg-background border-border"
              data-ocid="results.min_candles_input"
            />
          </div>
          <div className="space-y-1">
            <Label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Account Size (USD)
            </Label>
            <Input
              type="number"
              value={settings.accountSize}
              onChange={(e) =>
                onSettingsChange(
                  "accountSize",
                  Number.parseFloat(e.target.value) || 15000,
                )
              }
              min={1000}
              step={1000}
              className="font-mono text-xs h-8 bg-background border-border"
              data-ocid="results.account_size_input"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={onRun}
            disabled={isPending}
            className="font-mono text-xs uppercase tracking-widest h-9 px-6"
            data-ocid="results.run_backtest_button"
          >
            <Play className="w-3.5 h-3.5 mr-2" />
            {isPending ? "Running…" : "Run Backtest"}
          </Button>
          <p className="font-mono text-[10px] text-muted-foreground/50">
            Runs against all uploaded candle data
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BacktestResultsPage() {
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [sessionLabel, setSessionLabel] = useState("Backtest Run");
  const [settings, setSettings] = useState<BacktestSettings>({
    tp1MultiplierR: 2.0,
    minCandlesForMA: BigInt(200),
    stopBufferPct: 0.5,
    accountSize: 15000,
    confluenceThreshold: BigInt(3),
  });

  const sessions = useBacktestSessions();
  const trades = useBacktestTrades(selectedId);
  const stats = usePerformanceStats(selectedId);
  const runBacktest = useRunBacktest();
  const deleteSession = useDeleteBacktestSession();

  function setSetting<K extends keyof BacktestSettings>(
    key: K,
    val: BacktestSettings[K],
  ) {
    setSettings((prev) => ({ ...prev, [key]: val }));
  }

  async function handleRun() {
    try {
      const session = await runBacktest.mutateAsync({ settings, sessionLabel });
      setSelectedId(session.id);
      toast.success(`Backtest complete — ${session.tradeCount} trades found`);
    } catch {
      toast.error("Backtest failed. Upload price data first.");
    }
  }

  async function handleDelete(id: bigint, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteSession.mutateAsync(id);
    if (selectedId === id) setSelectedId(null);
    toast.success("Session deleted");
  }

  const selectedSession =
    sessions.data?.find((s) => s.id === selectedId) ?? null;
  const hasNoSessions =
    !sessions.isLoading && (sessions.data?.length ?? 0) === 0;

  return (
    <div className="min-h-screen bg-background" data-ocid="results.page">
      {/* Page header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-base font-bold text-foreground uppercase tracking-widest">
              Backtest Results
            </h1>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
              Strategy performance analysis
            </p>
          </div>
          {selectedSession && (
            <Badge
              variant="outline"
              className="font-mono text-xs border-primary/40 text-primary bg-primary/10"
            >
              {selectedSession.sessionLabel}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Settings Panel */}
        <BacktestSettingsForm
          settings={settings}
          sessionLabel={sessionLabel}
          onSettingsChange={setSetting}
          onLabelChange={setSessionLabel}
          onRun={handleRun}
          isPending={runBacktest.isPending}
        />

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Session History Sidebar */}
          <div className="xl:col-span-1 space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                Session History
              </h2>
              <Separator className="flex-1 bg-border" />
            </div>

            {sessions.isLoading && (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            )}

            {hasNoSessions && (
              <div
                className="border border-dashed border-border p-6 flex flex-col items-center gap-3 text-center"
                data-ocid="results.empty_state"
              >
                <BarChart2 className="w-8 h-8 text-muted-foreground/20" />
                <div>
                  <p className="font-mono text-xs text-muted-foreground">
                    No sessions yet
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground/50 mt-1">
                    Configure settings above and run your first backtest
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRun}
                  disabled={runBacktest.isPending}
                  className="font-mono text-[10px] uppercase tracking-wider"
                  data-ocid="results.empty_state_run_button"
                >
                  <Play className="w-3 h-3 mr-1" />
                  Run First Backtest
                </Button>
              </div>
            )}

            <div className="space-y-1" data-ocid="results.session_list">
              {sessions.data?.map((s, i) => (
                <SessionItem
                  key={s.id.toString()}
                  session={s}
                  isSelected={selectedId === s.id}
                  index={i + 1}
                  onSelect={() => setSelectedId(s.id)}
                  onDelete={(e) => handleDelete(s.id, e)}
                />
              ))}
            </div>
          </div>

          {/* Results Area */}
          <div className="xl:col-span-3 space-y-6">
            {selectedId === null ? (
              <div
                className="border border-dashed border-border flex flex-col items-center justify-center py-24 gap-4"
                data-ocid="results.no_session_state"
              >
                <Activity className="w-12 h-12 text-muted-foreground/20" />
                <div className="text-center">
                  <p className="font-mono text-sm text-muted-foreground">
                    No session selected
                  </p>
                  <p className="font-mono text-xs text-muted-foreground/50 mt-1">
                    Run a backtest or select a session from the history
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Performance Stats Grid */}
                {stats.isLoading ? (
                  <div
                    className="grid grid-cols-2 md:grid-cols-3 gap-3"
                    data-ocid="results.stats_loading_state"
                  >
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-24" />
                    ))}
                  </div>
                ) : stats.data ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard
                      label="Win Rate"
                      value={`${(stats.data.winRate * 100).toFixed(1)}%`}
                      sub={`${stats.data.wins.toString()} W / ${stats.data.losses.toString()} L`}
                      icon={<TrendingUp className="w-3.5 h-3.5" />}
                      accent={
                        stats.data.winRate >= 0.5 ? "positive" : "negative"
                      }
                      ocid="results.win_rate_card"
                    />
                    <StatCard
                      label="Profit Factor"
                      value={stats.data.profitFactor.toFixed(2)}
                      sub={`${stats.data.openTrades.toString()} open`}
                      icon={<BarChart2 className="w-3.5 h-3.5" />}
                      accent={
                        stats.data.profitFactor >= 1.5
                          ? "positive"
                          : stats.data.profitFactor < 1
                            ? "negative"
                            : "neutral"
                      }
                      ocid="results.profit_factor_card"
                    />
                    <StatCard
                      label="Total P&L"
                      value={fmtPnl(stats.data.totalPnl)}
                      sub="Net realized"
                      icon={<CircleDollarSign className="w-3.5 h-3.5" />}
                      accent={
                        stats.data.totalPnl >= 0 ? "positive" : "negative"
                      }
                      ocid="results.total_pnl_card"
                    />
                    <StatCard
                      label="Max Drawdown"
                      value={`${(stats.data.maxDrawdown * 100).toFixed(2)}%`}
                      sub="Peak-to-trough"
                      icon={<TrendingDown className="w-3.5 h-3.5" />}
                      accent="negative"
                      ocid="results.max_drawdown_card"
                    />
                    <StatCard
                      label="Avg R:R"
                      value={stats.data.avgRR.toFixed(2)}
                      sub="Per trade"
                      icon={<Target className="w-3.5 h-3.5" />}
                      accent={stats.data.avgRR >= 2 ? "positive" : "neutral"}
                      ocid="results.avg_rr_card"
                    />
                    <StatCard
                      label="Total Trades"
                      value={stats.data.totalTrades.toString()}
                      sub={`${stats.data.openTrades.toString()} still open`}
                      icon={<Activity className="w-3.5 h-3.5" />}
                      accent="neutral"
                      ocid="results.total_trades_card"
                    />
                  </div>
                ) : null}

                {/* Trade Log Table */}
                <Card className="border border-border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-primary" />
                      Trade Log
                      {trades.data && (
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] border-border ml-auto"
                        >
                          {trades.data.length} trades
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {trades.isLoading ? (
                      <div
                        className="p-4 space-y-2"
                        data-ocid="results.trades_loading_state"
                      >
                        {[0, 1, 2, 3, 4].map((i) => (
                          <Skeleton key={i} className="h-8 w-full" />
                        ))}
                      </div>
                    ) : trades.data?.length === 0 ? (
                      <div
                        className="p-12 text-center"
                        data-ocid="results.trades_empty_state"
                      >
                        <AlertTriangle className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
                        <p className="font-mono text-xs text-muted-foreground">
                          No trades found in this session
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-border hover:bg-transparent">
                              <TableHead className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider w-8">
                                #
                              </TableHead>
                              <TableHead className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                                Entry Time
                              </TableHead>
                              <TableHead className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider text-right">
                                Entry
                              </TableHead>
                              <TableHead className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider text-right">
                                Stop
                              </TableHead>
                              <TableHead className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider text-right">
                                TP1
                              </TableHead>
                              <TableHead className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider text-right">
                                Exit Price
                              </TableHead>
                              <TableHead className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider text-right">
                                Lot Size
                              </TableHead>
                              <TableHead className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider text-right">
                                R-Mult
                              </TableHead>
                              <TableHead className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider text-right">
                                P&amp;L
                              </TableHead>
                              <TableHead className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                                Conf
                              </TableHead>
                              <TableHead className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                                Outcome
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {trades.data?.map(
                              (trade: TradeResult, i: number) => {
                                const pnl = Array.isArray(trade.pnl)
                                  ? trade.pnl[0]
                                  : trade.pnl;
                                const rMultiple = Array.isArray(trade.rMultiple)
                                  ? trade.rMultiple[0]
                                  : trade.rMultiple;
                                const exitPrice = Array.isArray(trade.exitPrice)
                                  ? trade.exitPrice[0]
                                  : trade.exitPrice;
                                return (
                                  <TableRow
                                    key={trade.tradeId.toString()}
                                    className={rowClass(trade.outcome)}
                                    data-ocid={`results.trade.${i + 1}`}
                                  >
                                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                                      {i + 1}
                                    </TableCell>
                                    <TableCell className="font-mono text-[10px] whitespace-nowrap">
                                      {fmtTimestamp(trade.entryTimestamp)}
                                    </TableCell>
                                    <TableCell className="font-mono text-[10px] text-right">
                                      {fmtPrice(trade.entryPrice)}
                                    </TableCell>
                                    <TableCell className="font-mono text-[10px] text-right text-destructive/80">
                                      {fmtPrice(trade.stopPrice)}
                                    </TableCell>
                                    <TableCell className="font-mono text-[10px] text-right text-chart-1/80">
                                      {fmtPrice(trade.tp1Price)}
                                    </TableCell>
                                    <TableCell className="font-mono text-[10px] text-right text-muted-foreground">
                                      {exitPrice !== undefined
                                        ? fmtPrice(exitPrice)
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="font-mono text-[10px] text-right">
                                      {trade.lotSize.toFixed(2)}
                                    </TableCell>
                                    <TableCell
                                      className={`font-mono text-[10px] text-right ${
                                        rMultiple !== undefined &&
                                        rMultiple >= 0
                                          ? "text-chart-1"
                                          : "text-destructive"
                                      }`}
                                    >
                                      {rMultiple !== undefined
                                        ? rMultiple >= 0
                                          ? `+${rMultiple.toFixed(2)}R`
                                          : `${rMultiple.toFixed(2)}R`
                                        : "—"}
                                    </TableCell>
                                    <TableCell
                                      className={`font-mono text-[10px] text-right font-medium ${
                                        pnl !== undefined && pnl > 0
                                          ? "text-chart-1"
                                          : pnl !== undefined && pnl < 0
                                            ? "text-destructive"
                                            : "text-muted-foreground"
                                      }`}
                                    >
                                      {pnl !== undefined ? fmtPnl(pnl) : "—"}
                                    </TableCell>
                                    <TableCell>
                                      <ConfluenceBadge
                                        score={trade.confluenceScore}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <OutcomeBadge outcome={trade.outcome} />
                                    </TableCell>
                                  </TableRow>
                                );
                              },
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
