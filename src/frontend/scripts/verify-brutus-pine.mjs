import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, "../src/pages/BrutusTradeDeskPage.tsx");
const capturePath = resolve(here, "../src/pages/TradingViewCapturePage.tsx");
const dataUploadPath = resolve(here, "../src/pages/DataUploadPage.tsx");
const workspaceHookPath = resolve(here, "../src/hooks/useStrategyWorkspace.ts");
const source = readFileSync(sourcePath, "utf8");
const captureSource = readFileSync(capturePath, "utf8");
const dataUploadSource = readFileSync(dataUploadPath, "utf8");
const workspaceHookSource = readFileSync(workspaceHookPath, "utf8");
const normalizedSource = source.replaceAll('\\\\"', '"').replaceAll('\\"', '"');
const normalizedCaptureSource = captureSource
  .replaceAll('\\\\"', '"')
  .replaceAll('\\"', '"');

const requiredSnippets = [
  {
    label: "Pine v6 export",
    text: "return `//@version=6",
  },
  {
    label: "original long triangle condition",
    text: "rawLongCondition = (lowerSrc <= lower and close > open) or (lowerSrc[1] > lower[1] and lowerSrc <= lower)",
  },
  {
    label: "original short triangle condition",
    text: "rawShortCondition = (upperSrc >= upper and close < open) or (upperSrc[1] < upper[1] and upperSrc >= upper)",
  },
  {
    label: "first-touch intrabar latch",
    text: "varip bool rawLongLatched = false",
  },
  {
    label: "locked original length",
    text: "length = 9",
  },
  {
    label: "locked original standard deviation",
    text: "mult = 2.0",
  },
  {
    label: "locked upper source",
    text: "upperSrc = high",
  },
  {
    label: "locked lower source",
    text: "lowerSrc = low",
  },
  {
    label: "per-side alert latch",
    text: "varip bool alertedShortThisBar = false",
  },
  {
    label: "per-side last action memory",
    text: 'varip string lastLongAlertAction = ""',
  },
  {
    label: "decision change alert detection",
    text: "firstTouchDecisionChanged = signalMode == \"First touch\" and barstate.isrealtime",
  },
  {
    label: "alert fires on first touch or decision change",
    text: "firstTouchNewSide or firstTouchDecisionChanged or confirmedCloseEvent",
  },
  {
    label: "plain alert coverage documentation",
    text: "Alert coverage: confirmed-close mode sends one JSON packet for every confirmed raw signal.",
  },
  {
    label: "confirmed close raw signal event",
    text: 'confirmedCloseEvent = signalMode == "Confirmed close" and rawSignal and barstate.isconfirmed',
  },
  {
    label: "first touch sends first live side touch",
    text: "First-touch mode sends a JSON packet on the first live side touch",
  },
  {
    label: "long action memory update",
    text: "lastLongAlertAction := action",
  },
  {
    label: "short action memory update",
    text: "lastShortAlertAction := action",
  },
  {
    label: "new side touch event",
    text: 'firstTouchNewSide = signalMode == "First touch" and barstate.isrealtime',
  },
  {
    label: "all alert calls allowed after per-side gating",
    text: "alert(message, alert.freq_all)",
  },
  {
    label: "raw parity v10 payload",
    text: '"playbookVersion":"raw-parity-v10"',
  },
  {
    label: "raw signal JSON field",
    text: '"rawSignal":true',
  },
  {
    label: "original triangle signal calculation",
    text: "originalTriangleSignal = rawLongCondition or rawShortCondition",
  },
  {
    label: "live latch signal calculation",
    text: "latchedSignal = rawSignal and not originalTriangleSignal",
  },
  {
    label: "original triangle signal JSON field",
    text: '"originalTriangleSignal":" + str.tostring(originalTriangleSignal)',
  },
  {
    label: "live latch signal JSON field",
    text: '"latchedSignal":" + str.tostring(latchedSignal)',
  },
  {
    label: "decision event JSON field",
    text: '"decisionEvent":"',
  },
  {
    label: "previous action JSON field",
    text: '"previousAction":"',
  },
  {
    label: "decision event calculation",
    text: 'decisionEvent = confirmedCloseEvent ? "confirmed_close" : firstTouchNewSide ? "first_touch" : firstTouchDecisionChanged ? "decision_change" : "none"',
  },
  {
    label: "previous action calculation",
    text: 'previousAction = direction == "long" ? lastLongAlertAction : direction == "short" ? lastShortAlertAction : signalConflict ? "both" : ""',
  },
  {
    label: "conflict alerts keep importable side",
    text: 'alertDirection = signalConflict ? (rawLongSignal ? "long" : "short") : direction',
  },
  {
    label: "conflict alerts preserve original signal direction",
    text: '"signalDirection"',
  },
  {
    label: "raw condition JSON fields",
    text: '"rawLongCondition":" + str.tostring(rawLongCondition)',
  },
  {
    label: "new touch JSON fields",
    text: '"newLongTouch":" + str.tostring(newLongTouch)',
  },
  {
    label: "mode ready JSON field",
    text: '"modeReady":" + str.tostring(modeReady)',
  },
  {
    label: "session gate JSON field",
    text: '"inSession":" + str.tostring(inSession)',
  },
  {
    label: "minutes into bar JSON field",
    text: '"minutesIntoBar":" + str.tostring(minutesIntoBar)',
  },
  {
    label: "not too early JSON field",
    text: '"notTooEarly":" + str.tostring(notTooEarly)',
  },
  {
    label: "snapback JSON field",
    text: '"longSnapback":" + str.tostring(longSnapback)',
  },
  {
    label: "short snapback JSON field",
    text: '"shortSnapback":" + str.tostring(shortSnapback)',
  },
  {
    label: "push-through JSON field",
    text: '"longPushThrough":" + str.tostring(longPushThrough)',
  },
  {
    label: "short push-through JSON field",
    text: '"shortPushThrough":" + str.tostring(shortPushThrough)',
  },
  {
    label: "specific wait reason for early live candle",
    text: "it is still too early in the live candle",
  },
  {
    label: "specific wait reason for missing snapback",
    text: "snapback is not clean yet",
  },
  {
    label: "specific skip reason for session gate",
    text: "outside the active session",
  },
  {
    label: "original triangle long marker",
    text: 'plotshape(showOriginalSignals and rawLongCondition, title="Original Triangle Long Match"',
  },
  {
    label: "original triangle short marker",
    text: 'plotshape(showOriginalSignals and rawShortCondition, title="Original Triangle Short Match"',
  },
  {
    label: "live latch marker is separate from original marker",
    text: 'plotshape(showLiveLatchSignals and rawLongSignal and not rawLongCondition, title="Live Latched Long Touch"',
  },
  {
    label: "live latch marker defaults on",
    text: 'showLiveLatchSignals = input.bool(true, title="Show Live First-Touch Latches")',
  },
  {
    label: "visible audit panel",
    text: "var table auditPanel = table.new(position.top_right, 1, 8, border_width=1)",
  },
  {
    label: "audit panel shows confirmation state",
    text: 'confirmText = barstate.isconfirmed ? "confirmed close" : "open candle"',
  },
  {
    label: "audit panel shows mode and confirmation",
    text: 'modeText = mode + " | " + confirmText',
  },
  {
    label: "audit panel shows side and pierce depth",
    text: '"Side " + direction + " | depth "',
  },
  {
    label: "audit panel locked settings warning",
    text: "Locked: length 9, high/low bands, StdDev 2",
  },
  {
    label: "audit panel shows raw signal alert state",
    text: 'rawAuditText = rawSignal ? "Raw " + action + " | alert " + (shouldAlert ? "will fire" : "held") : "No raw Brutus signal now"',
  },
  {
    label: "audit panel renders raw alert state",
    text: "table.cell(auditPanel, 0, 2, rawAuditText",
  },
  {
    label: "audit panel parity instruction",
    text: "Check ORIG markers against old triangles first",
  },
  {
    label: "audit panel open-bar timing warning",
    text: "Open-bar ORIG can change until candle close",
  },
  {
    label: "audit panel paper-only warning",
    text: "Paper evidence only - not live-trade approval",
  },
  {
    label: "alert fire timestamp JSON field",
    text: '"alertTime":" + str.tostring(timenow)',
  },
  {
    label: "touch depth calculation",
    text: "touchDepth = direction == \"long\" ? longTouchDepth : direction == \"short\" ? shortTouchDepth : math.max(longTouchDepth, shortTouchDepth)",
  },
  {
    label: "band width JSON field",
    text: '"bandWidth":" + str.tostring(bandWidth)',
  },
  {
    label: "touch depth ratio JSON field",
    text: '"touchDepthRatio":" + str.tostring(touchDepthRatio)',
  },
  {
    label: "upper source JSON field",
    text: '"upperSource":"high"',
  },
  {
    label: "lower source JSON field",
    text: '"lowerSource":"low"',
  },
  {
    label: "bar timestamp alias JSON field",
    text: '"timestamp":" + str.tostring(time)',
  },
  {
    label: "candleTime alias JSON field",
    text: '"candleTime":" + str.tostring(time)',
  },
  {
    label: "paper-only warning",
    text: "This is a paper-test alert bridge. It does not prove the strategy is live-trade ready by itself.",
  },
  {
    label: "pine script says use one Any alert call",
    text: 'create exactly one alert per symbol/timeframe using "Any alert() function call"',
  },
  {
    label: "pine script warns named alertconditions lack JSON",
    text: "those are only visual fallback labels and will not carry the full JSON audit packet.",
  },
  {
    label: "named alertconditions warn wrong alert type",
    text: "Wrong alert type for evidence loop. Use Any alert() function call for full JSON.",
  },
  {
    label: "original-marker parity warning",
    text: "ORIG markers must match the old Brutus triangles before trusting ENTER, WAIT, SKIP, or DO NOT HOLD labels.",
  },
  {
    label: "open-bar repaint warning",
    text: "Because that formula uses candle color, an open candle can change until it closes.",
  },
  {
    label: "v10 same candle decision-change instruction",
    text: "The v10 script alerts",
  },
];

