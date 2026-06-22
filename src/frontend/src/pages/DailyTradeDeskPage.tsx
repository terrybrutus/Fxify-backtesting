import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import type { Candle } from "@/types/strategy";
import { Timeframe } from "@/types/strategy";
import { Download, ShieldAlert, Target, Waves } from "lucide-react";
import { useMemo } from "react";

const EASTERN_TZ = "America/New_York";
const HOUR_MS = 60 * 60 * 1000;
const POINT_VALUE = 10;
const BRUTUS_MODELS = [
  { length: 7, deviation: 2, target: 50, stop: 50 },
  { length: 9, deviation: 2, target: 50, stop: 75 },
];
const STRONG_BRUTUS_SYMBOLS = new Set(["US30", "NAS100"]);

type Direction = "Long" | "Short";

type BrutusDeskSignal = {
  id: string;
  symbol: string;
  direction: Direction;
  timestamp: number;
  triggerTimestamp: number;
  length: number;
  deviation: number;
  entry: number;
  oneHourClose: number;
  target: number;
  stop: number;
  outcomeToClose: number;
  maxAdverse: number;
  wickPoints: number;
  bandStretch: number;
  snapback5m: boolean;
  status: "Paper candidate" | "Watch only" | "Avoid";
  action: string;
  plainWhy: string;
  blockers: string[];
};

function ms(candle: Candle) {
  return Number(candle.timestamp);
}

function fmtPrice(value?: number) {
  return value === undefined ? "n/a" : value.toFixed(2);
}

