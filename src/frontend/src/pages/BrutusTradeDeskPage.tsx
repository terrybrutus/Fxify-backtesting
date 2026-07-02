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
type TradeabilityStatus =
  | "not enough evidence"
  | "paper-review only"
  | "revise rules"
  | "cautiously continue collecting";
type PaperOutcome =
  | "unreviewed"
  | "worked"
  | "failed"
  | "would_have_worked"
  | "avoided_loss"
  | "unclear";
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
  event?: string;
  alertTime?: number | string;
  playbookVersion?: string;
  rawSignal?: boolean;
  decisionEvent?: string;
  previousAction?: string;
  rawLongSignal?: boolean;
  rawShortSignal?: boolean;
  rawLongCondition?: boolean;
  rawShortCondition?: boolean;
  originalTriangleSignal?: boolean;
  latchedSignal?: boolean;
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
  barProgressPct?: number;
  touchProgressPct?: number;
  progressAfterTouchPct?: number;
  minBarProgressPct?: number;
  maxBarProgressPct?: number;
  minProgressAfterTouchPct?: number;
  notTooEarly?: boolean;
  snapback?: boolean;
  pushThrough?: boolean;
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
  tp1?: number;
  tp2?: number;
  tp3?: number;
  tp4?: number;
  finalTarget?: number;
  length?: number;
  upperSource?: string;
  lowerSource?: string;
  stdDev?: number;
  rsi?: number;
  rsiMa?: number;
  rsiUpper?: number;
  rsiLower?: number;
  rsiBbWidth?: number;
  rsiStretch?: string;
  rsiPosition?: string;
  rsiAlignedWithTouch?: boolean;
  alignedWithTouch?: boolean;
  volumeValue?: number;
  volumeMa?: number;
  volumeRatio?: number;
  volumeSpike?: boolean;
  ma20?: number;
  ma50?: number;
  ma100?: number;
  ma200?: number;
  maTrend?: string;
  maStackBullish?: boolean;
  maStackBearish?: boolean;
  priceAboveMa20?: boolean;
  priceAboveMa50?: boolean;
  priceAboveMa100?: boolean;
  priceAboveMa200?: boolean;
  setupId?: number;
  exitAction?: string;
  outcome?: string;
  outcomePrice?: number;
  outcomeR?: number;
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
  sourceRows: number;
  parsed: number;
  ignoredRows: number;
  added: number;
  duplicates: number;
  current: number;
  old: number;
  legacy: number;
  incomplete: number;
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
  firstTouch: number;
  originalTriangle: number;
  decisionChange: number;
  confirmedClose: number;
  origSource: number;
  liveLatchSource: number;
  match: number;
  different: number;
  pineOnly: number;
  noData: number;
  worked: number;
  failed: number;
  wouldHaveWorked: number;
  avoidedLoss: number;
  unclear: number;
  reviewed: number;
  latestAlertTime: number;
};

type DenialBucket = {
  key: string;
  label: string;
  plainMeaning: string;
  action: string;
  count: number;
  enter: number;
  wait: number;
  skip: number;
  doNotHold: number;
  long: number;
  short: number;
  current: number;
  old: number;
  noData: number;
  averageTouchDepthRatio: number;
  averageBandWidth: number;
  early: number;
  late: number;
  snapback: number;
  pushThrough: number;
  rsiKnown: number;
  rsiAligned: number;
  rsiOpposed: number;
  worked: number;
  failed: number;
  wouldHaveWorked: number;
  avoidedLoss: number;
  unclear: number;
  reviewed: number;
  latestAlertTime: number;
  examples: string[];
};

type StrategyDiagnosisRow = {
  key: string;
  family: string;
  paperUse: "paper-test" | "review" | "avoid" | "needs data";
  count: number;
  enter: number;
  wait: number;
  skip: number;
  doNotHold: number;
  snapback: number;
  pushThrough: number;
  sessionBlocked: number;
  early: number;
  rsiKnown: number;
  rsiAligned: number;
  rsiOpposed: number;
  worked: number;
  failed: number;
  wouldHaveWorked: number;
  avoidedLoss: number;
  plainFinding: string;
  paperRule: string;
  entryPlan: string;
  exitPlan: string;
  invalidation: string;
  nextProof: string;
  examples: string[];
};

