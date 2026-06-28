import {
  Download,
  Radio,
  ShieldAlert,
  Target,
  Upload,
  Waves,
} from "lucide-react";
import { useMemo, useState } from "react";

type Direction = "long" | "short";
type Decision = "ENTER" | "WAIT" | "SKIP" | "DO_NOT_HOLD";
type PlaybookVerdict = "TEST" | "WATCH" | "AVOID" | "TOO SMALL";
type PaperOutcome = "unreviewed" | "paid" | "failed" | "missed";
type MomentumContext = {
  rsi?: number;
  rsiMa?: number;
  rsiUpper?: number;
  rsiLower?: number;
  rsiDelta?: number;
  rsiSlope?: "rising" | "falling" | "flat" | "unknown";
  rsiStretch?: "upper" | "lower" | "none" | "unknown";
  rsiPosition?: "above-ma" | "below-ma" | "unknown";
  alignedWithTouch?: boolean;
  plainRead?: string;
};

type IntrabarTouch = {
  id: string;
  symbol: string;
  timeframe: string;
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
  momentum?: MomentumContext;
};

type IntrabarReport = {
  files?: string[];
  totals?: {
    importedBars?: number;
    minuteBars?: number;
    fifteenMinuteBars?: number;
    hourBars?: number;
    byTimeframe?: Record<string, number>;
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

type TvAlert = {
  id: string;
  strategy?: string;
  alertTime?: number | string;
  playbookVersion?: string;
  rawSignal?: boolean;
  decisionEvent?: string;
  previousAction?: string;
  rawLongSignal?: boolean;
  rawShortSignal?: boolean;
  rawLongCondition?: boolean;
  rawShortCondition?: boolean;
  newLongTouch?: boolean;
  newShortTouch?: boolean;
  signalConflict?: boolean;
  signalDirection?: string;
  action?: Decision;
  plainAction?: string;
  reason?: string;
  brokerSymbol?: string;
  symbol?: string;
  timeframe?: string;
  direction?: Direction;
  candleTime?: number;
  alertMode?: string;
  confirmed?: boolean;
  mode?: string;
  modeReady?: boolean;
  inSession?: boolean;
  minutesIntoBar?: number;
  notTooEarly?: boolean;
  longSnapback?: boolean;
  shortSnapback?: boolean;
  longPushThrough?: boolean;
  shortPushThrough?: boolean;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  upper?: number;
  lower?: number;
  bandWidth?: number;
  touchDepth?: number;
  touchDepthRatio?: number;
  entry?: number;
  stop?: number;
  target?: number;
  length?: number;
  upperSource?: string;
  lowerSource?: string;
  stdDev?: number;
};

type AlertDecisionMatch = {
  alert: TvAlert;
  decision?: TradeDecision;
  status: Decision | "NO DATA";
  note: string;
  agreement: "MATCH" | "DIFFERENT" | "PINE ONLY" | "NO DATA";
};

type AlertImportResult = {
  files: number;
  parsed: number;
  added: number;
  duplicates: number;
  current: number;
  old: number;
  legacy: number;
  contractIssues: number;
};

type PlaybookRow = {
  id: string;
  family: string;
  label: string;
  trades: number;
  targetRate: number;
  stopRate: number;
  avgR15: number;
  avgR60: number;
  score: number;
  verdict: PlaybookVerdict;
  plainRule: string;
  pineHint: string;
};

type AlertGroupRow = {
  key: string;
  symbol: string;
  timeframe: string;
  action: Decision | "NO DATA";
  count: number;
  match: number;
  different: number;
  pineOnly: number;
  noData: number;
  paid: number;
  failed: number;
  missed: number;
  reviewed: number;
  latestAlertTime: number;
};

const STORAGE_KEY = "ict.brutus.trade-desk.report.v1";
const ALERT_STORAGE_KEY = "ict.brutus.trade-desk.alerts.v1";
const PAPER_OUTCOME_STORAGE_KEY = "ict.brutus.trade-desk.paperOutcomes.v1";
const LATEST_PLAYBOOK_VERSION = "raw-parity-v10";
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

function loadAlerts(): TvAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ALERT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAlerts(alerts: TvAlert[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // Keep current-session alerts even if browser storage is full.
  }
}

function clearSavedAlerts() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ALERT_STORAGE_KEY);
}

function loadPaperOutcomes(): Record<string, PaperOutcome> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PAPER_OUTCOME_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, PaperOutcome] =>
        ["unreviewed", "paid", "failed", "missed"].includes(String(entry[1])),
      ),
    );
  } catch {
    return {};
  }
}

function savePaperOutcomes(outcomes: Record<string, PaperOutcome>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PAPER_OUTCOME_STORAGE_KEY,
      JSON.stringify(outcomes),
    );
  } catch {
    // Outcome marking still works during the current session.
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

function parseCsvRecords(text: string) {
  const records: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) records.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim() !== "")) records.push(row);
  return records;
}

function normalizeTimeframe(value?: string) {
  const raw = value?.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === "60" || lower === "1h" || lower === "1hr") return "1H";
  if (/^\d+$/.test(lower)) return `${Number(lower)}m`;
  if (lower.endsWith("m")) return lower;
  if (lower.endsWith("h")) return lower.toUpperCase();
  return raw;
}

function normalizeBrokerSymbol(value?: string) {
  return value
    ?.replace(/^ALCHEMY:/i, "")
    .replace(/^ALCHEMYMARKETS:/i, "")
    .trim()
    .toUpperCase();
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function alertTimeFrom(item: Record<string, unknown>, fallback?: string) {
  return (
    asNumber(item.alertTime) ??
    asNumber(item.timenow) ??
    asNumber(item.receivedAt) ??
    (typeof item.alertTime === "string" ? item.alertTime : undefined) ??
    fallback
  );
}

function directionFrom(value: unknown): Direction | undefined {
  const lower = String(value ?? "")
    .trim()
    .toLowerCase();
  if (lower === "long" || lower === "buy") return "long";
  if (lower === "short" || lower === "sell") return "short";
  return undefined;
}

function decisionFrom(value: unknown): Decision | undefined {
  const upper = String(value ?? "")
    .trim()
    .toUpperCase();
  if (
    upper === "ENTER" ||
    upper === "WAIT" ||
    upper === "SKIP" ||
    upper === "DO_NOT_HOLD"
  ) {
    return upper;
  }
  return undefined;
}

function normalizeAlertPayload(
  raw: unknown,
  alertTime?: string,
): TvAlert | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const brokerSymbol = String(item.symbol ?? item.ticker ?? "").trim();
  const symbol = normalizeBrokerSymbol(brokerSymbol);
  const direction = directionFrom(item.direction ?? item.side);
  const timeframe = normalizeTimeframe(
    String(item.timeframe ?? item.interval ?? ""),
  );
  const candleTime = asNumber(item.time ?? item.timestamp ?? item.candleTime);
  const importedAlertTime = alertTimeFrom(item, alertTime);
  if (!symbol || !timeframe || !direction || candleTime == null) return null;
  return {
    id: [
      symbol,
      timeframe,
      direction,
      candleTime,
      importedAlertTime ?? "",
    ].join("|"),
    alertTime: importedAlertTime,
    strategy: typeof item.strategy === "string" ? item.strategy : undefined,
    playbookVersion:
      typeof item.playbookVersion === "string" ? item.playbookVersion : undefined,
    rawSignal:
      typeof item.rawSignal === "boolean" ? item.rawSignal : undefined,
    decisionEvent:
      typeof item.decisionEvent === "string" ? item.decisionEvent : undefined,
    previousAction:
      typeof item.previousAction === "string" ? item.previousAction : undefined,
    rawLongSignal:
      typeof item.rawLongSignal === "boolean" ? item.rawLongSignal : undefined,
    rawShortSignal:
      typeof item.rawShortSignal === "boolean" ? item.rawShortSignal : undefined,
    rawLongCondition:
      typeof item.rawLongCondition === "boolean"
        ? item.rawLongCondition
        : undefined,
    rawShortCondition:
      typeof item.rawShortCondition === "boolean"
        ? item.rawShortCondition
        : undefined,
    newLongTouch:
      typeof item.newLongTouch === "boolean" ? item.newLongTouch : undefined,
    newShortTouch:
      typeof item.newShortTouch === "boolean" ? item.newShortTouch : undefined,
    signalConflict:
      typeof item.signalConflict === "boolean" ? item.signalConflict : undefined,
    signalDirection:
      typeof item.signalDirection === "string"
        ? item.signalDirection
        : undefined,
    action: decisionFrom(item.action),
    plainAction:
      typeof item.plainAction === "string" ? item.plainAction : undefined,
    reason: typeof item.reason === "string" ? item.reason : undefined,
    brokerSymbol,
    symbol,
    timeframe,
    direction,
    candleTime,
    alertMode: typeof item.alertMode === "string" ? item.alertMode : undefined,
    confirmed:
      typeof item.confirmed === "boolean" ? item.confirmed : undefined,
    mode: typeof item.mode === "string" ? item.mode : undefined,
    modeReady:
      typeof item.modeReady === "boolean" ? item.modeReady : undefined,
    inSession:
      typeof item.inSession === "boolean" ? item.inSession : undefined,
    minutesIntoBar: asNumber(item.minutesIntoBar),
    notTooEarly:
      typeof item.notTooEarly === "boolean" ? item.notTooEarly : undefined,
    longSnapback:
      typeof item.longSnapback === "boolean" ? item.longSnapback : undefined,
    shortSnapback:
      typeof item.shortSnapback === "boolean" ? item.shortSnapback : undefined,
    longPushThrough:
      typeof item.longPushThrough === "boolean"
        ? item.longPushThrough
        : undefined,
    shortPushThrough:
      typeof item.shortPushThrough === "boolean"
        ? item.shortPushThrough
        : undefined,
    open: asNumber(item.open),
    high: asNumber(item.high),
    low: asNumber(item.low),
    close: asNumber(item.close),
    upper: asNumber(item.upper),
    lower: asNumber(item.lower),
    bandWidth: asNumber(item.bandWidth),
    touchDepth: asNumber(item.touchDepth),
    touchDepthRatio: asNumber(item.touchDepthRatio),
    entry: asNumber(item.entry),
    stop: asNumber(item.stop),
    target: asNumber(item.target),
    length: asNumber(item.length),
    upperSource:
      typeof item.upperSource === "string" ? item.upperSource : undefined,
    lowerSource:
      typeof item.lowerSource === "string" ? item.lowerSource : undefined,
    stdDev: asNumber(item.stdDev),
  };
}

