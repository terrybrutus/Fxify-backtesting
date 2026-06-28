(() => {
  const PANEL_ID = "ict-tv-brutus-alert-helper";
  const STORAGE_KEY = "ictTvBrutusAlertHelperLog";
  const ALERT_QUEUE_KEY = "ictTvBrutusAlertQueue";

  if (document.getElementById(PANEL_ID)) return;

  const state = {
    alertQueue: [],
    alertQueueIndex: 0,
    lastInfo: null,
    log: []
  };

  const ALERT_SYMBOLS = ["DJ30.R", "USTEC.R", "US500.R", "JPN225.R", "RUS2000.R"];
  const ALERT_TIMEFRAMES = [
    { label: "1m", interval: "1" },
    { label: "3m", interval: "3" },
    { label: "5m", interval: "5" },
    { label: "15m", interval: "15" },
    { label: "30m", interval: "30" },
    { label: "45m", interval: "45" },
    { label: "1H", interval: "60" }
  ];

  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="ict-tv-title">
      <strong>Brutus Alert Helper</strong>
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
      <button type="button" data-action="refresh">Refresh chart info</button>
      <div class="ict-tv-divider"></div>
      <strong class="ict-tv-section">Alert Batch</strong>
      <button type="button" data-action="start-alert-batch">Start alert batch</button>
      <button type="button" data-action="open-alert-dialog">Open alert dialog</button>
      <button type="button" data-action="alert-created-next">Created, go next</button>
      <button type="button" data-action="skip-alert-next">Skip, go next</button>
      <button type="button" data-action="clear-alert-batch">Clear alert batch</button>
      <div class="ict-tv-hint" data-field="alert-hint">Use with Brutus Playbook Alerts on chart.</div>
      <div class="ict-tv-row">
        <span>Progress</span>
        <strong data-field="alert-progress">not started</strong>
      </div>
      <div class="ict-tv-row">
        <span>Target</span>
        <strong data-field="alert-target">none</strong>
      </div>
      <button type="button" data-action="save-log">Save helper log</button>
      <div class="ict-tv-status" data-field="status">Ready.</div>
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

  const sendRuntimeMessage = (message, callback) => {
    if (!extensionApiAvailable()) {
      callback({
        ok: false,
        error: "Extension context was reloaded. Refresh the TradingView tab."
      });
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

  const saveLogToStorage = () => {
    if (!extensionApiAvailable()) return;
    try {
      chrome.storage?.local?.set?.({ [STORAGE_KEY]: state.log.slice(-500) });
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
      node?.innerText,
      node?.textContent,
      node?.getAttribute?.("aria-label"),
      node?.getAttribute?.("title"),
      node?.getAttribute?.("data-name"),
      node?.getAttribute?.("data-symbol")
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  const visibleNodes = () =>
    Array.from(document.querySelectorAll("*")).filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

  const clickables = () =>
    Array.from(
      document.querySelectorAll(
        'button, [role="button"], [data-role="button"], [aria-label], [data-name], [class*="button"]'
      )
    ).filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

  const clickNode = (node) => {
    if (!node) return false;
    node.scrollIntoView?.({ block: "center", inline: "center" });
    node.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    node.click?.();
    return true;
  };

  const visibleSymbolGuess = () => {
    const header = visibleNodes()
      .map((node) => ({ rect: node.getBoundingClientRect(), text: textOf(node) }))
      .filter((item) => item.rect.top < 140 && item.rect.left < window.innerWidth * 0.5)
      .find((item) => /[A-Z0-9]+\.R/.test(item.text));
    return header?.text?.match(/[A-Z0-9]+\.R/)?.[0] ?? "";
  };

  const visibleIntervalGuess = () => {
    const active = visibleNodes()
      .map((node) => ({ rect: node.getBoundingClientRect(), text: textOf(node) }))
      .filter((item) => item.rect.top < 130 && item.rect.left < window.innerWidth * 0.5)
      .find((item) => /\b(1m|3m|5m|15m|30m|45m|1h)\b/i.test(item.text));
    return active?.text?.match(/\b(1m|3m|5m|15m|30m|45m|1h)\b/i)?.[0] ?? "";
  };

  const chartInfo = () => {
    const url = new URL(window.location.href);
    const rawSymbol = decodeURIComponent(url.searchParams.get("symbol") ?? "");
    const info = {
      url: window.location.href,
      symbol: rawSymbol || visibleSymbolGuess(),
      interval: url.searchParams.get("interval") ?? visibleIntervalGuess() ?? "unknown",
      capturedAt: new Date().toISOString()
    };
    state.lastInfo = info;
    panel.querySelector('[data-field="symbol"]').textContent = info.symbol || "unknown";
    panel.querySelector('[data-field="interval"]').textContent = info.interval || "unknown";
    return info;
  };

  const saveAlertQueue = () => {
    const payload = {
      queue: state.alertQueue,
      index: state.alertQueueIndex,
      savedAt: new Date().toISOString()
    };
    try {
      window.localStorage.setItem(ALERT_QUEUE_KEY, JSON.stringify(payload));
    } catch {
      // Keep the in-memory queue if localStorage is unavailable.
    }
  };

  const loadAlertQueue = () => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(ALERT_QUEUE_KEY) ?? "{}");
      state.alertQueue = Array.isArray(parsed.queue) ? parsed.queue : [];
      state.alertQueueIndex = Number.isFinite(parsed.index) ? parsed.index : 0;
    } catch {
      state.alertQueue = [];
      state.alertQueueIndex = 0;
    }
  };

  const currentAlertTarget = () => state.alertQueue[state.alertQueueIndex] ?? null;

  const updateAlertProgress = () => {
    const current = currentAlertTarget();
    panel.querySelector('[data-field="alert-progress"]').textContent = state.alertQueue.length
      ? `${Math.min(state.alertQueueIndex + 1, state.alertQueue.length)} / ${state.alertQueue.length}`
      : "not started";
    panel.querySelector('[data-field="alert-target"]').textContent = current
      ? `${current.symbol} ${current.label}`
      : "none";
    panel.querySelector('[data-field="alert-hint"]').textContent = current
      ? "Set Brutus Playbook Alerts -> Any alert() function call, create the alert, then click Created, go next."
      : "Use with Brutus Playbook Alerts on chart.";
  };

  const chartUrlForAlertTarget = (target) => {
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", `ALCHEMY:${target.symbol}`);
    url.searchParams.set("interval", target.interval);
    return url.toString();
  };

  const navigateToAlertTarget = (target) => {
    if (!target) {
      updateAlertProgress();
      setStatus("Alert batch is finished.", "ok");
      return;
    }
    saveAlertQueue();
    updateAlertProgress();
    setStatus(`Opening ${target.symbol} ${target.label}.`, "info");
    window.location.assign(chartUrlForAlertTarget(target));
  };

  const startAlertBatch = () => {
    state.alertQueue = ALERT_SYMBOLS.flatMap((symbol) =>
      ALERT_TIMEFRAMES.map((timeframe) => ({ symbol, ...timeframe }))
    );
    state.alertQueueIndex = 0;
    state.log.push({
      at: new Date().toISOString(),
      kind: "alert-batch-start",
      total: state.alertQueue.length,
      queue: state.alertQueue
    });
    saveLogToStorage();
    navigateToAlertTarget(currentAlertTarget());
  };

  const clearAlertBatch = () => {
    state.alertQueue = [];
    state.alertQueueIndex = 0;
    try {
      window.localStorage.removeItem(ALERT_QUEUE_KEY);
    } catch {
      // Ignore storage failures.
    }
    updateAlertProgress();
    setStatus("Alert batch cleared.", "ok");
  };

  const advanceAlertBatch = (result) => {
    const completed = currentAlertTarget();
    if (!completed) {
      updateAlertProgress();
      setStatus("No active alert target.", "error");
      return;
    }
    state.log.push({
      at: new Date().toISOString(),
      kind: "alert-batch-step",
      result,
      completed,
      chart: chartInfo()
    });
    state.alertQueueIndex += 1;
    saveLogToStorage();
    if (state.alertQueueIndex >= state.alertQueue.length) {
      saveAlertQueue();
      updateAlertProgress();
      setStatus("Alert batch finished. Verify TradingView Alerts list.", "ok");
      return;
    }
    navigateToAlertTarget(currentAlertTarget());
  };

  const openAlertDialog = async () => {
    chartInfo();
    const candidates = clickables()
      .map((node) => ({ node, rect: node.getBoundingClientRect(), text: textOf(node) }))
      .filter((item) => {
        if (item.rect.top > 150) return false;
        if (!/alert/i.test(item.text)) return false;
        if (/price alerts|technical alerts|alert log/i.test(item.text)) return false;
        return true;
      })
      .sort((a, b) => {
        const aExact = /^alert$/i.test(a.text.trim()) ? 0 : 1;
        const bExact = /^alert$/i.test(b.text.trim()) ? 0 : 1;
        return aExact - bExact || b.rect.left - a.rect.left;
      });

    const target = candidates[0];
    if (!target) {
      setStatus("Could not find TradingView's Alert button. Click Alert manually, then create it.", "error");
      return;
    }

    clickNode(target.node);
    await sleep(900);
    setStatus("Alert dialog should be open. Choose Brutus Playbook Alerts -> Any alert() function call.", "ok");
  };

  const saveLog = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      currentChart: chartInfo(),
      alertQueue: {
        index: state.alertQueueIndex,
        total: state.alertQueue.length,
        current: currentAlertTarget()
      },
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
    if (action === "start-alert-batch") startAlertBatch();
    if (action === "open-alert-dialog") openAlertDialog();
    if (action === "alert-created-next") advanceAlertBatch("created");
    if (action === "skip-alert-next") advanceAlertBatch("skipped");
    if (action === "clear-alert-batch") clearAlertBatch();
    if (action === "save-log") saveLog();
  });

  loadLogFromStorage((log) => {
    state.log = log;
    loadAlertQueue();
    chartInfo();
    updateAlertProgress();
    setStatus("Brutus Alert Helper loaded.", "ok");
  });
})();
