import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { useMemo, useState } from "react";

const STORAGE_KEY = "ict.tradingview.alerts.v1";

type TvAlert = {
  id: string;
  importedAt: number;
  strategy?: string;
  rawSignal?: boolean;
  action?: string;
  plainAction?: string;
  alertMode?: string;
  mode?: string;
  confirmed?: boolean;
  brokerSymbol?: string;
  mappedSymbol?: string;
  timeframe?: string;
  direction?: string;
  time?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  upper?: number;
  lower?: number;
  entry?: number;
  stop?: number;
  target?: number;
  length?: number;
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
  touchToClose?: number;
  adverse?: number;
};

type ImportResult = {
  added: number;
  duplicates: number;
  total: number;
};

type ReviewCounts = {
  enter: number;
  wait: number;
  skip: number;
  doNotHold: number;
};

const EXAMPLE_PAYLOAD = `{"strategy":"brutus_playbook_v1","rawSignal":true,"mode":"first_touch","confirmed":false,"symbol":"ALCHEMYMARKETS:DJ30.r","timeframe":"60","action":"ENTER","plainAction":"ENTER: paper trade candidate. Use the entry, stop, and target from this alert.","direction":"long","time":1782084600000,"alertTime":1782084723000,"open":51810.5,"high":51834.2,"low":51762.1,"close":51798.7,"upper":52104.8,"lower":51770.3,"entry":51770.3,"stop":51685.2,"target":51872.4,"length":9,"stdDev":2,"reason":"Original Brutus signal fired and price started snapping back."}`;

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
      ? parsed.map((alert) => normalizePayload(alert.raw ?? alert))
      : [];
  } catch {
    return [];
  }
}

function saveAlerts(alerts: TvAlert[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
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
    (typeof item.time === "string" ? Date.parse(item.time) : undefined);
  const brokerSymbol =
    asString(item.symbol) ?? asString(item.ticker) ?? asString(item.tickerid);
  return {
    id: crypto.randomUUID(),
    importedAt: Date.now(),
    strategy: asString(item.strategy),
    rawSignal: asBoolean(item.rawSignal),
    action: asString(item.action),
    plainAction: asString(item.plainAction),
    alertMode: asString(item.alertMode),
    mode: asString(item.mode),
    confirmed: asBoolean(item.confirmed),
    brokerSymbol,
    mappedSymbol: mapBrokerSymbol(brokerSymbol),
    timeframe: normalizeTimeframe(
      asString(item.timeframe) ?? asString(item.interval),
    ),
    direction: asString(item.direction) ?? asString(item.side),
    time: timestamp,
    open: asNumber(item.open),
    high: asNumber(item.high),
    low: asNumber(item.low),
    close: asNumber(item.close),
    upper: asNumber(item.upper),
    lower: asNumber(item.lower),
    entry: asNumber(item.entry),
    stop: asNumber(item.stop),
    target: asNumber(item.target),
    length: asNumber(item.length),
    stdDev: asNumber(item.stdDev) ?? asNumber(item.mult),
    raw: unwrapped,
  };
}

function normalizeTimeframe(timeframe?: string) {
  const raw = timeframe?.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === "15") return "15m";
  if (lower === "60") return "1H";
  if (lower.endsWith("m")) return lower;
  if (lower.endsWith("h")) return lower.toUpperCase();
  if (lower === "1d" || lower === "d") return "1D";
  return raw;
}