const STORAGE_KEY = "ict.brutus.trade-desk.report.v1";
const ALERT_STORAGE_KEY = "ict.brutus.trade-desk.alerts.v1";
const PAPER_OUTCOME_STORAGE_KEY = "ict.brutus.trade-desk.paperOutcomes.v1";
const LATEST_PLAYBOOK_VERSION = "raw-parity-v12";
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
      Object.entries(parsed)
        .map(([key, value]) => {
          const stored = String(value);
          const normalized =
            stored === "paid"
              ? "worked"
              : stored === "missed"
                ? "would_have_worked"
                : stored;
          return [key, normalized] as const;
        })
        .filter((entry): entry is [string, PaperOutcome] =>
          [
            "unreviewed",
            "worked",
            "failed",
            "would_have_worked",
            "avoided_loss",
            "unclear",
          ].includes(entry[1]),
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

function countSourceRows(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return 1;

  const records = parseCsvRecords(trimmed);
  if (records.length > 1) return records.length - 1;

  return trimmed.split(/\r?\n/).filter((line) => line.trim()).length;
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
    event: typeof item.event === "string" ? item.event : undefined,
    playbookVersion:
      typeof item.playbookVersion === "string" ? item.playbookVersion : undefined,
    rawSignal:
      typeof item.rawSignal === "boolean"
        ? item.rawSignal
        : typeof item.event === "string" &&
            (item.event.includes("TOUCH") ||
              item.event.includes("ENTER") ||
              item.event.includes("DECISION"))
          ? true
          : undefined,
    decisionEvent:
      typeof item.decisionEvent === "string"
        ? item.decisionEvent
        : typeof item.event === "string"
          ? item.event
          : undefined,
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
    originalTriangleSignal:
      typeof item.originalTriangleSignal === "boolean"
        ? item.originalTriangleSignal
        : undefined,
    latchedSignal:
      typeof item.latchedSignal === "boolean" ? item.latchedSignal : undefined,
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
    action:
      decisionFrom(item.action) ??
      (item.event === "ENTER_SETUP" || item.event === "ANY_ENTER_SETUP"
        ? "ENTER"
        : undefined),
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
    barProgressPct: asNumber(item.barProgressPct),
    touchProgressPct: asNumber(item.touchProgressPct),
    progressAfterTouchPct: asNumber(item.progressAfterTouchPct),
    minBarProgressPct: asNumber(item.minBarProgressPct),
    maxBarProgressPct: asNumber(item.maxBarProgressPct),
    minProgressAfterTouchPct: asNumber(item.minProgressAfterTouchPct),
    notTooEarly:
      typeof item.notTooEarly === "boolean" ? item.notTooEarly : undefined,
    snapback:
      typeof item.snapback === "boolean" ? item.snapback : undefined,
    pushThrough:
      typeof item.pushThrough === "boolean" ? item.pushThrough : undefined,
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
    target: asNumber(item.target ?? item.tp1 ?? item.finalTarget),
    tp1: asNumber(item.tp1),
    tp2: asNumber(item.tp2),
    tp3: asNumber(item.tp3),
    tp4: asNumber(item.tp4),
    finalTarget: asNumber(item.finalTarget),
    length: asNumber(item.length),
    upperSource:
      typeof item.upperSource === "string" ? item.upperSource : undefined,
    lowerSource:
      typeof item.lowerSource === "string" ? item.lowerSource : undefined,
    stdDev: asNumber(item.stdDev),
    rsi: asNumber(item.rsi),
    rsiMa: asNumber(item.rsiMa),
    rsiUpper: asNumber(item.rsiUpper),
    rsiLower: asNumber(item.rsiLower),
    rsiBbWidth: asNumber(item.rsiBbWidth),
    rsiStretch:
      typeof item.rsiStretch === "string" ? item.rsiStretch : undefined,
    rsiPosition:
      typeof item.rsiPosition === "string" ? item.rsiPosition : undefined,
    rsiAlignedWithTouch:
      typeof item.rsiAlignedWithTouch === "boolean"
        ? item.rsiAlignedWithTouch
        : undefined,
    alignedWithTouch:
      typeof item.alignedWithTouch === "boolean"
        ? item.alignedWithTouch
        : undefined,
    volumeValue: asNumber(item.volumeValue ?? item.volume),
    volumeMa: asNumber(item.volumeMa),
    volumeRatio: asNumber(item.volumeRatio),
    volumeSpike:
      typeof item.volumeSpike === "boolean" ? item.volumeSpike : undefined,
    ma20: asNumber(item.ma20),
    ma50: asNumber(item.ma50),
    ma100: asNumber(item.ma100),
    ma200: asNumber(item.ma200),
    maTrend: typeof item.maTrend === "string" ? item.maTrend : undefined,
    maStackBullish:
      typeof item.maStackBullish === "boolean"
        ? item.maStackBullish
        : undefined,
    maStackBearish:
      typeof item.maStackBearish === "boolean"
        ? item.maStackBearish
        : undefined,
    priceAboveMa20:
      typeof item.priceAboveMa20 === "boolean"
        ? item.priceAboveMa20
        : undefined,
    priceAboveMa50:
      typeof item.priceAboveMa50 === "boolean"
        ? item.priceAboveMa50
        : undefined,
    priceAboveMa100:
      typeof item.priceAboveMa100 === "boolean"
        ? item.priceAboveMa100
        : undefined,
    priceAboveMa200:
      typeof item.priceAboveMa200 === "boolean"
        ? item.priceAboveMa200
        : undefined,
    setupId: asNumber(item.setupId),
    exitAction:
      typeof item.exitAction === "string" ? item.exitAction : undefined,
    outcome: typeof item.outcome === "string" ? item.outcome : undefined,
    outcomePrice: asNumber(item.outcomePrice),
    outcomeR: asNumber(item.outcomeR),
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

const WRONG_TRADINGVIEW_ALERT_TYPE_MESSAGE =
  "This TradingView export came from a named Brutus alertcondition. Recreate the alert with Any alert() function call so the full JSON audit packet is captured.";

function isNamedAlertConditionExport(text: string) {
  return (
    text.includes("Wrong alert type for evidence loop") ||
    text.includes("Use Any alert() function call for full JSON")
  );
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
  return (
    alert.strategy === "brutus_playbook_v1" ||
    alert.strategy === "brutus_live_touch_punch_v6" ||
    alert.rawSignal === true
  );
}

function isExactLatestPlaybookAlert(alert: TvAlert) {
  return (
    (isPlaybookAlert(alert) && alert.playbookVersion === LATEST_PLAYBOOK_VERSION) ||
    alert.strategy === "brutus_live_touch_punch_v6"
  );
}

function hasLockedPlaybookSettings(alert: TvAlert) {
  return (
    (alert.length == null || alert.length === 9) &&
    (alert.upperSource == null || alert.upperSource === "high") &&
    (alert.lowerSource == null || alert.lowerSource === "low") &&
    (alert.stdDev == null || alert.stdDev === 2)
  );
}

function hasReviewablePlaybookPayload(alert: TvAlert) {
  return (
    alert.rawSignal === true &&
    Boolean(alert.action) &&
    Boolean(alert.symbol ?? alert.brokerSymbol) &&
    Boolean(alert.timeframe) &&
    Boolean(alert.direction) &&
    alert.candleTime != null &&
    alert.alertTime != null &&
    alert.open != null &&
    alert.high != null &&
    alert.low != null &&
    alert.close != null &&
    alert.upper != null &&
    alert.lower != null &&
    (alert.action !== "ENTER" ||
      (alert.entry != null && alert.stop != null && alert.target != null))
  );
}

function isCompatiblePlaybookAlert(alert: TvAlert) {
  return (
    isPlaybookAlert(alert) &&
    alert.playbookVersion !== LATEST_PLAYBOOK_VERSION &&
    hasLockedPlaybookSettings(alert) &&
    hasReviewablePlaybookPayload(alert)
  );
}

function isLatestPlaybookAlert(alert: TvAlert) {
  return (
    isExactLatestPlaybookAlert(alert) || isCompatiblePlaybookAlert(alert)
  );
}

function isExitOutcomeAlert(alert: TvAlert) {
  return (
    typeof alert.event === "string" &&
    alert.event.startsWith("EXIT_")
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
  if (isExactLatestPlaybookAlert(alert)) return "Current Playbook";
  if (isCompatiblePlaybookAlert(alert)) return "Compatible Playbook";
  if (isPlaybookAlert(alert)) return "Old Playbook";
  return "Legacy / other";
}

function playbookContractIssues(alert: TvAlert) {
  const issues: string[] = [];
  if (!isLatestPlaybookAlert(alert)) return issues;
  if (alert.length != null && alert.length !== 9) issues.push("length");
  if (alert.upperSource != null && alert.upperSource !== "high") {
    issues.push("upper source");
  }
  if (alert.lowerSource != null && alert.lowerSource !== "low") {
    issues.push("lower source");
  }
  if (alert.stdDev != null && alert.stdDev !== 2) issues.push("stdDev");
  return issues;
}

function missingPlaybookFields(alert: TvAlert) {
  const missing: string[] = [];
  if (!isLatestPlaybookAlert(alert)) return missing;
  if (isExitOutcomeAlert(alert)) {
    if (!alert.event) missing.push("event");
    if (!alert.setupId) missing.push("setupId");
    if (!alert.exitAction) missing.push("exitAction");
    if (alert.outcomePrice == null) missing.push("outcomePrice");
    if (alert.outcomeR == null) missing.push("outcomeR");
    return missing;
  }
  if (alert.rawSignal !== true) missing.push("rawSignal");
  if (!alert.decisionEvent) missing.push("decisionEvent");
  if (alert.decisionEvent === "decision_change" && !alert.previousAction) {
    missing.push("previousAction");
  }
  if (!alert.action) missing.push("action");
  if (!alert.reason && !alert.plainAction) missing.push("reason");
  if (!alert.mode && !alert.alertMode) missing.push("mode");
  if (alert.confirmed == null) missing.push("confirmed");
  if (alert.modeReady == null) missing.push("modeReady");
  if (alert.inSession == null) missing.push("inSession");
  if (alert.minutesIntoBar == null) missing.push("minutesIntoBar");
  if (alert.barProgressPct == null) missing.push("barProgressPct");
  if (alert.touchProgressPct == null) missing.push("touchProgressPct");
  if (alert.progressAfterTouchPct == null) {
    missing.push("progressAfterTouchPct");
  }
  if (alert.notTooEarly == null && alert.minBarProgressPct == null) {
    missing.push("timing gate");
  }
  if (
    alert.longSnapback == null &&
    alert.shortSnapback == null &&
    alert.snapback == null
  ) {
    missing.push("snapback");
  }
  if (
    alert.longPushThrough == null &&
    alert.shortPushThrough == null &&
    alert.pushThrough == null
  ) {
    missing.push("pushThrough");
  }
  if (!alert.brokerSymbol && !alert.symbol) missing.push("symbol");
  if (!alert.timeframe) missing.push("timeframe");
  if (!alert.direction) missing.push("direction");
  if (alert.candleTime == null) missing.push("timestamp");
  if (alert.alertTime == null) missing.push("alertTime");
  if (alert.open == null) missing.push("open");
  if (alert.high == null) missing.push("high");
  if (alert.low == null) missing.push("low");
  if (alert.close == null) missing.push("close");
  if (alert.upper == null) missing.push("upper");
  if (alert.lower == null) missing.push("lower");
  if (alert.action === "ENTER") {
    if (alert.entry == null) missing.push("entry");
    if (alert.stop == null) missing.push("stop");
    if (alert.target == null) missing.push("target");
  }
  if (alert.length != null && alert.length !== 9) missing.push("length=9");
  if (alert.upperSource != null && alert.upperSource !== "high") {
    missing.push("upperSource=high");
  }
  if (alert.lowerSource != null && alert.lowerSource !== "low") {
    missing.push("lowerSource=low");
  }
  if (alert.stdDev != null && alert.stdDev !== 2) missing.push("stdDev=2");
  return missing;
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
  if (outcome === "worked") return "Worked";
  if (outcome === "failed") return "Failed";
  if (outcome === "would_have_worked") return "Would have worked";
  if (outcome === "avoided_loss") return "Avoided loss";
  if (outcome === "unclear") return "Unclear";
  return "Unreviewed";
}

function paperOutcomeClass(outcome: PaperOutcome) {
  if (outcome === "worked") return "text-lime-300";
  if (outcome === "failed") return "text-red-300";
  if (outcome === "would_have_worked") return "text-amber-200";
  if (outcome === "avoided_loss") return "text-cyan-200";
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
      ? `This is a testable paper-review candidate: ${label}. It has enough sample to keep studying, but it is not approval to trade real money.`
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
    doNow = `PAPER REVIEW: ${plainTradeWord(touch.direction)} setup now. Skip if you are late.`;
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
indicator("Brutus Playbook Alerts", overlay=true, max_lines_count=100, max_labels_count=100)

// Generated by ICT Audit Lab from the Brutus Trade Desk playbook.
// Use this on TradingView Alchemy symbols first: DJ30.R, USTEC.R, US500.R, JPN225.R, and RUS2000.R.
// This is a paper-test alert bridge. It does not prove the strategy is live-trade ready by itself.
// Alert setup: create exactly one alert per symbol/timeframe using "Any alert() function call".
// Do not choose the named Brutus ENTER/WAIT/SKIP alertconditions for the evidence loop; those are only visual fallback labels and will not carry the full JSON audit packet.
// Alert coverage: confirmed-close mode sends one JSON packet for every confirmed raw signal. First-touch mode sends a JSON packet on the first live side touch and again if that same live candle changes action.
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
minBarProgressPct = input.float(25.0, minval=0.0, maxval=100.0, title="Minimum Candle Progress %")
maxBarProgressPct = input.float(92.0, minval=0.0, maxval=100.0, title="Maximum Candle Progress %")
minProgressAfterTouchPct = input.float(8.0, minval=0.0, maxval=100.0, title="Minimum Progress After First Touch %")
stopBandFraction = input.float(0.35, minval=0.05, maxval=2.0, title="Stop Distance as Band Width Fraction")
tp1R = input.float(1.0, minval=0.25, maxval=5.0, title="TP1 R")
tp2R = input.float(1.5, minval=0.25, maxval=8.0, title="TP2 R")
tp3R = input.float(2.0, minval=0.25, maxval=10.0, title="TP3 R")
tp4R = input.float(3.0, minval=0.25, maxval=15.0, title="TP4 R")
liveAlertsOnly = input.bool(true, title="Only Fire Alerts On Live Bars")
showOriginalSignals = input.bool(true, title="Show Original Triangle Matches")
showLiveLatchSignals = input.bool(true, title="Show Live First-Touch Latches")
showTradeLevels = input.bool(true, title="Show Current ENTER Plan Levels")
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

// Discovery context is calculated inside this script because Pine alerts cannot read separate chart indicators.
rsiLength = input.int(14, minval=1, title="RSI Length", group="Discovery Context")
rsiSource = input.source(close, title="RSI Source", group="Discovery Context")
rsiMaLength = input.int(14, minval=1, title="RSI SMA/BB Length", group="Discovery Context")
rsiBbMult = input.float(2.0, minval=0.001, maxval=50, title="RSI BB StdDev", group="Discovery Context")
volumeMaLength = input.int(20, minval=1, title="Volume MA Length", group="Discovery Context")
maRibbonType = input.string("SMA", title="MA Ribbon Type", options=["SMA", "EMA", "SMMA (RMA)", "WMA", "VWMA"], group="Discovery Context")

rsiChange = ta.change(rsiSource)
rsiUp = ta.rma(math.max(rsiChange, 0), rsiLength)
rsiDown = ta.rma(-math.min(rsiChange, 0), rsiLength)
rsiValue = rsiDown == 0 ? 100 : rsiUp == 0 ? 0 : 100 - (100 / (1 + rsiUp / rsiDown))
rsiMa = ta.sma(rsiValue, rsiMaLength)
rsiDeviation = ta.stdev(rsiValue, rsiMaLength) * rsiBbMult
rsiUpper = rsiMa + rsiDeviation
rsiLower = rsiMa - rsiDeviation
rsiBbWidth = rsiUpper - rsiLower
rsiStretch = rsiValue > rsiUpper ? "upper" : rsiValue < rsiLower ? "lower" : "none"
rsiPosition = rsiValue >= rsiMa ? "above-ma" : "below-ma"

volumeMa = ta.sma(volume, volumeMaLength)
volumeRatio = volumeMa == 0 ? 0 : volume / volumeMa
volumeSpike = volumeRatio >= 1.5

maRibbon(source, maLength, maType) =>
    switch maType
        "SMA" => ta.sma(source, maLength)
        "EMA" => ta.ema(source, maLength)
        "SMMA (RMA)" => ta.rma(source, maLength)
        "WMA" => ta.wma(source, maLength)
        "VWMA" => ta.vwma(source, maLength)
        => na

ma20 = maRibbon(close, 20, maRibbonType)
ma50 = maRibbon(close, 50, maRibbonType)
ma100 = maRibbon(close, 100, maRibbonType)
ma200 = maRibbon(close, 200, maRibbonType)
maStackBullish = ma20 > ma50 and ma50 > ma100 and ma100 > ma200
maStackBearish = ma20 < ma50 and ma50 < ma100 and ma100 < ma200
maTrend = maStackBullish ? "bullish-stack" : maStackBearish ? "bearish-stack" : close > ma200 ? "above-200-mixed" : close < ma200 ? "below-200-mixed" : "mixed"
priceAboveMa20 = close > ma20
priceAboveMa50 = close > ma50
priceAboveMa100 = close > ma100
priceAboveMa200 = close > ma200

// Raw Brutus signal layer. These two conditions intentionally match the original indicator's triangle logic.
rawLongCondition = (lowerSrc <= lower and close > open) or (lowerSrc[1] > lower[1] and lowerSrc <= lower)
rawShortCondition = (upperSrc >= upper and close < open) or (upperSrc[1] < upper[1] and upperSrc >= upper)
barDurationMs = math.max(timeframe.in_seconds(timeframe.period) * 1000.0, 1.0)
barProgressPct = barstate.isconfirmed ? 100.0 : math.min(100.0, math.max(0.0, (timenow - time) / barDurationMs * 100.0))

// First-touch mode latches the first live intrabar touch so alerts do not disappear just because the candle later changes.
// Historical bars cannot reconstruct the exact tick that first touched; confirmed-close mode uses the final candle state.
varip int latchedBarTime = na
varip bool rawLongLatched = false
varip bool rawShortLatched = false
varip float longTouchProgressPct = na
varip float shortTouchProgressPct = na
varip bool alertedLongThisBar = false
varip bool alertedShortThisBar = false
varip bool alertedOriginalThisBar = false
varip string lastLongAlertAction = ""
varip string lastShortAlertAction = ""
if na(latchedBarTime) or time != latchedBarTime
    latchedBarTime := time
    rawLongLatched := false
    rawShortLatched := false
    longTouchProgressPct := na
    shortTouchProgressPct := na
    alertedLongThisBar := false
    alertedShortThisBar := false
    alertedOriginalThisBar := false
    lastLongAlertAction := ""
    lastShortAlertAction := ""
newLongTouch = rawLongCondition and not rawLongLatched
newShortTouch = rawShortCondition and not rawShortLatched
if newLongTouch
    longTouchProgressPct := barProgressPct
if newShortTouch
    shortTouchProgressPct := barProgressPct
if rawLongCondition
    rawLongLatched := true
if rawShortCondition
    rawShortLatched := true

rawLongSignal = signalMode == "First touch" and barstate.isrealtime ? rawLongLatched : rawLongCondition
rawShortSignal = signalMode == "First touch" and barstate.isrealtime ? rawShortLatched : rawShortCondition
rawSignal = rawLongSignal or rawShortSignal
originalTriangleSignal = rawLongCondition or rawShortCondition
latchedSignal = rawSignal and not originalTriangleSignal
signalConflict = rawLongSignal and rawShortSignal
direction = signalConflict ? "both" : rawLongSignal ? "long" : rawShortSignal ? "short" : "none"
rsiAlignedWithTouch = (direction == "short" and rsiValue > rsiUpper) or (direction == "long" and rsiValue < rsiLower)
mode = signalMode == "Confirmed close" ? "bar_close" : "first_touch"
modeReady = signalMode == "Confirmed close" ? barstate.isconfirmed : true

longTouch = rawLongSignal
shortTouch = rawShortSignal
longTouchDepth = longTouch ? math.max(0.0, lower - lowerSrc) : 0.0
shortTouchDepth = shortTouch ? math.max(0.0, upperSrc - upper) : 0.0
touchDepth = direction == "long" ? longTouchDepth : direction == "short" ? shortTouchDepth : math.max(longTouchDepth, shortTouchDepth)
touchDepthRatio = touchDepth / bandWidth
touchProgressPct = direction == "long" ? longTouchProgressPct : direction == "short" ? shortTouchProgressPct : na
progressAfterTouchPct = na(touchProgressPct) ? na : math.max(0.0, barProgressPct - touchProgressPct)
inSession = not useSessionFilter or not na(time(timeframe.period, activeSession))
minutesIntoBar = math.max(0.0, (timenow - time) / 60000.0)
notTooEarly = barstate.isconfirmed or (barProgressPct >= minBarProgressPct and barProgressPct <= maxBarProgressPct and (na(progressAfterTouchPct) or progressAfterTouchPct >= minProgressAfterTouchPct))

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
hasEnter = longEnter or shortEnter
riskFloor = bandWidth * stopBandFraction
entry = hasEnter ? close : na
stop = longEnter ? math.min(low - syminfo.mintick, entry - riskFloor) : shortEnter ? math.max(high + syminfo.mintick, entry + riskFloor) : na
risk = hasEnter and not na(stop) ? math.abs(entry - stop) : na
tp1 = longEnter ? entry + risk * tp1R : shortEnter ? entry - risk * tp1R : na
tp2 = longEnter ? entry + risk * tp2R : shortEnter ? entry - risk * tp2R : na
tp3 = longEnter ? entry + risk * tp3R : shortEnter ? entry - risk * tp3R : na
tp4 = longEnter ? entry + risk * tp4R : shortEnter ? entry - risk * tp4R : na
snapbackOk = direction == "long" ? longSnapback : direction == "short" ? shortSnapback : false
tradeWord = direction == "long" ? "BUY" : direction == "short" ? "SELL" : "TRADE"
waitReason = not notTooEarly ? "Original Brutus signal fired, but the candle has not reached the allowed live-decision window yet." : not snapbackOk ? "Original Brutus signal fired, but snapback is not clean yet." : "Original Brutus signal fired, but the playbook still says wait."
skipReason = not inSession ? "Original Brutus signal fired outside the active session." : not modeReady ? "Original Brutus signal fired, but this mode waits for bar close." : "Original Brutus signal fired, but the playbook says skip."
reason = signalConflict ? "Both original Brutus long and short signals fired on the same candle. Skip because direction is unclear." : action == "ENTER" ? "Original Brutus signal fired and price started snapping back." : action == "WAIT" ? waitReason : action == "DO_NOT_HOLD" ? "Original Brutus signal fired, but price is still pushing through the band." : skipReason
plainAction = action == "ENTER" ? "PAPER REVIEW: " + tradeWord + " setup now. Skip if you are late." : action == "WAIT" ? "NO TRADE YET. Watch only." : action == "DO_NOT_HOLD" ? "NO TRADE. Do not fight this move." : "SKIP. No trade."
entryJson = na(entry) ? "null" : str.tostring(entry)
stopJson = na(stop) ? "null" : str.tostring(stop)
tp1Json = na(tp1) ? "null" : str.tostring(tp1)
tp2Json = na(tp2) ? "null" : str.tostring(tp2)
tp3Json = na(tp3) ? "null" : str.tostring(tp3)
tp4Json = na(tp4) ? "null" : str.tostring(tp4)

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

var line entryLine = na
var line stopLine = na
var line tp1Line = na
var line tp2Line = na
var line tp3Line = na
var line tp4Line = na
var label entryLabel = na
varip int setupCounter = 0
varip bool activeTrade = false
varip int activeSetupId = na
varip int activeDirection = 0
varip int activeEntryBar = na
varip float activeEntry = na
varip float activeStop = na
varip float activeTp1 = na
varip float activeTp2 = na
varip float activeTp3 = na
varip float activeTp4 = na
varip bool activeTp1Sent = false
varip bool activeTp2Sent = false
varip bool activeTp3Sent = false
varip bool activeTp4Sent = false
newEnterPlan = hasEnter and not activeTrade and ((longEnter and lastLongAlertAction != "ENTER") or (shortEnter and lastShortAlertAction != "ENTER"))
if showTradeLevels and newEnterPlan
    if not na(entryLine)
        line.delete(entryLine)
    if not na(stopLine)
        line.delete(stopLine)
    if not na(tp1Line)
        line.delete(tp1Line)
    if not na(tp2Line)
        line.delete(tp2Line)
    if not na(tp3Line)
        line.delete(tp3Line)
    if not na(tp4Line)
        line.delete(tp4Line)
    if not na(entryLabel)
        label.delete(entryLabel)
    planColor = longEnter ? color.lime : color.red
    entryLine := line.new(bar_index, entry, bar_index + 1, entry, xloc=xloc.bar_index, extend=extend.right, color=planColor, width=2)
    stopLine := line.new(bar_index, stop, bar_index + 1, stop, xloc=xloc.bar_index, extend=extend.right, color=color.red, width=2)
    tp1Line := line.new(bar_index, tp1, bar_index + 1, tp1, xloc=xloc.bar_index, extend=extend.right, color=color.new(color.lime, 0), width=1)
    tp2Line := line.new(bar_index, tp2, bar_index + 1, tp2, xloc=xloc.bar_index, extend=extend.right, color=color.new(color.lime, 15), width=1)
    tp3Line := line.new(bar_index, tp3, bar_index + 1, tp3, xloc=xloc.bar_index, extend=extend.right, color=color.new(color.lime, 30), width=1)
    tp4Line := line.new(bar_index, tp4, bar_index + 1, tp4, xloc=xloc.bar_index, extend=extend.right, color=color.new(color.lime, 45), width=1)
    entryLabel := label.new(bar_index, entry, tradeWord + " ENTER\\nSL/TP shown now", style=longEnter ? label.style_label_up : label.style_label_down, textcolor=color.white, color=planColor)
if newEnterPlan
    setupCounter += 1
    activeTrade := true
    activeSetupId := setupCounter
    activeDirection := longEnter ? 1 : -1
    activeEntryBar := bar_index
    activeEntry := entry
    activeStop := stop
    activeTp1 := tp1
    activeTp2 := tp2
    activeTp3 := tp3
    activeTp4 := tp4
    activeTp1Sent := false
    activeTp2Sent := false
    activeTp3Sent := false
    activeTp4Sent := false

firstTouchNewSide = signalMode == "First touch" and barstate.isrealtime and ((rawLongSignal and not alertedLongThisBar) or (rawShortSignal and not alertedShortThisBar))
firstTouchOriginalTriangle = signalMode == "First touch" and barstate.isrealtime and originalTriangleSignal and not alertedOriginalThisBar
meaningfulActionChange = action == "ENTER" or action == "DO_NOT_HOLD"
firstTouchDecisionChanged = signalMode == "First touch" and barstate.isrealtime and meaningfulActionChange and ((rawLongSignal and action != lastLongAlertAction) or (rawShortSignal and action != lastShortAlertAction))
confirmedCloseEvent = signalMode == "Confirmed close" and rawSignal and barstate.isconfirmed
decisionEvent = confirmedCloseEvent ? "confirmed_close" : firstTouchNewSide ? "first_touch" : firstTouchOriginalTriangle ? "original_triangle" : firstTouchDecisionChanged ? "decision_change" : "none"
previousAction = direction == "long" ? lastLongAlertAction : direction == "short" ? lastShortAlertAction : signalConflict ? "both" : ""
shouldAlert = modeReady and (not liveAlertsOnly or barstate.isrealtime) and (firstTouchNewSide or firstTouchOriginalTriangle or firstTouchDecisionChanged or confirmedCloseEvent)
rawAuditText = rawSignal ? "Raw " + action + " | alert " + (shouldAlert ? "will fire" : "held") : "No raw Brutus signal now"
alertDirection = signalConflict ? (rawLongSignal ? "long" : "short") : direction
confirmText = barstate.isconfirmed ? "confirmed close" : "open candle"
modeText = mode + " | " + confirmText
depthText = "Side " + direction + " | depth " + str.tostring(touchDepthRatio, "#.####") + " of band"
contextText = "RSI " + str.tostring(rsiValue, "#.##") + " " + rsiStretch + " | Vol " + str.tostring(volumeRatio, "#.##") + "x | " + maTrend

var table auditPanel = table.new(position.top_right, 1, 9, border_width=1)
if showAuditPanel and barstate.islast
    table.cell(auditPanel, 0, 0, "Brutus Playbook raw-parity-v12", text_color=color.white, bgcolor=color.new(color.black, 0))
    table.cell(auditPanel, 0, 1, "Locked: length 9, high/low bands, StdDev 2", text_color=color.white, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 2, rawAuditText, text_color=rawSignal ? color.aqua : color.silver, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 3, modeText + " | " + str.tostring(barProgressPct, "#") + "% in", text_color=barstate.isconfirmed ? color.lime : color.yellow, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 4, depthText, text_color=rawSignal ? color.aqua : color.silver, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 5, contextText, text_color=color.aqua, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 6, "Check ORIG markers against old triangles first", text_color=color.yellow, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 7, "Open-bar ORIG can change until candle close", text_color=color.yellow, bgcolor=color.new(color.black, 15))
    table.cell(auditPanel, 0, 8, "Paper evidence only - not live-trade approval", text_color=color.orange, bgcolor=color.new(color.black, 15))
message = "{\\"strategy\\":\\"brutus_playbook_v1\\",\\"playbookVersion\\":\\"raw-parity-v12\\",\\"rawSignal\\":true,\\"originalTriangleSignal\\":" + str.tostring(originalTriangleSignal) + ",\\"latchedSignal\\":" + str.tostring(latchedSignal) + ",\\"decisionEvent\\":\\"" + decisionEvent + "\\",\\"previousAction\\":\\"" + previousAction + "\\",\\"rawLongSignal\\":" + str.tostring(rawLongSignal) + ",\\"rawShortSignal\\":" + str.tostring(rawShortSignal) + ",\\"rawLongCondition\\":" + str.tostring(rawLongCondition) + ",\\"rawShortCondition\\":" + str.tostring(rawShortCondition) + ",\\"newLongTouch\\":" + str.tostring(newLongTouch) + ",\\"newShortTouch\\":" + str.tostring(newShortTouch) + ",\\"signalConflict\\":" + str.tostring(signalConflict) + ",\\"signalDirection\\":\\"" + direction + "\\",\\"mode\\":\\"" + mode + "\\",\\"confirmed\\":" + str.tostring(barstate.isconfirmed) + ",\\"modeReady\\":" + str.tostring(modeReady) + ",\\"inSession\\":" + str.tostring(inSession) + ",\\"minutesIntoBar\\":" + str.tostring(minutesIntoBar) + ",\\"barProgressPct\\":" + str.tostring(barProgressPct) + ",\\"touchProgressPct\\":" + (na(touchProgressPct) ? "null" : str.tostring(touchProgressPct)) + ",\\"progressAfterTouchPct\\":" + (na(progressAfterTouchPct) ? "null" : str.tostring(progressAfterTouchPct)) + ",\\"minBarProgressPct\\":" + str.tostring(minBarProgressPct) + ",\\"maxBarProgressPct\\":" + str.tostring(maxBarProgressPct) + ",\\"minProgressAfterTouchPct\\":" + str.tostring(minProgressAfterTouchPct) + ",\\"notTooEarly\\":" + str.tostring(notTooEarly) + ",\\"longSnapback\\":" + str.tostring(longSnapback) + ",\\"shortSnapback\\":" + str.tostring(shortSnapback) + ",\\"longPushThrough\\":" + str.tostring(longPushThrough) + ",\\"shortPushThrough\\":" + str.tostring(shortPushThrough) + ",\\"snapback\\":" + str.tostring(snapbackOk) + ",\\"pushThrough\\":" + str.tostring(longPushThrough or shortPushThrough) + ",\\"symbol\\":\\"" + syminfo.tickerid + "\\",\\"timeframe\\":\\"" + timeframe.period + "\\",\\"action\\":\\"" + action + "\\",\\"plainAction\\":\\"" + plainAction + "\\",\\"direction\\":\\"" + alertDirection + "\\",\\"time\\":" + str.tostring(time) + ",\\"timestamp\\":" + str.tostring(time) + ",\\"candleTime\\":" + str.tostring(time) + ",\\"alertTime\\":" + str.tostring(timenow) + ",\\"open\\":" + str.tostring(open) + ",\\"high\\":" + str.tostring(high) + ",\\"low\\":" + str.tostring(low) + ",\\"close\\":" + str.tostring(close) + ",\\"upper\\":" + str.tostring(upper) + ",\\"lower\\":" + str.tostring(lower) + ",\\"bandWidth\\":" + str.tostring(bandWidth) + ",\\"touchDepth\\":" + str.tostring(touchDepth) + ",\\"touchDepthRatio\\":" + str.tostring(touchDepthRatio) + ",\\"entry\\":" + entryJson + ",\\"stop\\":" + stopJson + ",\\"target\\":" + tp1Json + ",\\"tp1\\":" + tp1Json + ",\\"tp2\\":" + tp2Json + ",\\"tp3\\":" + tp3Json + ",\\"tp4\\":" + tp4Json + ",\\"length\\":" + str.tostring(length) + ",\\"upperSource\\":\\"high\\",\\"lowerSource\\":\\"low\\",\\"stdDev\\":" + str.tostring(mult) + ",\\"rsi\\":" + str.tostring(rsiValue) + ",\\"rsiMa\\":" + str.tostring(rsiMa) + ",\\"rsiUpper\\":" + str.tostring(rsiUpper) + ",\\"rsiLower\\":" + str.tostring(rsiLower) + ",\\"rsiBbWidth\\":" + str.tostring(rsiBbWidth) + ",\\"rsiStretch\\":\\"" + rsiStretch + "\\",\\"rsiPosition\\":\\"" + rsiPosition + "\\",\\"rsiAlignedWithTouch\\":" + str.tostring(rsiAlignedWithTouch) + ",\\"alignedWithTouch\\":" + str.tostring(rsiAlignedWithTouch) + ",\\"volumeValue\\":" + str.tostring(volume) + ",\\"volumeMa\\":" + str.tostring(volumeMa) + ",\\"volumeRatio\\":" + str.tostring(volumeRatio) + ",\\"volumeSpike\\":" + str.tostring(volumeSpike) + ",\\"ma20\\":" + str.tostring(ma20) + ",\\"ma50\\":" + str.tostring(ma50) + ",\\"ma100\\":" + str.tostring(ma100) + ",\\"ma200\\":" + str.tostring(ma200) + ",\\"maTrend\\":\\"" + maTrend + "\\",\\"maStackBullish\\":" + str.tostring(maStackBullish) + ",\\"maStackBearish\\":" + str.tostring(maStackBearish) + ",\\"priceAboveMa20\\":" + str.tostring(priceAboveMa20) + ",\\"priceAboveMa50\\":" + str.tostring(priceAboveMa50) + ",\\"priceAboveMa100\\":" + str.tostring(priceAboveMa100) + ",\\"priceAboveMa200\\":" + str.tostring(priceAboveMa200) + ",\\"reason\\":\\"" + reason + "\\"}"

if shouldAlert
    alert(message, alert.freq_all)
    if rawLongSignal
        alertedLongThisBar := true
        lastLongAlertAction := action
    if rawShortSignal
        alertedShortThisBar := true
        lastShortAlertAction := action
    if originalTriangleSignal
        alertedOriginalThisBar := true

canResolveTrade = activeTrade and bar_index > activeEntryBar
stopHit = canResolveTrade and (activeDirection == 1 ? low <= activeStop : high >= activeStop)
tp4Hit = canResolveTrade and not activeTp4Sent and (activeDirection == 1 ? high >= activeTp4 : low <= activeTp4)
tp3Hit = canResolveTrade and not activeTp3Sent and (activeDirection == 1 ? high >= activeTp3 : low <= activeTp3)
tp2Hit = canResolveTrade and not activeTp2Sent and (activeDirection == 1 ? high >= activeTp2 : low <= activeTp2)
tp1Hit = canResolveTrade and not activeTp1Sent and (activeDirection == 1 ? high >= activeTp1 : low <= activeTp1)
exitEvent = stopHit ? "EXIT_STOP" : tp4Hit ? "EXIT_TP4" : tp3Hit ? "EXIT_TP3" : tp2Hit ? "EXIT_TP2" : tp1Hit ? "EXIT_TP1" : "none"
exitPrice = stopHit ? activeStop : tp4Hit ? activeTp4 : tp3Hit ? activeTp3 : tp2Hit ? activeTp2 : tp1Hit ? activeTp1 : na
exitR = stopHit ? -1.0 : tp4Hit ? tp4R : tp3Hit ? tp3R : tp2Hit ? tp2R : tp1Hit ? tp1R : na
exitPlain = stopHit ? "STOP HIT. Trade is done." : tp4Hit ? "TP4 HIT. Runner is done." : tp3Hit ? "TP3 HIT. Take profit or trail tight." : tp2Hit ? "TP2 HIT. Take profit or move stop up." : tp1Hit ? "TP1 HIT. Take partial profit and protect the trade." : ""
exitReason = stopHit ? "Stop was touched after the entry bar. Conservative rule: same-bar stop/TP is not claimed because Pine cannot prove event order inside the bar." : exitEvent != "none" ? "Profit target was touched after the entry bar. Conservative rule: same-bar target is not claimed because Pine cannot prove event order inside the bar." : ""
exitMessage = "{\\"strategy\\":\\"brutus_playbook_v1\\",\\"playbookVersion\\":\\"raw-parity-v12\\",\\"rawSignal\\":false,\\"event\\":\\"" + exitEvent + "\\",\\"setupId\\":" + str.tostring(activeSetupId) + ",\\"exitAction\\":\\"" + (stopHit ? "STOP" : "TAKE_PROFIT") + "\\",\\"outcome\\":\\"" + exitEvent + "\\",\\"outcomePrice\\":" + (na(exitPrice) ? "null" : str.tostring(exitPrice)) + ",\\"outcomeR\\":" + (na(exitR) ? "null" : str.tostring(exitR)) + ",\\"plainAction\\":\\"" + exitPlain + "\\",\\"reason\\":\\"" + exitReason + "\\",\\"symbol\\":\\"" + syminfo.tickerid + "\\",\\"timeframe\\":\\"" + timeframe.period + "\\",\\"direction\\":\\"" + (activeDirection == 1 ? "long" : "short") + "\\",\\"time\\":" + str.tostring(time) + ",\\"timestamp\\":" + str.tostring(time) + ",\\"candleTime\\":" + str.tostring(time) + ",\\"alertTime\\":" + str.tostring(timenow) + ",\\"entry\\":" + str.tostring(activeEntry) + ",\\"stop\\":" + str.tostring(activeStop) + ",\\"target\\":" + str.tostring(activeTp1) + ",\\"tp1\\":" + str.tostring(activeTp1) + ",\\"tp2\\":" + str.tostring(activeTp2) + ",\\"tp3\\":" + str.tostring(activeTp3) + ",\\"tp4\\":" + str.tostring(activeTp4) + ",\\"open\\":" + str.tostring(open) + ",\\"high\\":" + str.tostring(high) + ",\\"low\\":" + str.tostring(low) + ",\\"close\\":" + str.tostring(close) + "}"
if exitEvent != "none" and (not liveAlertsOnly or barstate.isrealtime)
    alert(exitMessage, alert.freq_once_per_bar)
    if tp1Hit
        activeTp1Sent := true
    if tp2Hit
        activeTp2Sent := true
    if tp3Hit
        activeTp3Sent := true
    if tp4Hit
        activeTp4Sent := true
    if stopHit or tp4Hit
        activeTrade := false

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

function decisionFromAlertOrMatch(item: AlertDecisionMatch) {
  return item.alert.action ?? item.status;
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
  const snapback =
    sideGateValue(alert, alert.longSnapback, alert.shortSnapback) ??
    alert.snapback;
  const push =
    sideGateValue(alert, alert.longPushThrough, alert.shortPushThrough) ??
    alert.pushThrough;
  const source =
    alert.originalTriangleSignal === true
      ? "orig formula now"
      : alert.latchedSignal === true
        ? "live latch"
        : "unknown source";
  const minutes =
    alert.minutesIntoBar != null && Number.isFinite(alert.minutesIntoBar)
      ? `${alert.minutesIntoBar.toFixed(1)}m`
      : "?m";
  const progress =
    alert.barProgressPct != null && Number.isFinite(alert.barProgressPct)
      ? `${alert.barProgressPct.toFixed(0)}% into candle`
      : minutes;
  const touchProgress =
    alert.touchProgressPct != null && Number.isFinite(alert.touchProgressPct)
      ? `touch ${alert.touchProgressPct.toFixed(0)}%`
      : "touch ?";
  const afterTouch =
    alert.progressAfterTouchPct != null &&
    Number.isFinite(alert.progressAfterTouchPct)
      ? `after-touch ${alert.progressAfterTouchPct.toFixed(0)}%`
      : "after-touch ?";
  const timingOk =
    alert.notTooEarly ??
    (alert.minBarProgressPct != null && alert.barProgressPct != null
      ? alert.barProgressPct >= alert.minBarProgressPct
      : undefined);
  return `${source} | original ${boolWord(original)} | live ${boolWord(liveTouch)} | session ${boolWord(alert.inSession)} | timing ${boolWord(timingOk)} (${progress}, ${touchProgress}, ${afterTouch}) | snapback ${boolWord(snapback)} | push-through ${boolWord(push)}`;
}

function alertEventExplanation(event?: string) {
  switch (event) {
    case "first_touch":
      return "first live band touch";
    case "original_triangle":
      return "old Brutus triangle appeared";
    case "decision_change":
      return "same candle changed decision";
    case "confirmed_close":
      return "confirmed candle-close signal";
    default:
      return "alert event";
  }
}

function gateValueForDirection(
  alert: TvAlert,
  longValue?: boolean,
  shortValue?: boolean,
) {
  const direction = alert.signalDirection ?? alert.direction;
  if (direction === "long") return longValue;
  if (direction === "short") return shortValue;
  return longValue ?? shortValue;
}

function denialReasonFor(item: AlertDecisionMatch) {
  const alert = item.alert;
  const action = alert.action ?? item.status;
  const reason = String(alert.reason ?? item.note ?? "").toLowerCase();
  const pushThrough = gateValueForDirection(
    alert,
    alert.longPushThrough,
    alert.shortPushThrough,
  );
  const snapback = gateValueForDirection(
    alert,
    alert.longSnapback,
    alert.shortSnapback,
  );

  if (item.status === "NO DATA") {
    return {
      key: "no-data",
      label: "No matching candle data",
      plainMeaning:
        "The alert fired, but the imported candle batch cannot score what happened next.",
      action:
        "Do not judge the rule from this row. Import matching candles or treat it as live-only evidence.",
    };
  }
  if (alert.signalConflict === true) {
    return {
      key: "signal-conflict",
      label: "Both sides fired",
      plainMeaning:
        "The candle is messy enough that long and short logic are fighting each other.",
      action: "Skip it unless a later clean alert resolves the side.",
    };
  }
  if (alert.inSession === false || reason.includes("outside")) {
    return {
      key: "session",
      label: "Denied by session",
      plainMeaning:
        "The raw Brutus touch fired, but the current 0300-1200 session gate blocked it.",
      action:
        "This is the first suspect. Review these rows to decide whether Sunday/off-session moves need their own bucket instead of a hard block.",
    };
  }
  if (
    action === "DO_NOT_HOLD" ||
    pushThrough === true ||
    reason.includes("pushing through") ||
    reason.includes("kept moving")
  ) {
    return {
      key: "push-through",
      label: "Denied by push-through",
      plainMeaning:
        "Price kept driving through the band instead of rejecting it immediately.",
      action:
        "Separate these into continuation versus failed-reversal. Do not automatically treat every strong pierce as bad.",
    };
  }
  if (alert.notTooEarly === false || reason.includes("too early")) {
    return {
      key: "timing",
      label: "Denied by early timing",
      plainMeaning:
        "The signal fired too early inside the candle, when the wick could still extend against you.",
      action:
        "Check whether late-candle alerts outperform early first touches before tightening this further.",
    };
  }
  if (snapback === false || reason.includes("no snapback")) {
    return {
      key: "no-snapback",
      label: "Denied by no snapback",
      plainMeaning:
        "The band touch happened, but price had not started moving back toward the band/middle yet.",
      action:
        "Use this as the clean WAIT bucket: no entry until a later alert proves the turn started.",
    };
  }
  if (action === "SKIP") {
    return {
      key: "other-skip",
      label: "Denied by other rule",
      plainMeaning:
        "The app skipped it, but the reason is not one of the main gates.",
      action:
        "Inspect these manually. If many would have worked, the rule is hiding opportunity.",
    };
  }
  if (action === "WAIT") {
    return {
      key: "wait",
      label: "Wait bucket",
      plainMeaning:
        "The setup was close, but the current rule wanted more proof.",
      action:
        "If these repeatedly work, loosen ENTER. If they fail, keep them as WAIT.",
    };
  }
  if (action === "ENTER") {
    return {
      key: "enter",
      label: "Accepted candidate",
      plainMeaning:
        "The alert passed the current rule. This is still paper-review only.",
      action:
        "Replay these first. A failed ENTER is more important than a pretty winner.",
    };
  }
  return {
    key: "unclassified",
    label: "Unclassified",
    plainMeaning:
      "The row has enough JSON to parse, but the denial reason is not explicit.",
    action: "Treat this as a parser/rule clarity issue, not a trade signal.",
  };
}

function rsiReadForAlert(alert: TvAlert) {
  const rsi = asNumber(alert.rsi);
  const rsiMa = asNumber(alert.rsiMa);
  const rsiUpper = asNumber(alert.rsiUpper);
  const rsiLower = asNumber(alert.rsiLower);
  const hasBands = rsi != null && rsiUpper != null && rsiLower != null;
  const aligned =
    alert.rsiAlignedWithTouch === true ||
    alert.alignedWithTouch === true ||
    (alert.direction === "short" && hasBands && rsi > rsiUpper) ||
    (alert.direction === "long" && hasBands && rsi < rsiLower);
  const opposed =
    (alert.direction === "short" && hasBands && rsi < rsiLower) ||
    (alert.direction === "long" && hasBands && rsi > rsiUpper);
  return {
    known: rsi != null || rsiMa != null || rsiUpper != null || rsiLower != null,
    aligned,
    opposed,
  };
}

function strategyDiagnosisFor(item: AlertDecisionMatch) {
  const alert = item.alert;
  const denial = denialReasonFor(item);
  const snapback =
    gateValueForDirection(alert, alert.longSnapback, alert.shortSnapback) ===
    true;
  const pushThrough =
    gateValueForDirection(
      alert,
      alert.longPushThrough,
      alert.shortPushThrough,
    ) === true;
  const rsi = rsiReadForAlert(alert);
  const depth = alert.touchDepthRatio ?? 0;
  const early = alert.notTooEarly === false || (alert.minutesIntoBar ?? 99) <= 1;
  const midBand =
    alert.upper != null && alert.lower != null
      ? (alert.upper + alert.lower) / 2
      : undefined;
  const oppositeBand =
    alert.direction === "long" ? alert.upper : alert.lower;
  const side = alert.direction === "short" ? "short" : "long";
  const paperSide = side === "short" ? "paper short" : "paper long";
  const midTarget = midBand != null ? fmtPrice(midBand) : "the band middle";
  const runnerTarget =
    oppositeBand != null ? fmtPrice(oppositeBand) : "the opposite band";

  if (item.status === "NO DATA") {
    return {
      key: "needs-data",
      family: "Needs matching candle data",
      paperUse: "needs data" as const,
      plainFinding:
        "The alert exists, but the app cannot judge what happened after it.",
      paperRule:
        "Do not paper-trade this row from the app. Use it only as a live TradingView note.",
      entryPlan: "No entry from this row.",
      exitPlan: "No exit model until matching candle data exists.",
      invalidation: "Missing candle data.",
      nextProof: "Import matching Alchemy candles or review the alert directly in TradingView.",
    };
  }

  if (pushThrough && !snapback) {
    return {
      key: "push-through-continuation",
      family: "Push-through continuation",
      paperUse: early ? ("review" as const) : ("paper-test" as const),
      plainFinding:
        "Price is not rejecting the band yet. This is probably momentum, not a clean reversal.",
      paperRule:
        "Do not fade this immediately. Paper-test continuation only if the next candle keeps moving the same way and the band keeps widening.",
      entryPlan:
        side === "short"
          ? "If testing continuation, paper buy only after a pullback holds above the upper band area."
          : "If testing continuation, paper sell only after a pullback holds below the lower band area.",
      exitPlan:
        "For reversal attempts, exit immediately. For continuation tests, trail behind the most recent small pullback.",
      invalidation:
        "If price snaps back through the touched band, the continuation idea failed.",
      nextProof:
        "Track whether these push-through rows later become big continuation moves or sharp snapbacks.",
    };
  }

  if (snapback && depth >= 0.04) {
    return {
      key: "snapback-reversal",
      family: "Snapback reversal",
      paperUse:
        denial.key === "session" || early ? ("review" as const) : ("paper-test" as const),
      plainFinding:
        "Price pierced the band and started coming back. This is the closest version of your original wick/snapback idea.",
      paperRule:
        "Paper-test only after the snapback starts. Do not chase if the move already reached the middle.",
      entryPlan: `Watch for a ${paperSide} near the touched band after rejection starts.`,
      exitPlan: `First target is ${midTarget}. If it keeps moving, runner target is ${runnerTarget}.`,
      invalidation:
        "If the next candle pushes back through the touched band, stop paper-tracking it.",
      nextProof:
        rsi.known
          ? "Compare RSI-aligned snapbacks versus RSI-opposed snapbacks."
          : "Add RSI fields later if you want to test whether momentum divergence improves this family.",
    };
  }

  if (denial.key === "session") {
    return {
      key: "session-blocked-review",
      family: "Session-blocked opportunity",
      paperUse: "review" as const,
      plainFinding:
        "The raw Brutus touch was blocked mostly because of time of day, not because the setup itself was proven bad.",
      paperRule:
        "Do not hard-delete these. Split them into their own session bucket and see whether Sunday/Asia/off-hours behave differently.",
      entryPlan:
        "No automatic entry. Replay these first and mark Would have worked or Avoided loss.",
      exitPlan:
        "If reviewed as a snapback, use middle-band first target. If reviewed as continuation, trail behind pullbacks.",
      invalidation:
        "If this bucket mostly fails after review, keep the session filter. If it works, remove the hard block.",
      nextProof:
        "Mark at least 20 session-blocked rows before deciding whether to loosen the time filter.",
    };
  }

  if (early) {
    return {
      key: "early-touch-risk",
      family: "Early-touch wick risk",
      paperUse: "review" as const,
      plainFinding:
        "The alert fired early in the candle. This can become a great wick entry or an immediate stop-out.",
      paperRule:
        "Do not enter on the first touch unless the next 1m candle confirms rejection.",
      entryPlan:
        "Wait one candle. Paper-enter only if price stops stretching and starts moving back inside the band.",
      exitPlan: `First target is ${midTarget}; do not hold if price resumes pushing through.`,
      invalidation:
        "If the next 1m candle expands farther through the band, skip it.",
      nextProof:
        "Compare early first-touch alerts against late-candle alerts. This tells us whether your alert is too fast.",
    };
  }

  if (rsi.known && rsi.aligned) {
    return {
      key: "rsi-aligned-reversal",
      family: "RSI-aligned reversal",
      paperUse: "review" as const,
      plainFinding:
        "RSI is stretched with the band touch. This may strengthen snapback candidates, but it needs proof.",
      paperRule:
        "Use RSI as a ranking clue, not a trade trigger. It should improve entries only if outcomes prove it.",
      entryPlan: `Paper-test a ${paperSide} only when snapback also starts.`,
      exitPlan: `First target is ${midTarget}; runner target is ${runnerTarget}.`,
      invalidation:
        "If RSI stays embedded and price rides the band, this becomes continuation risk.",
      nextProof:
        "Compare RSI-aligned rows against non-RSI rows before promoting it.",
    };
  }

  return {
    key: "unclear-research",
    family: "Unclear research row",
    paperUse: "avoid" as const,
    plainFinding:
      "This alert does not yet fit a clean snapback, continuation, or session-review family.",
    paperRule:
      "Do not use this as a paper entry until it has a repeatable family.",
    entryPlan: "No entry.",
    exitPlan: "No exit model.",
    invalidation: "The setup has no clear thesis yet.",
    nextProof:
      "Only keep it if repeated examples show the same behavior after review.",
  };
}

function averageFromSum(sum: number, count: number) {
  return count > 0 ? sum / count : 0;
}

function paperUseClass(use: StrategyDiagnosisRow["paperUse"]) {
  if (use === "paper-test") return "border-lime-400/60 text-lime-300";
  if (use === "review") return "border-amber-300/60 text-amber-200";
  if (use === "needs data") return "border-cyan-300/60 text-cyan-200";
  return "border-red-500/60 text-red-300";
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
      alertMatches.filter(
        (item) =>
          isLatestPlaybookAlert(item.alert) &&
          !isExitOutcomeAlert(item.alert),
      ),
    [alertMatches],
  );

  const latestExitAlertMatches = useMemo(
    () =>
      alertMatches.filter(
        (item) =>
          isLatestPlaybookAlert(item.alert) &&
          isExitOutcomeAlert(item.alert),
      ),
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
      incomplete: alertMatches.filter(
        (item) => missingPlaybookFields(item.alert).length > 0,
      ).length,
      contractIssues: alertMatches.filter(
        (item) => playbookContractIssues(item.alert).length > 0,
      ).length,
    }),
    [alertMatches],
  );

  const exitOutcomeCounts = useMemo(() => {
    const counts = {
      total: latestExitAlertMatches.length,
      stop: 0,
      tp1: 0,
      tp2: 0,
      tp3: 0,
      tp4: 0,
      totalR: 0,
      knownR: 0,
      latestAlertTime: 0,
    };
    for (const item of latestExitAlertMatches) {
      const event = item.alert.event ?? "";
      if (event === "EXIT_STOP") counts.stop += 1;
      if (event === "EXIT_TP1") counts.tp1 += 1;
      if (event === "EXIT_TP2") counts.tp2 += 1;
      if (event === "EXIT_TP3") counts.tp3 += 1;
      if (event === "EXIT_TP4") counts.tp4 += 1;
      if (item.alert.outcomeR != null) {
        counts.totalR += item.alert.outcomeR;
        counts.knownR += 1;
      }
      const alertTime =
        typeof item.alert.alertTime === "number"
          ? item.alert.alertTime
          : item.alert.candleTime ?? 0;
      counts.latestAlertTime = Math.max(counts.latestAlertTime, alertTime);
    }
    return {
      ...counts,
      averageR: counts.knownR ? counts.totalR / counts.knownR : 0,
    };
  }, [latestExitAlertMatches]);

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

  const pineActionCounts = useMemo(
    () => ({
      enter: latestAlertMatches.filter((item) => item.alert.action === "ENTER")
        .length,
      wait: latestAlertMatches.filter((item) => item.alert.action === "WAIT")
        .length,
      skip: latestAlertMatches.filter((item) => item.alert.action === "SKIP")
        .length,
      doNotHold: latestAlertMatches.filter(
        (item) => item.alert.action === "DO_NOT_HOLD",
      ).length,
      missing: latestAlertMatches.filter((item) => item.alert.action == null)
        .length,
    }),
    [latestAlertMatches],
  );

  const alertSourceCounts = useMemo(
    () =>
      latestAlertMatches.reduce(
        (acc, item) => {
          const original =
            item.alert.originalTriangleSignal === true ||
            item.alert.decisionEvent === "original_triangle";
          const liveLatch =
            item.alert.latchedSignal === true ||
            item.alert.decisionEvent === "first_touch";
          if (original) {
            acc.original += 1;
          } else if (liveLatch) {
            acc.liveLatch += 1;
          } else {
            acc.unknown += 1;
          }
          return acc;
        },
        { original: 0, liveLatch: 0, unknown: 0 },
      ),
    [latestAlertMatches],
  );

  const paperOutcomeCounts = useMemo(() => {
    const emptyCounts = () => ({
      unreviewed: 0,
      worked: 0,
      failed: 0,
      would_have_worked: 0,
      avoided_loss: 0,
      unclear: 0,
    });
    const countsByDecision = {
      ENTER: emptyCounts(),
      WAIT: emptyCounts(),
      SKIP: emptyCounts(),
      DO_NOT_HOLD: emptyCounts(),
      "NO DATA": emptyCounts(),
    } satisfies Record<Decision | "NO DATA", Record<PaperOutcome, number>>;
    const totals = emptyCounts();

    for (const item of latestAlertMatches) {
      const outcome =
        paperOutcomes[paperOutcomeKey(item.alert)] ?? "unreviewed";
      const action = decisionFromAlertOrMatch(item);
      totals[outcome] += 1;
      countsByDecision[action][outcome] += 1;
    }

    const reviewed =
      totals.worked +
      totals.failed +
      totals.would_have_worked +
      totals.avoided_loss +
      totals.unclear;
    return {
      ...totals,
      reviewed,
      byDecision: countsByDecision,
    };
  }, [latestAlertMatches, paperOutcomes]);

  const paperOutcomeRead = useMemo(() => {
    if (!latestAlertMatches.length) {
      return "No current or compatible Playbook alerts imported yet.";
    }
    if (paperOutcomeCounts.reviewed < 10) {
      return "keep collecting: mark at least 10 usable Playbook alerts before changing the rule.";
    }
    const enter = paperOutcomeCounts.byDecision.ENTER;
    const wait = paperOutcomeCounts.byDecision.WAIT;
    const skip = paperOutcomeCounts.byDecision.SKIP;
    const doNotHold = paperOutcomeCounts.byDecision.DO_NOT_HOLD;
    if (enter.failed > enter.worked && enter.failed >= 3) {
      return "tighten ENTER: marked ENTER rows are failing too often.";
    }
    if (
      wait.would_have_worked + skip.would_have_worked >= 3 &&
      wait.would_have_worked + skip.would_have_worked > enter.worked
    ) {
      return "loosen ENTER: WAIT/SKIP rows are being marked as would-have-worked opportunities.";
    }
    if (enter.worked >= 5 && enter.worked > enter.failed) {
      return "keep collecting: ENTER is worth continued paper review, not real money yet.";
    }
    if (
      paperOutcomeCounts.failed >=
      paperOutcomeCounts.worked +
        paperOutcomeCounts.would_have_worked +
        paperOutcomeCounts.avoided_loss
    ) {
      return "rule currently not useful: marked rows are not showing enough useful behavior.";
    }
    if (skip.avoided_loss + doNotHold.avoided_loss >= 3) {
      return "keep collecting: SKIP/DO NOT HOLD is avoiding some losses, but this is still paper evidence.";
    }
    return "keep collecting: no obvious rule change yet.";
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
          firstTouch: 0,
          originalTriangle: 0,
          decisionChange: 0,
          confirmedClose: 0,
          origSource: 0,
          liveLatchSource: 0,
          match: 0,
          different: 0,
          pineOnly: 0,
          noData: 0,
          worked: 0,
          failed: 0,
          wouldHaveWorked: 0,
          avoidedLoss: 0,
          unclear: 0,
          reviewed: 0,
          latestAlertTime: 0,
        } satisfies AlertGroupRow);
      current.count += 1;
      current.firstTouch += item.alert.decisionEvent === "first_touch" ? 1 : 0;
      current.originalTriangle +=
        item.alert.decisionEvent === "original_triangle" ? 1 : 0;
      current.decisionChange +=
        item.alert.decisionEvent === "decision_change" ? 1 : 0;
      current.confirmedClose +=
        item.alert.decisionEvent === "confirmed_close" ? 1 : 0;
      current.origSource += item.alert.originalTriangleSignal === true ? 1 : 0;
      current.liveLatchSource += item.alert.latchedSignal === true ? 1 : 0;
      current.match += item.agreement === "MATCH" ? 1 : 0;
      current.different += item.agreement === "DIFFERENT" ? 1 : 0;
      current.pineOnly += item.agreement === "PINE ONLY" ? 1 : 0;
      current.noData += item.agreement === "NO DATA" ? 1 : 0;
      const outcome =
        paperOutcomes[paperOutcomeKey(item.alert)] ?? "unreviewed";
      current.worked += outcome === "worked" ? 1 : 0;
      current.failed += outcome === "failed" ? 1 : 0;
      current.wouldHaveWorked += outcome === "would_have_worked" ? 1 : 0;
      current.avoidedLoss += outcome === "avoided_loss" ? 1 : 0;
      current.unclear += outcome === "unclear" ? 1 : 0;
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
              decisionFromAlertOrMatch(item) === "ENTER" &&
              outcome === "failed",
          )
          .slice(0, 5),
      },
      {
        title: "WAIT rows that would have worked",
        tone: "text-amber-200",
        why: "If these keep working, ENTER is too strict.",
        rows: withOutcome
          .filter(
            ({ item, outcome }) =>
              decisionFromAlertOrMatch(item) === "WAIT" &&
              outcome === "would_have_worked",
          )
          .slice(0, 5),
      },
      {
        title: "Unreviewed ENTER rows",
        tone: "text-lime-300",
        why: "These are the next paper-review rows to judge first.",
        rows: withOutcome
          .filter(
            ({ item, outcome }) =>
              decisionFromAlertOrMatch(item) === "ENTER" &&
              outcome === "unreviewed",
          )
          .slice(0, 5),
      },
      {
        title: "SKIP rows that avoided losses",
        tone: "text-cyan-200",
        why: "If these avoided losses, the filter is doing useful work.",
        rows: withOutcome
          .filter(
            ({ item, outcome }) =>
              decisionFromAlertOrMatch(item) === "SKIP" &&
              outcome === "avoided_loss",
          )
          .slice(0, 5),
      },
      {
        title: "SKIP rows that missed good trades",
        tone: "text-amber-200",
        why: "If these would have worked, the filter may be too strict.",
        rows: withOutcome
          .filter(
            ({ item, outcome }) =>
              decisionFromAlertOrMatch(item) === "SKIP" &&
              outcome === "would_have_worked",
          )
          .slice(0, 5),
      },
    ];
  }, [latestAlertMatches, paperOutcomes]);

  const denialSourceMatches = useMemo(() => {
    if (latestAlertMatches.length) return latestAlertMatches;
    return alertMatches.filter((item) => isPlaybookAlert(item.alert));
  }, [alertMatches, latestAlertMatches]);

  const denialMatrix = useMemo(() => {
    type MutableBucket = DenialBucket & {
      touchDepthRatioTotal: number;
      touchDepthRatioCount: number;
      bandWidthTotal: number;
      bandWidthCount: number;
    };
    const buckets = new Map<string, MutableBucket>();
    for (const item of denialSourceMatches) {
      const denial = denialReasonFor(item);
      const current =
        buckets.get(denial.key) ??
        ({
          key: denial.key,
          label: denial.label,
          plainMeaning: denial.plainMeaning,
          action: denial.action,
          count: 0,
          enter: 0,
          wait: 0,
          skip: 0,
          doNotHold: 0,
          long: 0,
          short: 0,
          current: 0,
          old: 0,
          noData: 0,
          averageTouchDepthRatio: 0,
          averageBandWidth: 0,
          early: 0,
          late: 0,
          snapback: 0,
          pushThrough: 0,
          rsiKnown: 0,
          rsiAligned: 0,
          rsiOpposed: 0,
          worked: 0,
          failed: 0,
          wouldHaveWorked: 0,
          avoidedLoss: 0,
          unclear: 0,
          reviewed: 0,
          latestAlertTime: 0,
          examples: [],
          touchDepthRatioTotal: 0,
          touchDepthRatioCount: 0,
          bandWidthTotal: 0,
          bandWidthCount: 0,
        } satisfies MutableBucket);
      current.count += 1;
      const action = decisionFromAlertOrMatch(item);
      if (action === "ENTER") current.enter += 1;
      if (action === "WAIT") current.wait += 1;
      if (action === "SKIP") current.skip += 1;
      if (action === "DO_NOT_HOLD") current.doNotHold += 1;
      if (item.status === "NO DATA") current.noData += 1;
      if (item.alert.direction === "long") current.long += 1;
      if (item.alert.direction === "short") current.short += 1;
      if (isLatestPlaybookAlert(item.alert)) current.current += 1;
      else current.old += 1;
      if (
        item.alert.minutesIntoBar != null &&
        item.alert.minutesIntoBar <= 1
      ) {
        current.early += 1;
      }
      const tf = normalizeTimeframe(item.alert.timeframe ?? "");
      const tfMinutes = tf ? timeframeMinutes(tf) : 1;
      if (
        item.alert.minutesIntoBar != null &&
        item.alert.minutesIntoBar / Math.max(tfMinutes, 1) >= 0.85
      ) {
        current.late += 1;
      }
      if (
        gateValueForDirection(
          item.alert,
          item.alert.longSnapback,
          item.alert.shortSnapback,
        ) === true
      ) {
        current.snapback += 1;
      }
      if (
        gateValueForDirection(
          item.alert,
          item.alert.longPushThrough,
          item.alert.shortPushThrough,
        ) === true
      ) {
        current.pushThrough += 1;
      }
      if (Number.isFinite(item.alert.touchDepthRatio)) {
        current.touchDepthRatioTotal += item.alert.touchDepthRatio ?? 0;
        current.touchDepthRatioCount += 1;
      }
      if (Number.isFinite(item.alert.bandWidth)) {
        current.bandWidthTotal += item.alert.bandWidth ?? 0;
        current.bandWidthCount += 1;
      }
      const rsi = rsiReadForAlert(item.alert);
      if (rsi.known) current.rsiKnown += 1;
      if (rsi.aligned) current.rsiAligned += 1;
      if (rsi.opposed) current.rsiOpposed += 1;
      const outcome =
        paperOutcomes[paperOutcomeKey(item.alert)] ?? "unreviewed";
      current.worked += outcome === "worked" ? 1 : 0;
      current.failed += outcome === "failed" ? 1 : 0;
      current.wouldHaveWorked += outcome === "would_have_worked" ? 1 : 0;
      current.avoidedLoss += outcome === "avoided_loss" ? 1 : 0;
      current.unclear += outcome === "unclear" ? 1 : 0;
      current.reviewed += outcome !== "unreviewed" ? 1 : 0;
      const alertTime =
        typeof item.alert.alertTime === "number"
          ? item.alert.alertTime
          : item.alert.candleTime ?? 0;
      current.latestAlertTime = Math.max(current.latestAlertTime, alertTime);
      if (current.examples.length < 3) {
        current.examples.push(
          `${item.alert.symbol ?? "unknown"} ${item.alert.timeframe ?? "n/a"} ${item.alert.direction ?? "n/a"} | ${item.alert.reason ?? item.note}`,
        );
      }
      buckets.set(denial.key, current);
    }
    return [...buckets.values()]
      .map(({ touchDepthRatioTotal, touchDepthRatioCount, bandWidthTotal, bandWidthCount, ...bucket }) => ({
        ...bucket,
        averageTouchDepthRatio: averageFromSum(
          touchDepthRatioTotal,
          touchDepthRatioCount,
        ),
        averageBandWidth: averageFromSum(bandWidthTotal, bandWidthCount),
      }))
      .sort((a, b) => {
        const rank = (row: DenialBucket) => {
          if (row.wouldHaveWorked > 0) return 0;
          if (row.key === "session") return 1;
          if (row.key === "push-through") return 2;
          if (row.reviewed === 0) return 3;
          return 4;
        };
        return rank(a) - rank(b) || b.count - a.count;
      });
  }, [denialSourceMatches, paperOutcomes]);

  const strategyDiagnosisMatrix = useMemo(() => {
    type MutableDiagnosis = StrategyDiagnosisRow & {
      proofRank: number;
    };
    const rows = new Map<string, MutableDiagnosis>();
    const rank: Record<StrategyDiagnosisRow["paperUse"], number> = {
      "paper-test": 0,
      review: 1,
      avoid: 2,
      "needs data": 3,
    };
    for (const item of denialSourceMatches) {
      const diagnosis = strategyDiagnosisFor(item);
      const current =
        rows.get(diagnosis.key) ??
        ({
          key: diagnosis.key,
          family: diagnosis.family,
          paperUse: diagnosis.paperUse,
          count: 0,
          enter: 0,
          wait: 0,
          skip: 0,
          doNotHold: 0,
          snapback: 0,
          pushThrough: 0,
          sessionBlocked: 0,
          early: 0,
          rsiKnown: 0,
          rsiAligned: 0,
          rsiOpposed: 0,
          worked: 0,
          failed: 0,
          wouldHaveWorked: 0,
          avoidedLoss: 0,
          plainFinding: diagnosis.plainFinding,
          paperRule: diagnosis.paperRule,
          entryPlan: diagnosis.entryPlan,
          exitPlan: diagnosis.exitPlan,
          invalidation: diagnosis.invalidation,
          nextProof: diagnosis.nextProof,
          examples: [],
          proofRank: rank[diagnosis.paperUse],
        } satisfies MutableDiagnosis);
      current.count += 1;
      if (item.status === "ENTER") current.enter += 1;
      if (item.status === "WAIT") current.wait += 1;
      if (item.status === "SKIP") current.skip += 1;
      if (item.status === "DO_NOT_HOLD") current.doNotHold += 1;
      if (
        gateValueForDirection(
          item.alert,
          item.alert.longSnapback,
          item.alert.shortSnapback,
        ) === true
      ) {
        current.snapback += 1;
      }
      if (
        gateValueForDirection(
          item.alert,
          item.alert.longPushThrough,
          item.alert.shortPushThrough,
        ) === true
      ) {
        current.pushThrough += 1;
      }
      if (item.alert.inSession === false) current.sessionBlocked += 1;
      if (
        item.alert.notTooEarly === false ||
        (item.alert.minutesIntoBar ?? 99) <= 1
      ) {
        current.early += 1;
      }
      const rsi = rsiReadForAlert(item.alert);
      if (rsi.known) current.rsiKnown += 1;
      if (rsi.aligned) current.rsiAligned += 1;
      if (rsi.opposed) current.rsiOpposed += 1;
      const outcome =
        paperOutcomes[paperOutcomeKey(item.alert)] ?? "unreviewed";
      current.worked += outcome === "worked" ? 1 : 0;
      current.failed += outcome === "failed" ? 1 : 0;
      current.wouldHaveWorked += outcome === "would_have_worked" ? 1 : 0;
      current.avoidedLoss += outcome === "avoided_loss" ? 1 : 0;
      if (current.examples.length < 3) {
        current.examples.push(
          `${item.alert.symbol ?? "unknown"} ${item.alert.timeframe ?? "n/a"} ${item.alert.direction ?? "n/a"} | ${item.alert.plainAction ?? item.alert.reason ?? item.note}`,
        );
      }
      rows.set(diagnosis.key, current);
    }
    return [...rows.values()]
      .map(({ proofRank, ...row }) => row)
      .sort((a, b) => {
        const rankA = rank[a.paperUse];
        const rankB = rank[b.paperUse];
        return (
          rankA - rankB ||
          b.wouldHaveWorked - a.wouldHaveWorked ||
          b.count - a.count
        );
      });
  }, [denialSourceMatches, paperOutcomes]);

  const strategyDiagnosisRead = useMemo(() => {
    if (!strategyDiagnosisMatrix.length) {
      return "No Playbook alerts imported yet. Import alerts before looking for paper-trading families.";
    }
    const paperTests = strategyDiagnosisMatrix.filter(
      (row) => row.paperUse === "paper-test",
    );
    const reviews = strategyDiagnosisMatrix.filter(
      (row) => row.paperUse === "review",
    );
    const missed = strategyDiagnosisMatrix.filter(
      (row) => row.wouldHaveWorked > 0,
    );
    if (missed.length) {
      return "Most important: some blocked families were marked Would have worked. Those are the first candidates for loosening the rule.";
    }
    if (paperTests.length) {
      return "There are paper-test families, but they still need marked outcomes before they deserve TradingView automation.";
    }
    if (reviews.length) {
      return "The useful work is review, not entry yet. The app is seeing possible families, but not enough proof to paper-enter automatically.";
    }
    return "This alert batch does not contain a clean paper-test family yet.";
  }, [strategyDiagnosisMatrix]);

  const denialMatrixRead = useMemo(() => {
    if (!denialSourceMatches.length) {
      return "Import Playbook alerts first. No denial matrix can be built from screenshots.";
    }
    const session = denialMatrix.find((row) => row.key === "session");
    const push = denialMatrix.find((row) => row.key === "push-through");
    const missed = denialMatrix.filter((row) => row.wouldHaveWorked > 0);
    if (missed.length) {
      return "Likely over-filtering: some denied rows were marked Would have worked. Review those first before trusting SKIP.";
    }
    if (session && session.count >= Math.max(5, denialSourceMatches.length * 0.35)) {
      return "First suspect: session filter. Too many raw Brutus signals are being denied by time-of-day before we know whether those sessions are bad.";
    }
    if (push && push.count >= Math.max(5, denialSourceMatches.length * 0.25)) {
      return "Second suspect: push-through filter. Strong pierces may be getting labeled danger before proving whether they reverse or continue.";
    }
    return "No single denial gate dominates yet. Mark paper outcomes so the matrix can say which rule is helping or hurting.";
  }, [denialMatrix, denialSourceMatches.length]);

  const alertReviewInstruction = useMemo(() => {
    if (!alertMatches.length) {
      return "Import the latest TradingView Playbook alert CSV. Do not judge live alerts from screenshots alone.";
    }
    if (!latestAlertMatches.length) {
      return "This file has no usable current or compatible Playbook alerts. Keep it as history, but do not use it for this evidence loop.";
    }
    if (alertVersionCounts.contractIssues > 0) {
      return "Some usable Playbook alerts failed the locked-parameter check. Re-export the Pine script before trusting this batch.";
    }
    if (alertVersionCounts.incomplete > 0) {
      return "Some usable Playbook alerts are missing required JSON fields. Recreate the alerts with Any alert() function call before trusting this batch.";
    }
    if (alertSourceCounts.liveLatch > 0) {
      return "Review LIVE LATCH rows separately. They prove a live first-touch alert fired, but they are not the same evidence as a current old-triangle match.";
    }
    if (agreementCounts.different > 0) {
      return "Stop and review DIFFERENT rows first. Pine and the app disagree, so those rows are not tradeable evidence yet.";
    }
    if (agreementCounts.pineOnly > 0) {
      return "Review PINE ONLY rows in TradingView. The Pine action is usable, but the app has no matching candle outcome yet.";
    }
    if (paperOutcomeCounts.byDecision.ENTER.failed > 0) {
      return "Replay failed ENTER rows first. If they really failed on TradingView, tighten the rule before paper-trading more.";
    }
    if (paperOutcomeCounts.byDecision.WAIT.would_have_worked > 0) {
      return "Review WAIT rows marked Would have worked. If these keep working, the ENTER rule is too strict.";
    }
    if (pineActionCounts.enter > 0) {
      return "Paper-review ENTER rows next. The question is simple: did this work if taken immediately, or was it already too late?";
    }
    if (pineActionCounts.wait > 0) {
      return "Review WAIT rows that still worked. If too many WAIT rows work, the entry rule is too strict.";
    }
    if (pineActionCounts.skip + pineActionCounts.doNotHold > 0) {
      return "This batch is mostly denied. Review good-looking SKIP/DO NOT HOLD rows first to see which gate is too strict.";
    }
    return "No entry evidence yet. Keep collecting alerts; do not force a trade from this batch.";
  }, [
    agreementCounts,
    alertMatches.length,
    alertSourceCounts.liveLatch,
    alertVersionCounts.contractIssues,
    alertVersionCounts.incomplete,
    paperOutcomeCounts,
    pineActionCounts,
    latestAlertMatches.length,
  ]);

  const plainEvidenceVerdict = useMemo(() => {
    if (!alertMatches.length) {
      return {
        tone: "border-amber-300/50 bg-amber-300/5 text-amber-100",
        title: "No alert evidence loaded",
        body: "The Pine script may be ready, but this page cannot judge live behavior until you import the latest TradingView alert log.",
        evidence:
          "Use TradingView alerts exported from the newest Brutus Playbook Pine.",
        action: "Import the latest TradingView alert CSV, then read this verdict again.",
      };
    }
    if (!latestAlertMatches.length) {
      return {
        tone: "border-red-500/50 bg-red-500/5 text-red-100",
        title: "Do not use this batch",
        body: "The uploaded file has alerts, but none are current or compatible with the locked Brutus Playbook.",
        evidence:
          "Old rows can help with history, but they need locked settings and full JSON fields before this page treats them as usable evidence.",
        action:
          "Import a Playbook CSV with rawSignal true, length 9, high/low sources, StdDev 2, OHLC, bands, entry, stop, and target.",
      };
    }
    if (
      alertVersionCounts.contractIssues > 0 ||
      alertVersionCounts.incomplete > 0
    ) {
      return {
        tone: "border-red-500/50 bg-red-500/5 text-red-100",
        title: "Fix the alert setup first",
        body: "Some usable alerts are missing required fields or do not prove the locked Brutus settings.",
        evidence:
          "A trustworthy row must show length 9, upper high, lower low, StdDev 2, rawSignal true, and the source fields.",
        action:
          "Re-export the Pine and recreate the TradingView alerts before judging ENTER or WAIT.",
      };
    }
    if (agreementCounts.different > 0) {
      return {
        tone: "border-red-500/50 bg-red-500/5 text-red-100",
        title: "Not tradeable evidence yet",
        body: "Pine and the app disagree on at least one current alert row.",
        evidence:
          "DIFFERENT rows mean the app cannot honestly say the decision logic is aligned.",
        action:
          "Review DIFFERENT rows in TradingView first; do not use this batch for trade decisions until disagreement is explained.",
      };
    }
    if (alertSourceCounts.liveLatch > 0) {
      return {
        tone: "border-amber-300/50 bg-amber-300/5 text-amber-100",
        title: "Review live-latch rows separately",
        body: "This batch includes first-touch alerts that fired live after the old triangle formula was not true at the current chart state.",
        evidence:
          "LIVE LATCH rows are useful for timing research, but they are not the same as old-triangle parity rows.",
        action:
          "Judge ORIG rows first. Then compare LIVE LATCH rows only as timing evidence.",
      };
    }
    if (agreementCounts.pineOnly > 0 || agreementCounts.noData > 0) {
      return {
        tone: "border-amber-300/50 bg-amber-300/5 text-amber-100",
        title: "Live-alert review only",
        body: "The app can read what Pine said, but it does not have matching candles to judge what happened after these alerts.",
        evidence:
          `Pine classified this batch as ${pineActionCounts.enter} ENTER, ${pineActionCounts.wait} WAIT, ${pineActionCounts.skip} SKIP, and ${pineActionCounts.doNotHold} DO NOT HOLD.`,
        action:
          "Use TradingView replay/visual review for these rows. Mark missed good trades and avoided losses so the app can expose over-filtering.",
      };
    }
    if (alertCounts.enter > 0) {
      return {
        tone: "border-lime-400/50 bg-lime-400/5 text-lime-100",
        title: "Paper review only",
        body: "This batch has ENTER candidates and no setup-blocking import problem.",
        evidence:
          "That means the evidence loop is usable; it does not mean the strategy is profitable yet.",
        action:
          "Replay ENTER rows first and mark Worked, Failed, or Unclear. Real money still waits.",
      };
    }
    return {
      tone: "border-border bg-background text-foreground",
      title: "No trade call in this batch",
      body: "The usable alerts did not produce an ENTER candidate.",
      evidence:
        "That can be correct behavior if the move was late, noisy, or not enough like the tested buckets.",
      action:
        "Keep collecting alerts and review WAIT rows only if they repeatedly would have worked.",
    };
  }, [
    agreementCounts,
    alertCounts.enter,
    alertMatches.length,
    alertSourceCounts.liveLatch,
    alertVersionCounts.contractIssues,
    alertVersionCounts.incomplete,
    latestAlertMatches.length,
    pineActionCounts,
  ]);

  const tradeabilityVerdict = useMemo(() => {
    const enter = paperOutcomeCounts.byDecision.ENTER;
    const wait = paperOutcomeCounts.byDecision.WAIT;
    const skip = paperOutcomeCounts.byDecision.SKIP;
    const doNotHold = paperOutcomeCounts.byDecision.DO_NOT_HOLD;
    const setupBlocked =
      !latestAlertMatches.length ||
      alertVersionCounts.contractIssues > 0 ||
      alertVersionCounts.incomplete > 0 ||
      agreementCounts.different > 0;
    const hasUnscoredRows = agreementCounts.pineOnly + agreementCounts.noData > 0;
    let status: TradeabilityStatus = "not enough evidence";
    let reason =
      "There are not enough clean, marked usable Playbook alerts to judge the rule.";
    let next =
      "Keep collecting usable Playbook alerts and mark outcomes before changing rules.";

    if (setupBlocked) {
      status = "not enough evidence";
      reason =
        "The current evidence is missing, incomplete, old, or disagrees with the app.";
      next =
        "Fix the alert/candle evidence first. Do not use this batch for trade decisions.";
    } else if (paperOutcomeCounts.reviewed < 10) {
      status = "not enough evidence";
      reason = `${paperOutcomeCounts.reviewed}/10 usable alerts have marked outcomes.`;
      next =
        "Replay and mark at least 10 usable alerts before judging the rule.";
    } else if (enter.failed >= 3 && enter.failed > enter.worked) {
      status = "revise rules";
      reason =
        "Marked ENTER rows are failing more often than they are working.";
      next =
        "Tighten ENTER before collecting more evidence. Do not add size or trust the current entry rule.";
    } else if (
      wait.would_have_worked + skip.would_have_worked >= 3 &&
      wait.would_have_worked + skip.would_have_worked > enter.worked
    ) {
      status = "revise rules";
      reason =
        "Too many WAIT/SKIP rows are being marked as missed good trades.";
      next =
        "Loosen one entry condition as a paper hypothesis, then retest.";
    } else if (
      enter.worked >= 5 &&
      enter.worked > enter.failed &&
      !hasUnscoredRows
    ) {
      status = "cautiously continue collecting";
      reason =
        "ENTER has some marked positive evidence and the batch has no app/candle mismatch.";
      next =
        "Keep collecting and marking. This is still not real-money approval.";
    } else if (
      skip.avoided_loss + doNotHold.avoided_loss >= 3 ||
      enter.worked > 0
    ) {
      status = "paper-review only";
      reason =
        "Some pieces look useful, but the evidence is not strong or clean enough yet.";
      next =
        "Continue paper review. Do not trade funded money from this verdict.";
    }

    return { status, reason, next };
  }, [
    agreementCounts,
    alertVersionCounts.contractIssues,
    alertVersionCounts.incomplete,
    latestAlertMatches.length,
    paperOutcomeCounts,
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
      const texts = await Promise.all(
        selectedFiles.map(async (file) => file.text()),
      );
      const parsed = texts.flatMap((text) => parseAlertLog(text));
      const sourceRows = texts.reduce(
        (total, text) => total + countSourceRows(text),
        0,
      );
      if (!parsed.length) {
        if (texts.some(isNamedAlertConditionExport)) {
          throw new Error(WRONG_TRADINGVIEW_ALERT_TYPE_MESSAGE);
        }
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
        sourceRows,
        parsed: parsed.length,
        ignoredRows: Math.max(0, sourceRows - parsed.length),
        added,
        duplicates,
        current: parsed.filter(isLatestPlaybookAlert).length,
        old: parsed.filter(
          (alert) => isPlaybookAlert(alert) && !isLatestPlaybookAlert(alert),
        ).length,
        legacy: parsed.filter((alert) => !isPlaybookAlert(alert)).length,
        incomplete: parsed.filter(
          (alert) => missingPlaybookFields(alert).length > 0,
        ).length,
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
                alertSourceCounts,
                denialMatrix,
                denialMatrixRead,
                strategyDiagnosisMatrix,
                strategyDiagnosisRead,
                paperOutcomeCounts,
                paperOutcomeRead,
                tradeabilityVerdict,
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
        <section className="grid gap-2 border border-cyan-500/40 bg-cyan-500/5 p-3 font-mono text-xs md:grid-cols-6">
          <span>
            Alert files:{" "}
            <strong className="text-foreground">
              {alertImportResult.files}
            </strong>
          </span>
          <span>
            Source / usable / ignored:{" "}
            <strong className="text-foreground">
              {alertImportResult.sourceRows}
            </strong>{" "}
            /{" "}
            <strong className="text-cyan-200">
              {alertImportResult.parsed}
            </strong>{" "}
            /{" "}
            <strong
              className={
                alertImportResult.ignoredRows > 0
                  ? "text-amber-200"
                  : "text-muted-foreground"
              }
            >
              {alertImportResult.ignoredRows}
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
          <span
            className={
              alertImportResult.incomplete > 0
                ? "text-red-300"
                : "text-muted-foreground"
            }
          >
            Incomplete: {alertImportResult.incomplete}
          </span>
        </section>
      )}

      <section className="grid gap-3 border border-primary/50 bg-primary/5 p-4 md:grid-cols-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
            1. File Imported
          </p>
          <p className="mt-2 text-sm text-foreground">
            {alertImportResult
              ? `${alertImportResult.files} alert file(s), ${alertImportResult.current} usable Playbook rows`
              : "No TradingView alert file imported in this session."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Old or legacy alerts stay visible, but they are not the main review
            set.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
            2. Alerts That Matter
          </p>
          <p className="mt-2 text-sm text-foreground">
            Pine said: {pineActionCounts.enter} ENTER, {pineActionCounts.wait}{" "}
            WAIT, {pineActionCounts.skip} SKIP, {pineActionCounts.doNotHold} DO
            NOT HOLD.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            App-scored rows: {alertCounts.enter + alertCounts.wait + alertCounts.skip + alertCounts.doNotHold}.
            PINE ONLY / NO DATA rows need TradingView visual review.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
            3. Review Next
          </p>
          <p className="mt-2 text-sm text-foreground">
            {alertReviewInstruction}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mark rows as Worked, Failed, Would have worked, Avoided loss, or
            Unclear.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
            4. Today&apos;s Status
          </p>
          <p className="mt-2 text-sm font-bold text-foreground">
            {tradeabilityVerdict.status}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tradeabilityVerdict.next}
          </p>
        </div>
      </section>

      <section className="grid gap-3 border border-cyan-500/50 bg-cyan-500/5 p-4 md:grid-cols-[0.8fr_1.2fr_1.2fr]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
            Tradeability Verdict
          </p>
          <p className="mt-2 font-display text-xl font-bold capitalize text-foreground">
            {tradeabilityVerdict.status}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Why
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {tradeabilityVerdict.reason}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Next
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {tradeabilityVerdict.next}
          </p>
        </div>
      </section>

      <section className="border border-red-500/50 bg-red-500/5 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-red-300" />
          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-red-100">
              Not Trade-Ready
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This page is an evidence desk, not a profit claim. ENTER means
              paper-review candidate only. Real-money use requires marked
              outcomes, repeated fresh alerts, and a later tradeability verdict.
            </p>
          </div>
        </div>
      </section>

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
            Setting up TradingView: export the Pine script first. Reviewing
            evidence: import the Brutus Intrabar JSON, then import the newest
            TradingView alert CSV.
          </p>
        </div>
        <div>
          <p className="font-display text-sm font-bold">What Counts</p>
          <p className="mt-2 text-sm text-muted-foreground">
            ENTER only means paper-review candidate. MATCH means Pine and app
            agree. DIFFERENT or PINE ONLY means pause and verify before using
            the row as evidence.
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
                Paper-review candidate only. Do not treat it as real-money
                approval.
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
                evidence, not perfect historical replay. The Playbook script alerts
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
              behavior match one of these rows. ENTER still means paper review,
              not permission to trade funded money.
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
            <span className="border border-cyan-400/50 px-2 py-1 text-cyan-200">
              ORIG {alertSourceCounts.original}
            </span>
            <span className="border border-amber-300/50 px-2 py-1 text-amber-200">
              LIVE LATCH {alertSourceCounts.liveLatch}
            </span>
            <span className="border border-border px-2 py-1 text-muted-foreground">
              UNKNOWN SOURCE {alertSourceCounts.unknown}
            </span>
            <span className="border border-cyan-400/50 px-2 py-1 text-cyan-200">
              EXIT OUTCOMES {exitOutcomeCounts.total}
            </span>
            <span className="border border-lime-400/50 px-2 py-1 text-lime-300">
              PINE ENTER {pineActionCounts.enter}
            </span>
            <span className="border border-amber-300/50 px-2 py-1 text-amber-200">
              PINE WAIT {pineActionCounts.wait}
            </span>
            <span className="border border-red-500/50 px-2 py-1 text-red-300">
              PINE SKIP {pineActionCounts.skip}
            </span>
            <span className="border border-fuchsia-400/50 px-2 py-1 text-fuchsia-200">
              PINE DO NOT HOLD {pineActionCounts.doNotHold}
            </span>
            <span className="border border-border px-2 py-1 text-muted-foreground">
              APP NO DATA {alertCounts.noData}
            </span>
            {alertVersionCounts.contractIssues > 0 && (
              <span className="border border-red-500/50 px-2 py-1 text-red-300">
                PARAMETER ISSUE {alertVersionCounts.contractIssues}
              </span>
            )}
            {alertVersionCounts.incomplete > 0 && (
              <span className="border border-red-500/50 px-2 py-1 text-red-300">
                INCOMPLETE {alertVersionCounts.incomplete}
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
        <div
          className={`mt-3 grid gap-3 border p-3 text-sm md:grid-cols-[1fr_1fr] ${plainEvidenceVerdict.tone}`}
        >
          <div>
            <p className="font-display text-sm font-bold">
              Plain Verdict: {plainEvidenceVerdict.title}
            </p>
            <p className="mt-1 text-muted-foreground">
              {plainEvidenceVerdict.body}
            </p>
          </div>
          <div className="grid gap-2">
            <p>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                What counts
              </span>
              <br />
              <span className="text-foreground">
                {plainEvidenceVerdict.evidence}
              </span>
            </p>
            <p>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Do this next
              </span>
              <br />
              <span className="text-foreground">
                {plainEvidenceVerdict.action}
              </span>
            </p>
          </div>
        </div>
        {exitOutcomeCounts.total > 0 && (
          <div className="mt-3 border border-cyan-400/40 bg-cyan-400/5 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-sm font-bold">
                  Exit / TP Evidence
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  These are follow-up alerts from trades the Pine already
                  marked as ENTER. They are not new entries.
                </p>
              </div>
              <span className="border border-cyan-400/60 px-2 py-1 font-mono text-xs text-cyan-200">
                Avg {exitOutcomeCounts.averageR.toFixed(2)}R
              </span>
            </div>
            <div className="mt-3 grid gap-2 font-mono text-xs sm:grid-cols-6">
              <div className="border border-border p-2">
                <span className="block text-muted-foreground">Total</span>
                <span className="text-lg text-foreground">
                  {exitOutcomeCounts.total}
                </span>
              </div>
              <div className="border border-red-500/40 p-2">
                <span className="block text-muted-foreground">Stops</span>
                <span className="text-lg text-red-300">
                  {exitOutcomeCounts.stop}
                </span>
              </div>
              <div className="border border-lime-400/40 p-2">
                <span className="block text-muted-foreground">TP1</span>
                <span className="text-lg text-lime-300">
                  {exitOutcomeCounts.tp1}
                </span>
              </div>
              <div className="border border-lime-400/40 p-2">
                <span className="block text-muted-foreground">TP2</span>
                <span className="text-lg text-lime-300">
                  {exitOutcomeCounts.tp2}
                </span>
              </div>
              <div className="border border-lime-400/40 p-2">
                <span className="block text-muted-foreground">TP3</span>
                <span className="text-lg text-lime-300">
                  {exitOutcomeCounts.tp3}
                </span>
              </div>
              <div className="border border-lime-400/40 p-2">
                <span className="block text-muted-foreground">TP4</span>
                <span className="text-lg text-lime-300">
                  {exitOutcomeCounts.tp4}
                </span>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse font-mono text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Time</th>
                    <th className="px-2 py-2">Symbol</th>
                    <th className="px-2 py-2">TF</th>
                    <th className="px-2 py-2">Side</th>
                    <th className="px-2 py-2">Outcome</th>
                    <th className="px-2 py-2">R</th>
                    <th className="px-2 py-2">Price</th>
                    <th className="px-2 py-2">Plain read</th>
                  </tr>
                </thead>
                <tbody>
                  {latestExitAlertMatches.slice(0, 12).map(({ alert }) => (
                    <tr className="border-b border-border/60" key={alert.id}>
                      <td className="px-2 py-2">
                        {fmtDate(
                          typeof alert.alertTime === "number"
                            ? alert.alertTime
                            : alert.candleTime,
                        )}
                      </td>
                      <td className="px-2 py-2 text-foreground">
                        {alert.symbol ?? "unknown"}
                      </td>
                      <td className="px-2 py-2">
                        {normalizeTimeframe(alert.timeframe) ?? "n/a"}
                      </td>
                      <td className="px-2 py-2">{alert.direction ?? "n/a"}</td>
                      <td className="px-2 py-2 text-cyan-200">
                        {alert.event ?? alert.outcome ?? "exit"}
                      </td>
                      <td className="px-2 py-2">
                        {alert.outcomeR != null
                          ? `${alert.outcomeR.toFixed(2)}R`
                          : "n/a"}
                      </td>
                      <td className="px-2 py-2">
                        {fmtPrice(alert.outcomePrice)}
                      </td>
                      <td className="max-w-md whitespace-normal px-2 py-2 text-muted-foreground">
                        {alert.plainAction ?? alert.reason ?? "Exit event."}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
              <span className="block text-muted-foreground">Worked</span>
              <span className="text-lg text-lime-300">
                {paperOutcomeCounts.worked}
              </span>
            </div>
            <div className="border border-red-500/40 p-2">
              <span className="block text-muted-foreground">Failed</span>
              <span className="text-lg text-red-300">
                {paperOutcomeCounts.failed}
              </span>
            </div>
            <div className="border border-amber-300/40 p-2">
              <span className="block text-muted-foreground">
                Would have worked
              </span>
              <span className="text-lg text-amber-200">
                {paperOutcomeCounts.would_have_worked}
              </span>
            </div>
            <div className="border border-cyan-300/40 p-2">
              <span className="block text-muted-foreground">Avoided loss</span>
              <span className="text-lg text-cyan-200">
                {paperOutcomeCounts.avoided_loss}
              </span>
            </div>
          </div>
          <div className="md:col-span-2">
            <p className="font-display text-sm font-bold">How to mark rows</p>
            <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
              <p>
                <span className="font-mono text-lime-300">
                  Worked = the alert did what it was supposed to do.
                </span>{" "}
                Mark this when ENTER paid or when SKIP/DO NOT HOLD correctly
                avoided the bad move.
              </p>
              <p>
                <span className="font-mono text-red-300">
                  Failed = the alert was wrong.
                </span>{" "}
                Mark this when ENTER moved against the trade or a SKIP kept you
                out of a good trade.
              </p>
              <p>
                <span className="font-mono text-amber-200">
                  Would have worked = WAIT/SKIP missed a good move.
                </span>{" "}
                Mark this when the app did not say ENTER, but the trade clearly
                would have worked.
              </p>
              <p>
                <span className="font-mono text-cyan-200">
                  Avoided loss = skipping saved you.
                </span>{" "}
                Mark this when SKIP or DO NOT HOLD kept you out of a bad move.
              </p>
              <p>
                <span className="font-mono text-muted-foreground">
                  Unclear = not enough evidence.
                </span>{" "}
                Use this when replay is messy. Leave blank when unchecked.
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
                  rule, would-have-worked WAITs loosen it, and unreviewed
                  ENTERs get checked before anything else.
                </p>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                Usable Playbook only
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
        {denialMatrix.length > 0 && (
          <div className="mt-3 border border-amber-300/50 bg-amber-300/5 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-sm font-bold">
                  Why Was This Denied?
                </p>
                <p className="mt-1 max-w-4xl text-xs text-muted-foreground">
                  This checks every raw Playbook alert and separates the real
                  blockers: session, push-through, early timing, no snapback,
                  no candle data, and accepted candidates. It is designed to
                  catch over-filtering instead of hiding good setups under SKIP.
                </p>
              </div>
              <span className="border border-amber-300/60 px-2 py-1 font-mono text-xs text-amber-200">
                {denialSourceMatches.length} alert(s)
              </span>
            </div>
            <div className="mt-3 border border-border bg-background p-3 text-sm">
              <p className="font-display text-sm font-bold">Plain read</p>
              <p className="mt-1 text-muted-foreground">{denialMatrixRead}</p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse font-mono text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Gate</th>
                    <th className="px-2 py-2">Count</th>
                    <th className="px-2 py-2">What it means</th>
                    <th className="px-2 py-2">Action mix</th>
                    <th className="px-2 py-2">Direction</th>
                    <th className="px-2 py-2">Timing</th>
                    <th className="px-2 py-2">Pierce / width</th>
                    <th className="px-2 py-2">Snap / push</th>
                    <th className="px-2 py-2">RSI clue</th>
                    <th className="px-2 py-2">Paper result</th>
                    <th className="px-2 py-2">Do next</th>
                  </tr>
                </thead>
                <tbody>
                  {denialMatrix.map((row) => (
                    <tr className="border-b border-border/60" key={row.key}>
                      <td className="px-2 py-2 text-foreground">
                        {row.label}
                        <span className="block text-muted-foreground">
                          {row.current} current | {row.old} old
                        </span>
                      </td>
                      <td className="px-2 py-2 text-lg text-amber-200">
                        {row.count}
                      </td>
                      <td className="max-w-sm whitespace-normal px-2 py-2 text-muted-foreground">
                        {row.plainMeaning}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        <span className="block text-lime-300">
                          ENTER {row.enter}
                        </span>
                        <span className="block text-amber-200">
                          WAIT {row.wait}
                        </span>
                        <span className="block text-red-300">
                          SKIP {row.skip}
                        </span>
                        <span className="block text-fuchsia-200">
                          DO NOT HOLD {row.doNotHold}
                        </span>
                        {row.noData > 0 && (
                          <span className="block">NO DATA {row.noData}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        Long {row.long}
                        <span className="block">Short {row.short}</span>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        Early {row.early}
                        <span className="block">Late {row.late}</span>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        Depth {(row.averageTouchDepthRatio * 100).toFixed(1)}%
                        <span className="block">
                          Width {fmtPrice(row.averageBandWidth)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        Snap {row.snapback}
                        <span className="block">Push {row.pushThrough}</span>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        Known {row.rsiKnown}
                        <span className="block text-lime-300">
                          aligned {row.rsiAligned}
                        </span>
                        <span className="block text-red-300">
                          opposed {row.rsiOpposed}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <span className="text-lime-300">
                          {row.worked} worked
                        </span>
                        <span className="block text-red-300">
                          {row.failed} failed
                        </span>
                        <span className="block text-amber-200">
                          {row.wouldHaveWorked} missed good
                        </span>
                        <span className="block text-cyan-200">
                          {row.avoidedLoss} avoided loss
                        </span>
                        <span className="block text-muted-foreground">
                          {row.reviewed} reviewed
                        </span>
                      </td>
                      <td className="max-w-sm whitespace-normal px-2 py-2 text-muted-foreground">
                        {row.action}
                        {row.examples.length > 0 && (
                          <span className="mt-1 block text-[10px] text-muted-foreground">
                            Example: {row.examples[0]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {strategyDiagnosisMatrix.length > 0 && (
          <div className="mt-3 border border-lime-400/40 bg-lime-400/5 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-sm font-bold">
                  Strategy Diagnosis Matrix
                </p>
                <p className="mt-1 max-w-4xl text-xs text-muted-foreground">
                  This turns the denied-alert evidence into paper-trading
                  hypotheses. It separates snapback reversal, push-through
                  continuation, session-blocked review, early-touch wick risk,
                  RSI clues, and missing-data rows.
                </p>
              </div>
              <span className="border border-lime-400/60 px-2 py-1 font-mono text-xs text-lime-300">
                paper hypotheses
              </span>
            </div>
            <div className="mt-3 border border-border bg-background p-3 text-sm">
              <p className="font-display text-sm font-bold">
                Closest practical read
              </p>
              <p className="mt-1 text-muted-foreground">
                {strategyDiagnosisRead}
              </p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1240px] border-collapse font-mono text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Family</th>
                    <th className="px-2 py-2">Use</th>
                    <th className="px-2 py-2">Count</th>
                    <th className="px-2 py-2">Finding</th>
                    <th className="px-2 py-2">Paper rule</th>
                    <th className="px-2 py-2">Entry</th>
                    <th className="px-2 py-2">Exit</th>
                    <th className="px-2 py-2">Invalidation</th>
                    <th className="px-2 py-2">Clues</th>
                    <th className="px-2 py-2">Proof needed</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyDiagnosisMatrix.map((row) => (
                    <tr className="border-b border-border/60" key={row.key}>
                      <td className="px-2 py-2 text-foreground">
                        {row.family}
                        <span className="block text-muted-foreground">
                          ENTER {row.enter} | WAIT {row.wait} | SKIP{" "}
                          {row.skip} | DNH {row.doNotHold}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`border px-2 py-1 uppercase ${paperUseClass(row.paperUse)}`}
                        >
                          {row.paperUse}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-lg text-lime-300">
                        {row.count}
                      </td>
                      <td className="max-w-xs whitespace-normal px-2 py-2 text-muted-foreground">
                        {row.plainFinding}
                      </td>
                      <td className="max-w-xs whitespace-normal px-2 py-2 text-muted-foreground">
                        {row.paperRule}
                      </td>
                      <td className="max-w-xs whitespace-normal px-2 py-2 text-muted-foreground">
                        {row.entryPlan}
                      </td>
                      <td className="max-w-xs whitespace-normal px-2 py-2 text-muted-foreground">
                        {row.exitPlan}
                      </td>
                      <td className="max-w-xs whitespace-normal px-2 py-2 text-muted-foreground">
                        {row.invalidation}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        Snap {row.snapback} | Push {row.pushThrough}
                        <span className="block">
                          Session block {row.sessionBlocked} | Early{" "}
                          {row.early}
                        </span>
                        <span className="block">
                          RSI known {row.rsiKnown} | aligned{" "}
                          {row.rsiAligned} | opposed {row.rsiOpposed}
                        </span>
                        <span className="block text-amber-200">
                          missed good {row.wouldHaveWorked}
                        </span>
                        <span className="block text-cyan-200">
                          avoided loss {row.avoidedLoss}
                        </span>
                      </td>
                      <td className="max-w-sm whitespace-normal px-2 py-2 text-muted-foreground">
                        {row.nextProof}
                        {row.examples.length > 0 && (
                          <span className="mt-1 block text-[10px] text-muted-foreground">
                            Example: {row.examples[0]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                  Usable Playbook alerts only, grouped by symbol, timeframe,
                  and Pine action. Event/source counts show whether the group
                  came from first touch, old-triangle parity, decision changes,
                  or confirmed close.
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
                    <th className="px-2 py-2">Event mix</th>
                    <th className="px-2 py-2">Source mix</th>
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
                      <td className="px-2 py-2 text-muted-foreground">
                        <span className="block">
                          Touch {row.firstTouch} | Old {row.originalTriangle}
                        </span>
                        <span className="block">
                          Change {row.decisionChange} | Close{" "}
                          {row.confirmedClose}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        <span className="block">ORIG {row.origSource}</span>
                        <span className="block">
                          LIVE LATCH {row.liveLatchSource}
                        </span>
                      </td>
                      <td className="px-2 py-2">{row.count}</td>
                      <td className="px-2 py-2 text-lime-300">{row.match}</td>
                      <td className="px-2 py-2">
                        <span className="text-lime-300">
                          {row.worked} worked
                        </span>
                        <span className="block text-red-300">
                          {row.failed} failed
                        </span>
                        <span className="block text-amber-200">
                          {row.wouldHaveWorked} would have worked
                        </span>
                        <span className="block text-cyan-200">
                          {row.avoidedLoss} avoided loss
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
                      {missingPlaybookFields(item.alert).length > 0 && (
                        <span className="block text-red-300">
                          Missing{" "}
                          {missingPlaybookFields(item.alert)
                            .slice(0, 4)
                            .join(", ")}
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
                          <span className="block">
                            {alertEventExplanation(item.alert.decisionEvent)}
                          </span>
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
                          {(
                            [
                              "worked",
                              "failed",
                              "would_have_worked",
                              "avoided_loss",
                              "unclear",
                            ] as const
                          ).map((nextOutcome) => (
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
                          ))}
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
                          Usable Playbook only
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
              treat that as paper-review evidence until marked outcomes and a
              later tradeability verdict prove otherwise.
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
            You can still export the Pine script from the top of this page to
            set up TradingView alerts. Import the Brutus Intrabar Lab export
            when you are ready to score those alerts against candle evidence.
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

