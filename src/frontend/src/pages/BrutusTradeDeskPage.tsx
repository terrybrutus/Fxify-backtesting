import { Download, ShieldAlert, Target, Upload, Waves } from "lucide-react";
import { useMemo, useState } from "react";

type Direction = "long" | "short";
type Decision = "ENTER" | "WAIT" | "SKIP" | "EXIT";

type IntrabarTouch = {
  id: string;
  symbol: string;
  timeframe: "15m" | "1H";
  direction: Direction;
  bucketStart: number;
  touchTime: number;
  minuteOffset: number;
  entryBand: number;
  bandWidth: number;
  touchDepthRatio: number;
  touchCloseDistance: number;
  immediateRejection: number;
  oneMinuteFollowThrough: number;
  fifteenMinuteR: number;
  sixtyMinuteR: number;
  outcome15: string;
  outcome60: string;
  session: string;
  plainRead: string;
};

type IntrabarReport = {
  files?: string[];
  totals?: {
    importedBars?: number;
    minuteBars?: number;
    fifteenMinuteBars?: number;
    hourBars?: number;
    intrabarTouches?: number;
  };
  bySymbol?: Array<{ label: string; touches: number; avgR15: number }>;
  bySession?: Array<{ label: string; touches: number; avgR15: number }>;
  byTiming?: Array<{ label: string; touches: number; avgR15: number }>;
  byDepth?: Array<{ label: string; touches: number; avgR15: number }>;
  latestTouches?: IntrabarTouch[];
};

type TradeDecision = {
  id: string;
  decision: Decision;
  symbol: string;
  timeframe: string;
  direction: Direction;
  time: number;
  entry: number;
  stop: number;
  target: number;
  confidence: number;
  reason: string;
  doNow: string;
  plainExit: string;
  evidence: string[];
  blockers: string[];
  touch: IntrabarTouch;
};

const STORAGE_KEY = "ict.brutus.trade-desk.report.v1";
const POINT_VALUE = 10;

function fmtDate(timestamp?: number) {
  if (!timestamp) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function fmtPrice(value?: number) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(2);
}

function loadReport(): IntrabarReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveReport(report: IntrabarReport | null) {
  if (typeof window === "undefined") return;
  if (!report) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(report));
  } catch {
    // The desk still works for the current page session if browser storage is full.
  }
}

function parseIntrabarReport(text: string): IntrabarReport {
  const parsed = JSON.parse(text);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray(parsed.latestTouches)
  ) {
    throw new Error(
      "Upload ict-brutus-intrabar-lab.json from the Brutus Intrabar page.",
    );
  }
  return parsed as IntrabarReport;
}

function sideWord(direction: Direction) {
  return direction === "long" ? "LONG" : "SHORT";
}

function stopVerb(direction: Direction) {
  return direction === "long" ? "below" : "above";
}

function targetText(direction: Direction) {
  return direction === "long"
    ? "Take profit if price snaps upward."
    : "Take profit if price snaps downward.";
}

function getBucketAverage(
  rows: Array<{ label: string; avgR15: number }> | undefined,
  label: string,
) {
  return rows?.find((row) => row.label === label)?.avgR15;
}