const missing = requiredSnippets.filter(
  (item) => !normalizedSource.includes(item.text),
);

const requiredCaptureSnippets = [
  {
    label: "visible readiness gates",
    text: "Readiness gates",
  },
  {
    label: "latest Playbook sample gate",
    text: "Latest Playbook sample",
  },
  {
    label: "ENTER sample gate",
    text: "ENTER sample",
  },
  {
    label: "failed ENTER gate",
    text: "ENTER failures controlled",
  },
  {
    label: "exact Brutus settings gate",
    text: "Exact Brutus settings",
  },
  {
    label: "raw signal coverage gate",
    text: "Raw signal coverage",
  },
  {
    label: "alert timing evidence gate",
    text: "Alert timing evidence",
  },
  {
    label: "paper-only readiness status",
    text: "Still paper only: more or cleaner evidence is required.",
  },
  {
    label: "real-money proof denial",
    text: "Clean enough for paper-trade review. Still not real-money proof.",
  },
  {
    label: "readiness exported in paper summary",
    text: "readinessChecks,",
  },
  {
    label: "multi-file TradingView alert upload",
    text: "async function addPayloadFiles(files: FileList | null)",
  },
  {
    label: "latest Playbook import count",
    text: "Latest Playbook {importResult.latestPlaybook}",
  },
  {
    label: "old Playbook import count",
    text: "{importResult.oldPlaybook}",
  },
  {
    label: "settings mismatch import count",
    text: "{importResult.contractIssues}",
  },
  {
    label: "TradingView source row import count",
    text: "Source rows {importResult.sourceRows}",
  },
  {
    label: "TradingView ignored row import count",
    text: "{importResult.ignoredRows}",
  },
  {
    label: "multiple file input",
    text: "multiple",
  },
  {
    label: "paper outcome storage",
    text: "ict.tradingview.paperOutcomes.v1",
  },
  {
    label: "manual paper outcome gate",
    text: "Manual paper outcomes",
  },
  {
    label: "paper outcome CSV export",
    text: "paper_outcome",
  },
  {
    label: "paper outcome JSON export",
    text: "paperOutcome:",
  },
  {
    label: "stable paper outcome key",
    text: "function paperOutcomeKey(alert: TvAlert)",
  },
  {
    label: "event key CSV export",
    text: '"event_key"',
  },
  {
    label: "raw signal CSV export",
    text: '"raw_signal"',
  },
  {
    label: "raw long condition CSV export",
    text: '"raw_long_condition"',
  },
  {
    label: "original triangle signal CSV export",
    text: '"original_triangle_signal"',
  },
  {
    label: "latched signal CSV export",
    text: '"latched_signal"',
  },
  {
    label: "new touch CSV export",
    text: '"new_long_touch"',
  },
  {
    label: "signal conflict CSV export",
    text: '"signal_conflict"',
  },
  {
    label: "pine plain action CSV export",
    text: '"pine_plain_action"',
  },
  {
    label: "pine reason CSV export",
    text: '"pine_reason"',
  },
  {
    label: "review reason CSV export",
    text: '"review_reason"',
  },
  {
    label: "event key JSON export",
    text: "eventKey: paperOutcomeKey(row.alert)",
  },
  {
    label: "paper outcomes use stable key",
    text: "paperOutcomes[paperOutcomeKey(alert)]",
  },
  {
    label: "paper result table column",
    text: "Paper result",
  },
  {
    label: "paid outcome button",
    text: '(["paid", "failed", "missed"] as const)',
  },
  {
    label: "paper outcome scoreboard",
    text: "Paper outcome scoreboard",
  },
  {
    label: "capture paper marking guide",
    text: "How to mark alerts",
  },
  {
    label: "capture paid plain definition",
    text: "Paid = ENTER worked.",
  },
  {
    label: "capture failed plain definition",
    text: "Failed = ENTER failed.",
  },
  {
    label: "capture would-have-paid plain definition",
    text: "Would have paid = skipped move worked.",
  },
  {
    label: "outcomes grouped by Playbook decision",
    text: "paperOutcomeByDecision",
  },
  {
    label: "WAIT would-have-paid guidance",
    text: "If WAIT would have paid",
  },
  {
    label: "DO NOT HOLD trap filter guidance",
    text: "the trap filter is doing useful work",
  },
  {
    label: "outcome recommendation export",
    text: "outcomeRead,",
  },
  {
    label: "tighten ENTER recommendation",
    text: "Tighten ENTER. Marked ENTER rows are failing too often.",
  },
  {
    label: "loosen ENTER recommendation",
    text: "Test a looser ENTER rule. WAIT rows are being marked as would-have-paid opportunities.",
  },
  {
    label: "not enough outcomes recommendation",
    text: "Mark at least 10 latest rows before changing the rule.",
  },
  {
    label: "capture page v10 decision-change note",
    text: "Latest Playbook v10 can produce more than one alert",
  },
  {
    label: "capture detects named alertcondition exports",
    text: "function isNamedAlertConditionExport(text: string)",
  },
  {
    label: "capture explains wrong TradingView alert type",
    text: "This TradingView export came from a named Brutus alertcondition.",
  },
  {
    label: "capture parses decision event",
    text: "decisionEvent: asString(item.decisionEvent)",
  },
  {
    label: "capture parses previous action",
    text: "previousAction: asString(item.previousAction)",
  },
  {
    label: "capture exports decision event",
    text: "decision_event",
  },
  {
    label: "capture exports previous action",
    text: "previous_action",
  },
  {
    label: "capture displays decision event",
    text: "event {alert.decisionEvent.replaceAll",
  },
  {
    label: "capture displays previous action",
    text: "from ${alert.previousAction}",
  },
  {
    label: "plain live touch table label",
    text: "Live touch held L:",
  },
  {
    label: "plain original triangle table label",
    text: "Original triangle now L:",
  },
  {
    label: "plain first touch table label",
    text: "First touch this update L:",
  },
  {
    label: "plain conflict skip table label",
    text: "Both long and short fired. Treat as skip evidence.",
  },
  {
    label: "capture identity includes decision event",
    text: "alert.decisionEvent ?? \"\"",
  },
  {
    label: "capture identity includes previous action",
    text: "alert.previousAction ?? \"\"",
  },
  {
    label: "capture identity includes touch depth ratio",
    text: "alert.touchDepthRatio ?? \"\"",
  },
  {
    label: "capture identity includes execution target",
    text: "alert.target ?? \"\"",
  },
  {
    label: "capture reload preserves saved row identity",
    text: ".map((alert) => normalizePayload(alert))",
  },
  {
    label: "capture preserves saved alert id",
    text: "id: asString(item.id) ?? crypto.randomUUID()",
  },
  {
    label: "capture preserves saved import timestamp",
    text: "importedAt: asNumber(item.importedAt) ?? Date.now()",
  },
  {
    label: "capture summarizes alert event",
    text: "Alert event",
  },
  {
    label: "capture event breakdown",
    text: "topEvents: topBreakdownRows(byEvent)",
  },
  {
    label: "capture example uses current plain action",
    text: "PAPER BUY NOW. Skip if you are late.",
  },
  {
    label: "capture example includes original triangle signal",
    text: '"originalTriangleSignal":true',
  },
  {
    label: "capture table shows original signal source",
    text: "orig formula now",
  },
  {
    label: "capture summarizes alert source counts",
    text: "sourceCounts",
  },
  {
    label: "capture shows live latch count",
    text: "paperSummary.sourceCounts.liveLatch",
  },
];

