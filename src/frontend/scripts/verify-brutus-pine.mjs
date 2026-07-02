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
    label: "original upper EMA basis",
    text: "upperBasis = ta.ema(upperSrc, length)",
  },
  {
    label: "original lower EMA basis",
    text: "lowerBasis = ta.ema(lowerSrc, length)",
  },
  {
    label: "original upper standard deviation",
    text: "upperDev = mult * ta.stdev(upperSrc, length)",
  },
  {
    label: "original lower standard deviation",
    text: "lowerDev = mult * ta.stdev(lowerSrc, length)",
  },
  {
    label: "original upper band formula",
    text: "upper = upperBasis + upperDev",
  },
  {
    label: "original lower band formula",
    text: "lower = lowerBasis - lowerDev",
  },
  {
    label: "original upper band plot",
    text: 'plot(upper, "Upper", color=color.gray, linewidth=1)',
  },
  {
    label: "original lower band plot",
    text: 'plot(lower, "Lower", color=color.gray, linewidth=1)',
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
    label: "alert fires on first touch, original triangle, or decision change",
    text: "actionableAlert and actionableAlertAllowed and (firstTouchNewSide or firstTouchDecisionChanged or confirmedCloseEvent)",
  },
  {
    label: "plain alert coverage documentation",
    text: 'Alert coverage: use "Actionable only" for cleaner live testing',
  },
  {
    label: "confirmed close raw signal event",
    text: 'confirmedCloseEvent = signalMode == "Confirmed close" and rawSignal and barstate.isconfirmed',
  },
  {
    label: "first touch sends first live side touch",
    text: "First-touch mode latches the first live intrabar touch",
  },
  {
    label: "long action memory update",
    text: "lastLongAlertAction := liveAction",
  },
  {
    label: "short action memory update",
    text: "lastShortAlertAction := liveAction",
  },
  {
    label: "new side touch event",
    text: 'firstTouchNewSide = signalMode == "First touch" and barstate.isrealtime',
  },
  {
    label: "all alert calls allowed after per-side gating",
    text: "alert(message, alert.freq_once_per_bar)",
  },
  {
    label: "raw parity v21 payload",
    text: '"playbookVersion":"raw-parity-v21"',
  },
  {
    label: "session filter is measured but not a default block",
    text: 'useSessionFilter = input.bool(false, title="Block Outside Active Session")',
  },
  {
    label: "session measurement copy",
    text: "Session is measured in every alert. It is not a default block until evidence proves that gate helps.",
  },
  {
    label: "raw signal JSON field",
    text: '"rawSignal":true',
  },
  {
    label: "RSI default length",
    text: 'rsiLength = input.int(14',
  },
  {
    label: "RSI Bollinger default length",
    text: 'rsiMaLength = input.int(14',
  },
  {
    label: "RSI Bollinger default deviation",
    text: 'rsiBbMult = input.float(2.0',
  },
  {
    label: "volume MA default length",
    text: 'volumeMaLength = input.int(20',
  },
  {
    label: "MA ribbon default type",
    text: 'maRibbonType = input.string("SMA"',
  },
  {
    label: "RSI JSON field",
    text: '"rsi":" + str.tostring(rsiValue)',
  },
  {
    label: "RSI upper band JSON field",
    text: '"rsiUpper":" + str.tostring(rsiUpper)',
  },
  {
    label: "RSI alignment JSON field",
    text: '"rsiAlignedWithTouch":" + str.tostring(rsiAlignedWithTouch)',
  },
  {
    label: "volume ratio JSON field",
    text: '"volumeRatio":" + str.tostring(volumeRatio)',
  },
  {
    label: "volume spike JSON field",
    text: '"volumeSpike":" + str.tostring(volumeSpike)',
  },
  {
    label: "MA ribbon JSON field",
    text: '"ma20":" + str.tostring(ma20)',
  },
  {
    label: "MA trend JSON field",
    text: '"maTrend":"',
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
    text: 'decisionEvent = confirmedCloseEvent ? "confirmed_close" : firstTouchNewSide ? "first_touch" : firstTouchOriginalTriangle ? "original_triangle" : firstTouchDecisionChanged ? "decision_change" : "none"',
  },
  {
    label: "original triangle live event calculation",
    text: 'firstTouchOriginalTriangle = signalMode == "First touch" and barstate.isrealtime and originalTriangleSignal and not alertedOriginalThisBar',
  },
  {
    label: "alert gate includes original triangle event",
    text: "researchAlert = fullEvidenceAlerts and (firstTouchNewSide or firstTouchOriginalTriangle or confirmedCloseEvent)",
  },
  {
    label: "alert coverage input",
    text: 'alertCoverage = input.string("Actionable only", title="Alert Coverage", options=["Actionable only", "Full evidence"])',
  },
  {
    label: "exit alert mode input",
    text: 'exitAlertMode = input.string("Safe one-per-bar", title="Exit Alert Mode", options=["Safe one-per-bar", "Immediate TP/Stop"])',
  },
  {
    label: "decision alert cooldown input",
    text: 'alertCooldownSeconds = input.int(8, minval=0, maxval=300, title="Minimum Seconds Between Decision Alerts")',
  },
  {
    label: "decision alert cooldown gate",
    text: "alertCooldownReady = alertCooldownSeconds == 0 or na(lastDecisionAlertTimeMs) or timenow - lastDecisionAlertTimeMs >= alertCooldownSeconds * 1000",
  },
  {
    label: "decision alert cooldown JSON field",
    text: '"alertCooldownReady":" + str.tostring(alertCooldownReady)',
  },
  {
    label: "decision alert cooldown updates after alert",
    text: "lastDecisionAlertTimeMs := timenow",
  },
  {
    label: "full evidence alert mode",
    text: 'fullEvidenceAlerts = alertCoverage == "Full evidence"',
  },
  {
    label: "alert coverage JSON field",
    text: '"alertCoverage":"',
  },
  {
    label: "original triangle alert latches per bar",
    text: "alertedOriginalThisBar := true",
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
    label: "too early JSON field",
    text: '"tooEarly":" + str.tostring(tooEarly)',
  },
  {
    label: "too late JSON field",
    text: '"tooLate":" + str.tostring(tooLate)',
  },
  {
    label: "too soon after touch JSON field",
    text: '"tooSoonAfterTouch":" + str.tostring(tooSoonAfterTouch)',
  },
  {
    label: "active setup overlap guard",
    text: "overlappingActiveTrade = hasEnter and activeTrade",
  },
  {
    label: "tp1 stale entry guard",
    text: "tp1AlreadyTouched = (longEnter and not na(tp1) and high >= tp1) or (shortEnter and not na(tp1) and low <= tp1)",
  },
  {
    label: "fresh long enter excludes stale TP1",
    text: "freshLongEnter = longEnter and not tp1AlreadyTouched",
  },
  {
    label: "fresh short enter excludes stale TP1",
    text: "freshShortEnter = shortEnter and not tp1AlreadyTouched",
  },
  {
    label: "stale TP1 becomes wait",
    text: 'tp1AlreadyTouched ? "WAIT"',
  },
  {
    label: "overlap turns live enter into wait",
    text: 'liveAction = overlappingActiveTrade ? "WAIT" : action',
  },
  {
    label: "overlap plain instruction",
    text: "Existing setup still active. Do not open a second trade.",
  },
  {
    label: "overlap blocks fresh enter alerts",
    text: "enterAlertAllowed = newEnterPlan and",
  },
  {
    label: "overlap JSON field",
    text: '"overlappingActiveTrade":" + str.tostring(overlappingActiveTrade)',
  },
  {
    label: "stale TP1 JSON field",
    text: '"tp1AlreadyTouched":" + str.tostring(tp1AlreadyTouched)',
  },
  {
    label: "alert uses live action",
    text: 'lastLongAlertAction := liveAction',
  },
  {
    label: "explicit late timing wait reason",
    text: "the candle is already too late for a fresh entry",
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
    text: "the candle is too early for the live-decision window",
  },
  {
    label: "specific wait reason for missing snapback",
    text: "price has not reclaimed the band level yet",
  },
  {
    label: "live entry bar exit detection",
    text: "canResolveLiveEntryBar = activeTrade and barstate.isrealtime and bar_index == activeEntryBar",
  },
  {
    label: "same bar live exit JSON field",
    text: '"sameBarLiveExit":" + str.tostring(sameBarLiveExit)',
  },
  {
    label: "exit alert mode JSON field",
    text: '"exitAlertMode":"',
  },
  {
    label: "safe immediate exit alert cadence",
    text: "alert(exitMessage, alert.freq_once_per_bar)",
  },
  {
    label: "entry alert setup id JSON field",
    text: '"setupId":" + setupIdJson',
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
    label: "review labels default off",
    text: 'showReviewLabels = input.bool(false, title="Show WAIT/SKIP Review Labels")',
  },
  {
    label: "wait labels gated by review labels",
    text: 'plotshape(showReviewLabels and longWatch, title="Long WAIT"',
  },
  {
    label: "skip labels gated by review labels",
    text: 'plotshape(showReviewLabels and skipSignal and direction == "long", title="Long SKIP"',
  },
  {
    label: "strategy discovery matrix section",
    text: "Strategy Discovery Matrix",
  },
  {
    label: "strategy overlap matrix groups real confluence",
    text: "strategyOverlapMatrix",
  },
  {
    label: "strategy overlap includes pierce behavior",
    text: "behaviorBucketForAlert(alert)",
  },
  {
    label: "strategy overlap includes RSI context",
    text: "rsiBucketForAlert(alert)",
  },
  {
    label: "strategy overlap includes volume context",
    text: "volumeBucketForAlert(alert)",
  },
  {
    label: "visible audit panel",
    text: "var table auditPanel = table.new(position.top_right, 1, 9, border_width=1)",
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
    label: "pine script says no named alertconditions",
    text: "This script intentionally does not define named alertconditions.",
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
    label: "same candle decision-change instruction",
    text: "The Playbook script alerts",
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
    label: "capture current Playbook version",
    text: 'const LATEST_PLAYBOOK_VERSION = "raw-parity-v21"',
  },
  {
    label: "capture example includes setup id",
    text: '"setupId":1',
  },
  {
    label: "capture parses setup id",
    text: "setupId: asNumber(item.setupId)",
  },
  {
    label: "capture parses alert coverage",
    text: "alertCoverage: asString(item.alertCoverage)",
  },
  {
    label: "capture parses explicit timing gates",
    text: "tooLate: asBoolean(item.tooLate)",
  },
  {
    label: "capture parses active setup overlap",
    text: "overlappingActiveTrade: asBoolean(item.overlappingActiveTrade)",
  },
  {
    label: "active setup overlap CSV export",
    text: '"overlapping_active_trade"',
  },
  {
    label: "capture parses exit action",
    text: "exitAction: asString(item.exitAction)",
  },
  {
    label: "capture parses exit alert mode",
    text: "exitAlertMode: asString(item.exitAlertMode)",
  },
  {
    label: "capture parses outcome R",
    text: "outcomeR: asNumber(item.outcomeR)",
  },
  {
    label: "setup id CSV export",
    text: '"setup_id"',
  },
  {
    label: "alert coverage CSV export",
    text: '"alert_coverage"',
  },
  {
    label: "too late CSV export",
    text: '"too_late"',
  },
  {
    label: "exit action CSV export",
    text: '"exit_action"',
  },
  {
    label: "exit alert mode CSV export",
    text: '"exit_alert_mode"',
  },
  {
    label: "outcome R CSV export",
    text: '"outcome_r"',
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
    label: "worked paper outcome button",
    text: '"worked"',
  },
  {
    label: "would-have-worked paper outcome button",
    text: '"would_have_worked"',
  },
  {
    label: "avoided-loss paper outcome button",
    text: '"avoided_loss"',
  },
  {
    label: "unclear paper outcome button",
    text: '"unclear"',
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
    label: "capture worked plain definition",
    text: "Worked = the alert did what it was supposed to do.",
  },
  {
    label: "capture failed plain definition",
    text: "Failed = the alert was wrong.",
  },
  {
    label: "capture would-have-worked plain definition",
    text: "Would have worked = WAIT/SKIP missed a good move.",
  },
  {
    label: "capture avoided-loss plain definition",
    text: "Avoided loss = skipping saved you.",
  },
  {
    label: "outcomes grouped by Playbook decision",
    text: "paperOutcomeByDecision",
  },
  {
    label: "outcomes grouped by direction",
    text: "outcomeByDirection",
  },
  {
    label: "outcomes grouped by event type",
    text: "outcomeByEvent",
  },
  {
    label: "WAIT would-have-worked queue",
    text: "WAITs that would have worked",
  },
  {
    label: "SKIP avoided-loss queue",
    text: "SKIPs that avoided losses",
  },
  {
    label: "SKIP missed-trade queue",
    text: "SKIPs that missed good trades",
  },
  {
    label: "WAIT would-have-worked guidance",
    text: "If WAIT would have worked",
  },
  {
    label: "DO NOT HOLD trap filter guidance",
    text: "DO NOT HOLD avoids losses",
  },
  {
    label: "outcome recommendation export",
    text: "outcomeRead,",
  },
  {
    label: "tighten ENTER recommendation",
    text: "tighten ENTER:",
  },
  {
    label: "loosen ENTER recommendation",
    text: "loosen ENTER:",
  },
  {
    label: "keep collecting recommendation",
    text: "keep collecting:",
  },
  {
    label: "rule currently not useful recommendation",
    text: "rule currently not useful:",
  },
  {
    label: "capture page decision-change note",
    text: "Latest Playbook can produce more than one alert",
  },
  {
    label: "capture import usability type",
    text: "type ImportUsabilityVerdict",
  },
  {
    label: "capture exact usable verdict",
    text: '"usable for paper review"',
  },
  {
    label: "capture exact partially usable verdict",
    text: '"partially usable"',
  },
  {
    label: "capture exact not usable verdict",
    text: '"not usable"',
  },
  {
    label: "capture import usability panel",
    text: "Import usability",
  },
  {
    label: "capture import usability reasons",
    text: "importUsabilityReasons",
  },
  {
    label: "capture import verdict avoids profit claim",
    text: "This verdict only judges whether the uploaded alert file is clean",
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
    text: "BUY NOW | Entry",
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
    text: "decisionFrom(item.action) ??",
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
    label: "trade desk explains original triangle event",
    text: "old Brutus triangle appeared",
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
    label: "trade desk says named alert labels are absent",
    text: "intentionally exposes no named ENTER/WAIT/SKIP alertconditions",
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
    label: "trade desk current summary excludes unusable old alerts",
    text: "Usable Playbook alerts only, grouped by symbol, timeframe,",
  },
  {
    label: "trade desk exports grouped alert summary",
    text: "alertSummaryRows,",
  },
  {
    label: "trade desk summary shows event mix",
    text: "Event mix",
  },
  {
    label: "trade desk summary counts original triangle events",
    text: "originalTriangle",
  },
  {
    label: "trade desk summary shows source mix",
    text: "Source mix",
  },
  {
    label: "trade desk summary counts live latch source",
    text: "liveLatchSource",
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
    label: "trade desk worked plain definition",
    text: "Worked = the alert did what it was supposed to do.",
  },
  {
    label: "trade desk failed plain definition",
    text: "Failed = the alert was wrong.",
  },
  {
    label: "trade desk would-have-worked plain definition",
    text: "Would have worked = WAIT/SKIP missed a good move.",
  },
  {
    label: "trade desk avoided-loss plain definition",
    text: "Avoided loss = skipping saved you.",
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
    label: "trade desk would-have-worked wait queue",
    text: "WAIT rows that would have worked",
  },
  {
    label: "trade desk avoided-loss skip queue",
    text: "SKIP rows that avoided losses",
  },
  {
    label: "trade desk missed-good-trade skip queue",
    text: "SKIP rows that missed good trades",
  },
  {
    label: "trade desk unreviewed enter queue",
    text: "Unreviewed ENTER rows",
  },
  {
    label: "trade desk would-have-worked outcome",
    text: "Would have worked",
  },
  {
    label: "trade desk avoided-loss outcome",
    text: "Avoided loss",
  },
  {
    label: "trade desk exports paper outcome read",
    text: "paperOutcomeRead,",
  },
  {
    label: "trade desk warns when alert parameters drift",
    text: "Some usable Playbook alerts failed the locked-parameter check.",
  },
  {
    label: "trade desk detects incomplete latest playbook alerts",
    text: "function missingPlaybookFields(alert: TvAlert)",
  },
  {
    label: "trade desk blocks incomplete usable playbook alerts",
    text: "Some usable Playbook alerts are missing required JSON fields.",
  },
  {
    label: "trade desk accepts compatible locked playbook alerts",
    text: "function isCompatiblePlaybookAlert(alert: TvAlert)",
  },
  {
    label: "trade desk requires locked settings for compatible alerts",
    text: "function hasLockedPlaybookSettings(alert: TvAlert)",
  },
  {
    label: "trade desk requires reviewable payload for compatible alerts",
    text: "function hasReviewablePlaybookPayload(alert: TvAlert)",
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
    text: "NOW. Use the listed entry, stop, and target.",
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
    text: "Paper-review candidate only. Do not treat it as real-money",
  },
  {
    label: "trade desk not trade ready guardrail",
    text: "Not Trade-Ready",
  },
  {
    label: "trade desk denies profit claim",
    text: "This page is an evidence desk, not a profit claim.",
  },
  {
    label: "trade desk explicit tradeability verdict panel",
    text: "Tradeability Verdict",
  },
  {
    label: "trade desk denial matrix panel",
    text: "Why Was This Denied?",
  },
  {
    label: "trade desk denial matrix session gate",
    text: "Denied by session",
  },
  {
    label: "trade desk denial matrix push-through gate",
    text: "Denied by push-through",
  },
  {
    label: "trade desk denial matrix late timing gate",
    text: "Denied by late timing",
  },
  {
    label: "trade desk late reclaim family",
    text: "Late reclaim / chase risk",
  },
  {
    label: "trade desk denial matrix over-filtering read",
    text: "Likely over-filtering",
  },
  {
    label: "trade desk exports denial matrix",
    text: "denialMatrix,",
  },
  {
    label: "trade desk exports denial matrix read",
    text: "denialMatrixRead,",
  },
  {
    label: "trade desk strategy diagnosis matrix panel",
    text: "Strategy Diagnosis Matrix",
  },
  {
    label: "trade desk strategy diagnosis snapback family",
    text: "Snapback reversal",
  },
  {
    label: "trade desk strategy diagnosis continuation family",
    text: "Push-through continuation",
  },
  {
    label: "trade desk strategy diagnosis session review family",
    text: "Session-blocked opportunity",
  },
  {
    label: "trade desk strategy diagnosis exports matrix",
    text: "strategyDiagnosisMatrix,",
  },
  {
    label: "trade desk strategy diagnosis exports read",
    text: "strategyDiagnosisRead,",
  },
  {
    label: "trade desk live rule extractor panel",
    text: "Live Rule Extractor",
  },
  {
    label: "trade desk live rule extractor plain answer",
    text: "liveRuleRead",
  },
  {
    label: "trade desk live rule extractor export",
    text: "liveRuleCards,",
  },
  {
    label: "trade desk identifies reversal candidates",
    text: "Only consider the reversal after price has pierced/touched the band and started reclaiming back toward the band.",
  },
  {
    label: "trade desk identifies continuation trap risk",
    text: "If price is still beyond the push-through line and has not reclaimed, do not fade the move.",
  },
  {
    label: "trade desk exports alert-only evidence",
    text: "disabled={!decisions.length && !latestAlertMatches.length}",
  },
  {
    label: "trade desk strategy diagnosis includes dynamic exits",
    text: "First target is ${midTarget}",
  },
  {
    label: "trade desk tracks RSI clues without forcing RSI",
    text: "function rsiReadForAlert(alert: TvAlert)",
  },
  {
    label: "trade desk exports tradeability verdict",
    text: "tradeabilityVerdict,",
  },
  {
    label: "trade desk not enough evidence verdict",
    text: '"not enough evidence"',
  },
  {
    label: "trade desk paper-review only verdict",
    text: '"paper-review only"',
  },
  {
    label: "trade desk revise rules verdict",
    text: '"revise rules"',
  },
  {
    label: "trade desk cautiously continue collecting verdict",
    text: '"cautiously continue collecting"',
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
    label: "exported Pine named alertconditions",
    text: "alertcondition(",
  },
  {
    label: "old wrong alert type fallback",
    text: "Wrong alert type for evidence loop.",
  },
  {
    label: "old raw-parity-v10 contract",
    text: "raw-parity-v10",
  },
  {
    label: "stale Playbook v10 copy",
    text: "Playbook v10",
  },
  {
    label: "stale v10 script copy",
    text: "v10 script",
  },
  {
    label: "unsafe all-tick exit alert cadence",
    text: "alert.freq_all",
  },
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