function possibleJsonFragments(value: string) {
  const trimmed = value.trim();
  const fragments = new Set<string>();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    fragments.add(trimmed);
  }
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    fragments.add(trimmed.slice(objectStart, objectEnd + 1));
  }
  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    fragments.add(trimmed.slice(arrayStart, arrayEnd + 1));
  }
  return [...fragments];
}

function parseAlertLog(text: string): TvAlert[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const fromPayload = (value: unknown, alertTime?: string): TvAlert[] => {
    if (Array.isArray(value)) return value.flatMap((item) => fromPayload(item));
    const normalized = normalizeAlertPayload(value, alertTime);
    return normalized ? [normalized] : [];
  };

  try {
    return fromPayload(JSON.parse(trimmed));
  } catch {
    // Fall through to CSV/JSONL parsing.
  }

  const jsonl = trimmed.split(/\r?\n/).flatMap((line) => {
    try {
      return fromPayload(JSON.parse(line.trim()));
    } catch {
      return [];
    }
  });
  if (jsonl.length) return jsonl;

  const records = parseCsvRecords(trimmed);
  const [header, ...rows] = records;
  if (!header) return [];
  const normalizedHeader = header.map((cell) =>
    cell.trim().toLowerCase().replaceAll(" ", ""),
  );
  const preferredColumns = [
    "description",
    "message",
    "body",
    "requestbody",
    "payload",
  ];
  const preferredIndexes = preferredColumns
    .map((name) => normalizedHeader.indexOf(name))
    .filter((index) => index >= 0);
  if (!preferredIndexes.length) return [];
  const timeIndex = normalizedHeader.indexOf("time");

  return rows.flatMap((row) => {
    const alertTime = timeIndex >= 0 ? row[timeIndex] : undefined;
    for (const index of preferredIndexes) {
      const cell = row[index]?.trim();
      if (!cell) continue;
      for (const fragment of possibleJsonFragments(cell)) {
        for (const candidate of [fragment, fragment.replaceAll('""', '"')]) {
          try {
            const parsed = JSON.parse(candidate);
            return fromPayload(parsed, alertTime);
          } catch {
            // Try the next candidate.
          }
        }
      }
    }
    return [];
  });
}

function mergeAlerts(current: TvAlert[], incoming: TvAlert[]) {
  const seen = new Set(current.map((alert) => alert.id));
  const added: TvAlert[] = [];
  for (const alert of incoming) {
    if (seen.has(alert.id)) continue;
    seen.add(alert.id);
    added.push(alert);
  }
  return [...added, ...current].slice(0, 500);
}

function isPlaybookAlert(alert: TvAlert) {
  return alert.strategy === "brutus_playbook_v1" || alert.rawSignal === true;
}

function isLatestPlaybookAlert(alert: TvAlert) {
  return (
    isPlaybookAlert(alert) && alert.playbookVersion === LATEST_PLAYBOOK_VERSION
  );
}

function paperOutcomeKey(alert: TvAlert) {
  return [
    alert.symbol ?? "unknown",
    normalizeTimeframe(alert.timeframe) ?? "n/a",
    alert.direction ?? "n/a",
    alert.candleTime ?? "no-time",
    alert.action ?? "NO_ACTION",
    alert.decisionEvent ?? "event",
  ].join("|");
}

function alertVersionLabel(alert: TvAlert) {
  if (isLatestPlaybookAlert(alert)) return "Current Playbook";
  if (isPlaybookAlert(alert)) return "Old Playbook";
  return "Legacy / other";
}

function playbookContractIssues(alert: TvAlert) {
  const issues: string[] = [];
  if (!isLatestPlaybookAlert(alert)) return issues;
  if (alert.length !== 9) issues.push("length");
  if (alert.upperSource !== "high") issues.push("upper source");
  if (alert.lowerSource !== "low") issues.push("lower source");
  if (alert.stdDev !== 2) issues.push("stdDev");
  return issues;
}

function sideWord(direction: Direction) {
  return direction === "long" ? "LONG" : "SHORT";
}

function plainTradeWord(direction: Direction) {
  return direction === "long" ? "BUY" : "SELL";
}

function targetText(direction: Direction) {
  return direction === "long"
    ? "Target the snapback upward."
    : "Target the snapback downward.";
}

function timeframeMinutes(timeframe: string) {
  if (timeframe === "1H") return 60;
  const parsed = Number(timeframe.replace("m", ""));
  return Number.isFinite(parsed) ? parsed : 15;
}

function timeframeFamily(timeframe: string) {
  const minutes = timeframeMinutes(timeframe);
  if (minutes <= 5) return "fast";
  if (minutes <= 45) return "mid";
  return "slow";
}

function displayDecision(decision: Decision | "NO DATA") {
  return decision.replaceAll("_", " ");
}

function paperOutcomeLabel(outcome: PaperOutcome) {
  if (outcome === "paid") return "Paid";
  if (outcome === "failed") return "Failed";
  if (outcome === "missed") return "Wait paid";
  return "Unreviewed";
}

function paperOutcomeClass(outcome: PaperOutcome) {
  if (outcome === "paid") return "text-lime-300";
  if (outcome === "failed") return "text-red-300";
  if (outcome === "missed") return "text-amber-200";
  return "text-muted-foreground";
}

function timingLabelFor(touch: IntrabarTouch) {
  const minutes = timeframeMinutes(touch.timeframe);
  const progress = touch.minuteOffset / Math.max(minutes, 1);
  if (touch.minuteOffset <= 1) return `${touch.timeframe} | first 0-1m`;
  if (progress < 0.33) return `${touch.timeframe} | early`;
  if (progress < 0.67) return `${touch.timeframe} | middle`;
  return `${touch.timeframe} | late`;
}

function plainTimingFor(touch: IntrabarTouch) {
  const minutes = timeframeMinutes(touch.timeframe);
  const progress = touch.minuteOffset / Math.max(minutes, 1);
  if (touch.minuteOffset <= 1) return "first minute";
  if (progress < 0.33) return "early";
  if (progress < 0.67) return "middle";
  return "late";
}

function depthBucket(touch: IntrabarTouch) {
  if (touch.touchDepthRatio >= 0.15) return "deep stretch";
  if (touch.touchDepthRatio >= 0.04) return "moderate pierce";
  return "light touch";
}

function snapbackBucket(touch: IntrabarTouch) {
  if (touch.immediateRejection > 0 && touch.oneMinuteFollowThrough >= 0) {
    return "snapback started";
  }
  if (touch.oneMinuteFollowThrough < 0) return "kept pushing";
  return "no snapback yet";
}

function momentumBucket(touch: IntrabarTouch) {
  if (touch.momentum?.alignedWithTouch) return "RSI aligned";
  if (
    touch.momentum?.rsiStretch &&
    touch.momentum.rsiStretch !== "none" &&
    touch.momentum.rsiStretch !== "unknown"
  ) {
    return "RSI stretched against/near signal";
  }
  return "RSI neutral";
}

function getBucketAverage(
  rows: Array<{ label: string; avgR15: number }> | undefined,
  label: string,
) {
  return rows?.find((row) => row.label === label)?.avgR15;
}

function average(values: number[]) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function summarizePlaybookGroup(
  family: string,
  label: string,
  touches: IntrabarTouch[],
): PlaybookRow {
  const trades = touches.length;
  const targetRate =
    trades > 0
      ? touches.filter((touch) => touch.outcome15 === "target").length / trades
      : 0;
  const stopRate =
    trades > 0
      ? touches.filter((touch) => touch.outcome15 === "stop").length / trades
      : 0;
  const avgR15 = average(touches.map((touch) => touch.fifteenMinuteR));
  const avgR60 = average(touches.map((touch) => touch.sixtyMinuteR));
  const score =
    avgR15 * 45 +
    avgR60 * 20 +
    targetRate * 35 -
    stopRate * 45 +
    Math.min(trades / 35, 1) * 12;
  let verdict: PlaybookVerdict = "AVOID";
  if (trades < 12) verdict = "TOO SMALL";
  else if (avgR15 >= 0.22 && stopRate <= 0.24 && score > 10) verdict = "TEST";
  else if (avgR15 >= 0.05 && score > 0) verdict = "WATCH";

  const plainRule =
    verdict === "TEST"
      ? `This is a testable rule candidate: ${label}. It has enough sample to paper-trade and convert into a TradingView alert condition.`
      : verdict === "WATCH"
        ? `This is interesting but not clean enough yet: ${label}. Watch it, but do not make it a hard rule.`
        : verdict === "TOO SMALL"
          ? `Too few examples to trust yet: ${label}.`
          : `Avoid as a default rule: ${label}. The sample is not paying cleanly enough.`;

  return {
    id: `${family}:${label}`,
    family,
    label,
    trades,
    targetRate,
    stopRate,
    avgR15,
    avgR60,
    score,
    verdict,
    plainRule,
    pineHint: `Filter idea: ${label}. Require the alert to match this bucket before it can say ENTER.`,
  };
}