function scoreTouch(
  touch: IntrabarTouch,
  report: IntrabarReport,
): TradeDecision {
  const evidence: string[] = [];
  const blockers: string[] = [];
  const risk = touch.bandWidth * 0.5;
  const entry = touch.entryBand;
  const stop = touch.direction === "long" ? entry - risk : entry + risk;
  const target =
    touch.direction === "long" ? entry + risk * 1.5 : entry - risk * 1.5;
  const symbolAvg = getBucketAverage(
    report.bySymbol,
    `${touch.symbol} | ${touch.timeframe}`,
  );
  const sessionAvg = getBucketAverage(
    report.bySession,
    `${touch.session} | ${touch.timeframe}`,
  );
  const timingLabel =
    touch.minuteOffset <= 2
      ? `${touch.timeframe} | first 0-2m`
      : touch.minuteOffset <= 7
        ? `${touch.timeframe} | middle`
        : `${touch.timeframe} | late`;
  const timingAvg = getBucketAverage(report.byTiming, timingLabel);

  let confidence = 35;

  if (touch.timeframe === "15m") {
    confidence += 10;
    evidence.push("15m signal");
  } else {
    blockers.push("1H signals are not the main tested setup yet.");
  }

  if (touch.session === "London" || touch.session === "NY open") {
    confidence += 15;
    evidence.push(`${touch.session} timing`);
  } else {
    blockers.push("Outside London/NY timing.");
  }

  if (touch.minuteOffset <= 2) {
    confidence -= 25;
    blockers.push("Too early in the 15m candle.");
  } else if (touch.minuteOffset <= 7) {
    confidence += 12;
    evidence.push("Middle of candle");
  } else {
    confidence += 6;
    evidence.push("Late candle touch");
  }

  if (touch.symbol === "DJ30.R") {
    confidence += 12;
    evidence.push("DJ30 has the cleanest current evidence.");
  }

  if (touch.symbol === "JPN225.R" && touch.direction === "long") {
    confidence -= 30;
    blockers.push("JPN225 longs are weak in the current sample.");
  }

  if ((symbolAvg ?? 0) > 0.25) {
    confidence += 8;
    evidence.push("Asset bucket is positive.");
  }
  if ((sessionAvg ?? 0) > 0.25) {
    confidence += 8;
    evidence.push("Session bucket is positive.");
  }
  if ((timingAvg ?? 0) > 0.25) {
    confidence += 8;
    evidence.push("Timing bucket is positive.");
  }

  if (touch.immediateRejection > 0) {
    confidence += 10;
    evidence.push("Price started snapping back.");
  } else {
    confidence -= 15;
    blockers.push("No snapback yet.");
  }

  if (touch.oneMinuteFollowThrough > 0) {
    confidence += 10;
    evidence.push("Next 1m moved the right way.");
  } else if (touch.oneMinuteFollowThrough < -touch.bandWidth * 0.08) {
    confidence -= 25;
    blockers.push("Next 1m kept pushing against the trade.");
  }

  if (touch.touchDepthRatio >= 0.04 && touch.touchDepthRatio < 0.15) {
    confidence += 8;
    evidence.push("Touch depth is useful, not extreme.");
  } else if (touch.touchDepthRatio >= 0.15) {
    confidence -= 12;
    blockers.push("Touch is very stretched.");
  }

  confidence = Math.max(0, Math.min(100, confidence));

  let decision: Decision = "WAIT";
  let reason = "Setup is close, but wait for a cleaner 1m turn.";
  let doNow = "Wait for the next 1m candle.";
  let plainExit = `Skip if price keeps moving ${stopVerb(touch.direction)} the band.`;

  if (blockers.some((blocker) => blocker.includes("Next 1m kept pushing"))) {
    decision = "EXIT";
    reason = "Price kept moving against the setup.";
    doNow = "Do not stay in this trade.";
    plainExit = "Exit now if already in.";
  } else if (confidence >= 78 && blockers.length === 0) {
    decision = "ENTER";
    reason =
      "Best current Brutus pattern: right session, right timing, and snapback started.";
    doNow = `${sideWord(touch.direction)} now. Stop ${stopVerb(touch.direction)} the recent touch.`;
    plainExit = targetText(touch.direction);
  } else if (confidence < 55 || blockers.length >= 2) {
    decision = "SKIP";
    reason = blockers[0] ?? "Not enough current evidence.";
    doNow = "Do nothing.";
    plainExit = "Wait for the next alert.";
  }

  return {
    id: touch.id,
    decision,
    symbol: touch.symbol,
    timeframe: touch.timeframe,
    direction: touch.direction,
    time: touch.touchTime,
    entry,
    stop,
    target,
    confidence,
    reason,
    doNow,
    plainExit,
    evidence,
    blockers,
    touch,
  };
}

function exportJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function DecisionPill({ decision }: { decision: Decision }) {
  const colors: Record<Decision, string> = {
    ENTER: "border-lime-400 bg-lime-400/10 text-lime-300",
    WAIT: "border-amber-300 bg-amber-300/10 text-amber-200",
    SKIP: "border-red-500 bg-red-500/10 text-red-300",
    EXIT: "border-fuchsia-400 bg-fuchsia-400/10 text-fuchsia-200",
  };
  return (
    <span
      className={`border px-3 py-1 font-display text-xl font-bold ${colors[decision]}`}
    >
      {decision}
    </span>
  );
}

