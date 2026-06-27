import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, "../src/pages/BrutusTradeDeskPage.tsx");
const capturePath = resolve(here, "../src/pages/TradingViewCapturePage.tsx");
const source = readFileSync(sourcePath, "utf8");
const captureSource = readFileSync(capturePath, "utf8");
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
    label: "new side touch event",
    text: 'firstTouchNewSide = signalMode == "First touch" and barstate.isrealtime',
  },
  {
    label: "all alert calls allowed after per-side gating",
    text: "alert(message, alert.freq_all)",
  },
  {
    label: "raw parity v7 payload",
    text: '"playbookVersion":"raw-parity-v7"',
  },
  {
    label: "raw signal JSON field",
    text: '"rawSignal":true',
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
    label: "visible audit panel",
    text: "var table auditPanel = table.new(position.top_right, 1, 5, border_width=1)",
  },
  {
    label: "audit panel locked settings warning",
    text: "Locked: length 9, high/low bands, StdDev 2",
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
    label: "original-marker parity warning",
    text: "ORIG markers must match the old Brutus triangles before trusting ENTER, WAIT, SKIP, or DO NOT HOLD labels.",
  },
  {
    label: "open-bar repaint warning",
    text: "Because that formula uses candle color, an open candle can change until it closes.",
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
];

const missingCapture = requiredCaptureSnippets.filter(
  (item) => !normalizedCaptureSource.includes(item.text),
);

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

if (missing.length > 0 || missingCapture.length > 0 || forbidden.length > 0) {
  console.error("Brutus Pine export verifier failed.");
  for (const item of missing) {
    console.error(`- Missing: ${item.label}`);
  }
  for (const item of missingCapture) {
    console.error(`- Missing capture workflow: ${item.label}`);
  }
  for (const item of forbidden) {
    console.error(`- Forbidden: ${item.label}`);
  }
  process.exit(1);
}

console.log(
  `Brutus Pine export verifier passed (${requiredSnippets.length + requiredCaptureSnippets.length} invariants).`,
);
