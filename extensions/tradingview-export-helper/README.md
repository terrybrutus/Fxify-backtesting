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

1. Open your saved TradingView Alchemy layout.
2. Click **Start alert batch** in the helper panel.
3. The helper tells you the next target:

   ```text
   DJ30.R, USTEC.R, US500.R, JPN225.R, RUS2000.R
   ```

   across:

   ```text
   1m, 3m, 5m, 15m, 30m, 45m, 1H
   ```

4. Change the symbol/timeframe inside TradingView without refreshing the page.
5. Click **Open alert dialog**.
6. In TradingView, set:

   ```text
   Condition: Brutus Playbook Alerts
   Option: Any alert() function call
   ```

7. Choose your notifications/webhook settings.
8. Click TradingView **Create**.
9. Click **Created, go next** in the helper.

Use **Skip, go next** if you do not want one target. Use **Clear alert batch** to restart.

The helper no longer reloads TradingView or changes the URL. That avoids signing you out of Alchemy or reverting your indicators/layout.

## What Was Removed

The old Table View export, chart-data export, and recorder workflow were removed because they were not reliable enough and no longer match the current Brutus alert process.
