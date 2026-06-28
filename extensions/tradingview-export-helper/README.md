# ICT TradingView Export Helper

This is a local unpacked Chrome extension for manual-assisted TradingView chart exports and Brutus alert setup.

It does not bypass TradingView, pull hidden market data, avoid paid-plan limits, or place trades. It only adds a small helper panel on TradingView chart pages and tries to click the same chart, export, and alert controls you can click manually.

## Install Like You Are New To Extensions

1. Open Chrome.
2. Go to this address:

   ```text
   chrome://extensions
   ```

3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Pick this folder:

   ```text
   C:\Users\terrb\Documents\Codex\2026-06-16\files-mentioned-by-the-user-ict\Fxify-backtesting\extensions\tradingview-export-helper
   ```

6. Open TradingView and go to one of your Alchemy charts, for example:

   ```text
   https://www.tradingview.com/chart/?symbol=ALCHEMY%3ADJ30.R&interval=15
   ```

7. You should see a small black **ICT Export Helper** panel in the bottom-right corner.

After every extension code update, reload the extension in `chrome://extensions`, then refresh the TradingView chart tab. Chrome can leave an old content script attached to the page until the tab is refreshed.

## How To Use It

Start with one chart only.

1. Open the TradingView chart you want.
2. Make sure your Brutus/export indicator is on the chart.
3. Zoom out manually the way you want.
4. In the helper panel, click **Refresh chart info**.
5. If the helper clicks the wrong TradingView item, click **Start recorder**.
6. Manually do the correct TradingView flow once: right-click the chart, choose **Table view**, then click TradingView's download/table controls.
7. Click **Stop + save recording**. Send that JSON so we can target the real TradingView elements instead of guessing.
8. Only use **Open Table view** or **Batch current symbol TFs** after the recorded flow proves the right target. Batch loops through `1m`, `3m`, `5m`, `15m`, `30m`, `45m`, and `1H` for the current symbol.
9. The older fallback is **Open export dialog**, then **Click modal Download**.
10. Check your Chrome downloads for the CSVs.
11. Click **Save helper log** if something goes wrong and send me that JSON.

## Faster Brutus Alert Setup

Use this after the latest `Brutus Playbook Alerts` Pine script has been saved in TradingView and added to your chart layout.

1. Open a TradingView Alchemy chart.
2. Confirm the chart has **Brutus Playbook Alerts** on it.
3. In the helper panel, click **Start alert batch**.
4. The helper opens each target in this order:

   ```text
   DJ30.R, USTEC.R, US500.R, JPN225.R, RUS2000.R
   ```

   across:

   ```text
   1m, 3m, 5m, 15m, 30m, 45m, 1H
   ```

5. When the chart loads, click **Open alert dialog**.
6. In TradingView's alert dialog, set:

   ```text
   Condition: Brutus Playbook Alerts
   Option: Any alert() function call
   Notifications: whatever you want, including Webhook if you use it
   ```

7. Click TradingView's **Create** button.
8. In the helper panel, click **Created, go next**.
9. Repeat until the batch says finished.

If a symbol/timeframe is wrong or you do not want it, click **Skip, go next**.

This still requires you to confirm each alert because TradingView dialogs change often and blind auto-create would be too easy to get wrong.

## Manual Recorder

The recorder is passive. It does not block clicks, change orders, or send data anywhere. It records your manual clicks, right-clicks, key presses, element text, roles, classes, coordinates, and nearby visible menu rows into the helper log.

Use it when TradingView opens the wrong menu item or the helper cannot find **Table view**. This is the evidence path for revamping the automation safely.

The batch button does not switch symbols yet. Start on the symbol you want, such as `ALCHEMY:DJ30.R`, then run the timeframe batch. If that works reliably, symbol batching can be added next.

If **Open export dialog** fails, make sure the chart layout name, such as `DCA`, is visible in the top-right of TradingView. The helper intentionally avoids clicking broad top-bar buttons because those can open the wrong TradingView menu.

## What This Proves

This first version answers one question:

Can a Chrome extension reliably help open/download the current TradingView chart export from inside the page?

If yes, we can add a careful batch mode later. If no, then TradingView's UI is not stable enough for this path either.

## Risk Boundary

Keep it boring:

- one chart at a time first
- no scraping hidden network APIs
- no fast mass export loops yet
- no bypassing TradingView plan limits

