import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCandles,
  useFVGZones,
  useMovingAverages,
  useSundayLevels,
} from "@/hooks/useBackend";
import { Timeframe } from "@/types/strategy";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Check,
  CheckSquare,
  Crosshair,
  PlayCircle,
  PlusCircle,
  ShieldAlert,
  Target,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";

interface ConfluenceFactor {
  key: string;
  label: string;
  pass: boolean;
  description: string;
}

interface InvalidationItem {
  label: string;
  triggered: boolean;
  value: string;
}

function MARow({
  label,
  value,
  color = "text-foreground",
  ocid,
}: {
  label: string;
  value: number | null | undefined;
  color?: string;
  ocid: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="font-mono text-[10px] uppercase text-muted-foreground">
        {label}
      </span>
      <span
        className={`font-mono text-sm font-bold tabular-nums ${color}`}
        data-ocid={ocid}
      >
        {value != null ? value.toFixed(2) : "—"}
      </span>
    </div>
  );
}

function EntryRow({
  label,
  value,
  highlight = false,
  color = "text-foreground",
  ocid,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  color?: string;
  ocid: string;
}) {
  return (
    <div
      className={`px-3 py-2 border ${highlight ? "border-primary/30 bg-primary/5" : "border-border bg-background"}`}
    >
      <p className="font-mono text-[10px] uppercase text-muted-foreground">
        {label}
      </p>
      <p
        className={`font-mono text-sm font-bold mt-0.5 ${highlight ? "text-primary" : color}`}
        data-ocid={ocid}
      >
        {value}
      </p>
    </div>
  );
}