function buildPlaybook(touches: IntrabarTouch[]): PlaybookRow[] {
  const groups = new Map<string, IntrabarTouch[]>();
  const add = (family: string, label: string, touch: IntrabarTouch) => {
    const key = `${family}:${label}`;
    const list = groups.get(key) ?? [];
    list.push(touch);
    groups.set(key, list);
  };

  for (const touch of touches) {
    add("Asset + timeframe", `${touch.symbol} ${touch.timeframe}`, touch);
    add("Session + timeframe", `${touch.session} ${touch.timeframe}`, touch);
    add(
      "Timing + timeframe",
      `${touch.timeframe} ${plainTimingFor(touch)}`,
      touch,
    );
    add("Pierce depth", `${touch.timeframe} ${depthBucket(touch)}`, touch);
    add("Snapback", `${touch.timeframe} ${snapbackBucket(touch)}`, touch);
    add("Momentum", `${touch.timeframe} ${momentumBucket(touch)}`, touch);
    add(
      "Direction + setup",
      `${touch.symbol} ${touch.timeframe} ${touch.direction} ${touch.session} ${plainTimingFor(touch)} ${snapbackBucket(touch)}`,
      touch,
    );
  }

  return Array.from(groups.entries())
    .map(([key, touchesForGroup]) => {
      const [family, ...labelParts] = key.split(":");
      return summarizePlaybookGroup(
        family,
        labelParts.join(":"),
        touchesForGroup,
      );
    })
    .sort((a, b) => {
      const verdictRank: Record<PlaybookVerdict, number> = {
        TEST: 0,
        WATCH: 1,
        AVOID: 2,
        "TOO SMALL": 3,
      };
      return (
        verdictRank[a.verdict] - verdictRank[b.verdict] || b.score - a.score
      );
    });
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
  const timingLabel = timingLabelFor(touch);
  const timingAvg = getBucketAverage(report.byTiming, timingLabel);
  const family = timeframeFamily(touch.timeframe);

  let confidence = 35;

  if (family === "mid") {
    confidence += 10;
    evidence.push("Mid-timeframe signal");
  } else if (family === "fast") {
    confidence += 4;
    evidence.push("Fast scalp timeframe");
  } else {
    blockers.push("1H signal needs extra proof.");
  }

  if (touch.session === "London" || touch.session === "NY open") {
    confidence += 15;
    evidence.push(`${touch.session} timing`);
  } else {
    blockers.push("Outside London/NY timing.");
  }

  if (timingLabel.includes("first 0-1m")) {
    confidence -= 25;
    blockers.push("Too early in the candle.");
  } else if (timingLabel.includes("middle")) {
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

  if (touch.momentum?.alignedWithTouch) {
    confidence += 5;
    evidence.push("RSI also stretched with the touch.");
  } else if (
    touch.momentum?.rsiStretch &&
    touch.momentum.rsiStretch !== "none" &&
    touch.momentum.rsiStretch !== "unknown"
  ) {
    confidence -= 5;
    evidence.push("RSI stretch is against this touch.");
  }

  confidence = Math.max(0, Math.min(100, confidence));

  let decision: Decision = "WAIT";
  let reason = "Setup is close, but it has not snapped back enough yet.";
  let doNow = "NO TRADE YET. Watch only.";
  let plainExit = "Enter only if a later alert says ENTER.";

  if (blockers.some((blocker) => blocker.includes("Next 1m kept pushing"))) {
    decision = "DO_NOT_HOLD";
    reason = "Price kept moving against the setup.";
    doNow = "NO TRADE. Do not fight this move.";
    plainExit = "If already paper-tracking it, mark it failed.";
  } else if (confidence >= 78 && blockers.length === 0) {
    decision = "ENTER";
    reason =
      "Best current Brutus pattern: right session, right timing, and snapback started.";
    doNow = `PAPER ${plainTradeWord(touch.direction)} NOW. Skip if you are late.`;
    plainExit = targetText(touch.direction);
  } else if (confidence < 55 || blockers.length >= 2) {
    decision = "SKIP";
    reason = blockers[0] ?? "Not enough current evidence.";
    doNow = "SKIP. No trade.";
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

function exportText(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function pineComment(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replaceAll("//", "/ /")
    .slice(0, 160);
}

function generateBrutusPineScript(rows: PlaybookRow[]) {
  const testRows = rows
    .filter((row) => row.verdict === "TEST")
    .slice(0, 8)
    .map(
      (row) =>
        `// TEST ROW: ${pineComment(row.label)} | ${row.trades} touches | R15 ${row.avgR15.toFixed(2)} | R60 ${row.avgR60.toFixed(2)} | ${pineComment(row.plainRule)}`,
    )
    .join("\n");

  return `//@version=6
indicator("Brutus Playbook Alerts", overlay=true)

// Generated by ICT Audit Lab from the Brutus Trade Desk playbook.
// Use this on TradingView Alchemy symbols first: DJ30.R, USTEC.R, US500.R, JPN225.R, and RUS2000.R.
// This is a paper-test alert bridge. It does not prove the strategy is live-trade ready by itself.
// Alert setup: create exactly one alert per symbol/timeframe using "Any alert() function call".
// Do not choose the named Brutus ENTER/WAIT/SKIP alertconditions for the evidence loop; those are only visual fallback labels and will not carry the full JSON audit packet.
// Sanity check: keep Show Original Triangle Matches on first. ORIG markers must match the old Brutus triangles before trusting ENTER, WAIT, SKIP, or DO NOT HOLD labels.
// Timing truth: ORIG matches the old triangle formula. Because that formula uses candle color, an open candle can change until it closes. First-touch alerts are live evidence, not perfect historical replay.
${testRows || "// No TEST rows were available when this script was exported. Keep this in paper-test mode."}

// Exact original Brutus Bollinger settings. These are locked so Playbook alerts cannot silently drift from the old indicator.
length = 9
mult = 2.0
upperSrc = high
lowerSrc = low

useSessionFilter = input.bool(true, title="Use Active Session Filter")
activeSession = input.session("0300-1200", title="Active Session")
signalMode = input.string("First touch", title="Signal Mode", options=["First touch", "Confirmed close"])
minMinutesIntoBar = input.float(2.0, minval=0.0, title="Wait This Many Minutes Into Live Bar")
stopBandFraction = input.float(0.35, minval=0.05, maxval=2.0, title="Stop Distance as Band Width Fraction")
targetR = input.float(1.2, minval=0.25, maxval=5.0, title="Target R")
liveAlertsOnly = input.bool(true, title="Only Fire Alerts On Live Bars")
showOriginalSignals = input.bool(true, title="Show Original Triangle Matches")
showLiveLatchSignals = input.bool(true, title="Show Live First-Touch Latches")
showAuditPanel = input.bool(true, title="Show Brutus Audit Panel")

upperBasis = ta.ema(upperSrc, length)
lowerBasis = ta.ema(lowerSrc, length)
upperDev = mult * ta.stdev(upperSrc, length)
lowerDev = mult * ta.stdev(lowerSrc, length)
upper = upperBasis + upperDev
lower = lowerBasis - lowerDev
bandWidth = math.max(upper - lower, syminfo.mintick)

plot(upper, "Upper", color=color.gray, linewidth=1)
plot(lower, "Lower", color=color.gray, linewidth=1)

// Raw Brutus signal layer. These two conditions intentionally match the original indicator's triangle logic.
rawLongCondition = (lowerSrc <= lower and close > open) or (lowerSrc[1] > lower[1] and lowerSrc <= lower)
rawShortCondition = (upperSrc >= upper and close < open) or (upperSrc[1] < upper[1] and upperSrc >= upper)

// First-touch mode latches the first live intrabar touch so alerts do not disappear just because the candle later changes.
// Historical bars cannot reconstruct the exact tick that first touched; confirmed-close mode uses the final candle state.
varip int latchedBarTime = na
varip bool rawLongLatched = false
varip bool rawShortLatched = false
varip bool alertedLongThisBar = false
varip bool alertedShortThisBar = false
varip string lastLongAlertAction = ""
varip string lastShortAlertAction = ""
if na(latchedBarTime) or time != latchedBarTime
    latchedBarTime := time
    rawLongLatched := false
    rawShortLatched := false
    alertedLongThisBar := false
    alertedShortThisBar := false
    lastLongAlertAction := ""
    lastShortAlertAction := ""
newLongTouch = rawLongCondition and not rawLongLatched
newShortTouch = rawShortCondition and not rawShortLatched
if rawLongCondition
    rawLongLatched := true
if rawShortCondition
    rawShortLatched := true

rawLongSignal = signalMode == "First touch" and barstate.isrealtime ? rawLongLatched : rawLongCondition
rawShortSignal = signalMode == "First touch" and barstate.isrealtime ? rawShortLatched : rawShortCondition
rawSignal = rawLongSignal or rawShortSignal
signalConflict = rawLongSignal and rawShortSignal
direction = signalConflict ? "both" : rawLongSignal ? "long" : rawShortSignal ? "short" : "none"
mode = signalMode == "Confirmed close" ? "bar_close" : "first_touch"
modeReady = signalMode == "Confirmed close" ? barstate.isconfirmed : true

longTouch = rawLongSignal
shortTouch = rawShortSignal
longTouchDepth = longTouch ? math.max(0.0, lower - lowerSrc) : 0.0
shortTouchDepth = shortTouch ? math.max(0.0, upperSrc - upper) : 0.0
touchDepth = direction == "long" ? longTouchDepth : direction == "short" ? shortTouchDepth : math.max(longTouchDepth, shortTouchDepth)
touchDepthRatio = touchDepth / bandWidth
inSession = not useSessionFilter or not na(time(timeframe.period, activeSession))
minutesIntoBar = math.max(0.0, (timenow - time) / 60000.0)
notTooEarly = barstate.isconfirmed or minutesIntoBar >= minMinutesIntoBar

longSnapback = close > lower and close >= open
shortSnapback = close < upper and close <= open
longPushThrough = longTouch and close < lower and (lower - close) > bandWidth * 0.05
shortPushThrough = shortTouch and close > upper and (close - upper) > bandWidth * 0.05

longEnter = rawLongSignal and not signalConflict and inSession and modeReady and notTooEarly and longSnapback and not longPushThrough
shortEnter = rawShortSignal and not signalConflict and inSession and modeReady and notTooEarly and shortSnapback and not shortPushThrough
longWatch = rawLongSignal and not signalConflict and inSession and modeReady and not longEnter and not longPushThrough
shortWatch = rawShortSignal and not signalConflict and inSession and modeReady and not shortEnter and not shortPushThrough
doNotHold = rawSignal and not signalConflict and modeReady and (longPushThrough or shortPushThrough)
conflictSkip = signalConflict and modeReady
skipSignal = (rawSignal and modeReady and not (longEnter or shortEnter or longWatch or shortWatch or doNotHold)) or conflictSkip

action = conflictSkip ? "SKIP" : doNotHold ? "DO_NOT_HOLD" : longEnter or shortEnter ? "ENTER" : longWatch or shortWatch ? "WAIT" : rawSignal ? "SKIP" : "NO_SIGNAL"
entry = direction == "long" ? lower : direction == "short" ? upper : na
risk = bandWidth * stopBandFraction
stop = direction == "long" ? entry - risk : direction == "short" ? entry + risk : na
target = direction == "long" ? entry + risk * targetR : direction == "short" ? entry - risk * targetR : na
snapbackOk = direction == "long" ? longSnapback : direction == "short" ? shortSnapback : false
tradeWord = direction == "long" ? "BUY" : direction == "short" ? "SELL" : "TRADE"
waitReason = not notTooEarly ? "Original Brutus signal fired, but it is still too early in the live candle." : not snapbackOk ? "Original Brutus signal fired, but snapback is not clean yet." : "Original Brutus signal fired, but the playbook still says wait."
skipReason = not inSession ? "Original Brutus signal fired outside the active session." : not modeReady ? "Original Brutus signal fired, but this mode waits for bar close." : "Original Brutus signal fired, but the playbook says skip."
reason = signalConflict ? "Both original Brutus long and short signals fired on the same candle. Skip because direction is unclear." : action == "ENTER" ? "Original Brutus signal fired and price started snapping back." : action == "WAIT" ? waitReason : action == "DO_NOT_HOLD" ? "Original Brutus signal fired, but price is still pushing through the band." : skipReason
plainAction = action == "ENTER" ? "PAPER " + tradeWord + " NOW. Skip if you are late." : action == "WAIT" ? "NO TRADE YET. Watch only." : action == "DO_NOT_HOLD" ? "NO TRADE. Do not fight this move." : "SKIP. No trade."
entryJson = na(entry) ? "null" : str.tostring(entry)
stopJson = na(stop) ? "null" : str.tostring(stop)
targetJson = na(target) ? "null" : str.tostring(target)

plotshape(showOriginalSignals and rawLongCondition, title="Original Triangle Long Match", location=location.belowbar, color=color.new(color.gray, 5), style=shape.triangleup, size=size.tiny, text="ORIG")
plotshape(showOriginalSignals and rawShortCondition, title="Original Triangle Short Match", location=location.abovebar, color=color.new(color.gray, 5), style=shape.triangledown, size=size.tiny, text="ORIG")
plotshape(showLiveLatchSignals and rawLongSignal and not rawLongCondition, title="Live Latched Long Touch", location=location.belowbar, color=color.new(color.aqua, 15), style=shape.triangleup, size=size.tiny, text="LIVE")
plotshape(showLiveLatchSignals and rawShortSignal and not rawShortCondition, title="Live Latched Short Touch", location=location.abovebar, color=color.new(color.aqua, 15), style=shape.triangledown, size=size.tiny, text="LIVE")
plotshape(longEnter, title="Long ENTER", location=location.belowbar, color=color.lime, style=shape.triangleup, text="ENTER")
plotshape(shortEnter, title="Short ENTER", location=location.abovebar, color=color.red, style=shape.triangledown, text="ENTER")
plotshape(longWatch, title="Long WAIT", location=location.belowbar, color=color.new(color.lime, 45), style=shape.circle, text="WAIT")
plotshape(shortWatch, title="Short WAIT", location=location.abovebar, color=color.new(color.red, 45), style=shape.circle, text="WAIT")
plotshape(doNotHold and direction == "long", title="Long DO NOT HOLD", location=location.belowbar, color=color.orange, style=shape.xcross, text="NO")
plotshape(doNotHold and direction == "short", title="Short DO NOT HOLD", location=location.abovebar, color=color.orange, style=shape.xcross, text="NO")
plotshape(skipSignal and direction == "long", title="Long SKIP", location=location.belowbar, color=color.new(color.gray, 15), style=shape.square, text="SKIP")
plotshape(skipSignal and direction == "short", title="Short SKIP", location=location.abovebar, color=color.new(color.gray, 15), style=shape.square, text="SKIP")
plotshape(conflictSkip, title="Conflict SKIP", location=location.top, color=color.yellow, style=shape.diamond, text="BOTH")

firstTouchNewSide = signalMode == "First touch" and barstate.isrealtime and ((rawLongSignal and not alertedLongThisBar) or (rawShortSignal and not alertedShortThisBar))
firstTouchDecisionChanged = signalMode == "First touch" and barstate.isrealtime and ((rawLongSignal and action != "NO_SIGNAL" and action != lastLongAlertAction) or (rawShortSignal and action != "NO_SIGNAL" and action != lastShortAlertAction))
confirmedCloseEvent = signalMode == "Confirmed close" and rawSignal and barstate.isconfirmed
decisionEvent = confirmedCloseEvent ? "confirmed_close" : firstTouchNewSide ? "first_touch" : firstTouchDecisionChanged ? "decision_change" : "none"
previousAction = direction == "long" ? lastLongAlertAction : direction == "short" ? lastShortAlertAction : signalConflict ? "both" : ""
shouldAlert = modeReady and (not liveAlertsOnly or barstate.isrealtime) and (firstTouchNewSide or firstTouchDecisionChanged or confirmedCloseEvent)
rawAuditText = rawSignal ? "Raw " + action + " | alert " + (shouldAlert ? "will fire" : "held") : "No raw Brutus signal now"
alertDirection = signalConflict ? (rawLongSignal ? "long" : "short") : direction
confirmText = barstate.isconfirmed ? "confirmed close" : "open candle"
modeText = mode + " | " + confirmText
depthText = "Side " + direction + " | depth " + str.tostring(touchDepthRatio, "#.####") + " of band"

var table auditPanel = table.new(position.top_right, 1, 8, border_width=1)
if showAuditPanel and barstate.islast
    table.cell(auditPanel, 0, 0, "Brutus Playbook raw-parity-v10", text_color=color.white, bgcolor=color.new(color.black, 0))
    table.cell(auditPanel, 0, 1, "Locked: length 9, high/low bands, StdDev 2", text_color=color.white, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 2, rawAuditText, text_color=rawSignal ? color.aqua : color.silver, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 3, modeText, text_color=barstate.isconfirmed ? color.lime : color.yellow, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 4, depthText, text_color=rawSignal ? color.aqua : color.silver, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 5, "Check ORIG markers against old triangles first", text_color=color.yellow, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 6, "Open-bar ORIG can change until candle close", text_color=color.yellow, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 7, "Paper evidence only - not live-trade approval", text_color=color.orange, bgcolor=color.new(color.black, 15))
message = "{\\"strategy\\":\\"brutus_playbook_v1\\",\\"playbookVersion\\":\\"raw-parity-v10\\",\\"rawSignal\\":true,\\"decisionEvent\\":\\"" + decisionEvent + "\\",\\"previousAction\\":\\"" + previousAction + "\\",\\"rawLongSignal\\":" + str.tostring(rawLongSignal) + ",\\"rawShortSignal\\":" + str.tostring(rawShortSignal) + ",\\"rawLongCondition\\":" + str.tostring(rawLongCondition) + ",\\"rawShortCondition\\":" + str.tostring(rawShortCondition) + ",\\"newLongTouch\\":" + str.tostring(newLongTouch) + ",\\"newShortTouch\\":" + str.tostring(newShortTouch) + ",\\"signalConflict\\":" + str.tostring(signalConflict) + ",\\"signalDirection\\":\\"" + direction + "\\",\\"mode\\":\\"" + mode + "\\",\\"confirmed\\":" + str.tostring(barstate.isconfirmed) + ",\\"modeReady\\":" + str.tostring(modeReady) + ",\\"inSession\\":" + str.tostring(inSession) + ",\\"minutesIntoBar\\":" + str.tostring(minutesIntoBar) + ",\\"notTooEarly\\":" + str.tostring(notTooEarly) + ",\\"longSnapback\\":" + str.tostring(longSnapback) + ",\\"shortSnapback\\":" + str.tostring(shortSnapback) + ",\\"longPushThrough\\":" + str.tostring(longPushThrough) + ",\\"shortPushThrough\\":" + str.tostring(shortPushThrough) + ",\\"symbol\\":\\"" + syminfo.tickerid + "\\",\\"timeframe\\":\\"" + timeframe.period + "\\",\\"action\\":\\"" + action + "\\",\\"plainAction\\":\\"" + plainAction + "\\",\\"direction\\":\\"" + alertDirection + "\\",\\"time\\":" + str.tostring(time) + ",\\"timestamp\\":" + str.tostring(time) + ",\\"candleTime\\":" + str.tostring(time) + ",\\"alertTime\\":" + str.tostring(timenow) + ",\\"open\\":" + str.tostring(open) + ",\\"high\\":" + str.tostring(high) + ",\\"low\\":" + str.tostring(low) + ",\\"close\\":" + str.tostring(close) + ",\\"upper\\":" + str.tostring(upper) + ",\\"lower\\":" + str.tostring(lower) + ",\\"bandWidth\\":" + str.tostring(bandWidth) + ",\\"touchDepth\\":" + str.tostring(touchDepth) + ",\\"touchDepthRatio\\":" + str.tostring(touchDepthRatio) + ",\\"entry\\":" + entryJson + ",\\"stop\\":" + stopJson + ",\\"target\\":" + targetJson + ",\\"length\\":" + str.tostring(length) + ",\\"upperSource\\":\\"high\\",\\"lowerSource\\":\\"low\\",\\"stdDev\\":" + str.tostring(mult) + ",\\"reason\\":\\"" + reason + "\\"}"

if shouldAlert
    alert(message, alert.freq_all)
    if rawLongSignal
        alertedLongThisBar := true
        lastLongAlertAction := action
    if rawShortSignal
        alertedShortThisBar := true
        lastShortAlertAction := action

// These named alertconditions are labels only. The paper evidence loop depends on the alert(message) JSON above, so TradingView alerts should use "Any alert() function call".
alertcondition(longEnter or shortEnter, title="Brutus ENTER", message="Wrong alert type for evidence loop. Use Any alert() function call for full JSON.")
alertcondition(longWatch or shortWatch, title="Brutus WAIT", message="Wrong alert type for evidence loop. Use Any alert() function call for full JSON.")
alertcondition(doNotHold, title="Brutus DO NOT HOLD", message="Wrong alert type for evidence loop. Use Any alert() function call for full JSON.")
alertcondition(skipSignal, title="Brutus SKIP", message="Wrong alert type for evidence loop. Use Any alert() function call for full JSON.")
alertcondition(rawLongSignal, title="Raw Brutus Long", message="Wrong alert type for evidence loop. Use Any alert() function call for full JSON.")
alertcondition(rawShortSignal, title="Raw Brutus Short", message="Wrong alert type for evidence loop. Use Any alert() function call for full JSON.")
`;
}

function matchAlertsToDecisions(
  alerts: TvAlert[],
  decisions: TradeDecision[],
): AlertDecisionMatch[] {
  const byBucket = new Map<string, TradeDecision[]>();
  for (const decision of decisions) {
    const key = [
      normalizeBrokerSymbol(decision.symbol),
      normalizeTimeframe(decision.timeframe),
      decision.direction,
      decision.touch.bucketStart,
    ].join("|");
    const list = byBucket.get(key) ?? [];
    list.push(decision);
    byBucket.set(key, list);
  }

  return alerts.map((alert) => {
    const key = [
      normalizeBrokerSymbol(alert.symbol),
      normalizeTimeframe(alert.timeframe),
      alert.direction,
      alert.candleTime,
    ].join("|");
    const matches = byBucket.get(key) ?? [];
    const decision = matches.sort(
      (a, b) =>
        ({ ENTER: 4, WAIT: 3, SKIP: 2, DO_NOT_HOLD: 1 })[b.decision] -
          { ENTER: 4, WAIT: 3, SKIP: 2, DO_NOT_HOLD: 1 }[a.decision] ||
        b.confidence - a.confidence,
    )[0];

    if (!decision) {
      return {
        alert,
        status: "NO DATA",
        note: "No matching intrabar decision. Usually this alert is newer than the exported candle batch.",
        agreement: alert.action ? "PINE ONLY" : "NO DATA",
      };
    }

    return {
      alert,
      decision,
      status: decision.decision,
      note: decision.reason,
      agreement:
        alert.action == null
          ? "NO DATA"
          : alert.action === decision.decision
            ? "MATCH"
            : "DIFFERENT",
    };
  });
}

function DecisionPill({ decision }: { decision: Decision }) {
  const colors: Record<Decision, string> = {
    ENTER: "border-lime-400 bg-lime-400/10 text-lime-300",
    WAIT: "border-amber-300 bg-amber-300/10 text-amber-200",
    SKIP: "border-red-500 bg-red-500/10 text-red-300",
    DO_NOT_HOLD: "border-fuchsia-400 bg-fuchsia-400/10 text-fuchsia-200",
  };
  return (
    <span
      className={`border px-3 py-1 font-display text-xl font-bold ${colors[decision]}`}
    >
      {displayDecision(decision)}
    </span>
  );
}

function boolWord(value?: boolean) {
  if (value == null) return "?";
  return value ? "yes" : "no";
}

function sideGateValue(
  alert: TvAlert,
  longValue?: boolean,
  shortValue?: boolean,
) {
  const direction = alert.signalDirection ?? alert.direction;
  if (direction === "long") return longValue;
  if (direction === "short") return shortValue;
  return longValue ?? shortValue;
}

function alertGateSummary(alert: TvAlert) {
  const original = sideGateValue(
    alert,
    alert.rawLongCondition,
    alert.rawShortCondition,
  );
  const liveTouch = sideGateValue(alert, alert.rawLongSignal, alert.rawShortSignal);
  const snapback = sideGateValue(alert, alert.longSnapback, alert.shortSnapback);
  const push = sideGateValue(alert, alert.longPushThrough, alert.shortPushThrough);
  const minutes =
    alert.minutesIntoBar != null && Number.isFinite(alert.minutesIntoBar)
      ? `${alert.minutesIntoBar.toFixed(1)}m`
      : "?m";
  return `original ${boolWord(original)} | live ${boolWord(liveTouch)} | session ${boolWord(alert.inSession)} | time ${boolWord(alert.notTooEarly)} (${minutes}) | snapback ${boolWord(snapback)} | push-through ${boolWord(push)}`;
}

function VerdictPill({ verdict }: { verdict: PlaybookVerdict }) {
  const colors: Record<PlaybookVerdict, string> = {
    TEST: "border-lime-400 bg-lime-400/10 text-lime-300",
    WATCH: "border-amber-300 bg-amber-300/10 text-amber-200",
    AVOID: "border-red-500 bg-red-500/10 text-red-300",
    "TOO SMALL": "border-border bg-background text-muted-foreground",
  };
  return (
    <span className={`border px-2 py-1 font-mono text-xs ${colors[verdict]}`}>
      {verdict}
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
            Hold rule
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
      {item.touch.momentum && (
        <div className="mt-4 border border-border bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            RSI context
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {item.touch.momentum.plainRead ?? "RSI context not exported."}
          </p>
        </div>
      )}
    </article>
  );
}

export default function BrutusTradeDeskPage() {
  const [report, setReport] = useState<IntrabarReport | null>(() =>
    loadReport(),
  );
  const [alerts, setAlerts] = useState<TvAlert[]>(() => loadAlerts());
  const [paperOutcomes, setPaperOutcomes] = useState<
    Record<string, PaperOutcome>
  >(() => loadPaperOutcomes());
  const [alertImportResult, setAlertImportResult] =
    useState<AlertImportResult | null>(null);
  const [error, setError] = useState("");

  const decisions = useMemo(() => {
    if (!report?.latestTouches?.length) return [];
    return report.latestTouches
      .map((touch) => scoreTouch(touch, report))
      .sort((a, b) => {
        const rank: Record<Decision, number> = {
          ENTER: 0,
          WAIT: 1,
          DO_NOT_HOLD: 2,
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
      doNotHold: decisions.filter((item) => item.decision === "DO_NOT_HOLD")
        .length,
    }),
    [decisions],
  );

  const playbook = useMemo(
    () => buildPlaybook(report?.latestTouches ?? []),
    [report],
  );

  const testablePlaybook = useMemo(
    () => playbook.filter((row) => row.verdict === "TEST").slice(0, 12),
    [playbook],
  );

  const alertMatches = useMemo(
    () => matchAlertsToDecisions(alerts, decisions),
    [alerts, decisions],
  );

  const latestAlertMatches = useMemo(
    () =>
      alertMatches.filter((item) => isLatestPlaybookAlert(item.alert)),
    [alertMatches],
  );

  const alertVersionCounts = useMemo(
    () => ({
      current: alertMatches.filter((item) =>
        isLatestPlaybookAlert(item.alert),
      ).length,
      old: alertMatches.filter(
        (item) =>
          isPlaybookAlert(item.alert) && !isLatestPlaybookAlert(item.alert),
      ).length,
      legacy: alertMatches.filter((item) => !isPlaybookAlert(item.alert))
        .length,
      contractIssues: alertMatches.filter(
        (item) => playbookContractIssues(item.alert).length > 0,
      ).length,
    }),
    [alertMatches],
  );

  const alertCounts = useMemo(
    () => ({
      enter: latestAlertMatches.filter((item) => item.status === "ENTER")
        .length,
      wait: latestAlertMatches.filter((item) => item.status === "WAIT").length,
      skip: latestAlertMatches.filter((item) => item.status === "SKIP").length,
      doNotHold: latestAlertMatches.filter(
        (item) => item.status === "DO_NOT_HOLD",
      )
        .length,
      noData: latestAlertMatches.filter((item) => item.status === "NO DATA")
        .length,
    }),
    [latestAlertMatches],
  );

  const paperOutcomeCounts = useMemo(() => {
    const countsByDecision = {
      ENTER: { unreviewed: 0, paid: 0, failed: 0, missed: 0 },
      WAIT: { unreviewed: 0, paid: 0, failed: 0, missed: 0 },
      SKIP: { unreviewed: 0, paid: 0, failed: 0, missed: 0 },
      DO_NOT_HOLD: { unreviewed: 0, paid: 0, failed: 0, missed: 0 },
      "NO DATA": { unreviewed: 0, paid: 0, failed: 0, missed: 0 },
    } satisfies Record<Decision | "NO DATA", Record<PaperOutcome, number>>;
    const totals = { unreviewed: 0, paid: 0, failed: 0, missed: 0 };

    for (const item of latestAlertMatches) {
      const outcome =
        paperOutcomes[paperOutcomeKey(item.alert)] ?? "unreviewed";
      totals[outcome] += 1;
      countsByDecision[item.status][outcome] += 1;
    }

    const reviewed = totals.paid + totals.failed + totals.missed;
    return {
      ...totals,
      reviewed,
      byDecision: countsByDecision,
    };
  }, [latestAlertMatches, paperOutcomes]);

  const paperOutcomeRead = useMemo(() => {
    if (!latestAlertMatches.length) {
      return "No current Playbook alerts imported yet.";
    }
    if (paperOutcomeCounts.reviewed < 10) {
      return "Mark at least 10 current alerts before changing the rule.";
    }
    const enter = paperOutcomeCounts.byDecision.ENTER;
    const wait = paperOutcomeCounts.byDecision.WAIT;
    if (enter.failed > enter.paid && enter.failed >= 3) {
      return "Tighten ENTER. Marked ENTER rows are failing too often.";
    }
    if (wait.missed >= 3 && wait.missed > enter.paid) {
      return "Test a looser ENTER rule. WAIT rows are being marked as missed opportunities.";
    }
    if (enter.paid >= 5 && enter.paid > enter.failed) {
      return "Current ENTER rule is worth continued paper testing. Do not use real money yet.";
    }
    return "No rule change yet. Keep marking outcomes until one pattern is obvious.";
  }, [latestAlertMatches.length, paperOutcomeCounts]);

  const agreementCounts = useMemo(
    () => ({
      match: latestAlertMatches.filter((item) => item.agreement === "MATCH")
        .length,
      different: latestAlertMatches.filter(
        (item) => item.agreement === "DIFFERENT",
      )
        .length,
      pineOnly: latestAlertMatches.filter(
        (item) => item.agreement === "PINE ONLY",
      )
        .length,
      noData: latestAlertMatches.filter((item) => item.agreement === "NO DATA")
        .length,
    }),
    [latestAlertMatches],
  );

  const alertSummaryRows = useMemo(() => {
    const groups = new Map<string, AlertGroupRow>();
    for (const item of latestAlertMatches) {
      const symbol = item.alert.symbol ?? "unknown";
      const timeframe = normalizeTimeframe(item.alert.timeframe) ?? "n/a";
      const action = item.alert.action ?? item.status;
      const key = [symbol, timeframe, action].join("|");
      const current =
        groups.get(key) ??
        ({
          key,
          symbol,
          timeframe,
          action,
          count: 0,
          match: 0,
          different: 0,
          pineOnly: 0,
          noData: 0,
          paid: 0,
          failed: 0,
          missed: 0,
          reviewed: 0,
          latestAlertTime: 0,
        } satisfies AlertGroupRow);
      current.count += 1;
      current.match += item.agreement === "MATCH" ? 1 : 0;
      current.different += item.agreement === "DIFFERENT" ? 1 : 0;
      current.pineOnly += item.agreement === "PINE ONLY" ? 1 : 0;
      current.noData += item.agreement === "NO DATA" ? 1 : 0;
      const outcome =
        paperOutcomes[paperOutcomeKey(item.alert)] ?? "unreviewed";
      current.paid += outcome === "paid" ? 1 : 0;
      current.failed += outcome === "failed" ? 1 : 0;
      current.missed += outcome === "missed" ? 1 : 0;
      current.reviewed += outcome !== "unreviewed" ? 1 : 0;
      const alertTime =
        typeof item.alert.alertTime === "number"
          ? item.alert.alertTime
          : item.alert.candleTime ?? 0;
      current.latestAlertTime = Math.max(current.latestAlertTime, alertTime);
      groups.set(key, current);
    }
    return [...groups.values()].sort(
      (a, b) =>
        b.count - a.count ||
        b.match - a.match ||
        b.reviewed - a.reviewed ||
        b.latestAlertTime - a.latestAlertTime,
    );
  }, [latestAlertMatches, paperOutcomes]);

  const paperReviewQueue = useMemo(() => {
    const withOutcome = latestAlertMatches.map((item) => ({
      item,
      outcome: paperOutcomes[paperOutcomeKey(item.alert)] ?? "unreviewed",
    }));
    return [
      {
        title: "Failed ENTER rows",
        tone: "text-red-300",
        why: "If these really failed on TradingView, ENTER is too loose.",
        rows: withOutcome
          .filter(
            ({ item, outcome }) =>
              item.status === "ENTER" && outcome === "failed",
          )
          .slice(0, 5),
      },
      {
        title: "WAIT rows that paid",
        tone: "text-amber-200",
        why: "If these keep working, ENTER is too strict.",
        rows: withOutcome
          .filter(
            ({ item, outcome }) =>
              item.status === "WAIT" && outcome === "missed",
          )
          .slice(0, 5),
      },
      {
        title: "Unreviewed ENTER rows",
        tone: "text-lime-300",
        why: "These are the next paper-trade rows to judge first.",
        rows: withOutcome
          .filter(
            ({ item, outcome }) =>
              item.status === "ENTER" && outcome === "unreviewed",
          )
          .slice(0, 5),
      },
      {
        title: "DO NOT HOLD rows that paid",
        tone: "text-fuchsia-200",
        why: "If these paid, the trap filter may be too harsh.",
        rows: withOutcome
          .filter(
            ({ item, outcome }) =>
              item.status === "DO_NOT_HOLD" && outcome === "paid",
          )
          .slice(0, 5),
      },
    ];
  }, [latestAlertMatches, paperOutcomes]);

  const alertReviewInstruction = useMemo(() => {
    if (!alertMatches.length) {
      return "Import the latest TradingView Playbook alert CSV. Do not judge live alerts from screenshots alone.";
    }
    if (!latestAlertMatches.length) {
      return "This file has no current raw-parity-v10 Playbook alerts. Keep it as history, but do not use it for this evidence loop.";
    }
    if (alertVersionCounts.contractIssues > 0) {
      return "Some current Playbook alerts failed the locked-parameter check. Re-export the Pine script before trusting this batch.";
    }
    if (agreementCounts.different > 0) {
      return "Stop and review DIFFERENT rows first. Pine and the app disagree, so those rows are not tradeable evidence yet.";
    }
    if (agreementCounts.pineOnly > 0) {
      return "Review PINE ONLY rows in TradingView. They are newer than your imported candle batch, so the app cannot score them yet.";
    }
    if (paperOutcomeCounts.byDecision.ENTER.failed > 0) {
      return "Replay failed ENTER rows first. If they really failed on TradingView, tighten the rule before paper-trading more.";
    }
    if (paperOutcomeCounts.byDecision.WAIT.missed > 0) {
      return "Review WAIT rows marked Wait paid. If these keep working, the ENTER rule is too strict.";
    }
    if (alertCounts.enter > 0) {
      return "Paper-review ENTER rows next. The question is simple: did this work if taken immediately, or was it already too late?";
    }
    if (alertCounts.wait > 0) {
      return "Review WAIT rows that still paid. If too many WAIT rows work, the entry rule is too strict.";
    }
    return "No entry evidence yet. Keep collecting alerts; do not force a trade from this batch.";
  }, [
    agreementCounts,
    alertCounts,
    alertMatches.length,
    alertVersionCounts.contractIssues,
    paperOutcomeCounts,
    latestAlertMatches.length,
  ]);

  function markPaperOutcome(alert: TvAlert, outcome: PaperOutcome) {
    const key = paperOutcomeKey(alert);
    setPaperOutcomes((current) => {
      const next = { ...current };
      if (outcome === "unreviewed") delete next[key];
      else next[key] = outcome;
      savePaperOutcomes(next);
      return next;
    });
  }

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

  async function importAlerts(files: FileList | null | undefined) {
    const selectedFiles = [...(files ?? [])];
    if (!selectedFiles.length) return;
    try {
      const parsed = (
        await Promise.all(
          selectedFiles.map(async (file) => parseAlertLog(await file.text())),
        )
      ).flat();
      if (!parsed.length) {
        throw new Error(
          "No Brutus TradingView alerts found. Upload the TradingView alerts CSV or JSON export.",
        );
      }
      const before = new Set(alerts.map((alert) => alert.id));
      const merged = mergeAlerts(alerts, parsed);
      const after = new Set(merged.map((alert) => alert.id));
      const added = [...after].filter((id) => !before.has(id)).length;
      const duplicates = Math.max(0, parsed.length - added);
      const result: AlertImportResult = {
        files: selectedFiles.length,
        parsed: parsed.length,
        added,
        duplicates,
        current: parsed.filter(isLatestPlaybookAlert).length,
        old: parsed.filter(
          (alert) => isPlaybookAlert(alert) && !isLatestPlaybookAlert(alert),
        ).length,
        legacy: parsed.filter((alert) => !isPlaybookAlert(alert)).length,
        contractIssues: parsed.filter(
          (alert) => playbookContractIssues(alert).length > 0,
        ).length,
      };
      setAlerts(merged);
      saveAlerts(merged);
      setAlertImportResult(result);
      setError("");
    } catch (err) {
      setAlertImportResult(null);
      setError(
        err instanceof Error ? err.message : "Could not read alert file.",
      );
    }
  }

  function clearAlertEvidence() {
    setAlerts([]);
    clearSavedAlerts();
    setAlertImportResult(null);
  }

  return (
    <div className="space-y-4 p-6" data-ocid="brutus.trade-desk.page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Brutus Trade Desk</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            One job: turn Brutus research into plain decisions. This is not an
            auto-trader. It tells you ENTER, WAIT, SKIP, or DO NOT HOLD using
            the current draft rule.
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
          <label className="inline-flex cursor-pointer items-center gap-2 border border-border bg-card px-4 py-2 font-mono text-xs hover:border-primary">
            <Radio className="h-4 w-4" />
            Import Alert Logs
            <input
              accept=".csv,.json,.jsonl,.txt"
              className="hidden"
              multiple
              onChange={(event) => importAlerts(event.target.files)}
              type="file"
            />
          </label>
          <button
            className="inline-flex items-center gap-2 border border-border bg-card px-4 py-2 font-mono text-xs hover:border-destructive disabled:opacity-40"
            disabled={!alerts.length}
            onClick={clearAlertEvidence}
            type="button"
          >
            Clear Alerts
          </button>
          <button
            className="inline-flex items-center gap-2 border border-cyan-400/70 bg-cyan-400/10 px-4 py-2 font-mono text-xs text-cyan-200 hover:border-cyan-300"
            onClick={() =>
              exportText(
                "brutus-playbook-alerts.pine",
                generateBrutusPineScript(testablePlaybook),
                "text/plain",
              )
            }
            type="button"
          >
            Export Brutus Playbook Pine
          </button>
          <button
            className="inline-flex items-center gap-2 border border-border bg-card px-4 py-2 font-mono text-xs hover:border-primary disabled:opacity-40"
            disabled={!decisions.length}
            onClick={() =>
              exportJson("ict-brutus-trade-desk.json", {
                generatedAt: new Date().toISOString(),
                rule: {
                  plain:
                    "Import intrabar data, then TradingView alerts. Only paper-review ENTER rows when Pine and the app agree. Treat stale, DIFFERENT, or PINE ONLY rows as review items, not trade calls.",
                  pointValue: POINT_VALUE,
                },
                sourceTotals: report?.totals,
                counts,
                alertVersionCounts,
                alertCounts,
                paperOutcomeCounts,
                paperOutcomeRead,
                paperOutcomes,
                alertSummaryRows,
                latestAlertMatches,
                alertMatches,
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

      {alertImportResult && !error && (
        <section className="grid gap-2 border border-cyan-500/40 bg-cyan-500/5 p-3 font-mono text-xs md:grid-cols-4">
          <span>
            Alert files:{" "}
            <strong className="text-foreground">
              {alertImportResult.files}
            </strong>
          </span>
          <span>
            Added / duplicate:{" "}
            <strong className="text-lime-300">
              {alertImportResult.added}
            </strong>{" "}
            /{" "}
            <strong className="text-muted-foreground">
              {alertImportResult.duplicates}
            </strong>
          </span>
          <span>
            Current / old / legacy:{" "}
            <strong className="text-cyan-200">
              {alertImportResult.current}
            </strong>{" "}
            /{" "}
            <strong className="text-amber-200">
              {alertImportResult.old}
            </strong>{" "}
            /{" "}
            <strong className="text-muted-foreground">
              {alertImportResult.legacy}
            </strong>
          </span>
          <span
            className={
              alertImportResult.contractIssues > 0
                ? "text-red-300"
                : "text-muted-foreground"
            }
          >
            Settings issues: {alertImportResult.contractIssues}
          </span>
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
            Do not hold
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-fuchsia-200">
            {counts.doNotHold}
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

      <section className="grid gap-3 border border-border bg-card p-4 md:grid-cols-3">
        <div>
          <p className="font-display text-sm font-bold">Use This In Order</p>
          <p className="mt-2 text-sm text-muted-foreground">
            First import the Brutus Intrabar JSON. Then import the newest
            TradingView alert CSV. Then review Live Alert Match from top to
            bottom.
          </p>
        </div>
        <div>
          <p className="font-display text-sm font-bold">What Counts</p>
          <p className="mt-2 text-sm text-muted-foreground">
            ENTER only means paper-trade candidate. MATCH means Pine and app
            agree. DIFFERENT or PINE ONLY means pause and verify before trusting
            the row.
          </p>
        </div>
        <div>
          <p className="font-display text-sm font-bold">What To Ignore</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Do not trade from old screenshots, unmatched alerts, or rows where
            the candle batch is stale. Those are research clues, not live
            decisions.
          </p>
        </div>
      </section>

      <section className="border border-cyan-500/40 bg-cyan-500/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-sm font-bold">
              TradingView Setup Checklist
            </p>
            <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
              Use this every time you refresh the Pine script. The goal is raw
              triangle parity first, then paper alerts. Do not trade from it
              until the paper evidence says the labels deserve trust.
            </p>
          </div>
          <span className="border border-cyan-400/60 px-2 py-1 font-mono text-xs text-cyan-200">
            paper workflow
          </span>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
          <p>
            <span className="font-mono text-cyan-200">1. Export Pine.</span>{" "}
            Use Export Brutus Playbook Pine and paste it into TradingView.
          </p>
          <p>
            <span className="font-mono text-cyan-200">2. Check ORIG.</span>{" "}
            Grey ORIG markers should line up with the old Brutus triangles.
            Keep LIVE markers on to catch open-candle first touches.
          </p>
          <p>
            <span className="font-mono text-cyan-200">3. Create alert.</span>{" "}
            Choose Any alert() function call so the JSON payload is captured.
            Do not choose the named ENTER/WAIT/SKIP conditions.
          </p>
          <p>
            <span className="font-mono text-cyan-200">4. Import logs.</span>{" "}
            Bring the TradingView alert CSV back here and mark paper outcomes.
          </p>
        </div>
      </section>

      {report && (
        <section className="space-y-3 border border-primary/40 bg-primary/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold">
                Brutus Trade Playbook
              </h2>
              <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
                This is the matrix summary. It converts the imported Brutus
                touches into plain rule candidates for TradingView alerts. It is
                not looking for one perfect setup; it is separating testable
                conditions from noisy ones.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="border border-border bg-background px-4 py-2 font-mono text-xs hover:border-primary"
                onClick={() =>
                  exportText(
                    "brutus-playbook-alerts.pine",
                    generateBrutusPineScript(testablePlaybook),
                    "text/plain",
                  )
                }
                type="button"
              >
                Export Brutus Playbook Pine
              </button>
              <button
                className="border border-border bg-background px-4 py-2 font-mono text-xs hover:border-primary"
                onClick={() =>
                  exportJson("ict-brutus-playbook.json", {
                    generatedAt: new Date().toISOString(),
                    sourceTotals: report.totals,
                    testable: testablePlaybook,
                    matrix: playbook,
                  })
                }
                type="button"
              >
                Export Playbook
              </button>
            </div>
          </div>

          <div className="grid gap-2 border border-border bg-background p-3 font-mono text-xs md:grid-cols-4">
            <div>
              <p className="font-bold text-muted-foreground">ORIG</p>
              <p className="mt-1 text-muted-foreground">
                Old Brutus triangle match. Use this only to verify parity.
              </p>
            </div>
            <div>
              <p className="font-bold text-amber-200">WAIT</p>
              <p className="mt-1 text-muted-foreground">
                No trade yet. Watch only; wait for an ENTER alert.
              </p>
            </div>
            <div>
              <p className="font-bold text-lime-300">ENTER</p>
              <p className="mt-1 text-muted-foreground">
                Paper trade candidate. Take it immediately or skip it.
              </p>
            </div>
            <div>
              <p className="font-bold text-red-300">SKIP / NO</p>
              <p className="mt-1 text-muted-foreground">
                No trade. The move is noisy, late, or pushing through.
              </p>
            </div>
          </div>

          <div className="grid gap-3 border border-cyan-500/40 bg-cyan-500/5 p-4 text-sm md:grid-cols-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
                1. Export
              </p>
              <p className="mt-1 text-muted-foreground">
                Download the Pine script from this page. It starts from the
                original Brutus triangle logic with length 9, upper high,
                lower low, and standard deviation 2 locked in, then adds a
                paper-test decision layer. Use the button named Export Brutus
                Playbook Pine. First check that ORIG markers match your old
                triangles. If they do not, stop and fix parity before reading
                ENTER/WAIT.
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
                2. Paste in TradingView
              </p>
              <p className="mt-1 text-muted-foreground">
                Add it to the exact Alchemy chart, such as DJ30.R, USTEC.R,
                US500.R, JPN225.R, or RUS2000.R.
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
                3. Create alert
              </p>
              <p className="mt-1 text-muted-foreground">
                Use Any alert() function call. First touch is live paper
                evidence, not perfect historical replay. The v10 script alerts
                again if that same live candle changes from WAIT to ENTER or DO
                NOT HOLD. Confirmed close waits for the candle to close.
                Because your original triangle formula uses candle color,
                open-bar ORIG markers can change until close. Do not select the
                named ENTER, WAIT, SKIP, or Raw Brutus alertconditions when
                creating the evidence-loop alert; those labels do not carry the
                full JSON packet.
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
                4. Paper-test
              </p>
              <p className="mt-1 text-muted-foreground">
                Import alert logs back into this Trade Desk. Trust the alert
                JSON first, then review ENTER, WAIT, SKIP, and DO NOT HOLD rows
                before risking real money.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="border border-border bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Testable rules
              </p>
              <p className="mt-2 font-display text-2xl font-bold text-lime-300">
                {playbook.filter((row) => row.verdict === "TEST").length}
              </p>
            </div>
            <div className="border border-border bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Watch only
              </p>
              <p className="mt-2 font-display text-2xl font-bold text-amber-200">
                {playbook.filter((row) => row.verdict === "WATCH").length}
              </p>
            </div>
            <div className="border border-border bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Avoid / too small
              </p>
              <p className="mt-2 font-display text-2xl font-bold text-red-300">
                {
                  playbook.filter(
                    (row) =>
                      row.verdict === "AVOID" || row.verdict === "TOO SMALL",
                  ).length
                }
              </p>
            </div>
          </div>

          {testablePlaybook.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse font-mono text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Verdict</th>
                    <th className="px-2 py-2">Family</th>
                    <th className="px-2 py-2">Rule candidate</th>
                    <th className="px-2 py-2">Sample</th>
                    <th className="px-2 py-2">15m R</th>
                    <th className="px-2 py-2">60m R</th>
                    <th className="px-2 py-2">Stop rate</th>
                    <th className="px-2 py-2">Plain rule</th>
                  </tr>
                </thead>
                <tbody>
                  {testablePlaybook.map((row) => (
                    <tr className="border-b border-border/60" key={row.id}>
                      <td className="px-2 py-2">
                        <VerdictPill verdict={row.verdict} />
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {row.family}
                      </td>
                      <td className="px-2 py-2 text-foreground">{row.label}</td>
                      <td className="px-2 py-2">{row.trades}</td>
                      <td className="px-2 py-2">{row.avgR15.toFixed(2)}</td>
                      <td className="px-2 py-2">{row.avgR60.toFixed(2)}</td>
                      <td className="px-2 py-2">
                        {(row.stopRate * 100).toFixed(1)}%
                      </td>
                      <td className="max-w-md whitespace-normal px-2 py-2 text-muted-foreground">
                        {row.plainRule}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-border bg-card p-4 text-sm text-muted-foreground">
              No matrix bucket is clean enough to promote yet. That means the
              correct output is restraint, not a forced trade rule.
            </div>
          )}

          <div className="border border-border bg-card p-4">
            <h3 className="font-display text-sm font-bold uppercase tracking-widest">
              Current plain-language takeaway
            </h3>
            <p className="mt-2 text-sm text-foreground">
              Use this research to build TradingView alerts around TEST rows
              only. A live alert should say ENTER only when the symbol,
              timeframe, session, candle timing, pierce depth, and snapback
              behavior match one of these rows. Everything else should say SKIP
              or WAIT.
            </p>
          </div>
        </section>
      )}

      <section className="border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold">
              Live Alert Match
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your TradingView alert CSV here. Matching uses the correct
              field: the alert candle time equals the decision touch bucket
              start.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-xs">
            <span className="border border-cyan-400/50 px-2 py-1 text-cyan-200">
              CURRENT {alertVersionCounts.current}
            </span>
            <span className="border border-amber-300/50 px-2 py-1 text-amber-200">
              OLD {alertVersionCounts.old}
            </span>
            <span className="border border-border px-2 py-1 text-muted-foreground">
              LEGACY {alertVersionCounts.legacy}
            </span>
            <span className="border border-lime-400/50 px-2 py-1 text-lime-300">
              ENTER {alertCounts.enter}
            </span>
            <span className="border border-amber-300/50 px-2 py-1 text-amber-200">
              WAIT {alertCounts.wait}
            </span>
            <span className="border border-red-500/50 px-2 py-1 text-red-300">
              SKIP {alertCounts.skip}
            </span>
            <span className="border border-fuchsia-400/50 px-2 py-1 text-fuchsia-200">
              DO NOT HOLD {alertCounts.doNotHold}
            </span>
            <span className="border border-border px-2 py-1 text-muted-foreground">
              NO DATA {alertCounts.noData}
            </span>
            {alertVersionCounts.contractIssues > 0 && (
              <span className="border border-red-500/50 px-2 py-1 text-red-300">
                PARAMETER ISSUE {alertVersionCounts.contractIssues}
              </span>
            )}
          </div>
        </div>
        <div className="mt-3 grid gap-2 border border-border bg-background p-3 text-sm md:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="font-display text-sm font-bold">Next review step</p>
            <p className="mt-1 text-muted-foreground">
              {alertReviewInstruction}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-xs">
            <span className="border border-lime-400/50 px-2 py-1 text-lime-300">
              MATCH {agreementCounts.match}
            </span>
            <span className="border border-amber-300/50 px-2 py-1 text-amber-200">
              DIFFERENT {agreementCounts.different}
            </span>
            <span className="border border-cyan-400/50 px-2 py-1 text-cyan-200">
              PINE ONLY {agreementCounts.pineOnly}
            </span>
            <span className="border border-border px-2 py-1 text-muted-foreground">
              NO DATA {agreementCounts.noData}
            </span>
          </div>
        </div>
        <div className="mt-3 grid gap-3 border border-border bg-background p-3 md:grid-cols-[1.25fr_2fr]">
          <div>
            <p className="font-display text-sm font-bold">
              Paper outcome scoreboard
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {paperOutcomeRead}
            </p>
          </div>
          <div className="grid gap-2 font-mono text-xs sm:grid-cols-4">
            <div className="border border-border p-2">
              <span className="block text-muted-foreground">Marked</span>
              <span className="text-lg text-foreground">
                {paperOutcomeCounts.reviewed}
              </span>
            </div>
            <div className="border border-lime-400/40 p-2">
              <span className="block text-muted-foreground">Paid</span>
              <span className="text-lg text-lime-300">
                {paperOutcomeCounts.paid}
              </span>
            </div>
            <div className="border border-red-500/40 p-2">
              <span className="block text-muted-foreground">Failed</span>
              <span className="text-lg text-red-300">
                {paperOutcomeCounts.failed}
              </span>
            </div>
            <div className="border border-amber-300/40 p-2">
              <span className="block text-muted-foreground">Wait paid</span>
              <span className="text-lg text-amber-200">
                {paperOutcomeCounts.missed}
              </span>
            </div>
          </div>
          <div className="md:col-span-2">
            <p className="font-display text-sm font-bold">How to mark rows</p>
            <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
              <p>
                <span className="font-mono text-lime-300">
                  Paid = ENTER worked.
                </span>{" "}
                Mark this only when an ENTER would have paid if taken right
                away.
              </p>
              <p>
                <span className="font-mono text-red-300">
                  Failed = ENTER failed.
                </span>{" "}
                Mark this when an ENTER kept going against the trade before it
                paid.
              </p>
              <p>
                <span className="font-mono text-amber-200">
                  Wait paid = skipped move worked.
                </span>{" "}
                Mark this when WAIT/SKIP/DO NOT HOLD still would have paid.
              </p>
              <p>
                <span className="font-mono text-foreground">
                  Unreviewed = not checked yet.
                </span>{" "}
                Leave it alone until you replay or inspect it on TradingView.
              </p>
            </div>
          </div>
        </div>
        {paperReviewQueue.some((group) => group.rows.length > 0) && (
          <div className="mt-3 border border-border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-sm font-bold">
                  Paper review queue
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This is where the rule improves: failed ENTERs tighten the
                  rule, paid WAITs loosen it, and unreviewed ENTERs get checked
                  before anything else.
                </p>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                Current Playbook only
              </p>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {paperReviewQueue.map((group) => (
                <div className="border border-border p-3" key={group.title}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p
                        className={`font-mono text-xs font-bold ${group.tone}`}
                      >
                        {group.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {group.why}
                      </p>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {group.rows.length}
                    </span>
                  </div>
                  {group.rows.length ? (
                    <div className="mt-3 space-y-2">
                      {group.rows.map(({ item, outcome }) => (
                        <div
                          className="border border-border/70 bg-card p-2 font-mono text-xs"
                          key={`${group.title}-${item.alert.id}`}
                        >
                          <div className="flex flex-wrap justify-between gap-2">
                            <span>
                              {item.alert.symbol ?? "unknown"}{" "}
                              {item.alert.timeframe ?? "n/a"}{" "}
                              {item.alert.direction ?? "n/a"}
                            </span>
                            <span className={paperOutcomeClass(outcome)}>
                              {paperOutcomeLabel(outcome)}
                            </span>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {fmtDate(
                              typeof item.alert.alertTime === "number"
                                ? item.alert.alertTime
                                : item.alert.candleTime,
                            )}{" "}
                            |{" "}
                            {item.alert.plainAction ??
                              displayDecision(item.status)}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {item.alert.reason ?? item.note}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No rows in this bucket yet.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {alertSummaryRows.length > 0 && (
          <div className="mt-3 border border-border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-sm font-bold">
                  Current Alert Summary
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Current Playbook alerts only, grouped by symbol, timeframe,
                  and Pine action.
                </p>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {alertSummaryRows.length} groups
              </p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse font-mono text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Symbol</th>
                    <th className="px-2 py-2">TF</th>
                    <th className="px-2 py-2">Action</th>
                    <th className="px-2 py-2">Alerts</th>
                    <th className="px-2 py-2">Clean matches</th>
                    <th className="px-2 py-2">Paper result</th>
                    <th className="px-2 py-2">Needs review</th>
                    <th className="px-2 py-2">Latest</th>
                  </tr>
                </thead>
                <tbody>
                  {alertSummaryRows.slice(0, 16).map((row) => (
                    <tr className="border-b border-border/60" key={row.key}>
                      <td className="px-2 py-2">{row.symbol}</td>
                      <td className="px-2 py-2">{row.timeframe}</td>
                      <td className="px-2 py-2">{displayDecision(row.action)}</td>
                      <td className="px-2 py-2">{row.count}</td>
                      <td className="px-2 py-2 text-lime-300">{row.match}</td>
                      <td className="px-2 py-2">
                        <span className="text-lime-300">{row.paid} paid</span>
                        <span className="block text-red-300">
                          {row.failed} failed
                        </span>
                        <span className="block text-amber-200">
                          {row.missed} wait paid
                        </span>
                      </td>
                      <td
                        className={
                          row.different + row.pineOnly + row.noData > 0
                            ? "px-2 py-2 text-amber-200"
                            : "px-2 py-2 text-muted-foreground"
                        }
                      >
                        {row.different + row.pineOnly + row.noData}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {fmtDate(row.latestAlertTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1140px] border-collapse font-mono text-xs">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-2 py-2">Alert</th>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">Symbol</th>
                <th className="px-2 py-2">TF</th>
                <th className="px-2 py-2">Side</th>
                <th className="px-2 py-2">Decision</th>
                <th className="px-2 py-2">Pine vs app</th>
                <th className="px-2 py-2">Plain Action</th>
                <th className="px-2 py-2">Entry / Stop / Target</th>
                <th className="px-2 py-2">Paper result</th>
                <th className="px-2 py-2">Why</th>
              </tr>
            </thead>
            <tbody>
              {alertMatches.length === 0 ? (
                <tr>
                  <td className="px-2 py-6 text-muted-foreground" colSpan={11}>
                    No TradingView alert CSV imported yet.
                  </td>
                </tr>
              ) : (
                alertMatches.slice(0, 60).map((item) => {
                  const outcome =
                    paperOutcomes[paperOutcomeKey(item.alert)] ??
                    "unreviewed";
                  const canMark = isLatestPlaybookAlert(item.alert);
                  return (
                    <tr
                      className="border-b border-border/60"
                      key={`${item.alert.id}-${item.status}`}
                    >
                    <td className="px-2 py-2">
                      {item.alert.alertTime
                        ? new Date(item.alert.alertTime).toLocaleString()
                        : fmtDate(item.alert.candleTime)}
                      <span className="block text-muted-foreground">
                        fired alert
                      </span>
                      <span className="block text-muted-foreground">
                        candle {fmtDate(item.alert.candleTime)}
                      </span>
                      <span className="block text-muted-foreground">
                        {item.alert.mode ?? item.alert.alertMode ?? "alert"}
                        {item.alert.confirmed != null
                          ? item.alert.confirmed
                            ? " | confirmed"
                            : " | open bar"
                          : ""}
                        </span>
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={
                          isLatestPlaybookAlert(item.alert)
                            ? "text-cyan-200"
                            : isPlaybookAlert(item.alert)
                              ? "text-amber-200"
                              : "text-muted-foreground"
                        }
                      >
                        {alertVersionLabel(item.alert)}
                      </span>
                      {playbookContractIssues(item.alert).length > 0 && (
                        <span className="block text-red-300">
                          Fix{" "}
                          {playbookContractIssues(item.alert).join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">{item.alert.symbol ?? "n/a"}</td>
                    <td className="px-2 py-2">
                      {item.alert.timeframe ?? "n/a"}
                    </td>
                    <td className="px-2 py-2">
                      {item.alert.direction ?? "n/a"}
                    </td>
                    <td className="px-2 py-2">
                      {item.status === "NO DATA" ? (
                        <span className="border border-border px-2 py-1 text-muted-foreground">
                          NO DATA
                        </span>
                      ) : (
                        <DecisionPill decision={item.status} />
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={
                          item.agreement === "MATCH"
                            ? "text-lime-300"
                            : item.agreement === "DIFFERENT"
                              ? "text-amber-200"
                              : "text-muted-foreground"
                        }
                      >
                        {item.alert.action ?? "no pine action"} /{" "}
                        {item.status}
                      </span>
                      <span className="block text-muted-foreground">
                        {item.agreement.toLowerCase().replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {item.alert.plainAction ??
                        item.decision?.doNow ??
                        "Do nothing."}
                      {isLatestPlaybookAlert(item.alert) && (
                        <span className="mt-1 block text-muted-foreground">
                          {item.alert.decisionEvent ?? "event"}{" "}
                          {item.alert.previousAction
                            ? `from ${item.alert.previousAction}`
                            : ""}
                        </span>
                      )}
                      {isLatestPlaybookAlert(item.alert) && (
                        <span className="mt-1 block text-muted-foreground">
                          {alertGateSummary(item.alert)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      E:{fmtPrice(item.alert.entry ?? item.decision?.entry)} S:
                      {fmtPrice(item.alert.stop ?? item.decision?.stop)} T:
                      {fmtPrice(item.alert.target ?? item.decision?.target)}
                    </td>
                    <td className="px-2 py-2">
                      <span className={paperOutcomeClass(outcome)}>
                        {paperOutcomeLabel(outcome)}
                      </span>
                      {canMark ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(["paid", "failed", "missed"] as const).map(
                            (nextOutcome) => (
                              <button
                                className={
                                  outcome === nextOutcome
                                    ? "border border-primary bg-primary px-2 py-1 text-primary-foreground"
                                    : "border border-border px-2 py-1 text-muted-foreground hover:border-primary hover:text-foreground"
                                }
                                key={nextOutcome}
                                onClick={() =>
                                  markPaperOutcome(item.alert, nextOutcome)
                                }
                                type="button"
                              >
                                {paperOutcomeLabel(nextOutcome)}
                              </button>
                            ),
                          )}
                          {outcome !== "unreviewed" && (
                            <button
                              className="border border-border px-2 py-1 text-muted-foreground hover:border-primary hover:text-foreground"
                              onClick={() =>
                                markPaperOutcome(item.alert, "unreviewed")
                              }
                              type="button"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="mt-1 block text-muted-foreground">
                          Current Playbook only
                        </span>
                      )}
                    </td>
                    <td className="max-w-sm whitespace-normal px-2 py-2 text-muted-foreground">
                      {item.alert.reason ?? item.note}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
                  Compare 3m, 5m, 15m, 30m, 45m, and 1H Brutus touches. Prefer
                  London/NY. Avoid first-minute touches. Be careful with JPN225
                  longs. Enter only after price starts snapping back.
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
