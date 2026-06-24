import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

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
const manualStart = process.argv.includes("--manual-start");
const useChartUi = process.argv.includes("--use-chart-ui");
const chartLoadMs = Number(getArg("--chart-load-ms") ?? 7_000);
const downloadWaitMs = Number(getArg("--download-wait-ms") ?? 20_000);
const pauseMs = Number(getArg("--pause-ms") ?? 4_000);
const windowWidth = Number(getArg("--window-width") ?? 2560);
const windowHeight = Number(getArg("--window-height") ?? 1440);
const zoomOutSteps = Number(getArg("--zoom-out-steps") ?? 18);
const zoomOutDelayMs = Number(getArg("--zoom-out-delay-ms") ?? 120);

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
      "--start-maximized",
      `--window-size=${windowWidth},${windowHeight}`,
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
  await allowInputEvents(cdp);
  await setDownloadBehavior(cdp, exportDir);
  await maximizeWindow(cdp, page.id);

  if (setupOnly) {
    await cdp.send("Page.navigate", {
      url: "https://www.tradingview.com/chart/?symbol=ALCHEMY%3ADJ30.R&interval=15",
    });
    console.log("\nSetup mode is open.");
    console.log("1. Log into TradingView in the Chrome window.");
    console.log("2. Open a chart and make sure your Brutus indicator is applied.");
    console.log("3. Maximize the window and zoom the chart out as far as you want.");
    console.log("4. Manually confirm Manage layouts > Download chart data works once.");
    console.log("5. Run: corepack pnpm export:tradingview -- --manual-start --use-chart-ui\n");
    cdp.close();
    return;
  }

  if (manualStart) {
    if (!useChartUi) {
      await cdp.send("Page.navigate", {
        url: "https://www.tradingview.com/chart/?symbol=ALCHEMY%3ADJ30.R&interval=15",
      });
    }
    console.log("\nManual start mode:");
    console.log("1. In the Chrome window, open the chart layout you want exported.");
    console.log("2. Set the chart to the first symbol and zoom out to the amount of candles you want.");
    console.log("3. Make sure the watchlist symbols and timeframe buttons are visible.");
    console.log("4. Make sure the Brutus/export indicator is visible on the chart.");
    await waitForEnter("Press Enter here when the chart is ready and the batch should start...");
  }

  const manifest = {
    startedAt: new Date().toISOString(),
    exportDir,
    symbols,
    intervals: intervals.map((interval) => interval.label),
    settings: {
      chartLoadMs,
      downloadWaitMs,
      pauseMs,
      windowWidth,
      windowHeight,
      manualStart,
      useChartUi,
      zoomOutSteps,
      zoomOutDelayMs,
    },
    results: [],
  };

  if (useChartUi) {
    for (const symbol of symbols) {
      const selected = await selectSymbolInChartUi(cdp, symbol);
      if (!selected.ok) {
        const result = {
          symbol,
          timeframe: "all",
          targetName: null,
          status: "symbol-ui-not-found",
          error: selected.error,
        };
        manifest.results.push(result);
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        continue;
      }
      await sleep(chartLoadMs);
      for (const interval of intervals) {
        const result = await exportOneFromChartUi(cdp, symbol, interval);
        manifest.results.push(result);
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        if (pauseMs > 0) {
          console.log(`Waiting ${(pauseMs / 1000).toFixed(1)}s before the next export...`);
          await sleep(pauseMs);
        }
      }
    }
  } else {
    for (const symbol of symbols) {
      for (const interval of intervals) {
        const result = await exportOne(cdp, symbol, interval);
        manifest.results.push(result);
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        if (pauseMs > 0) {
          console.log(`Waiting ${(pauseMs / 1000).toFixed(1)}s before the next export...`);
          await sleep(pauseMs);
        }
      }
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
    await zoomOutChart(cdp, zoomOutSteps, zoomOutDelayMs);

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

async function exportOneFromChartUi(cdp, symbol, interval) {
  const display = `${symbol} ${interval.label}`;
  const targetName = `ALCHEMY_${symbol}, ${interval.tv}.csv`;
  const targetPath = path.join(exportDir, targetName);
  console.log(`\nExporting ${display} from current TradingView UI -> ${targetName}`);

  try {
    const before = snapshotCsvs(exportDir);
    const selected = await selectTimeframeInChartUi(cdp, interval);
    if (!selected.ok) {
      return {
        symbol,
        timeframe: interval.label,
        targetName,
        status: "timeframe-ui-not-found",
        error: selected.error,
      };
    }
    await sleep(chartLoadMs);

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

async function selectSymbolInChartUi(cdp, symbol) {
  console.log(`Selecting watchlist symbol ${symbol}...`);
  return runInPage(cdp, selectSymbolScript(symbol));
}

async function selectTimeframeInChartUi(cdp, interval) {
  console.log(`Selecting timeframe ${interval.label}...`);
  return runInPage(cdp, selectTimeframeScript(interval.label));
}

function selectSymbolScript(symbol) {
  return `
    () => {
      const wanted = ${JSON.stringify(symbol.toUpperCase())};
      const textOf = (node) => [
        node.innerText,
        node.textContent,
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.getAttribute?.("data-symbol"),
      ].filter(Boolean).join(" ").toUpperCase();
      const click = (node) => {
        node.scrollIntoView?.({ block: "center", inline: "center" });
        node.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        node.click();
      };
      const candidates = Array.from(document.querySelectorAll('*'))
        .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }))
        .filter((item) =>
          item.rect.width > 0 &&
          item.rect.height > 0 &&
          item.rect.left > window.innerWidth * 0.64 &&
          item.text.includes(wanted)
        )
        .sort((a, b) => Math.abs(a.rect.left - window.innerWidth * 0.82) - Math.abs(b.rect.left - window.innerWidth * 0.82));
      const target = candidates[0]?.node?.closest?.('button, [role="button"], [data-role="button"], [aria-label], [data-symbol]') ?? candidates[0]?.node;
      if (!target) return { ok: false, error: "Could not find symbol in right-side watchlist: " + wanted };
      click(target);
      return { ok: true, symbol: wanted };
    }
  `;
}

function selectTimeframeScript(label) {
  return `
    () => {
      const wanted = ${JSON.stringify(label.toLowerCase())};
      const aliases = wanted === "1h" ? ["1h", "1 h", "60"] : [wanted, wanted.replace("m", "")];
      const textOf = (node) => [
        node.innerText,
        node.textContent,
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.getAttribute?.("data-value"),
      ].filter(Boolean).join(" ").toLowerCase().trim();
      const click = (node) => {
        node.scrollIntoView?.({ block: "center", inline: "center" });
        node.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        node.click();
      };
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], [data-role="button"], [aria-label], [title], [data-value]'))
        .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }))
        .filter((item) => {
          if (item.rect.width <= 0 || item.rect.height <= 0) return false;
          if (item.rect.top > 175 || item.rect.left > window.innerWidth * 0.45) return false;
          return aliases.some((alias) => {
            const text = item.text.replace(/\\s+/g, " ");
            return text === alias || text.includes(" " + alias + " ") || text.endsWith(" " + alias);
          });
        })
        .sort((a, b) => a.rect.left - b.rect.left);
      const target = candidates[0]?.node;
      if (!target) return { ok: false, error: "Could not find visible timeframe button: " + wanted };
      click(target);
      return { ok: true, timeframe: wanted };
    }
  `;
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
      const clickAt = (x, y) => {
        const node = document.elementFromPoint(x, y);
        if (!node) return false;
        click(node.closest?.('button, [role="button"], [data-role="button"], [aria-label], [data-name]') ?? node);
        return true;
      };
      const visibleTextNodes = () => Array.from(document.querySelectorAll('*')).filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const clickLayoutDropdownByVisibleName = () => {
        const layoutName = visibleTextNodes()
          .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node).trim() }))
          .filter((item) =>
            item.rect.top < 85 &&
            item.rect.left > window.innerWidth * 0.55 &&
            item.text &&
            item.text.length <= 24 &&
            !item.text.includes("trade") &&
            !item.text.includes("publish")
          )
          .find((item) => /(^|\s)(dca|layout|view)(\s|$)/i.test(item.text));
        if (!layoutName) return false;
        const x = Math.min(layoutName.rect.right + 12, window.innerWidth - 12);
        const y = layoutName.rect.top + layoutName.rect.height / 2;
        return clickAt(x, y) || click(layoutName.node);
      };
      const clickDownloadDialogButton = () => {
        const nodes = visibleTextNodes()
          .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node).trim() }))
          .filter((item) => item.rect.width > 0 && item.rect.height > 0);
        const dialogHints = nodes.filter((item) => item.text.includes("download chart data"));
        const dialogRect = dialogHints
          .map((item) => item.rect)
          .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
        const buttons = allClickables()
          .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node).trim() }))
          .filter((item) => {
            if (item.rect.width <= 0 || item.rect.height <= 0) return false;
            if (item.text !== "download") return false;
            if (!dialogRect) return true;
            return (
              item.rect.left >= dialogRect.left - 20 &&
              item.rect.right <= dialogRect.right + 20 &&
              item.rect.top >= dialogRect.top - 20 &&
              item.rect.bottom <= dialogRect.bottom + 80
            );
          })
          .sort((a, b) => b.rect.top - a.rect.top || b.rect.left - a.rect.left);
        if (buttons[0]) {
          click(buttons[0].node);
          return { ok: true, method: "dialog-button", text: buttons[0].text };
        }
        const lowerRightButton = allClickables()
          .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node).trim() }))
          .filter((item) =>
            item.rect.width > 0 &&
            item.rect.height > 0 &&
            item.rect.left > window.innerWidth * 0.45 &&
            item.rect.top > window.innerHeight * 0.42 &&
            item.text.includes("download")
          )
          .sort((a, b) => b.rect.top - a.rect.top || b.rect.left - a.rect.left)[0];
        if (lowerRightButton) {
          click(lowerRightButton.node);
          return { ok: true, method: "lower-right-button", text: lowerRightButton.text };
        }
        return { ok: false, error: "Could not find final Download button in chart-data dialog." };
      };

      let menu = findByNeedles(["manage layouts", "manage layout", "chart layouts", "chart layout"]);
      if (!menu) {
        const rightButtons = allClickables()
          .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }))
          .filter((item) => item.rect.left > window.innerWidth * 0.72 && item.rect.top < 120)
          .sort((a, b) => b.rect.left - a.rect.left);
        menu = rightButtons.find((item) =>
          item.text.includes("manage layout") ||
          item.text.includes("chart layout") ||
          item.text.includes("layout")
        )?.node;
      }
      if (menu) {
        click(menu);
      } else if (clickLayoutDropdownByVisibleName()) {
        // Opened the chart-layout dropdown beside the visible layout name.
      } else {
        const clickedTopRight =
          clickAt(window.innerWidth - 280, 28) ||
          clickAt(window.innerWidth - 240, 28) ||
          clickAt(window.innerWidth - 320, 28) ||
          clickAt(window.innerWidth - 190, 28);
        if (!clickedTopRight) return { ok: false, error: "Could not find Manage layouts button." };
      }
      await sleep(500);

      let exportItem = visibleTextNodes().find((node) => textOf(node).includes("download chart data"));
      if (!exportItem) exportItem = visibleTextNodes().find((node) => textOf(node).includes("export chart data"));
      if (!exportItem) exportItem = visibleTextNodes().find((node) => textOf(node).includes("export data"));
      if (!exportItem) return { ok: false, error: "Could not find Download chart data menu item." };
      click(exportItem);
      await sleep(1000);

      const finalClick = clickDownloadDialogButton();
      if (!finalClick.ok) return finalClick;
      await sleep(800);
      return { ok: true, finalClick };
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

