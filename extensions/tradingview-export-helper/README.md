# ICT TradingView Export Helper

This is a local unpacked Chrome extension for manual-assisted TradingView chart exports.

It does not bypass TradingView, pull hidden market data, or avoid paid-plan limits. It only adds a small helper panel on TradingView chart pages and tries to click the same export controls you can click manually.

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

## How To Use It

Start with one chart only.

1. Open the TradingView chart you want.
2. Make sure your Brutus/export indicator is on the chart.
3. Zoom out manually the way you want.
4. In the helper panel, click **Refresh chart info**.
5. Try **Open Table view** first. This right-clicks the chart and looks for TradingView's **Table view** option.
6. If Table view opens, click **Download table data**.
7. If that path fails, manually right-click a blank area of the chart, choose **Table view**, then click **Download table data** in the helper.
8. The older fallback is **Open export dialog**, then **Click modal Download**.
9. Check your Chrome downloads for the CSV.
10. Click **Save helper log** if something goes wrong and send me that JSON.

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

