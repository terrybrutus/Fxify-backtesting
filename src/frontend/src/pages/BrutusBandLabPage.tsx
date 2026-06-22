import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import type { Candle } from "@/types/strategy";
import { Timeframe } from "@/types/strategy";
import { Download, Waves } from "lucide-react";
import { useMemo } from "react";

type Direction = "Long" | "Short";

type BandConfig = {
  length: number;
  deviation: number;
};

type BrutusVariant = {
  id: string;
  label: string;
  requiresCompression: boolean;
  requiresSnapback: boolean;
};

type BrutusSignal = {
  id: string;
  symbol: string;
  timestamp: number;
  direction: Direction;
  timeframe: Timeframe;
  lowerTimeframe: Timeframe;
  length: number;
  deviation: number;
  entry: number;
  close: number;
  high: number;
  low: number;
  upperBand: number;
  lowerBand: number;
  bandWidthPct: number;
  compression: boolean;
  snapback5m: boolean;
  outcomePoints: number;
  wickPoints: number;
  continuationFailure: boolean;
};

type VariantStats = {
  signals: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPoints: number;
  totalPoints: number;
  avgWickPoints: number;
  continuationFailures: number;
  continuationRate: number;
  estimatedDollarPnl: number;
};

type VariantRow = {
  config: BandConfig;
  variant: BrutusVariant;
  stats: VariantStats;
  sample: BrutusSignal[];
};

const BAND_CONFIGS: BandConfig[] = [
  { length: 8, deviation: 1 },
  { length: 8, deviation: 1.5 },
  { length: 10, deviation: 1 },
  { length: 10, deviation: 1.5 },
  { length: 14, deviation: 1 },
  { length: 14, deviation: 1.5 },
  { length: 20, deviation: 1.5 },
  { length: 20, deviation: 2 },
];

const VARIANTS: BrutusVariant[] = [
  {
    id: "raw-pierce",
    label: "Raw band pierce",
    requiresCompression: false,
    requiresSnapback: false,
  },
  {
    id: "compression",
    label: "Only after compression",
    requiresCompression: true,
    requiresSnapback: false,
  },
  {
    id: "snapback-5m",
    label: "Only with 5m snapback",
    requiresCompression: false,
    requiresSnapback: true,
  },
  {
    id: "compression-snapback-5m",
    label: "Compression + 5m snapback",
    requiresCompression: true,
    requiresSnapback: true,
  },
];

const POINT_VALUE = 10;
const HOUR_MS = 60 * 60 * 1000;