function TradeCard({ item }: { item: TradeDecision }) {
  return (
    <article className="border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {fmtDate(item.time)} | {item.symbol} | {item.timeframe}
          </p>
          <h2 className="mt-2 font-display text-xl font-bold">
            {sideWord(item.direction)} {item.symbol}
          </h2>
        </div>
        <DecisionPill decision={item.decision} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="border border-border bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Entry
          </p>
          <p className="mt-1 font-display text-lg font-bold">
            {fmtPrice(item.entry)}
          </p>
        </div>
        <div className="border border-border bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Stop
          </p>
          <p className="mt-1 font-display text-lg font-bold">
            {fmtPrice(item.stop)}
          </p>
        </div>
        <div className="border border-border bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Target
          </p>
          <p className="mt-1 font-display text-lg font-bold">
            {fmtPrice(item.target)}
          </p>
        </div>
        <div className="border border-border bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Confidence
          </p>
          <p className="mt-1 font-display text-lg font-bold">
            {item.confidence}/100
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="border border-primary/40 bg-primary/5 p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
            Do now
          </p>
          <p className="mt-2 text-sm text-foreground">{item.doNow}</p>
        </div>
        <div className="border border-border bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Why
          </p>
          <p className="mt-2 text-sm text-foreground">{item.reason}</p>
        </div>
        <div className="border border-border bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Exit rule
          </p>
          <p className="mt-2 text-sm text-foreground">{item.plainExit}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Good signs
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {item.evidence.length
              ? item.evidence.join("; ")
              : "None strong enough."}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Problems
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {item.blockers.length
              ? item.blockers.join("; ")
              : "No major blockers."}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function BrutusTradeDeskPage() {
  const [report, setReport] = useState<IntrabarReport | null>(() =>
    loadReport(),
  );
  const [error, setError] = useState("");

  const decisions = useMemo(() => {
    if (!report?.latestTouches?.length) return [];
    return report.latestTouches
      .map((touch) => scoreTouch(touch, report))
      .sort((a, b) => {
        const rank: Record<Decision, number> = {
          ENTER: 0,
          WAIT: 1,
          EXIT: 2,
          SKIP: 3,
        };
        return rank[a.decision] - rank[b.decision] || b.time - a.time;
      });
  }, [report]);

  const counts = useMemo(
    () => ({
      enter: decisions.filter((item) => item.decision === "ENTER").length,
      wait: decisions.filter((item) => item.decision === "WAIT").length,
      skip: decisions.filter((item) => item.decision === "SKIP").length,
      exit: decisions.filter((item) => item.decision === "EXIT").length,
    }),
    [decisions],
  );

  async function importReport(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = parseIntrabarReport(await file.text());
      setReport(parsed);
      saveReport(parsed);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read Brutus report.",
      );
    }
  }

  return (
    <div className="space-y-4 p-6" data-ocid="brutus.trade-desk.page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Brutus Trade Desk</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            One job: turn Brutus research into plain decisions. This is not an
            auto-trader. It tells you ENTER, WAIT, SKIP, or EXIT using the
            current draft rule.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 border border-primary bg-primary px-4 py-2 font-mono text-xs text-primary-foreground">
            <Upload className="h-4 w-4" />
            Import Intrabar JSON
            <input
              accept=".json"
              className="hidden"
              onChange={(event) => importReport(event.target.files?.[0])}
              type="file"
            />
          </label>
          <button
            className="inline-flex items-center gap-2 border border-border bg-card px-4 py-2 font-mono text-xs hover:border-primary disabled:opacity-40"
            disabled={!decisions.length}
            onClick={() =>
              exportJson("ict-brutus-trade-desk.json", {
                generatedAt: new Date().toISOString(),
                rule: {
                  plain:
                    "15m Brutus first. Prefer London/NY. Avoid first 0-2m touches. Treat JPN225 longs cautiously. Enter only after snapback starts.",
                  pointValue: POINT_VALUE,
                },
                sourceTotals: report?.totals,
                counts,
                decisions,
              })
            }
            type="button"
          >
            <Download className="h-4 w-4" />
            Export Trade Desk
          </button>
        </div>
      </div>

      {error && (
        <section className="border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-5">
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Signals read
          </p>
          <p className="mt-2 font-display text-2xl font-bold">
            {decisions.length}
          </p>
        </div>
        <div className="border border-lime-400/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Enter
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-lime-300">
            {counts.enter}
          </p>
        </div>
        <div className="border border-amber-300/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Wait
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-amber-200">
            {counts.wait}
          </p>
        </div>
        <div className="border border-fuchsia-400/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Exit
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-fuchsia-200">
            {counts.exit}
          </p>
        </div>
        <div className="border border-red-500/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Skip
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-red-300">
            {counts.skip}
          </p>
        </div>
      </section>

      <section className="border border-red-500/40 bg-red-500/5 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-red-300" />
          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-widest">
              Do Not Overread This
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This is a draft signal assistant. It is meant to compress research
              into fast decisions, not place funded trades. If it says ENTER,
              treat that as paper-trade quality until more alerts prove it live.
            </p>
          </div>
        </div>
      </section>

      {!report ? (
        <section className="border border-border bg-card p-8 text-center">
          <Target className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-3 font-display text-xl font-bold">
            Import the Brutus Intrabar export
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            Use the export from Brutus Intrabar Lab. This page will turn those
            touches into plain trade decisions.
          </p>
        </section>
      ) : (
        <>
          <section className="border border-primary/40 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Waves className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <h2 className="font-display text-sm font-bold uppercase tracking-widest">
                  Current Draft Rule
                </h2>
                <p className="mt-2 text-sm text-foreground">
                  Prefer 15m London/NY touches. Avoid first 0-2m touches. DJ30
                  is strongest. Be careful with JPN225 longs. Enter only after
                  price starts snapping back.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            {decisions.slice(0, 24).map((item) => (
              <TradeCard item={item} key={item.id} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
