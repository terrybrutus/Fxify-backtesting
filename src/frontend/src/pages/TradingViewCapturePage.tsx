import { useStrategyWorkspace } from "@/hooks/useStrategyWorkspace";
import { useMemo, useState } from "react";

const STORAGE_KEY = "ict.tradingview.alerts.v1";

type TvAlert = {
  id: string;
  importedAt: number;
  strategy?: string;
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
  length?: number;
  stdDev?: number;
  raw: unknown;
};

type MatchStatus = "matched" | "nearby" | "no-match" | "no-data";

const EXAMPLE_PAYLOAD = `{"strategy":"brutus_band","symbol":"ALCHEMYMARKETS:DJ30","timeframe":"60","direction":"long","time":1782084600000,"open":51810.5,"high":51834.2,"low":51762.1,"close":51798.7,"upper":52104.8,"lower":51770.3,"length":9,"stdDev":2}`;

function loadAlerts(): TvAlert[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TvAlert[]) : [];
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

function normalizePayload(raw: unknown): TvAlert {
  const item =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
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
    brokerSymbol,
    mappedSymbol: mapBrokerSymbol(brokerSymbol),
    timeframe: asString(item.timeframe) ?? asString(item.interval),
    direction: asString(item.direction) ?? asString(item.side),
    time: timestamp,
    open: asNumber(item.open),
    high: asNumber(item.high),
    low: asNumber(item.low),
    close: asNumber(item.close),
    upper: asNumber(item.upper),
    lower: asNumber(item.lower),
    length: asNumber(item.length),
    stdDev: asNumber(item.stdDev) ?? asNumber(item.mult),
    raw,
  };
}

function parsePayloadText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed)
      ? parsed.map(normalizePayload)
      : [normalizePayload(parsed)];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => normalizePayload(JSON.parse(line)));
  }
}

function mapBrokerSymbol(symbol?: string) {
  const upper = symbol?.toUpperCase() ?? "";
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
  return undefined;
}

function formatTime(timestamp?: number) {
  if (!timestamp) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(new Date(timestamp));
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
  const [payloadText, setPayloadText] = useState(EXAMPLE_PAYLOAD);
  const [alerts, setAlerts] = useState<TvAlert[]>(() => loadAlerts());
  const [error, setError] = useState("");

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
        const timeframe = alert.timeframe === "60" ? "1H" : alert.timeframe;
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

  function addPayloads(text: string) {
    try {
      const parsed = parsePayloadText(text);
      const next = [...parsed, ...alerts].slice(0, 500);
      setAlerts(next);
      saveAlerts(next);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not parse alert JSON.",
      );
    }
  }

  return (
    <div className="space-y-5 p-6" data-ocid="tradingview.capture.page">
      <div>
        <h1 className="font-display text-2xl font-bold">
          TradingView Alert Capture
        </h1>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
          Use this as the truth intake for exact FXIFY/Alchemy Markets
          TradingView alert events. Paste one JSON alert, a JSON array, or
          newline-delimited JSON exports.
        </p>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
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
            className="mt-3 min-h-44 w-full border border-border bg-background p-3 font-mono text-xs text-foreground"
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
          />
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="border border-primary bg-primary px-4 py-2 font-mono text-xs text-primary-foreground"
              onClick={() => addPayloads(payloadText)}
              type="button"
            >
              Import pasted alert
            </button>
            <label className="cursor-pointer border border-border bg-background px-4 py-2 font-mono text-xs hover:border-primary">
              Upload JSON log
              <input
                accept=".json,.jsonl,.txt"
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
                  JSON.stringify(alerts, null, 2),
                )
              }
              type="button"
            >
              Export captured alerts
            </button>
            <button
              className="border border-destructive/40 bg-background px-4 py-2 font-mono text-xs text-destructive hover:border-destructive"
              onClick={() => {
                setAlerts([]);
                saveAlerts([]);
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
              the Brutus alert, set the webhook URL there, then copy the
              received request body into this page. Later we replace
              Webhook.site with our own hosted endpoint.
            </p>
          </div>
          <div className="border border-border bg-card p-4">
            <h2 className="font-display text-sm font-bold">
              FXIFY Connection Clue
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              FXIFY docs point users to the TradingView Trading Panel broker
              flow and mention the broker name “Alchemy markets.” That is the
              source to test first, not public Yahoo symbols.
            </p>
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
                <th className="px-2 py-2">Side</th>
                <th className="px-2 py-2">OHLC</th>
                <th className="px-2 py-2">Bands</th>
                <th className="px-2 py-2">Match</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-2 py-6 text-muted-foreground" colSpan={8}>
                    No TradingView alert events imported yet.
                  </td>
                </tr>
              ) : (
                rows.map(({ alert, status, deltaMinutes }) => (
                  <tr className="border-b border-border/60" key={alert.id}>
                    <td className="px-2 py-2">{formatTime(alert.time)}</td>
                    <td className="px-2 py-2">
                      {alert.brokerSymbol ?? "unknown"}
                    </td>
                    <td className="px-2 py-2">
                      {alert.mappedSymbol ?? "unmapped"}
                    </td>
                    <td className="px-2 py-2">{alert.timeframe ?? "n/a"}</td>
                    <td className="px-2 py-2">{alert.direction ?? "n/a"}</td>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