function fmtPoints(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function fmtMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(0)}`;
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

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values: number[]) {
  const avg = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length,
  );
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function groupCandles(candles: Candle[], timeframe: Timeframe) {
  const groups = new Map<string, Candle[]>();
  for (const candle of candles) {
    if (candle.timeframe !== timeframe) continue;
    const group = groups.get(candle.symbol) ?? [];
    group.push(candle);
    groups.set(candle.symbol, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  }
  return groups;
}

function bandAt(candles: Candle[], index: number, config: BandConfig) {
  if (index < config.length) return undefined;
  const window = candles.slice(index - config.length, index);
  const highAvg = mean(window.map((candle) => candle.high));
  const lowAvg = mean(window.map((candle) => candle.low));
  const upper =
    highAvg + stdev(window.map((candle) => candle.high)) * config.deviation;
  const lower =
    lowAvg - stdev(window.map((candle) => candle.low)) * config.deviation;
  return {
    upper,
    lower,
    widthPct: ((upper - lower) / candles[index].close) * 100,
  };
}

function widthHistory(candles: Candle[], index: number, config: BandConfig) {
  const widths: number[] = [];
  const start = Math.max(config.length, index - 100);
  for (let i = start; i < index; i += 1) {
    const band = bandAt(candles, i, config);
    if (band) widths.push(band.widthPct);
  }
  return widths;
}

function fiveMinuteSnapback({
  lowerCandles,
  signal,
  upperBand,
  lowerBand,
}: {
  lowerCandles: Candle[];
  signal: Candle;
  upperBand: number;
  lowerBand: number;
}) {
  const start = Number(signal.timestamp);
  const end = start + HOUR_MS;
  const insideHour = lowerCandles.filter((candle) => {
    const timestamp = Number(candle.timestamp);
    return timestamp >= start && timestamp < end;
  });
  return {
    short: insideHour.some(
      (candle) => candle.high > upperBand && candle.close < upperBand,
    ),
    long: insideHour.some(
      (candle) => candle.low < lowerBand && candle.close > lowerBand,
    ),
  };
}

function buildSignals(candles: Candle[]) {
  const h1BySymbol = groupCandles(candles, Timeframe.H1);
  const m5BySymbol = groupCandles(candles, Timeframe.M5);
  const signals: BrutusSignal[] = [];

  for (const [symbol, h1] of h1BySymbol.entries()) {
    const m5 = m5BySymbol.get(symbol) ?? [];
    for (const config of BAND_CONFIGS) {
      for (let index = config.length; index < h1.length; index += 1) {
        const candle = h1[index];
        const band = bandAt(h1, index, config);
        if (!band) continue;
        const widths = widthHistory(h1, index, config);
        const compression =
          widths.length >= 20 && band.widthPct <= median(widths) * 0.8;
        const snapback = fiveMinuteSnapback({
          lowerCandles: m5,
          signal: candle,
          upperBand: band.upper,
          lowerBand: band.lower,
        });

        if (candle.high > band.upper) {
          const outcomePoints = band.upper - candle.close;
          signals.push({
            id: `${symbol}-${Number(candle.timestamp)}-${config.length}-${config.deviation}-short`,
            symbol,
            timestamp: Number(candle.timestamp),
            direction: "Short",
            timeframe: Timeframe.H1,
            lowerTimeframe: Timeframe.M5,
            length: config.length,
            deviation: config.deviation,
            entry: band.upper,
            close: candle.close,
            high: candle.high,
            low: candle.low,
            upperBand: band.upper,
            lowerBand: band.lower,
            bandWidthPct: band.widthPct,
            compression,
            snapback5m: snapback.short,
            outcomePoints,
            wickPoints: Math.max(0, candle.high - candle.close),
            continuationFailure: outcomePoints < 0,
          });
        }

        if (candle.low < band.lower) {
          const outcomePoints = candle.close - band.lower;
          signals.push({
            id: `${symbol}-${Number(candle.timestamp)}-${config.length}-${config.deviation}-long`,
            symbol,
            timestamp: Number(candle.timestamp),
            direction: "Long",
            timeframe: Timeframe.H1,
            lowerTimeframe: Timeframe.M5,
            length: config.length,
            deviation: config.deviation,
            entry: band.lower,
            close: candle.close,
            high: candle.high,
            low: candle.low,
            upperBand: band.upper,
            lowerBand: band.lower,
            bandWidthPct: band.widthPct,
            compression,
            snapback5m: snapback.long,
            outcomePoints,
            wickPoints: Math.max(0, candle.close - candle.low),
            continuationFailure: outcomePoints < 0,
          });
        }
      }
    }
  }

  return signals;
}

function statsFor(signals: BrutusSignal[]): VariantStats {
  const wins = signals.filter((signal) => signal.outcomePoints > 0);
  const losses = signals.filter((signal) => signal.outcomePoints <= 0);
  const totalPoints = signals.reduce(
    (sum, signal) => sum + signal.outcomePoints,
    0,
  );
  const continuationFailures = signals.filter(
    (signal) => signal.continuationFailure,
  ).length;
  return {
    signals: signals.length,
    wins: wins.length,
    losses: losses.length,
    winRate: signals.length ? wins.length / signals.length : 0,
    avgPoints: signals.length ? totalPoints / signals.length : 0,
    totalPoints,
    avgWickPoints: signals.length
      ? signals.reduce((sum, signal) => sum + signal.wickPoints, 0) /
        signals.length
      : 0,
    continuationFailures,
    continuationRate: signals.length
      ? continuationFailures / signals.length
      : 0,
    estimatedDollarPnl: totalPoints * POINT_VALUE,
  };
}

function buildRows(signals: BrutusSignal[]): VariantRow[] {
  return BAND_CONFIGS.flatMap((config) =>
    VARIANTS.map((variant) => {
      const matching = signals.filter((signal) => {
        if (signal.length !== config.length) return false;
        if (signal.deviation !== config.deviation) return false;
        if (variant.requiresCompression && !signal.compression) return false;
        if (variant.requiresSnapback && !signal.snapback5m) return false;
        return true;
      });
      return {
        config,
        variant,
        stats: statsFor(matching),
        sample: matching.slice(0, 20),
      };
    }),
  ).sort(
    (a, b) =>
      b.stats.avgPoints - a.stats.avgPoints ||
      b.stats.signals - a.stats.signals,
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

export default function BrutusBandLabPage() {
  const { candles, run } = useStrategyWorkspace();
  const signals = useMemo(() => buildSignals(candles), [candles]);
  const rows = useMemo(() => buildRows(signals), [signals]);
  const usableRows = rows.filter((row) => row.stats.signals >= 20);
  const best = usableRows[0] ?? rows[0];
  const rawBest = rows.find(
    (row) =>
      row.variant.id === "raw-pierce" &&
      row.config.length === best?.config.length &&
      row.config.deviation === best?.config.deviation,
  );

  const plainFinding = best
    ? `${best.variant.label} was the strongest first-pass version on the current data: ${fmtPoints(
        best.stats.avgPoints,
      )} average per signal across ${best.stats.signals} signals.`
    : "Load real index candles to test Brutus Band pierces.";
  const technicalFinding =
    best && rawBest
      ? `Compared with raw band touches using the same ${best.config.length} / ${best.config.deviation} bands, this version changed continuation failures from ${pct(
          rawBest.stats.continuationRate,
        )} to ${pct(best.stats.continuationRate)}.`
      : "The lab uses prior completed candles for band values, then grades what happened after the historical trigger candle.";

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="brutus-band.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Brutus Band Lab</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Historical replay for custom high/low Bollinger pierces on index
            candles. The first question is simple: did the band touch reject, or
            did price keep running through it?
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!run.integrity.canRunBacktest}
          onClick={() =>
            downloadFile(
              "ict-brutus-band-lab.json",
              JSON.stringify(
                {
                  generatedAt: new Date().toISOString(),
                  integrity: run.integrity,
                  pointValueAssumption: POINT_VALUE,
                  findings: { plainFinding, technicalFinding },
                  rows: rows.map((row) => ({
                    variant: row.variant,
                    config: row.config,
                    stats: row.stats,
                    sample: row.sample.map((signal) => ({
                      timestamp: new Date(signal.timestamp).toISOString(),
                      symbol: signal.symbol,
                      direction: signal.direction,
                      entry: signal.entry,
                      close: signal.close,
                      outcomePoints: signal.outcomePoints,
                      wickPoints: signal.wickPoints,
                      compression: signal.compression,
                      snapback5m: signal.snapback5m,
                      continuationFailure: signal.continuationFailure,
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
          Export Brutus Lab
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Brutus Band Lab is disabled until real 1H and 5m candles are loaded.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Band pierces"
              value={String(signals.length)}
              detail="All tested configs combined"
            />
            <Stat
              label="Best avg"
              value={best ? fmtPoints(best.stats.avgPoints) : "0.0 pts"}
              detail={best?.variant.label ?? "No result"}
            />
            <Stat
              label="Best win rate"
              value={best ? pct(best.stats.winRate) : "0.0%"}
              detail="Exit approximation: trigger candle close"
            />
            <Stat
              label="$10/point estimate"
              value={best ? fmtMoney(best.stats.estimatedDollarPnl) : "$0"}
              detail="Adjust later for broker contract value"
            />
          </div>

          <section className="border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Waves className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  What it means
                </p>
                <p className="mt-2 text-sm text-foreground">{plainFinding}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {technicalFinding}
                </p>
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <h2 className="font-display text-lg font-bold">
              Brutus Band Scoreboard
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This first pass treats the band as known from prior completed
              candles and grades the wick capture into the trigger candle close.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1120px] font-mono text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Variant</th>
                    <th className="py-2 text-right">Length</th>
                    <th className="py-2 text-right">Dev</th>
                    <th className="py-2 text-right">Signals</th>
                    <th className="py-2 text-right">W/L</th>
                    <th className="py-2 text-right">Win</th>
                    <th className="py-2 text-right">Avg</th>
                    <th className="py-2 text-right">Total</th>
                    <th className="py-2 text-right">Avg wick</th>
                    <th className="py-2 text-right">Ran through</th>
                    <th className="py-2 text-right">$ est.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 24).map((row) => (
                    <tr
                      key={`${row.variant.id}-${row.config.length}-${row.config.deviation}`}
                      className="border-b border-border/40"
                    >
                      <td className="py-2">{row.variant.label}</td>
                      <td className="py-2 text-right">{row.config.length}</td>
                      <td className="py-2 text-right">
                        {row.config.deviation.toFixed(1)}
                      </td>
                      <td className="py-2 text-right">{row.stats.signals}</td>
                      <td className="py-2 text-right">
                        {row.stats.wins}/{row.stats.losses}
                      </td>
                      <td className="py-2 text-right">
                        {pct(row.stats.winRate)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPoints(row.stats.avgPoints)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPoints(row.stats.totalPoints)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPoints(row.stats.avgWickPoints)}
                      </td>
                      <td className="py-2 text-right">
                        {pct(row.stats.continuationRate)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtMoney(row.stats.estimatedDollarPnl)}
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
                Sample Triggers
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[980px] font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Time</th>
                      <th className="py-2 text-left">Index</th>
                      <th className="py-2 text-left">Side</th>
                      <th className="py-2 text-right">Entry</th>
                      <th className="py-2 text-right">Close</th>
                      <th className="py-2 text-right">Outcome</th>
                      <th className="py-2 text-right">Wick</th>
                      <th className="py-2 text-left">Filters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {best.sample.slice(0, 12).map((signal) => (
                      <tr key={signal.id} className="border-b border-border/40">
                        <td className="py-2">
                          {new Date(signal.timestamp).toISOString()}
                        </td>
                        <td className="py-2">{signal.symbol}</td>
                        <td className="py-2">{signal.direction}</td>
                        <td className="py-2 text-right">
                          {signal.entry.toFixed(2)}
                        </td>
                        <td className="py-2 text-right">
                          {signal.close.toFixed(2)}
                        </td>
                        <td className="py-2 text-right">
                          {fmtPoints(signal.outcomePoints)}
                        </td>
                        <td className="py-2 text-right">
                          {fmtPoints(signal.wickPoints)}
                        </td>
                        <td className="py-2">
                          {[
                            signal.compression ? "compression" : "",
                            signal.snapback5m ? "5m snapback" : "",
                          ]
                            .filter(Boolean)
                            .join(", ") || "raw touch"}
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
