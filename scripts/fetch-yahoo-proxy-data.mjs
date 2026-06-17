import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const jobs = [
  { yahoo: "NQ=F", symbol: "NAS100", interval: "5m", range: "60d" },
  { yahoo: "NQ=F", symbol: "NAS100", interval: "60m", range: "60d", appTimeframe: "1H" },
  { yahoo: "NQ=F", symbol: "NAS100", interval: "1d", period1: "2024-01-01", appTimeframe: "1D" },
  { yahoo: "YM=F", symbol: "US30", interval: "5m", range: "60d" },
  { yahoo: "YM=F", symbol: "US30", interval: "60m", range: "60d", appTimeframe: "1H" },
  { yahoo: "YM=F", symbol: "US30", interval: "1d", period1: "2024-01-01", appTimeframe: "1D" },
  { yahoo: "ES=F", symbol: "US500", interval: "5m", range: "60d" },
  { yahoo: "ES=F", symbol: "US500", interval: "60m", range: "60d", appTimeframe: "1H" },
  { yahoo: "ES=F", symbol: "US500", interval: "1d", period1: "2024-01-01", appTimeframe: "1D" },
];

const outputArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputPath = path.resolve(
  process.cwd(),
  outputArg?.slice("--out=".length) ?? "data/yahoo_futures_proxy_master.csv",
);

function toUnixSeconds(dateText) {
  return Math.floor(new Date(`${dateText}T00:00:00Z`).getTime() / 1000);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toAppTimeframe(job) {
  if (job.appTimeframe) return job.appTimeframe;
  if (job.interval === "5m") return "5m";
  if (job.interval === "60m") return "1H";
  if (job.interval === "1d") return "1D";
  return job.interval;
}

function buildUrl(job) {
  const params = new URLSearchParams({
    interval: job.interval,
    includePrePost: "true",
    events: "history",
  });

  if (job.range) {
    params.set("range", job.range);
  } else {
    params.set("period1", String(toUnixSeconds(job.period1)));
    params.set("period2", String(Math.floor(Date.now() / 1000)));
  }

  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(job.yahoo)}?${params}`;
}

async function fetchJob(job) {
  const url = buildUrl(job);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 strategy-audit-data-fetcher",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`${job.yahoo} ${job.interval} failed: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const error = payload.chart?.error;
  if (error) throw new Error(`${job.yahoo} ${job.interval} failed: ${error.description}`);
  if (!result?.timestamp?.length) return [];

  const quote = result.indicators?.quote?.[0];
  if (!quote) return [];

  const rows = [];
  for (let index = 0; index < result.timestamp.length; index += 1) {
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    if (![open, high, low, close].every((value) => Number.isFinite(value))) continue;

    rows.push({
      timestamp: new Date(result.timestamp[index] * 1000).toISOString().replace(".000Z", "Z"),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(quote.volume?.[index]) ? quote.volume[index] : 0,
      symbol: job.symbol,
      timeframe: toAppTimeframe(job),
      timezone: "UTC",
    });
  }

  return rows;
}

const allRows = [];
for (const job of jobs) {
  process.stdout.write(`Fetching ${job.yahoo} as ${job.symbol} ${toAppTimeframe(job)}... `);
  const rows = await fetchJob(job);
  allRows.push(...rows);
  process.stdout.write(`${rows.length.toLocaleString()} rows\n`);
}

allRows.sort((a, b) =>
  a.symbol.localeCompare(b.symbol) ||
  a.timeframe.localeCompare(b.timeframe) ||
  a.timestamp.localeCompare(b.timestamp),
);

const header = ["timestamp", "open", "high", "low", "close", "volume", "symbol", "timeframe", "timezone"];
const csv = [
  header.join(","),
  ...allRows.map((row) => header.map((key) => csvEscape(row[key])).join(",")),
].join("\n");

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${csv}\n`, "utf8");

console.log(`Saved ${allRows.length.toLocaleString()} rows to ${outputPath}`);