function fmtPoints(value?: number) {
  if (value === undefined) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function fmtMoney(value?: number) {
  if (value === undefined) return "n/a";
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(0)}`;
}

function fmtEastern(value?: number) {
  if (value === undefined) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(value));
}

function easternDateKey(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values: number[]) {
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      values.length,
  );
}

function ema(values: number[], length: number) {
  const alpha = 2 / (length + 1);
  return values.reduce((average, value, index) => {
    if (index === 0) return value;
    return value * alpha + average * (1 - alpha);
  }, values[0]);
}

function bandForSeries(
  candles: Pick<Candle, "open" | "high" | "low" | "close">[],
  length: number,
  deviation: number,
) {
  if (candles.length < length) return undefined;
  const window = candles.slice(-length);
  const last = candles[candles.length - 1];
  const upper =
    ema(
      candles.map((candle) => candle.high),
      length,
    ) +
    stdev(window.map((candle) => candle.high)) * deviation;
  const lower =
    ema(
      candles.map((candle) => candle.low),
      length,
    ) -
    stdev(window.map((candle) => candle.low)) * deviation;
  return {
    upper,
    lower,
    widthPct: ((upper - lower) / last.close) * 100,
  };
}

function groupBySymbol(candles: Candle[], timeframe: Timeframe) {
  const groups = new Map<string, Candle[]>();
  for (const candle of candles) {
    if (candle.timeframe !== timeframe) continue;
    const group = groups.get(candle.symbol) ?? [];
    group.push(candle);
    groups.set(candle.symbol, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => ms(a) - ms(b));
  }
  return groups;
}

function scoreBrutusSignal(
  signal: Omit<BrutusDeskSignal, "status" | "action" | "plainWhy" | "blockers">,
): Pick<BrutusDeskSignal, "status" | "action" | "plainWhy" | "blockers"> {
  const blockers: string[] = [];
  if (!STRONG_BRUTUS_SYMBOLS.has(signal.symbol)) {
    blockers.push("US500 has been weaker in the Brutus evidence.");
  }
  if (!signal.snapback5m) {
    blockers.push("No 5m snapback inside the band yet.");
  }
  if (signal.maxAdverse > signal.stop) {
    blockers.push("Price already moved beyond the tested stop distance.");
  }
  if (signal.bandStretch > signal.target) {
    blockers.push("Band stretched more than the target size.");
  }

  if (blockers.length === 0) {
    return {
      status: "Paper candidate",
      action: "Paper trade only",
      plainWhy:
        "This matches the stronger Brutus evidence: US30/NAS100, 7/2 or 9/2 band pierce, 5m snapback, and adverse move stayed inside the tested stop.",
      blockers,
    };
  }
  if (blockers.length <= 2 && signal.snapback5m) {
    return {
      status: "Watch only",
      action: "Track, do not enter yet",
      plainWhy:
        "Something about the setup is close, but not clean enough for even paper-entry confidence.",
      blockers,
    };
  }
  return {
    status: "Avoid",
    action: "Do not trade",
    plainWhy:
      "This setup does not match the strongest Brutus evidence well enough.",
    blockers,
  };
}

function scanHour({
  symbol,
  h1,
  m5,
  index,
  length,
  deviation,
  target,
  stop,
}: {
  symbol: string;
  h1: Candle[];
  m5: Candle[];
  index: number;
  length: number;
  deviation: number;
  target: number;
  stop: number;
}): BrutusDeskSignal[] {
  const candle = h1[index];
  const start = ms(candle);
  const end = start + HOUR_MS;
  const lowerCandles = m5.filter((item) => {
    const timestamp = ms(item);
    return timestamp >= start && timestamp < end;
  });
  if (lowerCandles.length === 0) return [];

  const prior = h1.slice(0, index);
  let partialHigh = candle.open;
  let partialLow = candle.open;
  let partialClose = candle.open;
  let previousLower: number | undefined;
  let previousUpper: number | undefined;
  let previousLow = candle.open;
  let previousHigh = candle.open;
  const found: Partial<Record<Direction, BrutusDeskSignal>> = {};

  for (const lowerCandle of lowerCandles) {
    partialHigh = Math.max(partialHigh, lowerCandle.high);
    partialLow = Math.min(partialLow, lowerCandle.low);
    partialClose = lowerCandle.close;
    const liveBand = bandForSeries(
      [
        ...prior,
        {
          ...candle,
          high: partialHigh,
          low: partialLow,
          close: partialClose,
        },
      ],
      length,
      deviation,
    );
    const finalBand = bandForSeries([...prior, candle], length, deviation);
    if (!liveBand || !finalBand) continue;

    const longByPierce =
      partialLow <= liveBand.lower && partialClose > candle.open;
    const longByCross =
      previousLower !== undefined &&
      previousLow > previousLower &&
      partialLow <= liveBand.lower;
    const shortByPierce =
      partialHigh >= liveBand.upper && partialClose < candle.open;
    const shortByCross =
      previousUpper !== undefined &&
      previousHigh < previousUpper &&
      partialHigh >= liveBand.upper;
    const triggerTimestamp = ms(lowerCandle);
    const later = lowerCandles.filter((item) => ms(item) >= triggerTimestamp);

    if (!found.Long && (longByPierce || longByCross)) {
      const snapback = later.find((item) => item.close > liveBand.lower);
      const minLow = Math.min(...later.map((item) => item.low));
      const baseSignal = {
        id: `${symbol}-${start}-${length}-${deviation}-long`,
        symbol,
        direction: "Long" as Direction,
        timestamp: start,
        triggerTimestamp,
        length,
        deviation,
        entry: liveBand.lower,
        oneHourClose: candle.close,
        target,
        stop,
        outcomeToClose: candle.close - liveBand.lower,
        maxAdverse: Math.max(0, liveBand.lower - minLow),
        wickPoints: Math.max(0, candle.close - candle.low),
        bandStretch: Math.abs(finalBand.lower - liveBand.lower),
        snapback5m: Boolean(snapback),
      };
      found.Long = { ...baseSignal, ...scoreBrutusSignal(baseSignal) };
    }

    if (!found.Short && (shortByPierce || shortByCross)) {
      const snapback = later.find((item) => item.close < liveBand.upper);
      const maxHigh = Math.max(...later.map((item) => item.high));
      const baseSignal = {
        id: `${symbol}-${start}-${length}-${deviation}-short`,
        symbol,
        direction: "Short" as Direction,
        timestamp: start,
        triggerTimestamp,
        length,
        deviation,
        entry: liveBand.upper,
        oneHourClose: candle.close,
        target,
        stop,
        outcomeToClose: liveBand.upper - candle.close,
        maxAdverse: Math.max(0, maxHigh - liveBand.upper),
        wickPoints: Math.max(0, candle.high - candle.close),
        bandStretch: Math.abs(finalBand.upper - liveBand.upper),
        snapback5m: Boolean(snapback),
      };
      found.Short = { ...baseSignal, ...scoreBrutusSignal(baseSignal) };
    }

    previousLower = liveBand.lower;
    previousUpper = liveBand.upper;
    previousLow = partialLow;
    previousHigh = partialHigh;
  }

  return [found.Long, found.Short].filter((item): item is BrutusDeskSignal =>
    Boolean(item),
  );
}

function buildDesk(candles: Candle[]) {
  const h1BySymbol = groupBySymbol(candles, Timeframe.H1);
  const m5BySymbol = groupBySymbol(candles, Timeframe.M5);
  const latest = Math.max(
    ...[...h1BySymbol.values()].flatMap((group) =>
      group.at(-1) ? [ms(group.at(-1)!)] : [],
    ),
  );
  const latestDateKey = Number.isFinite(latest)
    ? easternDateKey(latest)
    : undefined;
  const startWindow = latest - 30 * HOUR_MS;
  const signals: BrutusDeskSignal[] = [];

  for (const [symbol, h1] of h1BySymbol.entries()) {
    const m5 = m5BySymbol.get(symbol) ?? [];
    for (const model of BRUTUS_MODELS) {
      for (let index = model.length - 1; index < h1.length; index += 1) {
        const candleTime = ms(h1[index]);
        if (candleTime < startWindow) continue;
        signals.push(
          ...scanHour({
            symbol,
            h1,
            m5,
            index,
            ...model,
          }),
        );
      }
    }
  }

  signals.sort((a, b) => b.triggerTimestamp - a.triggerTimestamp);
  const candidates = signals.filter(
    (signal) => signal.status === "Paper candidate",
  );
  const watch = signals.filter((signal) => signal.status === "Watch only");
  const avoid = signals.filter((signal) => signal.status === "Avoid");
  const plainAnswer =
    candidates.length > 0
      ? "There are Brutus paper candidates in the newest imported session. This is still paper-only until broker timing and 1m/tick precision are confirmed."
      : watch.length > 0
        ? "There are Brutus-like setups, but none are clean enough to paper enter by the current filters."
        : "No clean Brutus setup is visible in the newest imported session.";

  return {
    generatedAt: new Date().toISOString(),
    latestCandle: Number.isFinite(latest)
      ? new Date(latest).toISOString()
      : undefined,
    latestEasternDate: latestDateKey,
    plainAnswer,
    candidates,
    watch,
    avoid,
    signals,
  };
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

export default function DailyTradeDeskPage() {
  const { candles, run } = useStrategyWorkspace();
  const desk = useMemo(() => buildDesk(candles), [candles]);

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="daily-trade-desk.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Daily Trade Desk</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Start here after loading fresh candles. This page turns the newest
            imported session into plain trade/no-trade notes.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!run.integrity.canRunBacktest}
          onClick={() =>
            downloadFile(
              "ict-daily-trade-desk.json",
              JSON.stringify(desk, null, 2),
              "application/json",
            )
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Export Desk
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Daily Trade Desk is disabled until real 1H and 5m candles are loaded.
        </div>
      ) : (
        <>
          <section className="border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Target className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Today&apos;s Plain Answer
                </p>
                <p className="mt-2 text-sm text-foreground">
                  {desk.plainAnswer}
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Latest candle"
              value={fmtEastern(
                desk.latestCandle ? Date.parse(desk.latestCandle) : undefined,
              )}
              detail="Imported data freshness"
            />
            <Stat
              label="Paper candidates"
              value={String(desk.candidates.length)}
              detail="Brutus only, not live orders"
            />
            <Stat
              label="Watch only"
              value={String(desk.watch.length)}
              detail="Close but blocked"
            />
            <Stat
              label="Avoid"
              value={String(desk.avoid.length)}
              detail="Rejected by current filters"
            />
          </div>

          <section className="border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Live Trading Guard
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Paper candidate means “worth tracking now,” not “place a
                  funded trade.” The Brutus evidence is still based on 5m replay
                  approximations, so 1m/tick confirmation and broker-feed
                  comparison remain required before real execution.
                </p>
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Waves className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Newest Brutus Setups
              </h2>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1180px] font-mono text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Alert time</th>
                    <th className="py-2 text-left">Index</th>
                    <th className="py-2 text-left">Side</th>
                    <th className="py-2 text-left">Model</th>
                    <th className="py-2 text-left">Status</th>
                    <th className="py-2 text-right">Entry</th>
                    <th className="py-2 text-right">Close read</th>
                    <th className="py-2 text-right">Against</th>
                    <th className="py-2 text-right">Target</th>
                    <th className="py-2 text-right">Stop</th>
                    <th className="py-2 text-left">Why / blockers</th>
                  </tr>
                </thead>
                <tbody>
                  {desk.signals.slice(0, 32).map((signal) => (
                    <tr key={signal.id} className="border-b border-border/40">
                      <td className="py-2">
                        {fmtEastern(signal.triggerTimestamp)}
                      </td>
                      <td className="py-2">{signal.symbol}</td>
                      <td className="py-2">{signal.direction}</td>
                      <td className="py-2">
                        {signal.length}/{signal.deviation} TP {signal.target} /
                        stop {signal.stop}
                      </td>
                      <td className="py-2">{signal.status}</td>
                      <td className="py-2 text-right">
                        {fmtPrice(signal.entry)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPoints(signal.outcomeToClose)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtPoints(signal.maxAdverse)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtMoney(signal.target * POINT_VALUE)}
                      </td>
                      <td className="py-2 text-right">
                        {fmtMoney(-signal.stop * POINT_VALUE)}
                      </td>
                      <td className="max-w-[360px] py-2 text-muted-foreground">
                        {signal.blockers.length
                          ? signal.blockers.join("; ")
                          : signal.plainWhy}
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