async function zoomOutChart(cdp, steps, delayMs) {
  if (steps <= 0) return { ok: true, skipped: true };
  const bounds = await runInPage(cdp, chartBoundsScript());
  const x = Math.round(bounds?.x ?? windowWidth / 2);
  const y = Math.round(bounds?.y ?? windowHeight / 2);
  console.log(`Zooming chart out ${steps} step(s)...`);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
  });
  for (let index = 0; index < steps; index += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x,
      y,
      deltaX: 0,
      deltaY: 900,
    });
    await sleep(delayMs);
  }
  await sleep(750);
  return { ok: true, x, y, steps };
}

function chartBoundsScript() {
  return String.raw`
    () => {
      const candidates = Array.from(document.querySelectorAll(
        '[data-name="chart-widget"], [class*="chart-widget"], canvas'
      ))
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.width > 300 && rect.height > 200)
        .sort((a, b) => (b.width * b.height) - (a.width * a.height));
      const rect = candidates[0];
      if (!rect) return { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }
  `;
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

async function allowInputEvents(cdp) {
  try {
    await cdp.send("Input.setIgnoreInputEvents", { ignore: false });
  } catch {
    // Some Chrome builds do not expose this command; normal input still works.
  }
}

async function maximizeWindow(cdp, targetId) {
  try {
    const { windowId } = await cdp.send("Browser.getWindowForTarget", { targetId });
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: {
        windowState: "maximized",
      },
    });
  } catch {
    // Chrome can still run exports if the window manager refuses maximize.
  }
}

async function waitForEnter(prompt) {
  const rl = createInterface({ input, output });
  try {
    await rl.question(`${prompt}\n`);
  } finally {
    rl.close();
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
