(() => {
  const PANEL_ID = "ict-tv-export-helper";
  const STORAGE_KEY = "ictTvExportHelperLog";

  if (document.getElementById(PANEL_ID)) return;

  const state = {
    log: [],
    lastInfo: null,
    batchRunning: false
  };

  const TIMEFRAMES = [
    { label: "1m", aliases: ["1m", "1"] },
    { label: "3m", aliases: ["3m", "3"] },
    { label: "5m", aliases: ["5m", "5"] },
    { label: "15m", aliases: ["15m", "15"] },
    { label: "30m", aliases: ["30m", "30"] },
    { label: "45m", aliases: ["45m", "45"] },
    { label: "1H", aliases: ["1h", "1 h", "60"] }
  ];

  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="ict-tv-title">
      <strong>ICT Export Helper</strong>
      <button type="button" data-action="collapse" title="Collapse">-</button>
    </div>
    <div class="ict-tv-body">
      <div class="ict-tv-row">
        <span>Symbol</span>
        <strong data-field="symbol">unknown</strong>
      </div>
      <div class="ict-tv-row">
        <span>Interval</span>
        <strong data-field="interval">unknown</strong>
      </div>
      <div class="ict-tv-row">
        <span>Source</span>
        <strong data-field="source">TradingView tab</strong>
      </div>
      <button type="button" data-action="refresh">Refresh chart info</button>
      <button type="button" data-action="open-table">Open Table view</button>
      <button type="button" data-action="download-table">Download table data</button>
      <button type="button" data-action="back-chart">Back to chart</button>
      <button type="button" data-action="batch-timeframes">Batch current symbol TFs</button>
      <button type="button" data-action="open-export">Open export dialog</button>
      <button type="button" data-action="click-download">Click modal Download</button>
      <button type="button" data-action="save-log">Save helper log</button>
      <div class="ict-tv-status" data-field="status">Ready. Use one chart first.</div>
    </div>
  `;

  document.documentElement.appendChild(panel);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const extensionApiAvailable = () => {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  };

  const saveLogToStorage = () => {
    if (!extensionApiAvailable()) return;
    try {
      chrome.storage?.local?.set?.({ [STORAGE_KEY]: state.log.slice(-300) });
    } catch {
      // Chrome invalidates old content-script extension contexts after reloads.
    }
  };

  const loadLogFromStorage = (callback) => {
    if (!extensionApiAvailable()) {
      callback([]);
      return;
    }
    try {
      chrome.storage?.local?.get?.(STORAGE_KEY, (result) => {
        if (chrome.runtime?.lastError) {
          callback([]);
          return;
        }
        callback(Array.isArray(result?.[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
      });
    } catch {
      callback([]);
    }
  };

  const sendRuntimeMessage = (message, callback) => {
    if (!extensionApiAvailable()) {
      callback({ ok: false, error: "Extension context was reloaded. Refresh the TradingView tab." });
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime?.lastError) {
          callback({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        callback(response);
      });
    } catch (error) {
      callback({ ok: false, error: error.message });
    }
  };

  const setStatus = (message, kind = "info") => {
    const status = panel.querySelector('[data-field="status"]');
    status.textContent = message;
    status.dataset.kind = kind;
    state.log.push({
      at: new Date().toISOString(),
      kind,
      message,
      chart: state.lastInfo
    });
    saveLogToStorage();
  };

  const textOf = (node) =>
    [
      node.innerText,
      node.textContent,
      node.getAttribute?.("aria-label"),
      node.getAttribute?.("title"),
      node.getAttribute?.("data-name"),
      node.getAttribute?.("data-symbol")
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  const clickNode = (node) => {
    if (!node) return false;
    node.scrollIntoView?.({ block: "center", inline: "center" });
    node.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    node.click();
    return true;
  };

  const clickAt = (x, y) => {
    const node = document.elementFromPoint(x, y);
    return clickNode(node?.closest?.('button, [role="button"], [data-role="button"], [aria-label], [data-name]') ?? node);
  };

  const visibleNodes = () =>
    Array.from(document.querySelectorAll("*")).filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

  const clickables = () =>
    Array.from(
      document.querySelectorAll('button, [role="button"], [data-role="button"], [aria-label], [data-name], [class*="button"]')
    ).filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

  const chartInfo = () => {
    const url = new URL(window.location.href);
    const rawSymbol = decodeURIComponent(url.searchParams.get("symbol") ?? "");
    const interval = url.searchParams.get("interval") ?? visibleIntervalGuess();
    const info = {
      url: window.location.href,
      symbol: rawSymbol || visibleSymbolGuess(),
      interval: interval || "unknown",
      capturedAt: new Date().toISOString()
    };
    state.lastInfo = info;
    panel.querySelector('[data-field="symbol"]').textContent = info.symbol || "unknown";
    panel.querySelector('[data-field="interval"]').textContent = info.interval || "unknown";
    return info;
  };

  const visibleSymbolGuess = () => {
    const header = visibleNodes()
      .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }))
      .filter((item) => item.rect.top < 140 && item.rect.left < window.innerWidth * 0.45)
      .find((item) => /[A-Z0-9]+\.R/.test(item.text));
    return header?.text?.match(/[A-Z0-9]+\.R/)?.[0] ?? "";
  };

  const visibleIntervalGuess = () => {
    const active = visibleNodes()
      .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }))
      .filter((item) => item.rect.top < 130 && item.rect.left < window.innerWidth * 0.45)
      .find((item) => /\b(1m|3m|5m|15m|30m|45m|1h)\b/i.test(item.text));
    return active?.text?.match(/\b(1m|3m|5m|15m|30m|45m|1h)\b/i)?.[0] ?? "";
  };

  const backToChart = async () => {
    const button = visibleNodes().find((node) => /go back to chart|back to chart|chart view/i.test(textOf(node))) ??
      clickables().find((node) => /go back to chart|back to chart|chart view/i.test(textOf(node)));

    if (!button) {
      return { ok: true, alreadyChart: true };
    }

    clickNode(button.node ?? button);
    await sleep(1000);
    return { ok: true };
  };

  const selectTimeframe = async (timeframe) => {
    await backToChart();
    chartInfo();

    const aliases = timeframe.aliases.map((alias) => alias.toLowerCase());
    const candidates = clickables()
      .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node).toLowerCase() }))
      .filter((item) => {
        if (item.rect.top > 150) return false;
        if (item.rect.left > window.innerWidth * 0.5) return false;
        const normalized = item.text.replace(/\s+/g, " ").trim();
        return aliases.some((alias) => normalized === alias || normalized.includes(` ${alias} `) || normalized.endsWith(` ${alias}`));
      })
      .sort((a, b) => a.rect.left - b.rect.left);

    const target = candidates[0];
    if (!target) return { ok: false, error: `Could not find timeframe button ${timeframe.label}.` };

    clickNode(target.node);
    await sleep(1400);
    chartInfo();
    return { ok: true, timeframe: timeframe.label };
  };

  const chartCanvasPoint = () => {
    const canvases = Array.from(document.querySelectorAll("canvas"))
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter((item) =>
        item.rect.width > window.innerWidth * 0.35 &&
        item.rect.height > window.innerHeight * 0.25 &&
        item.rect.top > 40 &&
        item.rect.left < window.innerWidth * 0.75
      )
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));

    const rect = canvases[0]?.rect ?? {
      left: window.innerWidth * 0.18,
      top: window.innerHeight * 0.18,
      width: window.innerWidth * 0.55,
      height: window.innerHeight * 0.42
    };

    return {
      x: Math.round(rect.left + rect.width * 0.52),
      y: Math.round(rect.top + rect.height * 0.48)
    };
  };

  const rightClickAt = (x, y) => {
    const node = document.elementFromPoint(x, y);
    if (!node) return false;
    const target = node.closest?.("canvas, [class], [data-name]") ?? node;
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX: x,
      clientY: y
    };
    target.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
    target.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    target.dispatchEvent(new MouseEvent("contextmenu", eventOptions));
    target.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    return true;
  };

  const openTableView = async () => {
    chartInfo();
    await backToChart();
    const point = chartCanvasPoint();
    setStatus(`Right-clicking chart near ${point.x}, ${point.y} for Table view...`, "info");

    if (!rightClickAt(point.x, point.y)) {
      setStatus("Could not right-click the chart canvas.", "error");
      return { ok: false, error: "Could not right-click the chart canvas." };
    }

    await sleep(700);
    const tableItem = visibleNodes().find((node) => /^table view$/i.test(textOf(node))) ??
      visibleNodes().find((node) => /table view/i.test(textOf(node)));

    if (!tableItem) {
      setStatus("Context menu opened, but I could not find Table view.", "error");
      return { ok: false, error: "Context menu opened, but I could not find Table view." };
    }

    clickNode(tableItem);
    await sleep(900);
    setStatus("Table view should be open. Now click Download table data.", "ok");
    return { ok: true };
  };

  const downloadTableData = async () => {
    chartInfo();
    const candidates = visibleNodes()
      .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }))
      .filter((item) =>
        item.rect.width > 0 &&
        item.rect.height > 0 &&
        /download|export|save/i.test(item.text)
      )
      .sort((a, b) => b.rect.top - a.rect.top || b.rect.left - a.rect.left);

    const target = candidates.find((item) => /download data|download|export csv|csv/i.test(item.text)) ??
      clickables()
        .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }))
        .find((item) => /download|export|csv/i.test(item.text));

    if (!target) {
      setStatus("Could not find a download button in Table view.", "error");
      return { ok: false, error: "Could not find a download button in Table view." };
    }

    clickNode(target.node);
    await sleep(1200);
    setStatus("Clicked Table view download. Check Chrome downloads for the CSV.", "ok");
    return { ok: true };
  };

  const batchCurrentSymbolTimeframes = async () => {
    if (state.batchRunning) {
      setStatus("Batch already running.", "error");
      return;
    }

    state.batchRunning = true;
    const started = chartInfo();
    setStatus(`Starting Table view batch for ${started.symbol || "current symbol"}...`, "info");

    try {
      for (const timeframe of TIMEFRAMES) {
        setStatus(`Batch: switching to ${timeframe.label}...`, "info");
        const selected = await selectTimeframe(timeframe);
        if (!selected.ok) {
          setStatus(`Batch stopped: ${selected.error}`, "error");
          break;
        }

        const opened = await openTableView();
        if (!opened?.ok) {
          setStatus(`Batch stopped on ${timeframe.label}: ${opened?.error ?? "Table view failed."}`, "error");
          break;
        }

        const downloaded = await downloadTableData();
        if (!downloaded?.ok) {
          setStatus(`Batch stopped on ${timeframe.label}: ${downloaded?.error ?? "Download failed."}`, "error");
          break;
        }

        await backToChart();
        await sleep(1500);
      }
      setStatus("Batch finished or stopped. Check Chrome downloads.", "ok");
    } finally {
      state.batchRunning = false;
    }
  };

  const openChartLayoutMenu = () => {
    const topRightNodes = visibleNodes()
      .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }))
      .filter((item) => {
        if (item.rect.top > 70) return false;
        if (item.rect.left < window.innerWidth * 0.55) return false;
        if (item.rect.right > window.innerWidth - 160) return false;
        if (!item.text || item.text.length > 28) return false;
        return true;
      });

    const layoutName = topRightNodes.find((item) => /^dca$/i.test(item.text)) ??
      topRightNodes.find((item) => /layout|chart layout/i.test(item.text));

    if (!layoutName) return { ok: false, error: "Could not find the top-right chart layout name, such as DCA." };

    const y = layoutName.rect.top + layoutName.rect.height / 2;
    const candidateXs = [
      layoutName.rect.right + 18,
      layoutName.rect.right + 10,
      layoutName.rect.left + layoutName.rect.width / 2
    ];

    for (const x of candidateXs) {
      if (clickAt(x, y)) return { ok: true, method: "layout-name-chevron", text: layoutName.text };
    }

    return { ok: false, error: "Found the chart layout name, but could not click its dropdown." };
  };

  const openExportDialog = async () => {
    chartInfo();
    setStatus("Looking for the chart layout menu...", "info");

    const opened = openChartLayoutMenu();
    if (!opened.ok) {
      setStatus(opened.error, "error");
      return;
    }

    await sleep(600);
    const item = visibleNodes().find((node) => /download chart data|export chart data|export data/i.test(textOf(node)));
    if (!item) {
      setStatus("Menu opened, but I could not find Download chart data.", "error");
      return;
    }

    clickNode(item);
    await sleep(800);
    setStatus("Export dialog should be open. Click modal Download or press it manually.", "ok");
  };

  const clickModalDownload = async () => {
    chartInfo();
    const nodes = visibleNodes().map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }));
    const dialogHint = nodes.find((item) => /download chart data/i.test(item.text));
    let dialogRect = null;

    if (dialogHint) {
      let node = dialogHint.node;
      for (let depth = 0; node && depth < 8; depth += 1) {
        const rect = node.getBoundingClientRect();
        if (
          rect.width >= 260 &&
          rect.height >= 150 &&
          rect.left > window.innerWidth * 0.15 &&
          rect.right < window.innerWidth * 0.85 &&
          rect.top > window.innerHeight * 0.1 &&
          rect.bottom < window.innerHeight * 0.9
        ) {
          dialogRect = rect;
          break;
        }
        node = node.parentElement;
      }
    }

    const downloadButton = clickables()
      .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }))
      .filter((item) => /^download$/i.test(item.text))
      .filter((item) => {
        if (!dialogRect) return true;
        return (
          item.rect.left >= dialogRect.left - 20 &&
          item.rect.right <= dialogRect.right + 20 &&
          item.rect.top >= dialogRect.top - 20 &&
          item.rect.bottom <= dialogRect.bottom + 80
        );
      })
      .sort((a, b) => b.rect.top - a.rect.top || b.rect.left - a.rect.left)[0];

    if (downloadButton) {
      clickNode(downloadButton.node);
      setStatus("Clicked modal Download. Watch Chrome downloads for the CSV.", "ok");
      return;
    }

    if (dialogRect && clickAt(dialogRect.right - 45, dialogRect.bottom - 30)) {
      setStatus("Clicked lower-right area of export dialog. Check if the CSV downloaded.", "ok");
      return;
    }

    setStatus("Could not find the modal Download button.", "error");
  };

  const saveLog = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      currentChart: chartInfo(),
      log: state.log
    };
    sendRuntimeMessage({ type: "ICT_EXPORT_HELPER_DOWNLOAD_LOG", payload }, (response) => {
      if (response?.ok) setStatus("Saved helper log JSON.", "ok");
      else setStatus(`Could not save log: ${response?.error ?? "unknown error"}`, "error");
    });
  };

  panel.addEventListener("click", (event) => {
    const action = event.target?.getAttribute?.("data-action");
    if (!action) return;
    if (action === "collapse") panel.classList.toggle("is-collapsed");
    if (action === "refresh") {
      chartInfo();
      setStatus("Chart info refreshed.", "ok");
    }
    if (action === "open-table") openTableView();
    if (action === "download-table") downloadTableData();
    if (action === "back-chart") backToChart().then(() => setStatus("Returned to chart view if Table view was open.", "ok"));
    if (action === "batch-timeframes") batchCurrentSymbolTimeframes();
    if (action === "open-export") openExportDialog();
    if (action === "click-download") clickModalDownload();
    if (action === "save-log") saveLog();
  });

  loadLogFromStorage((log) => {
    state.log = log;
    chartInfo();
    setStatus("Extension loaded on TradingView.", "ok");
  });
})();