const forbidden = forbiddenSnippets.filter((item) => {
  if (
    item.label === "exported Pine named alertconditions" ||
    item.label === "old wrong alert type fallback"
  ) {
    return normalizedSource.includes(item.text);
  }
  const haystacks = [
    normalizedSource,
    normalizedCaptureSource,
    dataUploadSource,
    workspaceHookSource,
  ];
  return haystacks.some((haystack) => haystack.includes(item.text));
});

const orderedSnippets = [
  {
    label: "active setup id is declared before entry payload id",
    before: "varip int activeSetupId = na",
    after: "setupIdJson = hasEnter ? str.tostring(activeSetupId) : \"null\"",
  },
  {
    label: "new entry increments setup id before entry payload id",
    before: "activeSetupId := setupCounter",
    after: "setupIdJson = hasEnter ? str.tostring(activeSetupId) : \"null\"",
  },
  {
    label: "entry payload id is calculated before JSON message",
    before: "setupIdJson = hasEnter ? str.tostring(activeSetupId) : \"null\"",
    after: 'message = "{\\\\"strategy\\\\":\\\\"brutus_playbook_v1\\\\",\\\\"playbookVersion\\\\":\\\\"raw-parity-v21\\\\",\\\\"rawSignal\\\\":true,\\\\"setupId\\\\":" + setupIdJson',
  },
];

const orderFailures = orderedSnippets.filter((item) => {
  const beforeIndex = source.indexOf(item.before);
  const afterIndex = source.indexOf(item.after);
  return beforeIndex === -1 || afterIndex === -1 || beforeIndex >= afterIndex;
});

if (
  missing.length > 0 ||
  missingCapture.length > 0 ||
  missingTradeDesk.length > 0 ||
  missingData.length > 0 ||
  forbidden.length > 0 ||
  orderFailures.length > 0
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
  for (const item of orderFailures) {
    console.error(`- Invalid order: ${item.label}`);
  }
  process.exit(1);
}

console.log(
  `Brutus Pine export verifier passed (${requiredSnippets.length + requiredCaptureSnippets.length + requiredTradeDeskSnippets.length + requiredDataSnippets.length + orderedSnippets.length} invariants).`,
);

