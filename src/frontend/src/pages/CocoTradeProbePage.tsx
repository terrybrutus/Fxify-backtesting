import { Button } from "@/components/ui/button";
import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import type { Candle } from "@/types/strategy";
import { Timeframe, TradeDirection } from "@/types/strategy";
import { Download, SearchCheck, ShieldAlert } from "lucide-react";
import { useMemo } from "react";

const EASTERN_TZ = "America/New_York";

type MaProbe = {
  timeframe: "15m" | "30m" | "1H";
  candles: number;
  ema20?: number;
  sma50?: number;
  relation: "bearish" | "bullish" | "mixed";
  crossedDownRecently: boolean;
};

type SessionLow = {
  label: string;
  low?: number;
  lowTime?: number;
  distance?: number;
};

type CocoTradeProbe = {
  generatedAt: string;
  latestCandle?: string;
  symbol: string;
  direction: TradeDirection;
  entryTimestamp?: number;
  exitTimestamp?: number;
  entryCandle?: Candle;
  exitCandle?: Candle;
  points?: number;
  maxFavorable?: number;
  maxAdverse?: number;
  sundayOpen?: number;
  fridayCloseBeforeOpen?: number;
  gapPoints?: number;
  maProbes: MaProbe[];
  sessionLows: SessionLow[];
  plainAnswer: string;
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
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} pts`;
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

function easternParts(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function findRecentEasternTime({
  latest,
  weekday,
  hour,
}: {
  latest: number;
  weekday: string;
  hour: number;
}) {
  const floorHour = Math.floor(latest / 3_600_000) * 3_600_000;
  for (let offset = 0; offset <= 10 * 24; offset += 1) {
    const timestamp = floorHour - offset * 3_600_000;
    const parts = easternParts(timestamp);
    if (parts.weekday === weekday && parts.hour === hour) return timestamp;
  }
  return undefined;
}

function nextEasternTimeAfter({
  start,
  weekday,
  hour,
}: {
  start: number;
  weekday: string;
  hour: number;
}) {
  const floorHour = Math.floor(start / 3_600_000) * 3_600_000;
  for (let offset = 1; offset <= 48; offset += 1) {
    const timestamp = floorHour + offset * 3_600_000;
    const parts = easternParts(timestamp);
    if (parts.weekday === weekday && parts.hour === hour) return timestamp;
  }
  return undefined;
}

function sma(values: number[], period: number) {
  if (values.length < period) return undefined;
  return (
    values
      .slice(values.length - period)
      .reduce((sum, value) => sum + value, 0) / period
  );
}

function emaSeries(values: number[], period: number): (number | undefined)[] {
  const output: (number | undefined)[] = [];
  const k = 2 / (period + 1);
  let current: number | undefined;
  for (let index = 0; index < values.length; index += 1) {
    if (index + 1 < period) {
      output.push(undefined);
      continue;
    }
    if (current === undefined) {
      current =
        values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    } else {
      current = values[index] * k + current * (1 - k);
    }
    output.push(current);
  }
  return output;
}

function aggregateM5(candles: Candle[], minutes: number): Candle[] {
  const interval = minutes * 60_000;
  const grouped = new Map<number, Candle[]>();
  for (const candle of candles) {
    const bucket = Math.floor(ms(candle) / interval) * interval;
    const bucketCandles = grouped.get(bucket) ?? [];
    bucketCandles.push(candle);
    grouped.set(bucket, bucketCandles);
  }
  return [...grouped.entries()]
    .map(([timestamp, bucketCandles]) => {
      const sorted = bucketCandles.sort((a, b) => ms(a) - ms(b));
      const first = sorted[0];
      const last = sorted.at(-1)!;
      return {
        ...first,
        timestamp: BigInt(timestamp),
        open: first.open,
        high: Math.max(...sorted.map((candle) => candle.high)),
        low: Math.min(...sorted.map((candle) => candle.low)),
        close: last.close,
        volume: sorted.reduce((sum, candle) => sum + candle.volume, 0),
        timeframe: `${minutes}m` as Timeframe,
      };
    })
    .sort((a, b) => ms(a) - ms(b));
}

function maProbe(
  candles: Candle[],
  timestamp: number,
  timeframe: MaProbe["timeframe"],
): MaProbe {
  const known = candles.filter((candle) => ms(candle) <= timestamp);
  const closes = known.map((candle) => candle.close);
  const ema20Series = emaSeries(closes, 20);
  const ema20 = ema20Series.at(-1);
  const sma50 = sma(closes, 50);
  const relation =
    ema20 === undefined || sma50 === undefined
      ? "mixed"
      : ema20 < sma50
        ? "bearish"
        : "bullish";
  const crossedDownRecently = known.slice(-8).some((_, localIndex, recent) => {
    const globalIndex = known.length - recent.length + localIndex;
    if (globalIndex <= 0) return false;
    const prevEma = ema20Series[globalIndex - 1];
    const currEma = ema20Series[globalIndex];
    const prevSma = sma(closes.slice(0, globalIndex), 50);
    const currSma = sma(closes.slice(0, globalIndex + 1), 50);
    return (
      prevEma !== undefined &&
      currEma !== undefined &&
      prevSma !== undefined &&
      currSma !== undefined &&
      prevEma >= prevSma &&
      currEma < currSma
    );
  });
  return {
    timeframe,
    candles: known.length,
    ema20,
    sma50,
    relation,
    crossedDownRecently,
  };
}

function findCandleAtOrBefore(candles: Candle[], timestamp?: number) {
  if (timestamp === undefined) return undefined;
  return candles.filter((candle) => ms(candle) <= timestamp).at(-1);
}

function sessionLowForWeekday({
  candles,
  weekday,
  before,
  referencePrice,
}: {
  candles: Candle[];
  weekday: string;
  before: number;
  referencePrice?: number;
}): SessionLow {
  const matching = candles.filter((candle) => {
    const time = ms(candle);
    const parts = easternParts(time);
    const minutes = parts.hour * 60 + parts.minute;
    return (
      time < before &&
      parts.weekday === weekday &&
      minutes >= 9 * 60 + 30 &&
      minutes <= 16 * 60
    );
  });
  const latestDate = matching.at(-1)
    ? easternParts(ms(matching.at(-1)!)).dateKey
    : undefined;
  const sessionCandles = latestDate
    ? matching.filter(
        (candle) => easternParts(ms(candle)).dateKey === latestDate,
      )
    : [];
  const lowCandle = sessionCandles.sort((a, b) => a.low - b.low)[0];
  return {
    label: latestDate
      ? `${weekday} NY low (${latestDate})`
      : `${weekday} NY low`,
    low: lowCandle?.low,
    lowTime: lowCandle ? ms(lowCandle) : undefined,
    distance:
      lowCandle && referencePrice !== undefined
        ? referencePrice - lowCandle.low
        : undefined,
  };
}

function buildProbe(candles: Candle[]): CocoTradeProbe {
  const symbol = "US30";
  const symbolCandles = candles
    .filter((candle) => candle.symbol === symbol)
    .sort((a, b) => ms(a) - ms(b));
  const h1 = symbolCandles.filter(
    (candle) => candle.timeframe === Timeframe.H1,
  );
  const m5 = symbolCandles.filter(
    (candle) => candle.timeframe === Timeframe.M5,
  );
  const latest = h1.at(-1) ? ms(h1.at(-1)!) : undefined;
  const entryTimestamp =
    latest === undefined
      ? undefined
      : findRecentEasternTime({ latest, weekday: "Sun", hour: 19 });
  const exitTimestamp =
    entryTimestamp === undefined
      ? undefined
      : nextEasternTimeAfter({
          start: entryTimestamp,
          weekday: "Mon",
          hour: 8,
        });
  const entryCandle = findCandleAtOrBefore(h1, entryTimestamp);
  const exitCandle = findCandleAtOrBefore(h1, exitTimestamp);
  const tradeCandles =
    entryTimestamp === undefined || exitTimestamp === undefined
      ? []
      : h1.filter(
          (candle) =>
            ms(candle) >= entryTimestamp && ms(candle) <= exitTimestamp,
        );
  const entryPrice = entryCandle?.close;
  const exitPrice = exitCandle?.close;
  const points =
    entryPrice !== undefined && exitPrice !== undefined
      ? entryPrice - exitPrice
      : undefined;
  const maxFavorable =
    entryPrice !== undefined && tradeCandles.length > 0
      ? entryPrice - Math.min(...tradeCandles.map((candle) => candle.low))
      : undefined;
  const maxAdverse =
    entryPrice !== undefined && tradeCandles.length > 0
      ? Math.max(...tradeCandles.map((candle) => candle.high)) - entryPrice
      : undefined;
  const sundayOpenTimestamp =
    latest === undefined
      ? undefined
      : findRecentEasternTime({ latest, weekday: "Sun", hour: 18 });
  const sundayOpenCandle = findCandleAtOrBefore(h1, sundayOpenTimestamp);
  const fridayCloseBeforeOpen = findCandleAtOrBefore(
    h1,
    sundayOpenTimestamp ? sundayOpenTimestamp - 1 : undefined,
  )?.close;
  const m15 = aggregateM5(m5, 15);
  const m30 = aggregateM5(m5, 30);
  const maProbes =
    entryTimestamp === undefined
      ? []
      : [
          maProbe(m15, entryTimestamp, "15m"),
          maProbe(m30, entryTimestamp, "30m"),
          maProbe(h1, entryTimestamp, "1H"),
        ];
  const sessionLows =
    entryTimestamp === undefined
      ? []
      : [
          sessionLowForWeekday({
            candles: m5,
            weekday: "Fri",
            before: entryTimestamp,
            referencePrice: entryPrice,
          }),
          sessionLowForWeekday({
            candles: m5,
            weekday: "Thu",
            before: entryTimestamp,
            referencePrice: entryPrice,
          }),
        ];
  const blockers: string[] = [];
  if (!entryCandle)
    blockers.push("No US30 entry candle found for Sunday 7 PM ET.");
  if (!exitCandle)
    blockers.push("No US30 exit candle found for Monday 8 AM ET.");
  if (maProbes.some((probe) => probe.relation === "mixed")) {
    blockers.push(
      "One or more MA timeframes lack enough candles for 20 EMA / 50 SMA.",
    );
  }
  const bearishCount = maProbes.filter(
    (probe) => probe.relation === "bearish",
  ).length;
  const plainAnswer =
    blockers.length > 0
      ? "The probe could not fully audit the described trade because required candles or MA context are missing."
      : points !== undefined && points > 0 && bearishCount >= 2
        ? "The described US30 short is visible in the refreshed candles. It had bearish MA context on at least two checked timeframes and would have moved in the short direction by the Monday morning exit."
        : points !== undefined && points > 0
          ? "The described US30 short is visible and profitable by the Monday morning exit, but the MA-cross evidence is not strong enough yet to call this a locked rule."
          : "The described US30 short is visible, but this replay does not show a clean profitable short from the default entry and exit timestamps.";
  return {
    generatedAt: new Date().toISOString(),
    latestCandle: latest ? new Date(latest).toISOString() : undefined,
    symbol,
    direction: TradeDirection.Short,
    entryTimestamp,
    exitTimestamp,
    entryCandle,
    exitCandle,
    points,
    maxFavorable,
    maxAdverse,
    sundayOpen: sundayOpenCandle?.open,
    fridayCloseBeforeOpen,
    gapPoints:
      sundayOpenCandle && fridayCloseBeforeOpen !== undefined
        ? sundayOpenCandle.open - fridayCloseBeforeOpen
        : undefined,
    maProbes,
    sessionLows,
    plainAnswer,
    blockers,
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

export default function CocoTradeProbePage() {
  const { candles, run } = useStrategyWorkspace();
  const probe = useMemo(() => buildProbe(candles), [candles]);
  const bearishCount = probe.maProbes.filter(
    (row) => row.relation === "bearish",
  ).length;

  return (
    <div className="space-y-5 p-4 md:p-6" data-ocid="coco-trade-probe.page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Coco Trade Probe</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            This page checks the specific US30 Sunday-evening short idea against
            imported candles. It is a missed-trade audit, not a permission slip
            to trade live.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!run.integrity.canRunBacktest}
          onClick={() =>
            downloadFile(
              "ict-coco-trade-probe.json",
              JSON.stringify(probe, null, 2),
              "application/json",
            )
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Export Probe
        </Button>
      </div>

      {!run.integrity.canRunBacktest ? (
        <div className="border border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Coco Trade Probe is disabled until real 1H and 5m data is loaded.
        </div>
      ) : (
        <>
          <section className="border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <SearchCheck className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest">
                  Plain Answer
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {probe.plainAnswer}
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Entry checked"
              value={fmtEastern(probe.entryTimestamp)}
              detail="Default: most recent Sunday 7 PM ET"
            />
            <Stat
              label="Exit checked"
              value={fmtEastern(probe.exitTimestamp)}
              detail="Default: Monday 8 AM ET"
            />
            <Stat
              label="Short result"
              value={fmtPoints(probe.points)}
              detail={`Entry ${fmtPrice(probe.entryCandle?.close)} to exit ${fmtPrice(
                probe.exitCandle?.close,
              )}`}
            />
            <Stat
              label="Bearish MA votes"
              value={`${bearishCount}/${probe.maProbes.length}`}
              detail="15m, 30m, and 1H 20 EMA vs 50 SMA"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="Max favorable"
              value={fmtPoints(probe.maxFavorable)}
              detail="Best short move during entry-exit window"
            />
            <Stat
              label="Max adverse"
              value={fmtPoints(probe.maxAdverse)}
              detail="Worst move against short during window"
            />
            <Stat
              label="Sunday open"
              value={fmtPrice(probe.sundayOpen)}
              detail={`Gap ${fmtPoints(probe.gapPoints)}`}
            />
            <Stat
              label="Latest candle"
              value={fmtEastern(
                probe.latestCandle ? Date.parse(probe.latestCandle) : undefined,
              )}
              detail="Imported data freshness"
            />
          </div>

          {probe.blockers.length > 0 && (
            <section className="border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-widest">
                    Probe Blockers
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {probe.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="border border-border bg-card p-4">
              <h2 className="font-display text-lg font-bold">
                MA Alignment Check
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">TF</th>
                      <th className="py-2 text-right">20 EMA</th>
                      <th className="py-2 text-right">50 SMA</th>
                      <th className="py-2 text-left">Bias</th>
                      <th className="py-2 text-left">Recent cross</th>
                    </tr>
                  </thead>
                  <tbody>
                    {probe.maProbes.map((row) => (
                      <tr
                        key={row.timeframe}
                        className="border-b border-border/40"
                      >
                        <td className="py-2">{row.timeframe}</td>
                        <td className="py-2 text-right">
                          {fmtPrice(row.ema20)}
                        </td>
                        <td className="py-2 text-right">
                          {fmtPrice(row.sma50)}
                        </td>
                        <td className="py-2">{row.relation}</td>
                        <td className="py-2">
                          {row.crossedDownRecently
                            ? "crossed down"
                            : "no fresh cross"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-border bg-card p-4">
              <h2 className="font-display text-lg font-bold">
                Thursday / Friday NY Lows
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full font-mono text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Level</th>
                      <th className="py-2 text-right">Price</th>
                      <th className="py-2 text-right">Distance</th>
                      <th className="py-2 text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {probe.sessionLows.map((row) => (
                      <tr key={row.label} className="border-b border-border/40">
                        <td className="py-2">{row.label}</td>
                        <td className="py-2 text-right">{fmtPrice(row.low)}</td>
                        <td className="py-2 text-right">
                          {fmtPoints(row.distance)}
                        </td>
                        <td className="py-2">{fmtEastern(row.lowTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
