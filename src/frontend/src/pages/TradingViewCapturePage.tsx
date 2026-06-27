import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { useMemo, useState } from "react";

const STORAGE_KEY = "ict.tradingview.alerts.v1";
const PAPER_OUTCOME_STORAGE_KEY = "ict.tradingview.paperOutcomes.v1";

type TvAlert = {
  id: string;
  importedAt: number;
  strategy?: string;
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
  action?: string;
  plainAction?: string;
  reason?: string;
  alertMode?: string;
  mode?: string;
  confirmed?: boolean;
  modeReady?: boolean;
  inSession?: boolean;
  minutesIntoBar?: number;
  notTooEarly?: boolean;
  longSnapback?: boolean;
  shortSnapback?: boolean;
  longPushThrough?: boolean;
  shortPushThrough?: boolean;
  brokerSymbol?: string;
  mappedSymbol?: string;
  timeframe?: string;
  direction?: string;
  time?: number;
  alertTime?: number;
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
  raw: unknown;
};

type MatchStatus = "matched" | "nearby" | "no-match" | "no-data";
type BrutusReviewStatus = "ENTER" | "WAIT" | "SKIP" | "DO_NOT_HOLD";

type BrutusReview = {
  status: BrutusReviewStatus;
  reason: string;
  entry?: number;
  stop?: number;
  target?: number;
  bandWidth?: number;
  touchDepth?: number;
  touchDepthRatio?: number;
  touchToClose?: number;
  adverse?: number;
};

type ImportResult = {
  added: number;
  duplicates: number;
  total: number;
  latestPlaybook: number;
  oldPlaybook: number;
  legacy: number;
  incomplete: number;
  contractIssues: number;
};

type ReviewCounts = {
  enter: number;
  wait: number;
  skip: number;
  doNotHold: number;
};

type BreakdownRow = {
  label: string;
  counts: ReviewCounts;
  total: number;
};

type GateCount = {
  yes: number;
  no: number;
  unknown: number;
};

type ReadinessCheck = {
  label: string;
  passed: boolean;
  detail: string;
};

type PaperOutcome = "unreviewed" | "paid" | "failed" | "missed";

type PaperOutcomeCounts = Record<PaperOutcome, number>;

type EvidenceFilter = "latest" | "older" | "all";

const LATEST_PLAYBOOK_VERSION = "raw-parity-v10";
const EXAMPLE_PAYLOAD = `{"strategy":"brutus_playbook_v1","playbookVersion":"raw-parity-v10","rawSignal":true,"decisionEvent":"decision_change","previousAction":"WAIT","rawLongSignal":true,"rawShortSignal":false,"rawLongCondition":true,"rawShortCondition":false,"newLongTouch":true,"newShortTouch":false,"signalConflict":false,"mode":"first_touch","confirmed":false,"modeReady":true,"inSession":true,"minutesIntoBar":2.4,"notTooEarly":true,"longSnapback":true,"shortSnapback":false,"longPushThrough":false,"shortPushThrough":false,"symbol":"ALCHEMYMARKETS:DJ30.r","timeframe":"60","action":"ENTER","plainAction":"PAPER BUY NOW. Skip if you are late.","direction":"long","time":1782084600000,"timestamp":1782084600000,"candleTime":1782084600000,"alertTime":1782084723000,"open":51810.5,"high":51834.2,"low":51762.1,"close":51798.7,"upper":52104.8,"lower":51770.3,"bandWidth":334.5,"touchDepth":8.2,"touchDepthRatio":0.0245,"entry":51770.3,"stop":51685.2,"target":51872.4,"length":9,"upperSource":"high","lowerSource":"low","stdDev":2,"reason":"Original Brutus signal fired and price started snapping back."}`;

const BRUTUS_STRATEGIES = new Set(["brutus_band", "brutus_playbook_v1"]);
const BRUTUS_TIMEFRAMES = new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "45m",
  "1H",
]);

const ALCHEMY_INDEX_SYMBOLS = [
  { broker: "USTEC.R", market: "Nasdaq 100", appSymbol: "NAS100" },
  { broker: "DJ30.R", market: "US Top 30", appSymbol: "US30" },
  { broker: "US500.R", market: "S&P 500", appSymbol: "US500" },
  { broker: "JPN225.R", market: "Japan 225", appSymbol: "JPN225" },
  { broker: "AUS200.R", market: "S&P ASX", appSymbol: "AUS200" },
  { broker: "DE30.R", market: "DAX", appSymbol: "DE30" },
  { broker: "RUS2000.R", market: "Russell 2000", appSymbol: "RUS2000" },
  { broker: "UK100.R", market: "UK 100", appSymbol: "UK100" },
  { broker: "CHN50U.R", market: "China50", appSymbol: "CHN50" },
  { broker: "ES35.R", market: "IBEX 35", appSymbol: "ES35" },
];

function loadAlerts(): TvAlert[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .map((alert) => normalizePayload(alert.raw ?? alert))
          .filter(isImportableAlert)
      : [];
  } catch {
    return [];
  }
}

function saveAlerts(alerts: TvAlert[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
}

function loadPaperOutcomes(): Record<string, PaperOutcome> {
  try {
    const raw = window.localStorage.getItem(PAPER_OUTCOME_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, PaperOutcome] =>
        ["unreviewed", "paid", "failed", "missed"].includes(
          String(entry[1]),
        ),
      ),
    );
  } catch {
    return {};
  }
}

function savePaperOutcomes(outcomes: Record<string, PaperOutcome>) {
  window.localStorage.setItem(
    PAPER_OUTCOME_STORAGE_KEY,
    JSON.stringify(outcomes),
  );
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return undefined;
}

function unwrapWebhookPayload(raw: unknown): unknown {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    try {
      return unwrapWebhookPayload(JSON.parse(trimmed));
    } catch {
      return raw;
    }
  }
  if (!raw || typeof raw !== "object") return raw;
  const item = raw as Record<string, unknown>;
  const nested =
    item.content ??
    item.body ??
    item.requestBody ??
    item.payload ??
    item.data ??
    item.rawBody;
  if (nested !== undefined) {
    return unwrapWebhookPayload(nested);
  }
  if (item.request && typeof item.request === "object") {
    return unwrapWebhookPayload(item.request);
  }
  return raw;
}

function normalizePayload(raw: unknown): TvAlert {
  const unwrapped = unwrapWebhookPayload(raw);
  const item =
    unwrapped && typeof unwrapped === "object"
      ? (unwrapped as Record<string, unknown>)
      : {};
  const timestamp =
    asNumber(item.time) ??
    asNumber(item.timestamp) ??
    asNumber(item.candleTime) ??
    (typeof item.time === "string" ? Date.parse(item.time) : undefined);
  const alertTimestamp =
    asNumber(item.alertTime) ??
    asNumber(item.timenow) ??
    asNumber(item.receivedAt) ??
    (typeof item.alertTime === "string"
      ? Date.parse(item.alertTime)
      : undefined);
  const brokerSymbol =
    asString(item.symbol) ?? asString(item.ticker) ?? asString(item.tickerid);
  return {
    id: crypto.randomUUID(),
    importedAt: Date.now(),
    strategy: asString(item.strategy),
    playbookVersion: asString(item.playbookVersion),
    rawSignal: asBoolean(item.rawSignal),
    decisionEvent: asString(item.decisionEvent),
    previousAction: asString(item.previousAction),
    rawLongSignal: asBoolean(item.rawLongSignal),
    rawShortSignal: asBoolean(item.rawShortSignal),
    rawLongCondition: asBoolean(item.rawLongCondition),
    rawShortCondition: asBoolean(item.rawShortCondition),
    newLongTouch: asBoolean(item.newLongTouch),
    newShortTouch: asBoolean(item.newShortTouch),
    signalConflict: asBoolean(item.signalConflict),
    action: asString(item.action),
    plainAction: asString(item.plainAction),
    reason: asString(item.reason),
    alertMode: asString(item.alertMode),
    mode: asString(item.mode),
    confirmed: asBoolean(item.confirmed),
    modeReady: asBoolean(item.modeReady),
    inSession: asBoolean(item.inSession),
    minutesIntoBar: asNumber(item.minutesIntoBar),
    notTooEarly: asBoolean(item.notTooEarly),
    longSnapback: asBoolean(item.longSnapback),
    shortSnapback: asBoolean(item.shortSnapback),
    longPushThrough: asBoolean(item.longPushThrough),
    shortPushThrough: asBoolean(item.shortPushThrough),
    brokerSymbol,
    mappedSymbol: mapBrokerSymbol(brokerSymbol),
    timeframe: normalizeTimeframe(
      asString(item.timeframe) ?? asString(item.interval),
    ),
    direction: asString(item.direction) ?? asString(item.side),
    time: timestamp,
    alertTime: alertTimestamp,
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
    upperSource: asString(item.upperSource),
    lowerSource: asString(item.lowerSource),
    stdDev: asNumber(item.stdDev) ?? asNumber(item.mult),
    raw: unwrapped,
  };
}

function isImportableAlert(alert: TvAlert) {
  return Boolean(
    alert.brokerSymbol &&
      (alert.strategy || alert.action || alert.direction || alert.time != null),
  );
}
function normalizeTimeframe(timeframe?: string) {
  const raw = timeframe?.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === "60") return "1H";
  if (/^\d+$/.test(lower)) return `${lower}m`;
  if (lower.endsWith("m")) return lower;
  if (lower.endsWith("h")) return lower.toUpperCase();
  if (lower === "1d" || lower === "d") return "1D";
  return raw;
}

function timeframeMinutes(timeframe?: string) {
  const normalized = normalizeTimeframe(timeframe);
  if (!normalized) return undefined;
  const lower = normalized.toLowerCase();
  if (lower.endsWith("m")) return Number(lower.replace("m", ""));
  if (lower.endsWith("h")) return Number(lower.replace("h", "")) * 60;
  if (lower === "1d") return 1440;
  return undefined;
}

function alertIdentity(alert: TvAlert) {
  return [
    alert.strategy ?? "",
    alert.playbookVersion ?? "",
    alert.decisionEvent ?? "",
    alert.previousAction ?? "",
    alert.alertMode ?? "",
    alert.mode ?? "",
    alert.action ?? "",
    alert.plainAction ?? "",
    alert.reason ?? "",
    alert.confirmed ?? "",
    alert.modeReady ?? "",
    alert.inSession ?? "",
    alert.minutesIntoBar ?? "",
    alert.notTooEarly ?? "",
    alert.longSnapback ?? "",
    alert.shortSnapback ?? "",
    alert.longPushThrough ?? "",
    alert.shortPushThrough ?? "",
    alert.rawSignal ?? "",
    alert.rawLongSignal ?? "",
    alert.rawShortSignal ?? "",
    alert.rawLongCondition ?? "",
    alert.rawShortCondition ?? "",
    alert.newLongTouch ?? "",
    alert.newShortTouch ?? "",
    alert.signalConflict ?? "",
    alert.brokerSymbol ?? "",
    alert.timeframe ?? "",
    alert.direction ?? "",
    alert.time ?? "",
    alert.alertTime ?? "",
    alert.open ?? "",
    alert.high ?? "",
    alert.low ?? "",
    alert.close ?? "",
    alert.upper ?? "",
    alert.lower ?? "",
    alert.bandWidth ?? "",
    alert.touchDepth ?? "",
    alert.touchDepthRatio ?? "",
    alert.entry ?? "",
    alert.stop ?? "",
    alert.target ?? "",
    alert.length ?? "",
    alert.upperSource ?? "",
    alert.lowerSource ?? "",
    alert.stdDev ?? "",
  ].join("|");
}