const missingCapture = requiredCaptureSnippets.filter(
  (item) => !normalizedCaptureSource.includes(item.text),
);

const requiredTradeDeskSnippets = [
  {
    label: "trade desk parses embedded JSON fragments",
    text: "function possibleJsonFragments(value: string)",
  },
  {
    label: "Trade Desk alert source row import count",
    text: "{alertImportResult.sourceRows}",
  },
  {
    label: "Trade Desk alert ignored row import count",
    text: "{alertImportResult.ignoredRows}",
  },
  {
    label: "trade desk tolerant CSV header normalization",
    text: 'cell.trim().toLowerCase().replaceAll(" ", "")',
  },
  {
    label: "trade desk accepts TradingView request body columns",
    text: '"requestbody"',
  },
  {
    label: "trade desk accepts doubled quote CSV JSON",
    text: "fragment.replaceAll('\"\"', '\"')",
  },
  {
    label: "trade desk preserves Pine action",
    text: "action: decisionFrom(item.action)",
  },
  {
    label: "trade desk preserves numeric Pine alert time",
    text: "function alertTimeFrom(item: Record<string, unknown>, fallback?: string)",
  },
  {
    label: "trade desk displays alert fire time",
    text: "fired alert",
  },
  {
    label: "trade desk displays candle bucket time",
    text: "candle {fmtDate(item.alert.candleTime)}",
  },
  {
    label: "trade desk preserves Pine plain action",
    text: "plainAction:",
  },
  {
    label: "trade desk parses raw long signal",
    text: "rawLongSignal:",
  },
  {
    label: "trade desk parses raw short signal",
    text: "rawShortSignal:",
  },
  {
    label: "trade desk parses original long condition",
    text: "rawLongCondition:",
  },
  {
    label: "trade desk parses original short condition",
    text: "rawShortCondition:",
  },
  {
    label: "trade desk parses original triangle signal",
    text: "originalTriangleSignal:",
  },
  {
    label: "trade desk parses live latch signal",
    text: "latchedSignal:",
  },
  {
    label: "trade desk parses first touch long",
    text: "newLongTouch:",
  },
  {
    label: "trade desk parses signal conflict",
    text: "signalConflict:",
  },
  {
    label: "trade desk parses session gate",
    text: "inSession:",
  },
  {
    label: "trade desk parses timing gate",
    text: "notTooEarly:",
  },
  {
    label: "trade desk parses minutes into bar",
    text: "minutesIntoBar: asNumber(item.minutesIntoBar)",
  },
  {
    label: "trade desk parses snapback gates",
    text: "longSnapback:",
  },
  {
    label: "trade desk parses push-through gates",
    text: "longPushThrough:",
  },
  {
    label: "trade desk displays raw gate summary",
    text: "function alertGateSummary(alert: TvAlert)",
  },
  {
    label: "trade desk shows original/live gate summary",
    text: "orig formula now",
  },
  {
    label: "trade desk summarizes alert source counts",
    text: "alertSourceCounts",
  },
  {
    label: "trade desk shows original alert source count",
    text: "ORIG {alertSourceCounts.original}",
  },
  {
    label: "trade desk shows live latch alert source count",
    text: "LIVE LATCH {alertSourceCounts.liveLatch}",
  },
  {
    label: "trade desk exports alert source counts",
    text: "alertSourceCounts,",
  },
  {
    label: "trade desk separates live latch review",
    text: "Review LIVE LATCH rows separately.",
  },
  {
    label: "trade desk compares Pine versus app decision",
    text: "Pine vs app",
  },
  {
    label: "trade desk flags mismatched decisions",
    text: "DIFFERENT",
  },
  {
    label: "trade desk gives next alert review step",
    text: "Next review step",
  },
  {
    label: "trade desk gives plain evidence verdict",
    text: "Plain Verdict:",
  },
  {
    label: "trade desk explains next action plainly",
    text: "Do this next",
  },
  {
    label: "trade desk isolates latest playbook alerts",
    text: "const latestAlertMatches = useMemo(",
  },
  {
    label: "trade desk counts old playbook alerts separately",
    text: "old: alertMatches.filter(",
  },
  {
    label: "trade desk labels current playbook rows",
    text: "Current Playbook",
  },
  {
    label: "trade desk TradingView setup checklist",
    text: "TradingView Setup Checklist",
  },
  {
    label: "trade desk setup path starts with Pine export",
    text: "Setting up TradingView: export the Pine script first.",
  },
  {
    label: "trade desk review path starts with intrabar import",
    text: "evidence: import the Brutus Intrabar JSON,",
  },
  {
    label: "trade desk ORIG parity setup step",
    text: "Grey ORIG markers should line up with the old Brutus triangles.",
  },
  {
    label: "trade desk LIVE latch setup step",
    text: "Keep LIVE markers on to catch open-candle first touches.",
  },
  {
    label: "trade desk Any alert setup step",
    text: "Choose Any alert() function call so the JSON payload is captured.",
  },
  {
    label: "trade desk warns not to choose named conditions",
    text: "Do not choose the named ENTER/WAIT/SKIP conditions.",
  },
  {
    label: "trade desk says named alert labels lack full JSON",
    text: "full JSON packet.",
  },
  {
    label: "trade desk import logs setup step",
    text: "Bring the TradingView alert CSV back here and mark paper outcomes.",
  },
  {
    label: "trade desk summarizes alerts by symbol timeframe action",
    text: "Current Alert Summary",
  },
  {
    label: "trade desk current summary excludes old alerts",
    text: "Current Playbook alerts only, grouped by symbol, timeframe,",
  },
  {
    label: "trade desk exports grouped alert summary",
    text: "alertSummaryRows,",
  },
  {
    label: "trade desk paper outcome storage",
    text: "ict.brutus.trade-desk.paperOutcomes.v1",
  },
  {
    label: "trade desk paper outcome key",
    text: "function paperOutcomeKey(alert: TvAlert)",
  },
  {
    label: "trade desk paper outcome scoreboard",
    text: "Paper outcome scoreboard",
  },
  {
    label: "trade desk paper marking guide",
    text: "How to mark rows",
  },
  {
    label: "trade desk paid plain definition",
    text: "Paid = ENTER worked.",
  },
  {
    label: "trade desk failed plain definition",
    text: "Failed = ENTER failed.",
  },
  {
    label: "trade desk would-have-paid plain definition",
    text: "Would have paid = skipped move worked.",
  },
  {
    label: "trade desk paper review queue",
    text: "Paper review queue",
  },
  {
    label: "trade desk failed enter queue",
    text: "Failed ENTER rows",
  },
  {
    label: "trade desk would-have-paid wait queue",
    text: "WAIT rows that would have paid",
  },
  {
    label: "trade desk unreviewed enter queue",
    text: "Unreviewed ENTER rows",
  },
  {
    label: "trade desk would-have-paid outcome",
    text: "Would have paid",
  },
  {
    label: "trade desk exports paper outcome read",
    text: "paperOutcomeRead,",
  },
  {
    label: "trade desk warns when alert parameters drift",
    text: "Some current Playbook alerts failed the locked-parameter check.",
  },
  {
    label: "trade desk detects incomplete latest playbook alerts",
    text: "function missingPlaybookFields(alert: TvAlert)",
  },
  {
    label: "trade desk blocks incomplete latest playbook alerts",
    text: "Some current Playbook alerts are missing required JSON fields.",
  },
  {
    label: "trade desk shows incomplete import count",
    text: "Incomplete: {alertImportResult.incomplete}",
  },
  {
    label: "trade desk shows incomplete live badge",
    text: "INCOMPLETE {alertVersionCounts.incomplete}",
  },
  {
    label: "trade desk prioritizes decision disagreements",
    text: "Stop and review DIFFERENT rows first. Pine and the app disagree, so those rows are not tradeable evidence yet.",
  },
  {
    label: "trade desk calls out pine-only rows",
    text: "Review PINE ONLY rows in TradingView.",
  },
  {
    label: "trade desk multi-file alert import",
    text: "multiple",
  },
  {
    label: "trade desk alert import result",
    text: "Alert files:",
  },
  {
    label: "trade desk detects named alertcondition exports",
    text: "function isNamedAlertConditionExport(text: string)",
  },
  {
    label: "trade desk explains wrong TradingView alert type",
    text: "This TradingView export came from a named Brutus alertcondition.",
  },
  {
    label: "trade desk clear stale alerts",
    text: "Clear Alerts",
  },
  {
    label: "trade desk prefers Pine alert price levels",
    text: "item.alert.entry ?? item.decision?.entry",
  },
  {
    label: "trade desk plain paper trade instruction",
    text: "PAPER ${plainTradeWord(touch.direction)} NOW. Skip if you are late.",
  },
  {
    label: "trade desk plain wait instruction",
    text: "NO TRADE YET. Watch only.",
  },
  {
    label: "trade desk plain do not fight instruction",
    text: "NO TRADE. Do not fight this move.",
  },
  {
    label: "trade desk label map explains original triangles",
    text: "Old Brutus triangle match. Use this only to verify parity.",
  },
  {
    label: "trade desk label map explains immediate enter",
    text: "Paper trade candidate. Take it immediately or skip it.",
  },
  {
    label: "trade desk no-report state still allows Pine export",
    text: "You can still export the Pine script from the top of this page",
  },
];

