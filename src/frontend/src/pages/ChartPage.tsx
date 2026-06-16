import RechartsChart, { ChartLegend } from "@/components/RechartsChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBacktestSessions,
  useBacktestTrades,
  useCandles,
  useFVGZones,
  useMovingAverages,
  useSundayLevels,
} from "@/hooks/useBackend";
import { Timeframe } from "@/types/strategy";
import { Link } from "@tanstack/react-router";
import { BarChart2, ChevronRight, Cpu, Layers, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

const TF_OPTIONS = [
  { value: Timeframe.H1, label: "1H" },
  { value: Timeframe.H4, label: "4H" },
  { value: Timeframe.Daily, label: "Daily" },
];

function ConfluenceBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-chart-1"
      : score >= 60
        ? "bg-primary"
        : score >= 40
          ? "bg-chart-4"
          : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="font-mono text-xs text-primary w-8 text-right">
        {score}%
      </span>
    </div>
  );
}

export default function ChartPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.H1);
  const [showFVG, setShowFVG] = useState(true);
  const [showLevels, setShowLevels] = useState(true);
  const [showMA, setShowMA] = useState(true);

  const candles = useCandles(timeframe);
  const sundayLevels = useSundayLevels();
  const fvgZones = useFVGZones();
  const movingAverages = useMovingAverages(timeframe);
  const sessions = useBacktestSessions();
  const lastSessionId = useMemo(() => {
    const s = sessions.data;
    if (!s || s.length === 0) return null;
    return s[s.length - 1].id;
  }, [sessions.data]);
  const backtestTrades = useBacktestTrades(lastSessionId);

  const confluenceScore = useMemo(() => {
    let score = 0;
    const data = candles.data;
    if (!data || data.length === 0) return 0;
    const last = data[data.length - 1];
    const price = last.close;
    const ma = movingAverages.data;
    if (ma?.ema200 && Math.abs(price - ma.ema200) / price < 0.005) score += 25;
    if (ma?.ema20 && Math.abs(price - ma.ema20) / price < 0.003) score += 15;
    if (ma?.sma50 && Math.abs(price - ma.sma50) / price < 0.003) score += 15;
    if ((sundayLevels.data?.length ?? 0) > 0) score += 20;
    if ((fvgZones.data?.length ?? 0) > 0) score += 25;
    return Math.min(score, 100);
  }, [candles.data, movingAverages.data, sundayLevels.data, fvgZones.data]);

  const candleCount = candles.data?.length ?? 0;
  const isLoading = candles.isLoading;

  return (
    <div className="flex flex-col h-full" data-ocid="chart.page">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <BarChart2 className="w-4 h-4 text-primary" />
        <span className="font-mono text-sm font-semibold text-foreground">
          Price Chart
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={timeframe}
            onValueChange={(v) => setTimeframe(v as Timeframe)}
          >
            <SelectTrigger
              className="w-20 h-7 font-mono text-xs"
              data-ocid="chart.timeframe_select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TF_OPTIONS.map((tf) => (
                <SelectItem
                  key={tf.value}
                  value={tf.value}
                  className="font-mono text-xs"
                >
                  {tf.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => setShowLevels((p) => !p)}
            className={`px-2 py-1 font-mono text-xs border transition-smooth ${
              showLevels
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground"
            }`}
            data-ocid="chart.levels_toggle"
          >
            <TrendingUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setShowFVG((p) => !p)}
            className={`px-2 py-1 font-mono text-xs border transition-smooth ${
              showFVG
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground"
            }`}
            data-ocid="chart.fvg_toggle"
          >
            <Layers className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setShowMA((p) => !p)}
            className={`px-2 py-1 font-mono text-xs border transition-smooth ${
              showMA
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground"
            }`}
            data-ocid="chart.ma_toggle"
          >
            <Cpu className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Chart + legend area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 relative bg-background min-h-0">
            {isLoading ? (
              <div
                className="absolute inset-0 flex flex-col gap-3 p-6"
                data-ocid="chart.loading_state"
              >
                <Skeleton className="h-full w-full" />
              </div>
            ) : candleCount === 0 ? (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-4"
                data-ocid="chart.empty_state"
              >
                <BarChart2 className="w-12 h-12 text-muted-foreground/40" />
                <p className="font-mono text-sm text-muted-foreground">
                  No candle data loaded for {timeframe}
                </p>
                <p className="font-mono text-xs text-muted-foreground/60 text-center max-w-xs">
                  Upload historical OHLCV data to start charting your strategy
                </p>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs"
                  data-ocid="chart.upload_link"
                >
                  <Link to="/upload">
                    Upload Data <ChevronRight className="w-3 h-3 ml-1" />
                  </Link>
                </Button>
              </div>
            ) : (
              <RechartsChart
                candles={candles.data ?? []}
                sundayLevels={showLevels ? (sundayLevels.data ?? []) : []}
                fvgZones={showFVG ? (fvgZones.data ?? []) : []}
                movingAverages={showMA ? (movingAverages.data ?? {}) : {}}
                trades={backtestTrades.data ?? []}
                showFVG={showFVG}
                showLevels={showLevels}
                showMA={showMA}
              />
            )}
          </div>
          {/* Chart legend */}
          {candleCount > 0 && (
            <ChartLegend
              showMA={showMA}
              showFVG={showFVG}
              showLevels={showLevels}
            />
          )}
        </div>

        {/* Side panel */}
        <div className="w-52 shrink-0 border-l border-border bg-card flex flex-col overflow-y-auto">
          {/* Confluence score */}
          <div className="p-3 border-b border-border">
            <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">
              Confluence
            </p>
            <ConfluenceBar score={confluenceScore} />
          </div>

          {/* MA values */}
          {showMA && (
            <div className="p-3 border-b border-border space-y-1">
              <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Moving Avgs
              </p>
              {movingAverages.data?.ema200 && (
                <div className="flex justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    EMA 200
                  </span>
                  <span className="font-mono text-xs text-primary">
                    {movingAverages.data.ema200.toFixed(2)}
                  </span>
                </div>
              )}
              {movingAverages.data?.ema20 && (
                <div className="flex justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    EMA 20
                  </span>
                  <span className="font-mono text-xs text-primary">
                    {movingAverages.data.ema20.toFixed(2)}
                  </span>
                </div>
              )}
              {movingAverages.data?.sma50 && (
                <div className="flex justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    SMA 50
                  </span>
                  <span className="font-mono text-xs text-primary">
                    {movingAverages.data.sma50.toFixed(2)}
                  </span>
                </div>
              )}
              {!movingAverages.data?.ema200 &&
                !movingAverages.data?.ema20 &&
                !movingAverages.data?.sma50 && (
                  <p className="font-mono text-xs text-muted-foreground/50">
                    Awaiting data
                  </p>
                )}
            </div>
          )}

          {/* Sunday Levels */}
          {showLevels && (
            <div className="p-3 border-b border-border">
              <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Sunday Levels ({sundayLevels.data?.length ?? 0})
              </p>
              <div className="space-y-1">
                {sundayLevels.data?.slice(0, 6).map((lvl) => (
                  <div key={lvl.id.toString()} className="flex justify-between">
                    <span className="font-mono text-xs text-muted-foreground truncate">
                      {lvl.levelLabel}
                    </span>
                    <span className="font-mono text-xs text-primary">
                      {lvl.price.toFixed(2)}
                    </span>
                  </div>
                ))}
                {(sundayLevels.data?.length ?? 0) === 0 && (
                  <p className="font-mono text-xs text-muted-foreground/50">
                    None set
                  </p>
                )}
              </div>
            </div>
          )}

          {/* FVG Zones */}
          {showFVG && (
            <div className="p-3">
              <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">
                FVG Zones ({fvgZones.data?.length ?? 0})
              </p>
              <div className="space-y-1">
                {fvgZones.data?.slice(0, 6).map((zone) => (
                  <div
                    key={zone.id.toString()}
                    className="flex justify-between items-center"
                  >
                    <Badge
                      variant="outline"
                      className={`font-mono text-xs px-1 py-0 ${
                        zone.isBullish
                          ? "border-chart-1/60 text-chart-1"
                          : "border-destructive/60 text-destructive"
                      }`}
                    >
                      {zone.isBullish ? "B" : "S"}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {zone.bottom.toFixed(0)}–{zone.top.toFixed(0)}
                    </span>
                  </div>
                ))}
                {(fvgZones.data?.length ?? 0) === 0 && (
                  <p className="font-mono text-xs text-muted-foreground/50">
                    None set
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