function paperOutcomeKey(alert: TvAlert) {
  return [
    alert.strategy ?? "",
    alert.playbookVersion ?? "",
    alert.brokerSymbol ?? "",
    alert.timeframe ?? "",
    alert.time ?? "",
    alert.alertTime ?? "",
    alert.decisionEvent ?? "",
    alert.previousAction ?? "",
    alert.action ?? "",
    alert.direction ?? "",
  ].join("|");
}

function mergeAlerts(incoming: TvAlert[], current: TvAlert[]) {
  const seen = new Set(current.map(alertIdentity));
  const uniqueIncoming: TvAlert[] = [];
  let duplicates = 0;
  for (const alert of incoming) {
    const identity = alertIdentity(alert);
    if (seen.has(identity)) {
      duplicates += 1;
      continue;
    }
    seen.add(identity);
    uniqueIncoming.push(alert);
  }
  return {
    alerts: [...uniqueIncoming, ...current].slice(0, 500),
    result: {
      added: uniqueIncoming.length,
      duplicates,
      total: current.length + uniqueIncoming.length,
      latestPlaybook: uniqueIncoming.filter(isLatestPlaybookAlert).length,
      oldPlaybook: uniqueIncoming.filter(
        (alert) => isPlaybookAlert(alert) && !isLatestPlaybookAlert(alert),
      ).length,
      legacy: uniqueIncoming.filter(isLegacyBrutusAlert).length,
      incomplete: uniqueIncoming.filter(
        (alert) =>
          isLatestPlaybookAlert(alert) && missingPlaybookFields(alert).length > 0,
      ).length,
      contractIssues: uniqueIncoming.filter(
        (alert) =>
          isLatestPlaybookAlert(alert) && playbookContractIssues(alert).length > 0,
      ).length,
    },
  };
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

function parseCsvText(
  text: string,
  normalizeMany: (value: unknown) => TvAlert[],
) {
  const records = parseCsvRecords(text);
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
  const candidateCells =
    preferredIndexes.length > 0
      ? rows.flatMap((row) => preferredIndexes.map((index) => row[index] ?? ""))
      : records.flat();

  return candidateCells.flatMap((cell) => {
    for (const fragment of possibleJsonFragments(cell)) {
      for (const candidate of [fragment, fragment.replaceAll('""', '"')]) {
        try {
          return normalizeMany(JSON.parse(candidate));
        } catch {
          // Try the next candidate.
        }
      }
    }
    return [];
  });
}

function parsePayloadText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const normalizeMany = (value: unknown): TvAlert[] => {
    const unwrapped = unwrapWebhookPayload(value);
    if (Array.isArray(unwrapped)) return unwrapped.flatMap(normalizeMany);
    const alert = normalizePayload(unwrapped);
    return isImportableAlert(alert) ? [alert] : [];
  };
  try {
    const parsed = JSON.parse(trimmed);
    return normalizeMany(parsed);
  } catch {
    const parsedLines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return normalizeMany(JSON.parse(line));
        } catch {
          return [];
        }
      });
    if (parsedLines.length > 0) return parsedLines;
    const parsedCsv = parseCsvText(trimmed, normalizeMany);
    if (parsedCsv.length > 0) return parsedCsv;
    throw new Error(
      "No TradingView alert JSON found. Paste the request body JSON, a JSON export, or a Webhook.site CSV export.",
    );
  }
}

function mapBrokerSymbol(symbol?: string) {
  const upper = symbol?.toUpperCase() ?? "";
  const exactMatch = ALCHEMY_INDEX_SYMBOLS.find((item) =>
    upper.includes(item.broker),
  );
  if (exactMatch) return exactMatch.appSymbol;
  if (
    upper.includes("DJ30") ||
    upper.includes("US30") ||
    upper.includes("DOW")
  ) {
    return "US30";
  }
  if (
    upper.includes("NAS100") ||
    upper.includes("USTEC") ||
    upper.includes("NASDAQ")
  ) {
    return "NAS100";
  }
  if (
    upper.includes("US500") ||
    upper.includes("SPX") ||
    upper.includes("SP500")
  ) {
    return "US500";
  }
  if (
    upper.includes("JPN225") ||
    upper.includes("JP225") ||
    upper.includes("JPN") ||
    upper.includes("NIKKEI") ||
    upper.includes("NI225")
  ) {
    return "JPN225";
  }
  if (
    upper.includes("RUS2000") ||
    upper.includes("RUSSELL") ||
    upper.includes("RTY")
  ) {
    return "RUS2000";
  }
  return undefined;
}