function alertIdentity(alert: TvAlert) {
  return [
    alert.strategy ?? "",
    alert.alertMode ?? "",
    alert.brokerSymbol ?? "",
    alert.timeframe ?? "",
    alert.direction ?? "",
    alert.time ?? "",
    alert.open ?? "",
    alert.high ?? "",
    alert.low ?? "",
    alert.close ?? "",
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

function parseCsvText(
  text: string,
  normalizeMany: (value: unknown) => TvAlert[],
) {
  const records = parseCsvRecords(text);
  const [header, ...rows] = records;
  if (!header) return [];
  const descriptionIndex = header.findIndex(
    (cell) => cell.trim().toLowerCase() === "description",
  );
  const candidateCells =
    descriptionIndex >= 0
      ? rows.map((row) => row[descriptionIndex] ?? "")
      : records.flat();
  return candidateCells.flatMap((cell) => {
    const trimmed = cell.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];
    try {
      return normalizeMany(JSON.parse(trimmed));
    } catch {
      try {
        return normalizeMany(JSON.parse(trimmed.replaceAll('""', '"')));
      } catch {
        return [];
      }
    }
  });
}

function parsePayloadText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const normalizeMany = (value: unknown): TvAlert[] => {
    const unwrapped = unwrapWebhookPayload(value);
    if (Array.isArray(unwrapped)) return unwrapped.flatMap(normalizeMany);
    return [normalizePayload(unwrapped)];
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

function directionFor(alert: TvAlert): "long" | "short" | undefined {
  const direction = alert.direction?.toLowerCase();
  if (direction === "long" || direction === "buy") return "long";
  if (direction === "short" || direction === "sell") return "short";
  return undefined;
}

function actionFor(alert: TvAlert) {
  return alert.action?.trim().toUpperCase().replace(/\s+/g, "_");
}

function isPlaybookAlert(alert: TvAlert) {
  return alert.strategy === "brutus_playbook_v1" || alert.rawSignal === true;
}

function isLegacyBrutusAlert(alert: TvAlert) {
  return !isPlaybookAlert(alert) && alert.strategy === "brutus_band";
}

function rawReasonFor(alert: TvAlert) {
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
    touchToClose,
    adverse,
  };
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

export default function TradingViewCapturePage() {
  const { candles } = useStrategyWorkspace();
  const [payloadText, setPayloadText] = useState("");
  const [alerts, setAlerts] = useState<TvAlert[]>(() => loadAlerts());
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

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
  const reviewCounts = useMemo(
    () => ({
      enter: reviewedRows.filter((row) => row.brutusReview.status === "ENTER")
        .length,
      wait: reviewedRows.filter((row) => row.brutusReview.status === "WAIT")
        .length,
      skip: reviewedRows.filter((row) => row.brutusReview.status === "SKIP")
        .length,
      doNotHold: reviewedRows.filter(
        (row) => row.brutusReview.status === "DO_NOT_HOLD",
      ).length,
    }),
    [reviewedRows],
  );
  const paperSummary = useMemo(() => {
    const matchCounts = reviewedRows.reduce<Record<MatchStatus, number>>(
      (acc, row) => {
        acc[row.status] += 1;
        return acc;
      },
      { matched: 0, nearby: 0, "no-match": 0, "no-data": 0 },
    );
    const bySymbol = reviewedRows.reduce<Record<string, ReviewCounts>>(
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
    const byTimeframe = reviewedRows.reduce<Record<string, ReviewCounts>>(
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
    const byMode = reviewedRows.reduce<Record<string, ReviewCounts>>(
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
    const playbookAlerts = reviewedRows.filter((row) =>
      isPlaybookAlert(row.alert),
    ).length;
    const legacyAlerts = reviewedRows.filter((row) =>
      isLegacyBrutusAlert(row.alert),
    ).length;
    const incompleteAlerts = reviewedRows.filter((row) => {
      const alert = row.alert;
      return (
        !alert.brokerSymbol ||
        !alert.timeframe ||
        !alert.direction ||
        alert.high == null ||
        alert.low == null ||
        alert.close == null ||
        alert.upper == null ||
        alert.lower == null
      );
    }).length;
    const enterRows = reviewedRows.filter(
      (row) => row.brutusReview.status === "ENTER",
    );
    const waitRows = reviewedRows.filter(
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
      ...(matchCounts["no-data"] || matchCounts["no-match"]
        ? [
            `${matchCounts["no-data"] + matchCounts["no-match"]} alert(s) cannot be matched to imported app candles. Trust TradingView first for those rows.`,
          ]
        : []),
      ...(incompleteAlerts
        ? [
            `${incompleteAlerts} alert(s) are missing required JSON fields. Recreate those alerts with the latest exported Playbook script.`,
          ]
        : []),
    ];
    const dataQuality =
      reviewedRows.length === 0
        ? "empty"
        : playbookAlerts === 0
          ? "legacy-only"
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
    const verdict =
      reviewedRows.length === 0
        ? "No TradingView alerts imported yet."
        : playbookAlerts === 0
          ? "This batch has no current Playbook alerts. Recreate alerts from the latest exported Pine before using it as evidence."
          : incompleteAlerts > 0
            ? "Some alerts are missing required fields. Fix the alert script/log source before judging the strategy."
            : reviewCounts.enter === 0
              ? "No entry candidates in this alert batch. Keep collecting paper alerts."
              : matchCounts["no-data"] > reviewedRows.length / 2
                ? "Entry candidates exist, but most alerts are missing matching app candles. Use TradingView as the live truth and import more alert logs."
                : "Entry candidates exist. Paper review the ENTER rows against TradingView before risking money.";
    return {
      generatedAt: new Date().toISOString(),
      totalAlerts: reviewedRows.length,
      actionCounts: reviewCounts,
      matchCounts,
      bySymbol,
      byTimeframe,
      byMode,
      playbookAlerts,
      legacyAlerts,
      incompleteAlerts,
      failedEnterRows,
      likelyUpgradeWaits,
      reviewQueue,
      dataQuality,
      rawSignalAlerts,
      confirmedAlerts,
      verdict,
    };
  }, [reviewCounts, reviewedRows]);

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
            <p className="mt-2 text-sm text-muted-foreground">
              Added{" "}
              <span className="font-mono text-primary">
                {importResult.added}
              </span>{" "}
              alert(s), skipped{" "}
              <span className="font-mono text-amber-300">
                {importResult.duplicates}
              </span>{" "}
              duplicate(s). Stored total:{" "}
              <span className="font-mono text-foreground">{alerts.length}</span>
              .
            </p>
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
                  const file = event.target.files?.[0];
                  if (!file) return;
                  addPayloads(await file.text());
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            <button
              className="border border-border bg-background px-4 py-2 font-mono text-xs hover:border-primary"
              onClick={() =>
                downloadText(
                  "ict-tradingview-alert-capture.json",
                  JSON.stringify(
                    reviewedRows.map(
                      ({ alert, status, deltaMinutes, brutusReview }) => ({
                        ...alert,
                        matchStatus: status,
                        matchDeltaMinutes: deltaMinutes,
                        brutusReview,
                      }),
                    ),
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
              Start with TradingView using a temporary Webhook.site URL. Create
              the Brutus alert, set the webhook URL there, then copy either the
              received request body or a JSON export into this page. Later we
              replace Webhook.site with our own hosted endpoint.
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
          </div>
        </aside>
      </section>

      <section className="grid gap-3 border border-cyan-500/40 bg-cyan-500/5 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
            Paper-test batch verdict
          </p>
          <p className="mt-2 text-sm text-foreground">{paperSummary.verdict}</p>
          {paperSummary.reviewQueue.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {paperSummary.reviewQueue.slice(0, 5).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          <p>
            Alerts:{" "}
            <span className="text-foreground">{paperSummary.totalAlerts}</span>
          </p>
          <p>
            Playbook:{" "}
            <span className="text-cyan-300">{paperSummary.playbookAlerts}</span>
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
            No data:{" "}
            <span className="text-destructive">
              {paperSummary.matchCounts["no-data"]}
            </span>
          </p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <div className="border border-primary/50 bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
            Draft rule
          </p>
          <p className="mt-2 text-sm text-foreground">
            Good Brutus rejection, band-touch entry, half-band stop, 1.5R
            target, quick scalp.
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-bold">Captured Alerts</h2>
          <p className="font-mono text-xs text-muted-foreground">
            {alerts.length} stored
          </p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse font-mono text-xs">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-2 py-2">TradingView time</th>
                <th className="px-2 py-2">Broker symbol</th>
                <th className="px-2 py-2">Map</th>
                <th className="px-2 py-2">TF</th>
                <th className="px-2 py-2">Mode</th>
                <th className="px-2 py-2">Side</th>
                <th className="px-2 py-2">Rule</th>
                <th className="px-2 py-2">OHLC</th>
                <th className="px-2 py-2">Bands</th>
                <th className="px-2 py-2">Plan</th>
                <th className="px-2 py-2">Match</th>
              </tr>
            </thead>
            <tbody>
              {reviewedRows.length === 0 ? (
                <tr>
                  <td className="px-2 py-6 text-muted-foreground" colSpan={11}>
                    No TradingView alert events imported yet.
                  </td>
                </tr>
              ) : (
                reviewedRows.map(
                  ({ alert, status, deltaMinutes, brutusReview }) => (
                    <tr className="border-b border-border/60" key={alert.id}>
                      <td className="px-2 py-2">{formatTime(alert.time)}</td>
                      <td className="px-2 py-2">
                        {alert.brokerSymbol ?? "unknown"}
                      </td>
                      <td className="px-2 py-2">
                        {alert.mappedSymbol ?? "unmapped"}
                      </td>
                      <td className="px-2 py-2">{alert.timeframe ?? "n/a"}</td>
                      <td className="px-2 py-2">
                        {alert.mode ?? alert.alertMode ?? "n/a"}
                        <span className="block text-muted-foreground">
                          {alert.rawSignal ? "raw" : "legacy"} /{" "}
                          {alert.confirmed ? "confirmed" : "live"}
                        </span>
                      </td>
                      <td className="px-2 py-2">{alert.direction ?? "n/a"}</td>
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
                      <td className="px-2 py-2">
                        E:{brutusReview.entry?.toFixed(2) ?? "?"} S:
                        {brutusReview.stop?.toFixed(2) ?? "?"} T:
                        {brutusReview.target?.toFixed(2) ?? "?"}
                        <span className="block text-muted-foreground">
                          move {brutusReview.touchToClose?.toFixed(1) ?? "?"} /
                          adverse {brutusReview.adverse?.toFixed(1) ?? "?"}
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
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