const missingTradeDesk = requiredTradeDeskSnippets.filter(
  (item) => !normalizedSource.includes(item.text),
);

const requiredDataSnippets = [
  {
    label: "data page says Yahoo is manual backup only",
    text: "Yahoo proxy data is now manual backup only",
  },
  {
    label: "data page marks backup button manual only",
    text: "Manual backup only. Never auto-loaded.",
  },
  {
    label: "data page backup load failure is not called auto-load",
    text: "Yahoo backup load failed. No backup data was imported.",
  },
  {
    label: "workspace clears bundled Yahoo proxy saved state",
    text: "isBundledProxyWorkspace(indexedWorkspace)",
  },
  {
    label: "workspace removes legacy bundled Yahoo proxy saved state",
    text: "isBundledProxyWorkspace(legacyWorkspace)",
  },
];

const missingData = requiredDataSnippets.filter((item) => {
  const haystack = item.label.startsWith("workspace")
    ? workspaceHookSource
    : dataUploadSource;
  return !haystack.includes(item.text);
});

const forbiddenSnippets = [
  {
    label: "editable upper source input",
    text: "input.source(high",
  },
  {
    label: "editable lower source input",
    text: "input.source(low",
  },
  {
    label: "editable length input",
    text: "input.int(9",
  },
  {
    label: "editable stdDev input",
    text: 'title="StdDev"',
  },
];

const forbidden = forbiddenSnippets.filter((item) =>
  normalizedSource.includes(item.text),
);

if (
  missing.length > 0 ||
  missingCapture.length > 0 ||
  missingTradeDesk.length > 0 ||
  missingData.length > 0 ||
  forbidden.length > 0
) {
  console.error("Brutus Pine export verifier failed.");
  for (const item of missing) {
    console.error(`- Missing: ${item.label}`);
  }
  for (const item of missingCapture) {
    console.error(`- Missing capture workflow: ${item.label}`);
  }
  for (const item of missingTradeDesk) {
    console.error(`- Missing trade desk workflow: ${item.label}`);
  }
  for (const item of missingData) {
    console.error(`- Missing data-load guardrail: ${item.label}`);
  }
  for (const item of forbidden) {
    console.error(`- Forbidden: ${item.label}`);
  }
  process.exit(1);
}

console.log(
  `Brutus Pine export verifier passed (${requiredSnippets.length + requiredCaptureSnippets.length + requiredTradeDeskSnippets.length + requiredDataSnippets.length} invariants).`,
);