function formatTime(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function formatAlertDelay(alert: TvAlert) {
  if (!alert.time || !alert.alertTime) return "alert time n/a";
  const minutes = Math.max(0, (alert.alertTime - alert.time) / 60000);
  if (minutes < 1) return "fired inside first minute";
  if (minutes < 60) return `fired +${minutes.toFixed(1)}m`;
  return `fired +${(minutes / 60).toFixed(1)}h`;
}

function pierceLabel(touchDepthRatio?: number) {
  if (touchDepthRatio == null || !Number.isFinite(touchDepthRatio)) {
    return "unknown pierce";
  }
  if (touchDepthRatio >= 0.15) return "deep stretch";
  if (touchDepthRatio >= 0.04) return "moderate pierce";
  if (touchDepthRatio > 0) return "shallow touch";
  return "touch only";
}

function formatPierce(alert: TvAlert, review: BrutusReview) {
  const depth = alert.touchDepth ?? review.touchDepth;
  const ratio = alert.touchDepthRatio ?? review.touchDepthRatio;
  if (depth == null && ratio == null) return "n/a";
  return `${pierceLabel(ratio)} (${ratio == null ? "?" : `${(ratio * 100).toFixed(1)}%`} width, ${depth == null ? "?" : depth.toFixed(1)} pts)`;
}

function directionFor(alert: TvAlert): "long" | "short" | undefined {
  const direction = alert.direction?.toLowerCase();
  if (direction === "long" || direction === "buy") return "long";
  if (direction === "short" || direction === "sell") return "short";
  return undefined;
}

function actionFor(alert: TvAlert) {
  return alert.action?.trim().toUpperCase().replace(/\s+/g, "_");
}

function pineActionLabel(alert: TvAlert) {
  return actionFor(alert)?.replaceAll("_", " ") ?? "missing";
}

function gateLabel(value?: boolean) {
  if (value == null) return "?";
  return value ? "yes" : "no";
}

function missingPlaybookFields(alert: TvAlert) {
  const missing: string[] = [];
  if (alert.rawSignal !== true) missing.push("rawSignal");
  if (!alert.decisionEvent) missing.push("decisionEvent");
  if (alert.decisionEvent === "decision_change" && !alert.previousAction) {
    missing.push("previousAction");
  }
  if (!actionFor(alert)) missing.push("action");
  if (!rawReasonFor(alert)) missing.push("reason");
  if (!alert.mode && !alert.alertMode) missing.push("mode");
  if (alert.confirmed == null) missing.push("confirmed");
  if (alert.modeReady == null) missing.push("modeReady");
  if (alert.inSession == null) missing.push("inSession");
  if (alert.minutesIntoBar == null) missing.push("minutesIntoBar");
  if (alert.notTooEarly == null) missing.push("notTooEarly");
  if (alert.longSnapback == null) missing.push("longSnapback");
  if (alert.shortSnapback == null) missing.push("shortSnapback");
  if (alert.longPushThrough == null) missing.push("longPushThrough");
  if (alert.shortPushThrough == null) missing.push("shortPushThrough");
  if (!alert.brokerSymbol) missing.push("symbol");
  if (!alert.timeframe) missing.push("timeframe");
  if (!directionFor(alert)) missing.push("direction");
  if (alert.time == null) missing.push("timestamp");
  if (alert.alertTime == null) missing.push("alertTime");
  if (alert.open == null) missing.push("open");
  if (alert.high == null) missing.push("high");
  if (alert.low == null) missing.push("low");
  if (alert.close == null) missing.push("close");
  if (alert.upper == null) missing.push("upper");
  if (alert.lower == null) missing.push("lower");
  if (alert.entry == null) missing.push("entry");
  if (alert.stop == null) missing.push("stop");
  if (alert.target == null) missing.push("target");
  if (alert.length !== 9) missing.push("length=9");
  if (alert.upperSource !== "high") missing.push("upperSource=high");
  if (alert.lowerSource !== "low") missing.push("lowerSource=low");
  if (alert.stdDev !== 2) missing.push("stdDev=2");
  return missing;
}

function playbookContractIssues(alert: TvAlert) {
  const issues: string[] = [];
  if (alert.length !== 9) issues.push("Length is not locked to 9");
  if (alert.upperSource !== "high") issues.push("Upper band source is not high");
  if (alert.lowerSource !== "low") issues.push("Lower band source is not low");
  if (alert.stdDev !== 2) issues.push("StdDev is not locked to 2");
  return issues;
}

function isPlaybookAlert(alert: TvAlert) {
  return alert.strategy === "brutus_playbook_v1" || alert.rawSignal === true;
}

function isLatestPlaybookAlert(alert: TvAlert) {
  return (
    isPlaybookAlert(alert) && alert.playbookVersion === LATEST_PLAYBOOK_VERSION
  );
}

function isLegacyBrutusAlert(alert: TvAlert) {
  return !isPlaybookAlert(alert) && alert.strategy === "brutus_band";
}

function rawReasonFor(alert: TvAlert) {
  if (alert.reason) return alert.reason;
  if (alert.plainAction) return alert.plainAction;
  if (alert.raw && typeof alert.raw === "object") {
    const raw = alert.raw as Record<string, unknown>;
    return asString(raw.plainAction) ?? asString(raw.reason);
  }
  return undefined;
}

function reviewBrutusAlert(alert: TvAlert): BrutusReview {
  const direction = directionFor(alert);
  const action = actionFor(alert);
  const rawReason = rawReasonFor(alert);
  if (alert.signalConflict) {
    return {
      status: "SKIP",
      reason:
        rawReason ??
        "Both original long and short signals fired on the same candle. Skip because direction is unclear.",
    };
  }
  const missing =
    !alert.brokerSymbol ||
    !alert.mappedSymbol ||
    !alert.timeframe ||
    !direction ||
    alert.high == null ||
    alert.low == null ||
    alert.close == null ||
    alert.upper == null ||
    alert.lower == null;
  if (missing) {
    return {
      status: "SKIP",
      reason: "Missing symbol, direction, timeframe, price, or band data.",
    };
  }
  if (alert.strategy && !BRUTUS_STRATEGIES.has(alert.strategy)) {
    return { status: "SKIP", reason: "Not a Brutus band alert." };
  }
  if (!BRUTUS_TIMEFRAMES.has(alert.timeframe ?? "")) {
    return {
      status: "SKIP",
      reason:
        "Only the tested 1m, 3m, 5m, 15m, 30m, 45m, and 1H Brutus exports are in scope.",
    };
  }

  const high = alert.high;
  const low = alert.low;
  const close = alert.close;
  const upper = alert.upper;
  const lower = alert.lower;
  if (
    high == null ||
    low == null ||
    close == null ||
    upper == null ||
    lower == null
  ) {
    return {
      status: "SKIP",
      reason: "Missing price or band data.",
    };
  }

  const bandWidth = Math.max(upper - lower, 0.0001);
  const touchDepth =
    alert.touchDepth ??
    (direction === "long" ? Math.max(lower - low, 0) : Math.max(high - upper, 0));
  const touchDepthRatio = alert.touchDepthRatio ?? touchDepth / bandWidth;
  const computedEntry = direction === "long" ? lower : upper;
  const entry = alert.entry ?? computedEntry;
  const stopDistance = bandWidth * 0.5;
  const computedStop =
    direction === "long" ? entry - stopDistance : entry + stopDistance;
  const stop = alert.stop ?? computedStop;
  const computedTarget =
    direction === "long"
      ? entry + stopDistance * 1.5
      : entry - stopDistance * 1.5;
  const target = alert.target ?? computedTarget;
  const touchToClose = direction === "long" ? close - entry : entry - close;
  const adverse =
    direction === "long" ? Math.max(entry - low, 0) : Math.max(high - entry, 0);
  const signalStopHit = adverse >= stopDistance;
  const movedTooFar = touchToClose > bandWidth * 0.35;
  const noRejectionYet = touchToClose <= 0;

  if (action === "ENTER") {
    return {
      status: "ENTER",
      reason:
        rawReason ?? "TradingView Pine rule says this is an entry candidate.",
      entry,
      stop,
      target,
      bandWidth,
      touchDepth,
      touchDepthRatio,
      touchToClose,
      adverse,
    };
  }
  if (action === "WAIT" || action === "WATCH") {
    return {
      status: "WAIT",
      reason:
        rawReason ?? "TradingView Pine rule says wait, but do not enter yet.",
      entry,
      stop,
      target,
      bandWidth,
      touchDepth,
      touchDepthRatio,
      touchToClose,
      adverse,
    };
  }
  if (action === "DO_NOT_HOLD") {
    return {
      status: "DO_NOT_HOLD",
      reason:
        rawReason ??
        "TradingView Pine rule says do not hold because price is pushing through the band.",
      entry,
      stop,
      target,
      bandWidth,
      touchDepth,
      touchDepthRatio,
      touchToClose,
      adverse,
    };
  }
  if (signalStopHit) {
    return {
      status: "SKIP",
      reason: "The alert candle already moved beyond the half-band stop zone.",
      entry,
      stop,
      target,
      bandWidth,
      touchDepth,
      touchDepthRatio,
      touchToClose,
      adverse,
    };
  }
  if (movedTooFar) {
    return {
      status: "SKIP",
      reason:
        "Skip. The move has already run too far away from the band touch.",
      entry,
      stop,
      target,
      bandWidth,
      touchDepth,
      touchDepthRatio,
      touchToClose,
      adverse,
    };
  }
  if (noRejectionYet) {
    return {
      status: "WAIT",
      reason: "Wait. No useful rejection away from the band is visible yet.",
      entry,
      stop,
      target,
      bandWidth,
      touchDepth,
      touchDepthRatio,
      touchToClose,
      adverse,
    };
  }
  return {
    status: "WAIT",
    reason:
      "Wait. This is close to the draft Brutus rule, but it is not a clean entry yet.",
    entry,
    stop,
    target,
    bandWidth,
    touchDepth,
    touchDepthRatio,
    touchToClose,
    adverse,
  };
}

function reviewTagFor(
  alert: TvAlert,
  review: BrutusReview,
  matchStatus: MatchStatus,
) {
  if (isLegacyBrutusAlert(alert)) return "Old script";
  if (!isPlaybookAlert(alert)) return "Not Playbook";
  if (!isLatestPlaybookAlert(alert)) return "Old Playbook";
  if (playbookContractIssues(alert).length > 0) return "Wrong settings";
  if (alert.signalConflict) return "Skip evidence";
  if (isLatestPlaybookAlert(alert) && missingPlaybookFields(alert).length > 0) {
    return "Missing fields";
  }
  if (matchStatus === "no-data" || matchStatus === "no-match") {
    return "TV only";
  }
  const risk =
    review.entry != null && review.stop != null
      ? Math.abs(review.entry - review.stop)
      : undefined;
  if (
    review.status === "ENTER" &&
    risk != null &&
    risk > 0 &&
    review.adverse != null &&
    review.adverse >= risk
  ) {
    return "Failed entry";
  }
  if (review.status === "ENTER") return "Review first";
  if (
    review.status === "WAIT" &&
    review.touchToClose != null &&
    review.bandWidth != null &&
    review.touchToClose > 0 &&
    review.touchToClose <= review.bandWidth * 0.35
  ) {
    return "Maybe loosen";
  }
  if (review.status === "DO_NOT_HOLD") return "Trap watch";
  if (review.status === "SKIP") return "Skip evidence";
  return "Paper log";
}

function reviewTagClass(tag: string) {
  if (tag === "Review first") return "text-cyan-300";
  if (tag === "Maybe loosen") return "text-lime-300";
  if (
    tag === "Failed entry" ||
    tag === "Missing fields" ||
    tag === "Wrong settings"
  ) {
    return "text-destructive";
  }
  if (
    tag === "Trap watch" ||
    tag === "Old script" ||
    tag === "Old Playbook" ||
    tag === "TV only"
  ) {
    return "text-amber-300";
  }
  return "text-muted-foreground";
}

function totalReviews(counts: ReviewCounts) {
  return counts.enter + counts.wait + counts.skip + counts.doNotHold;
}

function topBreakdownRows(
  rows: Record<string, ReviewCounts>,
  limit = 5,
): BreakdownRow[] {
  return Object.entries(rows)
    .map(([label, counts]) => ({
      label,
      counts,
      total: totalReviews(counts),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function countsText(counts: ReviewCounts) {
  return `E ${counts.enter} / W ${counts.wait} / NO ${counts.doNotHold} / S ${counts.skip}`;
}

function gateCountText(counts: GateCount) {
  return `yes ${counts.yes} / no ${counts.no} / ? ${counts.unknown}`;
}

function paperOutcomeCountsText(counts: PaperOutcomeCounts) {
  return `Paid ${counts.paid} / Failed ${counts.failed} / Missed ${counts.missed} / Open ${counts.unreviewed}`;
}

function emptyPaperOutcomeCounts(): PaperOutcomeCounts {
  return { unreviewed: 0, paid: 0, failed: 0, missed: 0 };
}

function plainRowInstruction(alert: TvAlert, review: BrutusReview) {
  const side =
    directionFor(alert) === "long"
      ? "LONG"
      : directionFor(alert) === "short"
        ? "SHORT"
        : "TRADE";
  if (review.status === "ENTER") {
    return `PAPER ENTER ${side}. Use the listed stop and target. Mark Paid or Failed after the move resolves.`;
  }
  if (review.status === "WAIT") {
    return "WAIT. Do nothing now. Mark Missed only if it clearly paid without giving an ENTER.";
  }
  if (review.status === "DO_NOT_HOLD") {
    return "DO NOT ENTER. Price is still pushing through the band. If paper-tracking, exit the idea.";
  }
  return "SKIP. Ignore this alert and wait for the next one.";
}

function paperOutcomeLabel(outcome: PaperOutcome) {
  if (outcome === "paid") return "Paid";
  if (outcome === "failed") return "Failed";
  if (outcome === "missed") return "Missed";
  return "Unreviewed";
}

function paperOutcomeClass(outcome: PaperOutcome) {
  if (outcome === "paid") return "text-lime-300";
  if (outcome === "failed") return "text-destructive";
  if (outcome === "missed") return "text-amber-300";
  return "text-muted-foreground";
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  if (value == null) return "";
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function evidenceRowsToCsv(
  rows: Array<{
    alert: TvAlert;
    status: MatchStatus;
    deltaMinutes?: number;
    brutusReview: BrutusReview;
  }>,
  paperOutcomes: Record<string, PaperOutcome> = {},
) {
  const headers = [
    "event_key",
    "candle_time",
    "alert_delay",
    "broker_symbol",
    "mapped_symbol",
    "timeframe",
    "mode",
    "decision_event",
    "previous_action",
    "confirmed",
    "raw_signal",
    "raw_long_signal",
    "raw_short_signal",
    "raw_long_condition",
    "raw_short_condition",
    "new_long_touch",
    "new_short_touch",
    "signal_conflict",
    "direction",
    "pine_action",
    "review_status",
    "review_tag",
    "paper_outcome",
    "plain_instruction",
    "session_ok",
    "timing_ok",
    "minutes_into_bar",
    "long_snapback",
    "short_snapback",
    "long_push_through",
    "short_push_through",
    "entry",
    "stop",
    "target",
    "move",
    "adverse",
    "match_status",
    "match_delta_minutes",
    "pine_plain_action",
    "pine_reason",
    "review_reason",
  ];
  const body = rows.map((row) => {
    const { alert, brutusReview } = row;
    return [
      paperOutcomeKey(alert),
      formatTime(alert.time),
      formatAlertDelay(alert),
      alert.brokerSymbol,
      alert.mappedSymbol,
      alert.timeframe,
      alert.mode ?? alert.alertMode,
      alert.decisionEvent,
      alert.previousAction,
      alert.confirmed,
      alert.rawSignal,
      alert.rawLongSignal,
      alert.rawShortSignal,
      alert.rawLongCondition,
      alert.rawShortCondition,
      alert.newLongTouch,
      alert.newShortTouch,
      alert.signalConflict,
      alert.direction,
      actionFor(alert),
      brutusReview.status,
      reviewTagFor(alert, brutusReview, row.status),
      paperOutcomes[paperOutcomeKey(alert)] ?? "unreviewed",
      plainRowInstruction(alert, brutusReview),
      alert.inSession,
      alert.notTooEarly,
      alert.minutesIntoBar,
      alert.longSnapback,
      alert.shortSnapback,
      alert.longPushThrough,
      alert.shortPushThrough,
      brutusReview.entry,
      brutusReview.stop,
      brutusReview.target,
      brutusReview.touchToClose,
      brutusReview.adverse,
      row.status,
      row.deltaMinutes,
      alert.plainAction,
      rawReasonFor(alert),
      brutusReview.reason,
    ]
      .map(csvCell)
      .join(",");
  });
  return [headers.map(csvCell).join(","), ...body].join("\n");
}

function exportableReviewedRow({
  alert,
  status,
  deltaMinutes,
  brutusReview,
}: {
  alert: TvAlert;
  status: MatchStatus;
  deltaMinutes?: number;
  brutusReview: BrutusReview;
}) {
  return {
    ...alert,
    matchStatus: status,
    matchDeltaMinutes: deltaMinutes,
    reviewTag: reviewTagFor(alert, brutusReview, status),
    brutusReview,
  };
}

export default function TradingViewCapturePage() {
  const { candles } = useStrategyWorkspace();
  const [payloadText, setPayloadText] = useState("");
  const [alerts, setAlerts] = useState<TvAlert[]>(() => loadAlerts());
  const [paperOutcomes, setPaperOutcomes] = useState<
    Record<string, PaperOutcome>
  >(() => loadPaperOutcomes());
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [evidenceFilter, setEvidenceFilter] =
    useState<EvidenceFilter>("latest");

  const candleIndex = useMemo(() => {
    const map = new Map<string, { timestamp: number; close: number }[]>();
    for (const candle of candles) {
      const key = `${candle.symbol}|${candle.timeframe}`;
      const list = map.get(key) ?? [];
      list.push({ timestamp: Number(candle.timestamp), close: candle.close });
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.timestamp - b.timestamp);
    }
    return map;
  }, [candles]);

  const rows = useMemo(
    () =>
      alerts.map((alert) => {
        const timeframe = normalizeTimeframe(alert.timeframe);
        const key = `${alert.mappedSymbol ?? ""}|${timeframe ?? ""}`;
        const list = candleIndex.get(key);
        if (!list?.length || !alert.time) {
          return {
            alert,
            status: "no-data" as MatchStatus,
            deltaMinutes: undefined,
          };
        }
        const closest = list.reduce((best, item) =>
          Math.abs(item.timestamp - alert.time!) <
          Math.abs(best.timestamp - alert.time!)
            ? item
            : best,
        );
        const deltaMinutes = Math.abs(closest.timestamp - alert.time) / 60000;
        const status: MatchStatus =
          deltaMinutes <= 1
            ? "matched"
            : deltaMinutes <= 65
              ? "nearby"
              : "no-match";
        return { alert, status, deltaMinutes };
      }),
    [alerts, candleIndex],
  );
  const reviewedRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        brutusReview: reviewBrutusAlert(row.alert),
      })),
    [rows],
  );
  const latestReviewedRows = useMemo(
    () => reviewedRows.filter((row) => isLatestPlaybookAlert(row.alert)),
    [reviewedRows],
  );
  const filteredReviewedRows = useMemo(() => {
    if (evidenceFilter === "latest") return latestReviewedRows;
    if (evidenceFilter === "older") {
      return reviewedRows.filter((row) => !isLatestPlaybookAlert(row.alert));
    }
    return reviewedRows;
  }, [evidenceFilter, latestReviewedRows, reviewedRows]);
  const reviewCounts = useMemo(
    () => ({
      enter: latestReviewedRows.filter(
        (row) => row.brutusReview.status === "ENTER",
      ).length,
      wait: latestReviewedRows.filter(
        (row) => row.brutusReview.status === "WAIT",
      ).length,
      skip: latestReviewedRows.filter(
        (row) => row.brutusReview.status === "SKIP",
      ).length,
      doNotHold: latestReviewedRows.filter(
        (row) => row.brutusReview.status === "DO_NOT_HOLD",
      ).length,
    }),
    [latestReviewedRows],
  );
  const paperSummary = useMemo(() => {
    const matchCounts = reviewedRows.reduce<Record<MatchStatus, number>>(
      (acc, row) => {
        acc[row.status] += 1;
        return acc;
      },
      { matched: 0, nearby: 0, "no-match": 0, "no-data": 0 },
    );
    const bySymbol = latestReviewedRows.reduce<Record<string, ReviewCounts>>(
      (acc, row) => {
        const key =
          row.alert.mappedSymbol ?? row.alert.brokerSymbol ?? "unknown";
        acc[key] ??= { enter: 0, wait: 0, skip: 0, doNotHold: 0 };
        if (row.brutusReview.status === "ENTER") acc[key].enter += 1;
        if (row.brutusReview.status === "WAIT") acc[key].wait += 1;
        if (row.brutusReview.status === "SKIP") acc[key].skip += 1;
        if (row.brutusReview.status === "DO_NOT_HOLD") acc[key].doNotHold += 1;
        return acc;
      },
      {},
    );
    const byTimeframe = latestReviewedRows.reduce<Record<string, ReviewCounts>>(
      (acc, row) => {
        const key = row.alert.timeframe ?? "unknown";
        acc[key] ??= { enter: 0, wait: 0, skip: 0, doNotHold: 0 };
        if (row.brutusReview.status === "ENTER") acc[key].enter += 1;
        if (row.brutusReview.status === "WAIT") acc[key].wait += 1;
        if (row.brutusReview.status === "SKIP") acc[key].skip += 1;
        if (row.brutusReview.status === "DO_NOT_HOLD") {
          acc[key].doNotHold += 1;
        }
        return acc;
      },
      {},
    );
    const byMode = latestReviewedRows.reduce<Record<string, ReviewCounts>>(
      (acc, row) => {
        const key = row.alert.mode ?? row.alert.alertMode ?? "unknown";
        acc[key] ??= { enter: 0, wait: 0, skip: 0, doNotHold: 0 };
        if (row.brutusReview.status === "ENTER") acc[key].enter += 1;
        if (row.brutusReview.status === "WAIT") acc[key].wait += 1;
        if (row.brutusReview.status === "SKIP") acc[key].skip += 1;
        if (row.brutusReview.status === "DO_NOT_HOLD") {
          acc[key].doNotHold += 1;
        }
        return acc;
      },
      {},
    );
    const byEvent = latestReviewedRows.reduce<Record<string, ReviewCounts>>(
      (acc, row) => {
        const key = row.alert.decisionEvent ?? "unknown";
        acc[key] ??= { enter: 0, wait: 0, skip: 0, doNotHold: 0 };
        if (row.brutusReview.status === "ENTER") acc[key].enter += 1;
        if (row.brutusReview.status === "WAIT") acc[key].wait += 1;
        if (row.brutusReview.status === "SKIP") acc[key].skip += 1;
        if (row.brutusReview.status === "DO_NOT_HOLD") {
          acc[key].doNotHold += 1;
        }
        return acc;
      },
      {},
    );
    const byPierce = latestReviewedRows.reduce<Record<string, ReviewCounts>>(
      (acc, row) => {
        const key = pierceLabel(
          row.alert.touchDepthRatio ?? row.brutusReview.touchDepthRatio,
        );
        acc[key] ??= { enter: 0, wait: 0, skip: 0, doNotHold: 0 };
        if (row.brutusReview.status === "ENTER") acc[key].enter += 1;
        if (row.brutusReview.status === "WAIT") acc[key].wait += 1;
        if (row.brutusReview.status === "SKIP") acc[key].skip += 1;
        if (row.brutusReview.status === "DO_NOT_HOLD") {
          acc[key].doNotHold += 1;
        }
        return acc;
      },
      {},
    );
    const emptyGate = (): GateCount => ({ yes: 0, no: 0, unknown: 0 });
    const addGate = (counts: GateCount, value?: boolean) => {
      if (value == null) counts.unknown += 1;
      else if (value) counts.yes += 1;
      else counts.no += 1;
    };
    const gateSummary = latestReviewedRows.reduce(
      (acc, row) => {
        const direction = directionFor(row.alert);
        const snapback =
          direction === "long"
            ? row.alert.longSnapback
            : direction === "short"
              ? row.alert.shortSnapback
              : undefined;
        const pushThrough =
          direction === "long"
            ? row.alert.longPushThrough
            : direction === "short"
              ? row.alert.shortPushThrough
              : undefined;
        acc.total += 1;
        addGate(acc.sessionOk, row.alert.inSession);
        addGate(acc.timingOk, row.alert.notTooEarly);
        addGate(acc.snapback, snapback);
        addGate(acc.pushThrough, pushThrough);
        addGate(acc.confirmed, row.alert.confirmed);
        return acc;
      },
      {
        total: 0,
        sessionOk: emptyGate(),
        timingOk: emptyGate(),
        snapback: emptyGate(),
        pushThrough: emptyGate(),
        confirmed: emptyGate(),
      },
    );
    const playbookAlerts = reviewedRows.filter((row) =>
      isPlaybookAlert(row.alert),
    ).length;
    const latestPlaybookAlerts = reviewedRows.filter((row) =>
      isLatestPlaybookAlert(row.alert),
    ).length;
    const stalePlaybookAlerts = playbookAlerts - latestPlaybookAlerts;
    const legacyAlerts = reviewedRows.filter((row) =>
      isLegacyBrutusAlert(row.alert),
    ).length;
    const missingFieldCounts = latestReviewedRows.reduce<
      Record<string, number>
    >((acc, row) => {
      for (const field of missingPlaybookFields(row.alert)) {
        acc[field] = (acc[field] ?? 0) + 1;
      }
      return acc;
    }, {});
    const missingFieldSummary = Object.entries(missingFieldCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([field, count]) => `${field}: ${count}`);
    const incompleteAlerts = latestReviewedRows.filter(
      (row) => missingPlaybookFields(row.alert).length > 0,
    ).length;
    const contractIssueCounts = latestReviewedRows.reduce<
      Record<string, number>
    >((acc, row) => {
      for (const issue of playbookContractIssues(row.alert)) {
        acc[issue] = (acc[issue] ?? 0) + 1;
      }
      return acc;
    }, {});
    const contractIssueSummary = Object.entries(contractIssueCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([issue, count]) => `${issue}: ${count}`);
    const contractIssueAlerts = latestReviewedRows.filter(
      (row) => playbookContractIssues(row.alert).length > 0,
    ).length;
    const enterRows = latestReviewedRows.filter(
      (row) => row.brutusReview.status === "ENTER",
    );
    const waitRows = latestReviewedRows.filter(
      (row) => row.brutusReview.status === "WAIT",
    );
    const failedEnterRows = enterRows.filter((row) => {
      const review = row.brutusReview;
      return (
        review.adverse != null &&
        review.stop != null &&
        review.entry != null &&
        Math.abs(review.entry - review.stop) > 0 &&
        review.adverse >= Math.abs(review.entry - review.stop)
      );
    }).length;
    const latestRawSignalAlerts = latestReviewedRows.filter(
      (row) => row.alert.rawSignal === true,
    ).length;
    const latestMissingAlertTimeAlerts = latestReviewedRows.filter(
      (row) => row.alert.rawSignal === true && !row.alert.alertTime,
    ).length;
    const paperOutcomeCounts = latestReviewedRows.reduce(
      (acc, row) => {
        const outcome =
          paperOutcomes[paperOutcomeKey(row.alert)] ?? "unreviewed";
        acc[outcome] += 1;
        return acc;
      },
      { unreviewed: 0, paid: 0, failed: 0, missed: 0 },
    );
    const reviewedOutcomeRows =
      paperOutcomeCounts.paid +
      paperOutcomeCounts.failed +
      paperOutcomeCounts.missed;
    const paperOutcomeByDecision = latestReviewedRows.reduce<
      Record<BrutusReviewStatus, PaperOutcomeCounts>
    >(
      (acc, row) => {
        const outcome =
          paperOutcomes[paperOutcomeKey(row.alert)] ?? "unreviewed";
        acc[row.brutusReview.status][outcome] += 1;
        return acc;
      },
      {
        ENTER: emptyPaperOutcomeCounts(),
        WAIT: emptyPaperOutcomeCounts(),
        SKIP: emptyPaperOutcomeCounts(),
        DO_NOT_HOLD: emptyPaperOutcomeCounts(),
      },
    );
    const failedEnterRate =
      enterRows.length > 0 ? failedEnterRows / enterRows.length : undefined;
    const readinessChecks: ReadinessCheck[] = [
      {
        label: "Latest Playbook sample",
        passed: latestPlaybookAlerts >= 20,
        detail: `${latestPlaybookAlerts}/20 latest rows`,
      },
      {
        label: "ENTER sample",
        passed: enterRows.length >= 5,
        detail: `${enterRows.length}/5 ENTER rows`,
      },
      {
        label: "ENTER failures controlled",
        passed:
          enterRows.length >= 5 &&
          failedEnterRate != null &&
          failedEnterRate <= 0.3,
        detail:
          enterRows.length > 0
            ? `${failedEnterRows}/${enterRows.length} failed ENTER rows`
            : "no ENTER rows yet",
      },
      {
        label: "Exact Brutus settings",
        passed: latestPlaybookAlerts > 0 && contractIssueAlerts === 0,
        detail:
          contractIssueAlerts === 0
            ? "length 9, high/low sources, StdDev 2"
            : `${contractIssueAlerts} settings mismatch`,
      },
      {
        label: "Required alert fields",
        passed: latestPlaybookAlerts > 0 && incompleteAlerts === 0,
        detail:
          incompleteAlerts === 0
            ? "all required fields present"
            : `${incompleteAlerts} incomplete rows`,
      },
      {
        label: "Raw signal coverage",
        passed:
          latestPlaybookAlerts > 0 &&
          latestRawSignalAlerts === latestPlaybookAlerts,
        detail: `${latestRawSignalAlerts}/${latestPlaybookAlerts} latest rows are raw signals`,
      },
      {
        label: "Alert timing evidence",
        passed:
          latestPlaybookAlerts > 0 && latestMissingAlertTimeAlerts === 0,
        detail:
          latestMissingAlertTimeAlerts === 0
            ? "alertTime present"
            : `${latestMissingAlertTimeAlerts} missing alertTime`,
      },
      {
        label: "Manual paper outcomes",
        passed: latestPlaybookAlerts >= 20 && reviewedOutcomeRows >= 10,
        detail: `${reviewedOutcomeRows}/10 latest rows marked paid, failed, or missed`,
      },
    ];
    const readinessPassed = readinessChecks.filter((check) => check.passed).length;
    const readinessStatus =
      latestPlaybookAlerts === 0
        ? "Not ready: no latest Playbook alerts."
        : readinessPassed === readinessChecks.length
          ? "Clean enough for paper-trade review. Still not real-money proof."
          : "Still paper only: more or cleaner evidence is required.";
    const paperEvidenceStatus =
      latestPlaybookAlerts === 0
        ? "No Playbook evidence yet"
        : latestPlaybookAlerts < 20
          ? "Too early: collect more live alerts"
          : enterRows.length < 5
            ? "Early: not enough ENTER evidence"
            : failedEnterRows > enterRows.length * 0.3
              ? "Warning: ENTER failures need review"
              : "Usable paper-test batch";
    const evidenceNeed =
      latestPlaybookAlerts < 20
        ? `Need about ${20 - latestPlaybookAlerts} more latest Playbook alert(s) before this batch is useful evidence.`
        : enterRows.length < 5
          ? `Need about ${5 - enterRows.length} more ENTER row(s) before judging the entry rule.`
          : "Enough rows to review directionally, but still not proof of profitability.";
    const likelyUpgradeWaits = waitRows.filter((row) => {
      const review = row.brutusReview;
      return (
        review.touchToClose != null &&
        review.bandWidth != null &&
        review.touchToClose > 0 &&
        review.touchToClose <= review.bandWidth * 0.35
      );
    }).length;
    const reviewQueue = [
      ...(enterRows.length
        ? [
            `${enterRows.length} ENTER row(s): replay these first. If they do not show immediate snapback on TradingView, the rule is too loose.`,
          ]
        : []),
      ...(latestPlaybookAlerts > 0 && latestPlaybookAlerts < 20
        ? [
            `${latestPlaybookAlerts} latest Playbook alert(s) is still a small sample. Treat patterns as clues, not a trading rule.`,
          ]
        : []),
      ...(likelyUpgradeWaits
        ? [
            `${likelyUpgradeWaits} WAIT row(s) are close to entry behavior. These are the main candidates to test for a less strict ENTER rule.`,
          ]
        : []),
      ...(failedEnterRows
        ? [
            `${failedEnterRows} ENTER row(s) already crossed the draft stop zone inside the alert candle. Treat those as failed evidence.`,
          ]
        : []),
      ...(legacyAlerts
        ? [
            `${legacyAlerts} legacy alert(s) came from the old script. Do not mix them into Playbook readiness claims.`,
          ]
        : []),
      ...(stalePlaybookAlerts
        ? [
            `${stalePlaybookAlerts} Playbook alert(s) are from an older export. Recreate those TradingView alerts from the latest Pine before judging readiness.`,
          ]
        : []),
      ...(contractIssueAlerts
        ? [
            `${contractIssueAlerts} latest Playbook alert(s) do not prove the exact original Brutus settings. Re-export ${LATEST_PLAYBOOK_VERSION} before judging them.`,
          ]
        : []),
      ...(matchCounts["no-data"] || matchCounts["no-match"]
        ? [
            `${matchCounts["no-data"] + matchCounts["no-match"]} alert(s) cannot be matched to imported app candles. Trust TradingView first for those rows.`,
          ]
        : []),
      ...(incompleteAlerts
        ? [
            `${incompleteAlerts} latest Playbook alert(s) are missing required JSON fields: ${missingFieldSummary.join(", ")}.`,
          ]
        : []),
    ];
    const dataQuality =
      reviewedRows.length === 0
        ? "empty"
        : playbookAlerts === 0
          ? "legacy-only"
          : stalePlaybookAlerts > 0
            ? "mixed-playbook-versions"
            : latestPlaybookAlerts === 0
              ? "no-latest-playbook"
              : contractIssueAlerts > 0
                ? "wrong-brutus-settings"
                : incompleteAlerts > 0
                  ? "incomplete"
                  : matchCounts["no-data"] > reviewedRows.length / 2
                    ? "needs-candles"
                    : "usable-paper-log";
    const rawSignalAlerts = reviewedRows.filter(
      (row) => row.alert.rawSignal === true,
    ).length;
    const confirmedAlerts = reviewedRows.filter(
      (row) => row.alert.confirmed === true,
    ).length;
    const missingAlertTimeAlerts = reviewedRows.filter(
      (row) => row.alert.rawSignal === true && !row.alert.alertTime,
    ).length;
    const lateAlertTimeAlerts = reviewedRows.filter((row) => {
      const { alert } = row;
      if (!alert.rawSignal || !alert.time || !alert.alertTime) return false;
      const expectedMinutes = timeframeMinutes(alert.timeframe);
      if (!expectedMinutes) return false;
      return alert.alertTime - alert.time > expectedMinutes * 60000;
    }).length;
    const verdict =
      reviewedRows.length === 0
        ? "No TradingView alerts imported yet."
        : playbookAlerts === 0
          ? "This batch has no current Playbook alerts. Recreate alerts from the latest exported Pine before using it as evidence."
            : latestPlaybookAlerts === 0
              ? "This batch only has older Playbook rows. Export the latest Pine and collect fresh alerts."
              : stalePlaybookAlerts > 0
                ? "This batch mixes old and current Playbook exports. Use only the latest-version rows for readiness claims."
                : contractIssueAlerts > 0
                  ? "Some latest Playbook alerts do not prove the exact original Brutus settings. Do not use this batch for readiness claims."
                  : incompleteAlerts > 0
                    ? "Some alerts are missing required fields. Fix the alert script/log source before judging the strategy."
                    : reviewCounts.enter === 0
                      ? "No entry candidates in this alert batch. Keep collecting paper alerts."
                      : matchCounts["no-data"] > reviewedRows.length / 2
                        ? "Entry candidates exist, but most alerts are missing matching app candles. Use TradingView as the live truth and import more alert logs."
                        : "Entry candidates exist. Paper review the ENTER rows against TradingView before risking money.";
    const nextAction =
      reviewedRows.length === 0
        ? "Import the latest TradingView alert CSV from the Alerts Log."
        : playbookAlerts === 0
          ? "Replace the old TradingView alerts with alerts created from the latest Playbook Pine export."
          : latestPlaybookAlerts === 0
            ? "Create fresh alerts from the latest exported Pine, then import that new CSV."
            : stalePlaybookAlerts > 0
              ? `Filter to ${LATEST_PLAYBOOK_VERSION} rows or recreate the older alerts before using this batch.`
              : contractIssueAlerts > 0
                ? "Export the newest Pine and recreate the TradingView alerts. The batch must prove length 9, upper high, lower low, and StdDev 2."
                : incompleteAlerts > 0
                  ? "Fix the alert source first. Missing fields make the batch unreliable."
                  : failedEnterRows > 0
                    ? "Replay the failed ENTER rows first. If they really failed on TradingView, tighten the rule before paper-trading more."
                    : enterRows.length > 0
                      ? "Replay ENTER rows on TradingView. Mark whether snapback happened quickly; do not use real money yet."
                      : likelyUpgradeWaits > 0
                        ? "Replay the Maybe loosen WAIT rows. These are possible future ENTER-rule candidates."
                        : "No trade candidate yet. Keep collecting live Playbook alerts.";
    const enterOutcomes = paperOutcomeByDecision.ENTER;
    const waitOutcomes = paperOutcomeByDecision.WAIT;
    const trapOutcomes = paperOutcomeByDecision.DO_NOT_HOLD;
    const outcomeRead =
      reviewedOutcomeRows < 10
        ? "Not enough marked outcomes yet. Mark at least 10 latest rows before changing the rule."
        : enterOutcomes.failed >= 2 &&
            enterOutcomes.failed >= enterOutcomes.paid
          ? "Tighten ENTER. Marked ENTER rows are failing too often."
          : waitOutcomes.missed >= 2 && waitOutcomes.missed > waitOutcomes.failed
            ? "Test a looser ENTER rule. WAIT rows are being marked as missed opportunities."
            : trapOutcomes.paid >= 2 && trapOutcomes.paid > trapOutcomes.failed
              ? "Keep the DO NOT HOLD filter. Marked trap rows are helping avoid bad holds."
              : enterOutcomes.paid >= 5 &&
                  enterOutcomes.paid > enterOutcomes.failed * 2
                ? "Current ENTER rule is worth continued paper testing. Do not use real money yet."
                : "No rule change yet. Keep marking outcomes until one pattern is obvious.";
    return {
      generatedAt: new Date().toISOString(),
      totalAlerts: reviewedRows.length,
      evidenceAlerts: latestReviewedRows.length,
      actionCounts: reviewCounts,
      matchCounts,
      bySymbol,
      byTimeframe,
      byMode,
      playbookAlerts,
      latestPlaybookAlerts,
      stalePlaybookAlerts,
      legacyAlerts,
      incompleteAlerts,
      contractIssueAlerts,
      contractIssueCounts,
      contractIssueSummary,
      failedEnterRows,
      failedEnterRate,
      likelyUpgradeWaits,
      paperOutcomeCounts,
      paperOutcomeByDecision,
      outcomeRead,
      reviewedOutcomeRows,
      readinessChecks,
      readinessPassed,
      readinessStatus,
      paperEvidenceStatus,
      evidenceNeed,
      reviewQueue,
      dataQuality,
      rawSignalAlerts,
      confirmedAlerts,
      missingAlertTimeAlerts,
      lateAlertTimeAlerts,
      missingFieldCounts,
      missingFieldSummary,
      verdict,
      nextAction,
      gateSummary,
      topSymbols: topBreakdownRows(bySymbol),
      topTimeframes: topBreakdownRows(byTimeframe),
      topModes: topBreakdownRows(byMode),
      topEvents: topBreakdownRows(byEvent),
      topPierce: topBreakdownRows(byPierce),
    };
  }, [latestReviewedRows, paperOutcomes, reviewCounts, reviewedRows]);
  const reviewQueues = useMemo(() => {
    const withTags = latestReviewedRows.map((row) => ({
      ...row,
      reviewTag: reviewTagFor(row.alert, row.brutusReview, row.status),
    }));
    return {
      failedEntries: withTags
        .filter((row) => row.reviewTag === "Failed entry")
        .slice(0, 6),
      maybeLoosenWaits: withTags
        .filter((row) => row.reviewTag === "Maybe loosen")
        .slice(0, 6),
      cleanEntries: withTags
        .filter((row) => row.reviewTag === "Review first")
        .slice(0, 6),
    };
  }, [latestReviewedRows]);

  function addPayloads(text: string) {
    try {
      const parsed = parsePayloadText(text);
      const merged = mergeAlerts(parsed, alerts);
      setAlerts(merged.alerts);
      saveAlerts(merged.alerts);
      setImportResult(merged.result);
      setError("");
    } catch (err) {
      setImportResult(null);
      setError(
        err instanceof Error ? err.message : "Could not parse alert JSON.",
      );
    }
  }

  async function addPayloadFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      const texts = await Promise.all(
        Array.from(files).map((file) => file.text()),
      );
      const parsed = texts.flatMap((text) => parsePayloadText(text));
      const merged = mergeAlerts(parsed, alerts);
      setAlerts(merged.alerts);
      saveAlerts(merged.alerts);
      setImportResult(merged.result);
      setError("");
    } catch (err) {
      setImportResult(null);
      setError(
        err instanceof Error ? err.message : "Could not parse alert files.",
      );
    }
  }

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

  function exportReviewedRowWithOutcome(
    row: Parameters<typeof exportableReviewedRow>[0],
  ) {
    return {
      eventKey: paperOutcomeKey(row.alert),
      ...exportableReviewedRow(row),
      paperOutcome:
        paperOutcomes[paperOutcomeKey(row.alert)] ?? ("unreviewed" as const),
    };
  }

  return (
    <div className="space-y-3 p-6" data-ocid="tradingview.capture.page">
      <div>
        <h1 className="font-display text-2xl font-bold">
          TradingView Alert Capture
        </h1>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
          Use this as the truth intake for exact FXIFY/Alchemy Markets
          TradingView alert events. Paste one JSON alert, a JSON array, or
          newline-delimited JSON. Webhook.site request objects with nested
          bodies are accepted too.
        </p>
      </div>

      <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-bold">
              Paste Alert JSON
            </h2>
            <button
              className="border border-border bg-background px-3 py-2 font-mono text-xs hover:border-primary"
              onClick={() => setPayloadText(EXAMPLE_PAYLOAD)}
              type="button"
            >
              Load example
            </button>
          </div>
          <textarea
            className="mt-3 min-h-32 w-full border border-border bg-background p-3 font-mono text-xs text-foreground"
            placeholder={EXAMPLE_PAYLOAD}
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
          />
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          {importResult && !error && (
            <div className="mt-2 border border-border bg-background/40 p-3 text-sm text-muted-foreground">
              <p>
                Added{" "}
                <span className="font-mono text-primary">
                  {importResult.added}
                </span>{" "}
                alert(s), skipped{" "}
                <span className="font-mono text-amber-300">
                  {importResult.duplicates}
                </span>{" "}
                duplicate(s). Stored total:{" "}
                <span className="font-mono text-foreground">
                  {alerts.length}
                </span>
                .
              </p>
              <p className="mt-1 font-mono text-xs">
                Latest Playbook {importResult.latestPlaybook} | Old Playbook{" "}
                {importResult.oldPlaybook} | Legacy {importResult.legacy} |
                Incomplete {importResult.incomplete} | Settings mismatch{" "}
                {importResult.contractIssues}
              </p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="border border-primary bg-primary px-4 py-2 font-mono text-xs text-primary-foreground"
              onClick={() => addPayloads(payloadText)}
              type="button"
            >
              Import pasted alert
            </button>
            <label className="cursor-pointer border border-border bg-background px-4 py-2 font-mono text-xs hover:border-primary">
              Upload CSV/JSON log
              <input
                accept=".csv,.json,.jsonl,.txt"
                className="hidden"
                onChange={async (event) => {
                  await addPayloadFiles(event.target.files);
                  event.target.value = "";
                }}
                multiple
                type="file"
              />
            </label>
            <button
              className="border border-border bg-background px-4 py-2 font-mono text-xs hover:border-primary"
              onClick={() =>
                downloadText(
                  "ict-tradingview-alert-capture.json",
                  JSON.stringify(
                    reviewedRows.map(exportReviewedRowWithOutcome),
                    null,
                    2,
                  ),
                )
              }
              type="button"
            >
              Export captured alerts
            </button>
            <button
              className="border border-lime-500/60 bg-background px-4 py-2 font-mono text-xs text-lime-300 hover:border-lime-400"
              onClick={() =>
                downloadText(
                  "ict-brutus-current-evidence.json",
                  JSON.stringify(
                    {
                      generatedAt: new Date().toISOString(),
                      playbookVersion: LATEST_PLAYBOOK_VERSION,
                      note: "Latest Playbook rows only. Older Playbook and legacy alerts are excluded from this evidence export.",
                      queues: {
                        failedEntries: reviewQueues.failedEntries.map(
                          exportReviewedRowWithOutcome,
                        ),
                        maybeLoosenWaits: reviewQueues.maybeLoosenWaits.map(
                          exportReviewedRowWithOutcome,
                        ),
                        cleanEntries: reviewQueues.cleanEntries.map(
                          exportReviewedRowWithOutcome,
                        ),
                      },
                      rows: latestReviewedRows.map(exportReviewedRowWithOutcome),
                    },
                    null,
                    2,
                  ),
                )
              }
              type="button"
            >
              Export current evidence
            </button>
            <button
              className="border border-lime-500/60 bg-background px-4 py-2 font-mono text-xs text-lime-300 hover:border-lime-400"
              onClick={() =>
                downloadText(
                  "ict-brutus-current-evidence.csv",
                  evidenceRowsToCsv(latestReviewedRows, paperOutcomes),
                )
              }
              type="button"
            >
              Export evidence CSV
            </button>
            <button
              className="border border-border bg-background px-4 py-2 font-mono text-xs hover:border-primary"
              onClick={() =>
                downloadText(
                  "ict-brutus-paper-summary.json",
                  JSON.stringify(paperSummary, null, 2),
                )
              }
              type="button"
            >
              Export paper summary
            </button>
            <button
              className="border border-destructive/40 bg-background px-4 py-2 font-mono text-xs text-destructive hover:border-destructive"
              onClick={() => {
                setAlerts([]);
                saveAlerts([]);
                setImportResult(null);
              }}
              type="button"
            >
              Clear
            </button>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="border border-border bg-card p-4">
            <h2 className="font-display text-sm font-bold">
              How You Get This Data
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Start with TradingView alerts created from the latest Playbook
              Pine. Export the TradingView Alert Log CSV, paste one JSON body,
              or upload a Webhook.site export. This page treats those alerts as
              paper evidence, not trade approval.
            </p>
          </div>
          <div className="border border-border bg-card p-4">
            <h2 className="font-display text-sm font-bold">
              FXIFY Connection Clue
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              FXIFY docs point users to the TradingView Trading Panel broker
              flow and mention the broker name "Alchemy markets." That is the
              source to test first, not public Yahoo symbols.
            </p>
          </div>
          <div className="border border-border bg-card p-4">
            <h2 className="font-display text-sm font-bold">
              Known Alchemy Index Symbols
            </h2>
            <div className="mt-3 max-h-64 overflow-y-auto">
              <table className="w-full border-collapse font-mono text-[11px]">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1 pr-2">Broker</th>
                    <th className="py-1 pr-2">Market</th>
                    <th className="py-1">App map</th>
                  </tr>
                </thead>
                <tbody>
                  {ALCHEMY_INDEX_SYMBOLS.map((item) => (
                    <tr className="border-b border-border/60" key={item.broker}>
                      <td className="py-1 pr-2 text-foreground">
                        {item.broker}
                      </td>
                      <td className="py-1 pr-2 text-muted-foreground">
                        {item.market}
                      </td>
                      <td className="py-1 text-primary">{item.appSymbol}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="border border-border bg-card p-4">
            <h2 className="font-display text-sm font-bold">Match Status</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Matched means the imported app candle is within one minute of the
              TradingView alert. Nearby means the instrument mapping is
              plausible but the feed/timeframe is not exact enough yet.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Timing truth: first-touch rows are live alert evidence. Confirmed
              close rows are cleaner historically, but they may be later than
              the wick entry you were trying to study.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Latest Playbook v10 can produce more than one alert on the same
              live candle when the decision changes, such as WAIT becoming
              ENTER or DO NOT HOLD.
            </p>
          </div>
        </aside>
      </section>

      <section className="grid gap-3 border border-cyan-500/40 bg-cyan-500/5 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
            Paper-test batch verdict
          </p>
          <p className="mt-2 text-sm text-foreground">{paperSummary.verdict}</p>
          <div className="mt-3 border border-border bg-background/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Evidence status
            </p>
            <p className="mt-1 text-sm text-foreground">
              {paperSummary.paperEvidenceStatus}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {paperSummary.evidenceNeed}
            </p>
          </div>
          <div className="mt-3 border border-cyan-500/30 bg-background/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
              Next action
            </p>
            <p className="mt-1 text-sm text-foreground">
              {paperSummary.nextAction}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              This is still paper-trading evidence. Do not treat any row as a
              real-money instruction until repeated live alerts prove it.
            </p>
          </div>
          <div className="mt-3 border border-border bg-background/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Readiness gates
              </p>
              <span className="font-mono text-xs text-foreground">
                {paperSummary.readinessPassed}/
                {paperSummary.readinessChecks.length} passed
              </span>
            </div>
            <p className="mt-1 text-sm text-foreground">
              {paperSummary.readinessStatus}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {paperSummary.readinessChecks.map((check) => (
                <div
                  className="border border-border/80 bg-background/50 p-2"
                  key={check.label}
                >
                  <p
                    className={`font-mono text-[10px] uppercase tracking-widest ${
                      check.passed ? "text-lime-300" : "text-amber-300"
                    }`}
                  >
                    {check.passed ? "PASS" : "WAIT"} - {check.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Passing these gates only means the batch is clean enough to
              review. It does not prove the strategy is profitable.
            </p>
          </div>
          <div className="mt-3 border border-border bg-background/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Why labels happened
            </p>
            <div className="mt-2 grid gap-2 font-mono text-xs text-muted-foreground sm:grid-cols-2">
              <p>
                Session OK:{" "}
                <span className="text-foreground">
                  {gateCountText(paperSummary.gateSummary.sessionOk)}
                </span>
              </p>
              <p>
                Timing OK:{" "}
                <span className="text-foreground">
                  {gateCountText(paperSummary.gateSummary.timingOk)}
                </span>
              </p>
              <p>
                Snapback:{" "}
                <span className="text-foreground">
                  {gateCountText(paperSummary.gateSummary.snapback)}
                </span>
              </p>
              <p>
                Push-through trap:{" "}
                <span className="text-foreground">
                  {gateCountText(paperSummary.gateSummary.pushThrough)}
                </span>
              </p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This shows the gate pattern behind the labels. If WAIT rows have
              snapback but no ENTER, the entry rule may be too strict. If ENTER
              rows also show push-through, the rule is too loose.
            </p>
          </div>
          <div className="mt-3 border border-border bg-background/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Paper outcome scoreboard
            </p>
            <p className="mt-1 text-sm text-foreground">
              {paperSummary.outcomeRead}
            </p>
            <div className="mt-2 grid gap-2 font-mono text-xs text-muted-foreground sm:grid-cols-2">
              {(
                [
                  ["ENTER", "ENTER"],
                  ["WAIT", "WAIT"],
                  ["DO_NOT_HOLD", "DO NOT HOLD"],
                  ["SKIP", "SKIP"],
                ] as const
              ).map(([status, label]) => (
                <p key={status}>
                  {label}:{" "}
                  <span className="text-foreground">
                    {paperOutcomeCountsText(
                      paperSummary.paperOutcomeByDecision[status],
                    )}
                  </span>
                </p>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              If ENTER fails often, tighten the rule. If WAIT is often missed,
              the rule may be too strict. If DO NOT HOLD avoids failed moves,
              the trap filter is doing useful work.
            </p>
          </div>
          {paperSummary.reviewQueue.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {paperSummary.reviewQueue.slice(0, 5).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {paperSummary.contractIssueAlerts > 0 && (
            <div className="mt-3 border border-amber-400/50 bg-amber-400/5 p-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-amber-300">
                Brutus settings mismatch
              </p>
              <p className="mt-1 text-sm text-foreground">
                These alerts do not prove they used the original Brutus setup.
                Do not judge the strategy from them.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Required: length 9, upper source high, lower source low, StdDev
                2. {paperSummary.contractIssueSummary.join(" | ")}
              </p>
            </div>
          )}
          {paperSummary.missingFieldSummary.length > 0 && (
            <div className="mt-3 border border-destructive/40 bg-destructive/5 p-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-destructive">
                Missing alert fields
              </p>
              <p className="mt-1 text-sm text-foreground">
                Fix the alert source before judging this batch.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {paperSummary.missingFieldSummary.join(" | ")}
              </p>
            </div>
          )}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          <p>
            Alerts:{" "}
            <span className="text-foreground">{paperSummary.totalAlerts}</span>
          </p>
          <p>
            Evidence rows:{" "}
            <span className="text-lime-300">{paperSummary.evidenceAlerts}</span>
          </p>
          <p>
            Playbook:{" "}
            <span className="text-cyan-300">{paperSummary.playbookAlerts}</span>
          </p>
          <p>
            Latest:{" "}
            <span className="text-lime-300">
              {paperSummary.latestPlaybookAlerts}
            </span>
          </p>
          <p>
            Old Playbook:{" "}
            <span className="text-amber-300">
              {paperSummary.stalePlaybookAlerts}
            </span>
          </p>
          <p>
            Legacy:{" "}
            <span className="text-amber-300">{paperSummary.legacyAlerts}</span>
          </p>
          <p>
            Quality:{" "}
            <span className="text-foreground">{paperSummary.dataQuality}</span>
          </p>
          <p>
            Matched:{" "}
            <span className="text-lime-300">
              {paperSummary.matchCounts.matched}
            </span>
          </p>
          <p>
            Raw signals:{" "}
            <span className="text-foreground">
              {paperSummary.rawSignalAlerts}
            </span>
          </p>
          <p>
            Paper marked:{" "}
            <span className="text-foreground">
              {paperSummary.reviewedOutcomeRows}
            </span>
          </p>
          <p>
            Paid / failed / missed:{" "}
            <span className="text-lime-300">
              {paperSummary.paperOutcomeCounts.paid}
            </span>{" "}
            /{" "}
            <span className="text-destructive">
              {paperSummary.paperOutcomeCounts.failed}
            </span>{" "}
            /{" "}
            <span className="text-amber-300">
              {paperSummary.paperOutcomeCounts.missed}
            </span>
          </p>
          <p>
            Confirmed:{" "}
            <span className="text-foreground">
              {paperSummary.confirmedAlerts}
            </span>
          </p>
          <p>
            Missing alert time:{" "}
            <span className="text-amber-300">
              {paperSummary.missingAlertTimeAlerts}
            </span>
          </p>
          <p>
            Late alert time:{" "}
            <span className="text-destructive">
              {paperSummary.lateAlertTimeAlerts}
            </span>
          </p>
          <p>
            No data:{" "}
            <span className="text-destructive">
              {paperSummary.matchCounts["no-data"]}
            </span>
          </p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Symbols
          </p>
          <div className="mt-3 space-y-2 font-mono text-xs">
            {paperSummary.topSymbols.length ? (
              paperSummary.topSymbols.map((row) => (
                <div
                  className="flex items-center justify-between gap-3"
                  key={row.label}
                >
                  <span className="text-foreground">{row.label}</span>
                  <span className="text-muted-foreground">
                    {countsText(row.counts)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No alerts imported.</p>
            )}
          </div>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Timeframes
          </p>
          <div className="mt-3 space-y-2 font-mono text-xs">
            {paperSummary.topTimeframes.length ? (
              paperSummary.topTimeframes.map((row) => (
                <div
                  className="flex items-center justify-between gap-3"
                  key={row.label}
                >
                  <span className="text-foreground">{row.label}</span>
                  <span className="text-muted-foreground">
                    {countsText(row.counts)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No alerts imported.</p>
            )}
          </div>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Alert mode
          </p>
          <div className="mt-3 space-y-2 font-mono text-xs">
            {paperSummary.topModes.length ? (
              paperSummary.topModes.map((row) => (
                <div
                  className="flex items-center justify-between gap-3"
                  key={row.label}
                >
                  <span className="text-foreground">{row.label}</span>
                  <span className="text-muted-foreground">
                    {countsText(row.counts)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No alerts imported.</p>
            )}
          </div>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Alert event
          </p>
          <div className="mt-3 space-y-2 font-mono text-xs">
            {paperSummary.topEvents.length ? (
              paperSummary.topEvents.map((row) => (
                <div
                  className="flex items-center justify-between gap-3"
                  key={row.label}
                >
                  <span className="text-foreground">
                    {row.label.replaceAll("_", " ")}
                  </span>
                  <span className="text-muted-foreground">
                    {countsText(row.counts)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No alerts imported.</p>
            )}
          </div>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Pierce depth
          </p>
          <div className="mt-3 space-y-2 font-mono text-xs">
            {paperSummary.topPierce.length ? (
              paperSummary.topPierce.map((row) => (
                <div
                  className="flex items-center justify-between gap-3"
                  key={row.label}
                >
                  <span className="text-foreground">{row.label}</span>
                  <span className="text-muted-foreground">
                    {countsText(row.counts)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No alerts imported.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-3">
        <div className="border border-destructive/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-destructive">
            Failed ENTERs to replay first
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            These are the rows that can kill the draft rule fastest. If
            TradingView confirms they failed, tighten ENTER before paper
            trading.
          </p>
          <div className="mt-3 space-y-2">
            {reviewQueues.failedEntries.length ? (
              reviewQueues.failedEntries.map((row) => (
                <div
                  className="border border-border bg-background/40 p-2 font-mono text-xs"
                  key={row.alert.id}
                >
                  <p className="text-foreground">
                    {row.alert.mappedSymbol ?? row.alert.brokerSymbol}{" "}
                    {row.alert.timeframe} {row.alert.direction}{" "}
                    {formatTime(row.alert.time)}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Replay this. It already crossed the draft stop zone.
                  </p>
                </div>
              ))
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No failed latest ENTER rows in this batch.
              </p>
            )}
          </div>
        </div>

        <div className="border border-lime-500/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-lime-300">
            WAITs that might become ENTERs
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            These are the best loosen-test candidates. They were close to
            snapback, but the current rule still said WAIT.
          </p>
          <div className="mt-3 space-y-2">
            {reviewQueues.maybeLoosenWaits.length ? (
              reviewQueues.maybeLoosenWaits.map((row) => (
                <div
                  className="border border-border bg-background/40 p-2 font-mono text-xs"
                  key={row.alert.id}
                >
                  <p className="text-foreground">
                    {row.alert.mappedSymbol ?? row.alert.brokerSymbol}{" "}
                    {row.alert.timeframe} {row.alert.direction}{" "}
                    {formatTime(row.alert.time)}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Check if the next candles paid. If yes repeatedly, ENTER may
                    be too strict.
                  </p>
                </div>
              ))
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No close WAIT rows in this batch yet.
              </p>
            )}
          </div>
        </div>

        <div className="border border-cyan-500/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
            Clean ENTERs to paper check
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            These are not trade approvals. They are the rows to compare against
            TradingView first.
          </p>
          <div className="mt-3 space-y-2">
            {reviewQueues.cleanEntries.length ? (
              reviewQueues.cleanEntries.map((row) => (
                <div
                  className="border border-border bg-background/40 p-2 font-mono text-xs"
                  key={row.alert.id}
                >
                  <p className="text-foreground">
                    {row.alert.mappedSymbol ?? row.alert.brokerSymbol}{" "}
                    {row.alert.timeframe} {row.alert.direction}{" "}
                    {formatTime(row.alert.time)}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Paper review only. Confirm the label appeared live before
                    trusting it.
                  </p>
                </div>
              ))
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No clean latest ENTER rows in this batch.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <div className="border border-primary/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
            Draft rule counts
          </p>
          <p className="mt-2 text-sm text-foreground">
            Latest Playbook rows only. Older exports stay visible below, but do
            not count as current evidence.
          </p>
        </div>
        <div className="border border-cyan-500/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Enter
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-cyan-300">
            {reviewCounts.enter}
          </p>
        </div>
        <div className="border border-lime-500/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Wait
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-lime-300">
            {reviewCounts.wait}
          </p>
        </div>
        <div className="border border-amber-500/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Do not hold
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-amber-300">
            {reviewCounts.doNotHold}
          </p>
        </div>
        <div className="border border-destructive/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Skip
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-destructive">
            {reviewCounts.skip}
          </p>
        </div>
      </section>

      <section className="border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold">
              Captured Alerts
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Current Evidence shows only latest Playbook rows. Older rows stay
              available for audit, but do not count toward readiness.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              ["latest", "Current Evidence"],
              ["older", "Older / ignored"],
              ["all", "All imported"],
            ].map(([value, label]) => (
              <button
                className={`border px-3 py-2 font-mono text-xs ${
                  evidenceFilter === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary"
                }`}
                key={value}
                onClick={() => setEvidenceFilter(value as EvidenceFilter)}
                type="button"
              >
                {label}
              </button>
            ))}
            <p className="font-mono text-xs text-muted-foreground">
              {filteredReviewedRows.length} shown / {alerts.length} stored
            </p>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse font-mono text-xs">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-2 py-2">Candle / alert time</th>
                <th className="px-2 py-2">Broker symbol</th>
                <th className="px-2 py-2">Map</th>
                <th className="px-2 py-2">TF</th>
                <th className="px-2 py-2">Mode</th>
                <th className="px-2 py-2">Side</th>
                <th className="px-2 py-2">Pine says</th>
                <th className="px-2 py-2">Review</th>
                <th className="px-2 py-2">Paper result</th>
                <th className="px-2 py-2">Rule</th>
                <th className="px-2 py-2">OHLC</th>
                <th className="px-2 py-2">Bands</th>
                <th className="px-2 py-2">Pierce</th>
                <th className="px-2 py-2">Plan</th>
                <th className="px-2 py-2">Match</th>
              </tr>
            </thead>
            <tbody>
              {filteredReviewedRows.length === 0 ? (
                <tr>
                  <td className="px-2 py-6 text-muted-foreground" colSpan={15}>
                    {reviewedRows.length === 0
                      ? "No TradingView alert events imported yet."
                      : "No alerts match this filter."}
                  </td>
                </tr>
              ) : (
                filteredReviewedRows.map(
                  ({ alert, status, deltaMinutes, brutusReview }) => {
                    const reviewTag = reviewTagFor(alert, brutusReview, status);
                    const paperOutcome =
                      paperOutcomes[paperOutcomeKey(alert)] ?? "unreviewed";
                    return (
                      <tr className="border-b border-border/60" key={alert.id}>
                        <td className="px-2 py-2">
                          {formatTime(alert.time)}
                          <span className="block text-muted-foreground">
                            {formatAlertDelay(alert)}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          {alert.brokerSymbol ?? "unknown"}
                        </td>
                        <td className="px-2 py-2">
                          {alert.mappedSymbol ?? "unmapped"}
                        </td>
                        <td className="px-2 py-2">
                          {alert.timeframe ?? "n/a"}
                        </td>
                        <td className="px-2 py-2">
                          {alert.mode ?? alert.alertMode ?? "n/a"}
                          <span className="block text-muted-foreground">
                            {alert.rawSignal ? "raw" : "legacy"} /{" "}
                            {alert.confirmed ? "confirmed" : "live"}
                          </span>
                          {alert.playbookVersion && (
                            <span className="block text-muted-foreground">
                              {alert.playbookVersion}
                            </span>
                          )}
                          {alert.decisionEvent && (
                            <span className="block text-cyan-300">
                              event {alert.decisionEvent.replaceAll("_", " ")}
                              {alert.previousAction
                                ? ` from ${alert.previousAction}`
                                : ""}
                            </span>
                          )}
                          {isPlaybookAlert(alert) && (
                            <span
                              className={`block ${
                                playbookContractIssues(alert).length > 0
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              }`}
                            >
                              L:{alert.length ?? "?"} U:
                              {alert.upperSource ?? "?"} L:
                              {alert.lowerSource ?? "?"} SD:
                              {alert.stdDev ?? "?"}
                            </span>
                          )}
                          {(alert.rawLongSignal != null ||
                            alert.rawShortSignal != null) && (
                            <span className="block text-muted-foreground">
                              Live touch held L:
                              {alert.rawLongSignal ? "yes" : "no"} S:
                              {alert.rawShortSignal ? "yes" : "no"}
                            </span>
                          )}
                          {(alert.rawLongCondition != null ||
                            alert.rawShortCondition != null) && (
                            <span className="block text-muted-foreground">
                              Original triangle now L:
                              {alert.rawLongCondition ? "yes" : "no"} S:
                              {alert.rawShortCondition ? "yes" : "no"}
                            </span>
                          )}
                          {(alert.newLongTouch != null ||
                            alert.newShortTouch != null) && (
                            <span className="block text-muted-foreground">
                              First touch this update L:
                              {alert.newLongTouch ? "yes" : "no"} S:
                              {alert.newShortTouch ? "yes" : "no"}
                            </span>
                          )}
                          {alert.signalConflict && (
                            <span className="block text-amber-300">
                              Both long and short fired. Treat as skip evidence.
                            </span>
                          )}
                          {isLatestPlaybookAlert(alert) && (
                            <span className="block max-w-56 whitespace-normal text-muted-foreground">
                              Gates: session {gateLabel(alert.inSession)}, time{" "}
                              {gateLabel(alert.notTooEarly)}, snap L:
                              {gateLabel(alert.longSnapback)} S:
                              {gateLabel(alert.shortSnapback)}, push L:
                              {gateLabel(alert.longPushThrough)} S:
                              {gateLabel(alert.shortPushThrough)}
                              {alert.minutesIntoBar != null
                                ? `, ${alert.minutesIntoBar.toFixed(1)}m in`
                                : ""}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {alert.direction ?? "n/a"}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={
                              actionFor(alert) === "ENTER"
                                ? "text-cyan-300"
                                : actionFor(alert) === "WAIT"
                                  ? "text-lime-300"
                                  : actionFor(alert) === "DO_NOT_HOLD"
                                    ? "text-amber-300"
                                    : actionFor(alert) === "SKIP"
                                      ? "text-muted-foreground"
                                      : "text-destructive"
                            }
                          >
                            {pineActionLabel(alert)}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <span className={reviewTagClass(reviewTag)}>
                            {reviewTag}
                          </span>
                          {reviewTag === "Wrong settings" && (
                            <span className="block max-w-56 whitespace-normal text-destructive">
                              Recreate this alert from the latest locked Pine.
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <span className={paperOutcomeClass(paperOutcome)}>
                            {paperOutcomeLabel(paperOutcome)}
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(["paid", "failed", "missed"] as const).map(
                              (outcome) => (
                                <button
                                  className={`border px-2 py-1 text-[10px] ${
                                    paperOutcome === outcome
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background text-muted-foreground hover:border-primary"
                                  }`}
                                  key={outcome}
                                  onClick={() =>
                                    markPaperOutcome(alert, outcome)
                                  }
                                  type="button"
                                >
                                  {paperOutcomeLabel(outcome)}
                                </button>
                              ),
                            )}
                            {paperOutcome !== "unreviewed" && (
                              <button
                                className="border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground hover:border-primary"
                                onClick={() =>
                                  markPaperOutcome(alert, "unreviewed")
                                }
                                type="button"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={
                              brutusReview.status === "ENTER"
                                ? "text-cyan-300"
                                : brutusReview.status === "WAIT"
                                  ? "text-lime-400"
                                  : brutusReview.status === "DO_NOT_HOLD"
                                    ? "text-amber-300"
                                    : "text-destructive"
                            }
                          >
                            {brutusReview.status.replaceAll("_", " ")}
                          </span>
                          <span className="block max-w-72 whitespace-normal text-muted-foreground">
                            {brutusReview.reason}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          O:{alert.open?.toFixed(2) ?? "?"} H:
                          {alert.high?.toFixed(2) ?? "?"} L:
                          {alert.low?.toFixed(2) ?? "?"} C:
                          {alert.close?.toFixed(2) ?? "?"}
                        </td>
                        <td className="px-2 py-2">
                          U:{alert.upper?.toFixed(2) ?? "?"} L:
                          {alert.lower?.toFixed(2) ?? "?"}
                        </td>
                        <td className="max-w-40 whitespace-normal px-2 py-2">
                          {formatPierce(alert, brutusReview)}
                          {brutusReview.bandWidth != null && (
                            <span className="block text-muted-foreground">
                              width {brutusReview.bandWidth.toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="max-w-72 whitespace-normal px-2 py-2">
                          <span className="block text-foreground">
                            {plainRowInstruction(alert, brutusReview)}
                          </span>
                          <span className="block text-muted-foreground">
                            Entry {brutusReview.entry?.toFixed(2) ?? "?"} /
                            stop {brutusReview.stop?.toFixed(2) ?? "?"} /
                            target {brutusReview.target?.toFixed(2) ?? "?"}
                          </span>
                          <span className="block text-muted-foreground">
                            move {brutusReview.touchToClose?.toFixed(1) ?? "?"}{" "}
                            / adverse {brutusReview.adverse?.toFixed(1) ?? "?"}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={
                              status === "matched"
                                ? "text-lime-400"
                                : status === "nearby"
                                  ? "text-amber-300"
                                  : "text-destructive"
                            }
                          >
                            {status}
                          </span>
                          {deltaMinutes != null && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({deltaMinutes.toFixed(1)}m)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  },
                )
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