export default function SetupDetectorPage() {
  const candles1H = useCandles(Timeframe.H1);
  const candlesDaily = useCandles(Timeframe.Daily);
  const sundayLevels = useSundayLevels();
  const fvgZones = useFVGZones();
  const maData = useMovingAverages(Timeframe.H1);
  const navigate = useNavigate();

  const isLoading =
    candles1H.isLoading ||
    candlesDaily.isLoading ||
    sundayLevels.isLoading ||
    fvgZones.isLoading ||
    maData.isLoading;

  const candles1HData = candles1H.data ?? [];
  const candlesDailyData = candlesDaily.data ?? [];
  const sundayData = sundayLevels.data ?? [];
  const fvgData = fvgZones.data ?? [];
  const ma = maData.data;

  const hasData = candles1HData.length > 0;

  // ── Derive confluence factors ─────────────────────────────────────────────
  const lastDaily = candlesDailyData[candlesDailyData.length - 1];
  const lastCandle = candles1HData[candles1HData.length - 1];
  const prevDaily = candlesDailyData[candlesDailyData.length - 2];

  const currentPrice = lastCandle?.close ?? 0;

  const ema200 = ma?.ema200 ?? null;
  const ema20 = ma?.ema20 ?? null;
  const sma50 = ma?.sma50 ?? null;

  // Factor 1: Bullish daily candle — close > open AND engulfing (close > prev high)
  const bullishDailyCandle = !!(
    lastDaily &&
    prevDaily &&
    lastDaily.close > lastDaily.open &&
    lastDaily.close > prevDaily.open &&
    lastDaily.open < prevDaily.close
  );

  // Factor 2: Price above 200 EMA
  const priceAbove200EMA = !!(ema200 && currentPrice > ema200);

  // Factor 3: 200 EMA confluence with Sunday level (within 0.3%)
  const ema200SundayConfluence = !!(
    ema200 &&
    sundayData.some((lvl) => Math.abs(lvl.price - ema200) / ema200 < 0.003)
  );

  // Factor 4: 20 EMA / 50 SMA confluence with Sunday level or current zone
  const ma2050Confluence = !!(
    (ema20 || sma50) &&
    sundayData.some((lvl) => {
      const ma = ema20 ?? sma50 ?? 0;
      return Math.abs(lvl.price - ma) / Math.max(ma, 1) < 0.005;
    })
  );

  // Factor 5: 1H FVG present in zone (near current price, within 1%)
  const fvgInZone = !!(
    currentPrice > 0 &&
    fvgData.some(
      (z) =>
        z.isBullish &&
        currentPrice >= z.bottom * 0.99 &&
        currentPrice <= z.top * 1.01,
    )
  );

  // Factor 6: MA holds — current price is above the lower of ema20/sma50
  const lowerMA = Math.min(
    ema20 ?? Number.POSITIVE_INFINITY,
    sma50 ?? Number.POSITIVE_INFINITY,
    ema200 ?? Number.POSITIVE_INFINITY,
  );
  const maHolds = !!(
    currentPrice > 0 &&
    lowerMA !== Number.POSITIVE_INFINITY &&
    currentPrice >= lowerMA
  );

  // Factor 7: Buy-side liquidity target above — any sunday level above current price
  const buySideTargetAbove = sundayData.some((lvl) => lvl.price > currentPrice);

  const factors: ConfluenceFactor[] = [
    {
      key: "bullishDailyCandle",
      label: "Bullish Daily Candle (engulfing)",
      pass: bullishDailyCandle,
      description: "Previous daily candle is bullish engulfing / displacement",
    },
    {
      key: "priceAbove200EMA",
      label: "Price Above 200 EMA",
      pass: priceAbove200EMA,
      description: "Current price reclaiming or above 200 EMA",
    },
    {
      key: "ema200SundayConfluence",
      label: "200 EMA × Sunday Level",
      pass: ema200SundayConfluence,
      description: "200 EMA overlaps a Sunday level (±0.3%)",
    },
    {
      key: "ma2050Confluence",
      label: "20 EMA / 50 SMA × Sunday Level",
      pass: ma2050Confluence,
      description: "20 EMA or 50 SMA aligns with a Sunday level (±0.5%)",
    },
    {
      key: "fvgInZone",
      label: "1H FVG Present in Zone",
      pass: fvgInZone,
      description: "Bullish 1H fair value gap overlapping current price zone",
    },
    {
      key: "maHolds",
      label: "Moving Average Holds",
      pass: maHolds,
      description: "Price remains above MA cluster — no close through MAs",
    },
    {
      key: "buySideTargetAbove",
      label: "Buy-Side Liquidity Target Above",
      pass: buySideTargetAbove,
      description: "Nearest prior high / Sunday level above entry is target",
    },
  ];

  const score = factors.filter((f) => f.pass).length;

  // ── Invalidation triggers ─────────────────────────────────────────────────
  const invalidations: InvalidationItem[] = [
    {
      label: "Price closed below 20 EMA",
      triggered: !!(ema20 && currentPrice < ema20),
      value: ema20 ? `20 EMA @ ${ema20.toFixed(2)}` : "—",
    },
    {
      label: "Price closed below 200 EMA",
      triggered: !!(ema200 && currentPrice < ema200),
      value: ema200 ? `200 EMA @ ${ema200.toFixed(2)}` : "—",
    },
    {
      label: "MA cluster failed to hold",
      triggered: !maHolds && currentPrice > 0,
      value:
        lowerMA !== Number.POSITIVE_INFINITY
          ? `Support @ ${lowerMA.toFixed(2)}`
          : "—",
    },
    {
      label: "Sunday level broken (close below)",
      triggered: sundayData.some(
        (lvl) =>
          lastCandle &&
          lastCandle.close < lvl.price &&
          lastCandle.open > lvl.price,
      ),
      value: sundayData.length
        ? `${sundayData.length} levels active`
        : "No levels set",
    },
  ];

  // ── Entry / stop / TP1 ────────────────────────────────────────────────────
  const allPass = score === 7;
  const entryPrice = allPass && lastCandle ? lastCandle.close : null;
  const stopPrice =
    lowerMA !== Number.POSITIVE_INFINITY ? lowerMA * 0.997 : null;
  const tp1Level = sundayData
    .filter((lvl) => lvl.price > currentPrice)
    .sort((a, b) => a.price - b.price)[0];

  // ── Next add zone ─────────────────────────────────────────────────────────
  const nextAddZone =
    sundayData
      .filter((lvl) => lvl.price > (entryPrice ?? currentPrice))
      .sort((a, b) => a.price - b.price)[1] ??
    tp1Level ??
    null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" data-ocid="detector.loading_state">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {["a", "b", "c", "d", "e", "f"].map((k) => (
            <Skeleton key={`skeleton-${k}`} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div
        className="flex flex-col items-center justify-center py-24 px-6 text-center space-y-6"
        data-ocid="detector.empty_state"
      >
        <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center">
          <Activity className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold text-foreground">
            No Candle Data Loaded
          </h2>
          <p className="text-sm text-muted-foreground max-w-md font-mono">
            Upload historical candle data first to run the confluence detector.
            The setup scanner needs at least one candle on the 1H timeframe.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => navigate({ to: "/upload" })}
          className="font-mono uppercase text-xs tracking-wider"
          data-ocid="detector.upload_cta_button"
        >
          <Upload className="w-4 h-4 mr-2" /> Go to Data Upload
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl" data-ocid="detector.page">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-primary" />
            Setup Confluence Detector
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            1H Timeframe · {candles1HData.length} candles loaded
          </p>
        </div>
        <Button
          type="button"
          onClick={() => navigate({ to: "/results" })}
          size="sm"
          className="font-mono uppercase text-xs tracking-wider shrink-0"
          data-ocid="detector.run_backtest_button"
        >
          <PlayCircle className="w-4 h-4 mr-1.5" /> Run Backtest
        </Button>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* LEFT: Score + Checklist */}
        <div className="xl:col-span-2 space-y-4">
          {/* Score card */}
          <Card className="sharp-border bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-center justify-center w-28 h-28 shrink-0 border-2 border-border bg-background relative">
                  <span
                    className={`font-display text-5xl font-black tabular-nums ${
                      score >= 5
                        ? "text-chart-1"
                        : score >= 3
                          ? "text-chart-4"
                          : "text-destructive"
                    }`}
                    data-ocid="detector.score_display"
                  >
                    {score}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                    / 7
                  </span>
                  <div
                    className={`absolute -bottom-1 left-0 right-0 h-1 ${
                      score >= 5
                        ? "bg-chart-1"
                        : score >= 3
                          ? "bg-chart-4"
                          : "bg-destructive"
                    }`}
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Setup Confidence Score
                  </p>
                  <p
                    className={`font-display text-2xl font-bold ${
                      score >= 5
                        ? "text-chart-1"
                        : score >= 3
                          ? "text-chart-4"
                          : "text-destructive"
                    }`}
                  >
                    {score >= 5
                      ? "High Confidence"
                      : score >= 3
                        ? "Moderate"
                        : "Low — Skip"}
                  </p>
                  <div className="flex gap-1 mt-1">
                    {factors.map((f, i) => (
                      <div
                        key={f.key}
                        className={`h-1.5 flex-1 ${
                          f.pass
                            ? score >= 5
                              ? "bg-chart-1"
                              : "bg-chart-4"
                            : "bg-border"
                        }`}
                        title={f.label}
                        data-ocid={`detector.score_bar.${i + 1}`}
                      />
                    ))}
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {score < 3 &&
                      "Minimum 3 factors required to consider a trade"}
                    {score >= 3 &&
                      score < 5 &&
                      "Proceed with caution — not all confluences met"}
                    {score >= 5 &&
                      "All major confluences aligned — setup is valid"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Confluence checklist */}
          <Card className="sharp-border bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <CheckSquare className="w-3.5 h-3.5" /> Confluence Checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-1">
              {factors.map((factor, i) => (
                <div
                  key={factor.key}
                  className={`flex items-start gap-3 px-3 py-2.5 border ${
                    factor.pass
                      ? "border-chart-1/30 bg-chart-1/5"
                      : "border-border bg-background"
                  }`}
                  data-ocid={`detector.factor.${i + 1}`}
                >
                  <div
                    className={`mt-0.5 w-4 h-4 shrink-0 flex items-center justify-center border ${
                      factor.pass
                        ? "border-chart-1 bg-chart-1/20 text-chart-1"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {factor.pass ? (
                      <Check className="w-2.5 h-2.5" />
                    ) : (
                      <X className="w-2.5 h-2.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`font-mono text-xs font-semibold ${
                        factor.pass
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {factor.label}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground/70 mt-0.5">
                      {factor.description}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`font-mono text-[10px] shrink-0 ${
                      factor.pass
                        ? "border-chart-1/50 text-chart-1"
                        : "border-destructive/40 text-destructive/70"
                    }`}
                  >
                    {factor.pass ? "PASS" : "FAIL"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: MA values + Entry + Add zone + Invalidation */}
        <div className="space-y-4">
          {/* MA Values */}
          <Card className="sharp-border bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" /> Moving Averages · 1H
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-2">
              <MARow
                label="200 EMA"
                value={ema200}
                color="text-primary"
                ocid="detector.ema200_value"
              />
              <MARow
                label="20 EMA"
                value={ema20}
                color="text-chart-5"
                ocid="detector.ema20_value"
              />
              <MARow
                label="50 SMA"
                value={sma50}
                color="text-chart-4"
                ocid="detector.sma50_value"
              />
              <Separator className="my-1" />
              <div className="flex justify-between items-center">
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  Current Price
                </span>
                <span
                  className="font-mono text-sm font-bold text-foreground tabular-nums"
                  data-ocid="detector.current_price"
                >
                  {currentPrice > 0 ? currentPrice.toFixed(2) : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Entry Conditions */}
          <Card className="sharp-border bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Target className="w-3.5 h-3.5" /> Entry Conditions
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-2">
              <EntryRow
                label="Entry Price"
                value={
                  entryPrice !== null
                    ? entryPrice.toFixed(2)
                    : "Conditions not met"
                }
                highlight={entryPrice !== null}
                ocid="detector.entry_price"
              />
              <EntryRow
                label="Stop Price"
                value={stopPrice !== null ? stopPrice.toFixed(2) : "—"}
                color="text-destructive"
                ocid="detector.stop_price"
              />
              <EntryRow
                label="TP1 — Nearest Prior High Target"
                value={
                  tp1Level
                    ? `${tp1Level.price.toFixed(2)} (${tp1Level.levelLabel})`
                    : "No level above"
                }
                color="text-chart-1"
                ocid="detector.tp1_price"
              />
            </CardContent>
          </Card>

          {/* Add Logic */}
          <Card className="sharp-border bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <PlusCircle className="w-3.5 h-3.5" /> Add Logic
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <p className="font-mono text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">
                Next Add Zone
              </p>
              {nextAddZone ? (
                <div
                  className="flex items-center justify-between p-2.5 border border-primary/30 bg-primary/5"
                  data-ocid="detector.next_add_zone"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {nextAddZone.levelLabel}
                  </span>
                  <span className="font-mono text-sm font-bold text-primary tabular-nums">
                    {nextAddZone.price.toFixed(2)}
                  </span>
                </div>
              ) : (
                <p
                  className="font-mono text-xs text-muted-foreground/60 text-center py-2"
                  data-ocid="detector.next_add_zone_empty"
                >
                  Define Sunday levels to see add zones
                </p>
              )}
              <p className="font-mono text-[10px] text-muted-foreground/60 mt-2">
                Add only after first position is working, at next structured
                Sunday level
              </p>
            </CardContent>
          </Card>

          {/* Invalidation Triggers */}
          <Card className="sharp-border border-destructive/20 bg-card">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-destructive/70" />{" "}
                Invalidation Triggers
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-1.5">
              {invalidations.map((item, i) => (
                <div
                  key={item.label}
                  className={`flex items-start justify-between gap-2 px-3 py-2 border ${
                    item.triggered
                      ? "border-destructive/40 bg-destructive/8"
                      : "border-border bg-background"
                  }`}
                  data-ocid={`detector.invalidation.${i + 1}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        item.triggered ? "bg-destructive" : "bg-chart-1"
                      }`}
                    />
                    <span className="font-mono text-[10px] text-muted-foreground leading-tight">
                      {item.label}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`font-mono text-[10px] shrink-0 whitespace-nowrap ${
                      item.triggered
                        ? "border-destructive/50 text-destructive"
                        : "border-chart-1/50 text-chart-1"
                    }`}
                  >
                    {item.triggered ? "TRIGGERED" : "SAFE"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
