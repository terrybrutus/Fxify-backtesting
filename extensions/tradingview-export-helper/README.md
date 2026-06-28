# Brutus TradingView Alert Helper

This local unpacked Chrome extension helps set up repeated TradingView alerts for the Brutus Playbook workflow.

It does not bypass TradingView, pull hidden data, avoid paid-plan limits, or place trades. It only opens the same charts and alert dialog you would open manually.

## Install Or Reload

1. Open Chrome.
2. Go to:

   ```text
   chrome://extensions
   ```

3. Turn on **Developer mode**.
4. If already installed, click reload on **Brutus TradingView Alert Helper**.
5. If not installed, click **Load unpacked** and select:

   ```text
   C:\Users\terrb\Documents\Codex\2026-06-16\files-mentioned-by-the-user-ict\Fxify-backtesting\extensions\tradingview-export-helper
   ```

6. Refresh TradingView.

## Use It

Before starting, make sure the latest **Brutus Playbook Alerts** Pine script is saved in TradingView and added to your chart layout.

1. Open any TradingView Alchemy chart.
2. Click **Start alert batch** in the helper panel.
3. The helper opens each target chart:

   ```text
   DJ30.R, USTEC.R, US500.R, JPN225.R, RUS2000.R
   ```

   across:

   ```text
   1m, 3m, 5m, 15m, 30m, 45m, 1H
   ```

4. Click **Open alert dialog**.
5. In TradingView, set:

   ```text
   Condition: Brutus Playbook Alerts
   Option: Any alert() function call
   ```

6. Choose your notifications/webhook settings.
7. Click TradingView **Create**.
8. Click **Created, go next** in the helper.

Use **Skip, go next** if you do not want one target. Use **Clear alert batch** to restart.

## What Was Removed

The old Table View export, chart-data export, and recorder workflow were removed because they were not reliable enough and no longer match the current Brutus alert process.
