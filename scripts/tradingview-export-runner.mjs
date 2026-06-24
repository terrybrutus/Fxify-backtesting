import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const symbols = ["DJ30.R", "USTEC.R", "US500.R", "JPN225.R", "RUS2000.R"];
const intervals = [
  { label: "1m", tv: "1" },
  { label: "3m", tv: "3" },
  { label: "5m", tv: "5" },
  { label: "15m", tv: "15" },
  { label: "30m", tv: "30" },
  { label: "45m", tv: "45" },
  { label: "1H", tv: "60" },
];

const root = process.cwd();
const exportDir = path.resolve(root, "data", "tradingview-exports");
const profileDir = path.resolve(root, ".tradingview-export-profile");
const manifestPath = path.join(exportDir, "manifest.json");
const remotePort = Number(getArg("--port") ?? 9333);
const setupOnly = process.argv.includes("--setup");
const keepOpen = process.argv.includes("--keep-open") || setupOnly;
const chartLoadMs = Number(getArg("--chart-load-ms") ?? 10_000);
const downloadWaitMs = Number(getArg("--download-wait-ms") ?? 20_000);

if (!globalThis.WebSocket) {
  throw new Error("This script needs Node 22+ because it uses the built-in WebSocket client.");
}

mkdirSync(exportDir, { recursive: true });
mkdirSync(profileDir, { recursive: true });

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error("Could not find Chrome. Install Chrome or add it to the script's findChrome() list.");
  }

  console.log(`Launching Chrome from: ${chromePath}`);
  console.log(`TradingView profile: ${profileDir}`);
  console.log(`Export folder: ${exportDir}`);

  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${remotePort}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-popup-blocking",
      "about:blank",
    ],
    { detached: true, stdio: "ignore" },
  );
  chrome.unref();

  await waitForDevtools(remotePort);
  const page = await getFirstPage(remotePort);
  const cdp = await CdpClient.connect(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await setDownloadBehavior(cdp, exportDir);

  if (setupOnly) {
    await cdp.send("Page.navigate", {
      url: "https://www.tradingview.com/chart/?symbol=ALCHEMY%3ADJ30.R&interval=15",
    });
    console.log("\nSetup mode is open.");
    console.log("1. Log into TradingView in the Chrome window.");
    console.log("2. Open a chart and make sure your Brutus indicator is applied.");
    console.log("3. Run: corepack pnpm export:tradingview\n");
    cdp.close();
    return;
  }

  const manifest = {
    startedAt: new Date().toISOString(),
    exportDir,
    symbols,
    intervals: intervals.map((interval) => interval.label),
    results: [],
  };

  for (const symbol of symbols) {
    for (const interval of intervals) {
      const result = await exportOne(cdp, symbol, interval);
      manifest.results.push(result);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }

  manifest.finishedAt = new Date().toISOString();
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const succeeded = manifest.results.filter((result) => result.status === "saved").length;
  const failed = manifest.results.filter((result) => result.status !== "saved");
  console.log(`\nDone. Saved ${succeeded}/${manifest.results.length} CSV exports.`);
  if (failed.length > 0) {
    console.log("Failed exports:");
    for (const item of failed) console.log(`- ${item.symbol} ${item.timeframe}: ${item.status} ${item.error ?? ""}`);
  }
  console.log(`Manifest: ${manifestPath}`);

  if (!keepOpen) {
    console.log("Chrome was left open intentionally only if you pass --keep-open.");
  }
}

async function exportOne(cdp, symbol, interval) {
  const display = `${symbol} ${interval.label}`;
  const targetName = `ALCHEMY_${symbol}, ${interval.tv}.csv`;
  const targetPath = path.join(exportDir, targetName);
  console.log(`\nExporting ${display} -> ${targetName}`);

  try {
    const before = snapshotCsvs(exportDir);
    const url = `https://www.tradingview.com/chart/?symbol=ALCHEMY%3A${encodeURIComponent(symbol)}&interval=${interval.tv}`;
    await cdp.send("Page.navigate", { url });
    await waitForPageIdle(cdp, chartLoadMs);

    const clicked = await runInPage(cdp, exportClickScript());
    if (!clicked?.ok) {
      return { symbol, timeframe: interval.label, targetName, status: "export-ui-not-found", error: clicked?.error };
    }

    const downloaded = await waitForNewCsv(exportDir, before, downloadWaitMs);
    if (!downloaded) {
      return { symbol, timeframe: interval.label, targetName, status: "download-timeout" };
    }

    renameSync(downloaded, targetPath);
    return {
      symbol,
      timeframe: interval.label,
      targetName,
      status: "saved",
      bytes: statSync(targetPath).size,
    };
  } catch (error) {
    return { symbol, timeframe: interval.label, targetName, status: "error", error: error.message };
  }
}

function exportClickScript() {
  return String.raw`
    async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const textOf = (node) => [
        node.innerText,
        node.textContent,
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.getAttribute?.("data-name"),
      ].filter(Boolean).join(" ").toLowerCase();
      const allClickables = () => Array.from(document.querySelectorAll(
        'button, [role="button"], [data-role="button"], [aria-label], [data-name], [class*="button"]'
      )).filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const click = (node) => {
        node.scrollIntoView?.({ block: "center", inline: "center" });
        node.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        node.click();
      };
      const findByNeedles = (needles) => allClickables().find((node) => {
        const haystack = textOf(node);
        return needles.some((needle) => haystack.includes(needle));
      });

      let menu = findByNeedles(["manage layouts", "layout"]);
      if (!menu) {
        const rightButtons = allClickables()
          .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }))
          .filter((item) => item.rect.left > window.innerWidth * 0.55)
          .sort((a, b) => b.rect.left - a.rect.left);
        menu = rightButtons.find((item) =>
          item.text.includes("layout") ||
          item.text.includes("chart layout") ||
          item.text.includes("save")
        )?.node;
      }
      if (!menu) return { ok: false, error: "Could not find Manage layouts button." };
      click(menu);
      await sleep(900);

      let exportItem = Array.from(document.querySelectorAll('*')).find((node) => {
        const rect = node.getBoundingClientRect();
        const text = textOf(node);
        return rect.width > 0 && rect.height > 0 && text.includes("download chart data");
      });
      if (!exportItem) {
        exportItem = Array.from(document.querySelectorAll('*')).find((node) => {
          const rect = node.getBoundingClientRect();
          const text = textOf(node);
          return rect.width > 0 && rect.height > 0 && text.includes("export chart data");
        });
      }
      if (!exportItem) return { ok: false, error: "Could not find Download chart data menu item." };
      click(exportItem);
      await sleep(1200);

      const finalButton = findByNeedles(["export", "download", "save"]);
      if (finalButton) click(finalButton);
      return { ok: true };
    }
  `;
}

async function runInPage(cdp, fnSource) {
  const response = await cdp.send("Runtime.evaluate", {
    expression: `(${fnSource})()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text ?? "Runtime evaluation failed");
  }
  return response.result?.value;
}

async function waitForPageIdle(cdp, ms) {
  await sleep(ms);
  await cdp.send("Runtime.evaluate", {
    expression: "document.readyState",
    returnByValue: true,
  });
}

async function setDownloadBehavior(cdp, downloadPath) {
  try {
    await cdp.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath,
      eventsEnabled: true,
    });
  } catch {
    await cdp.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath,
    });
  }
}

function snapshotCsvs(dir) {
  return new Set(
    readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith(".csv"))
      .map((name) => path.join(dir, name)),
  );
}

async function waitForNewCsv(dir, before, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const candidates = readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith(".csv") && !name.endsWith(".crdownload"))
      .map((name) => path.join(dir, name))
      .filter((file) => !before.has(file))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (candidates[0] && statSync(candidates[0]).size > 0) return candidates[0];
    await sleep(500);
  }
  return null;
}

async function waitForDevtools(port) {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`Chrome DevTools did not open on port ${port}.`);
}

async function getFirstPage(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  const pages = await response.json();
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) throw new Error("Could not find a Chrome page target.");
  return page;
}

class CdpClient {
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => resolve(new CdpClient(ws)));
      ws.addEventListener("error", () => reject(new Error("Could not connect to Chrome DevTools WebSocket.")));
    });
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.ws.close();
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function getArg(name) {
  const match = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
