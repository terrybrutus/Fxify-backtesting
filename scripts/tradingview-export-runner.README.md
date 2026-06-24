# TradingView Export Runner

This helper opens a real Chrome window with a persistent TradingView profile and tries to download chart-data CSVs for the Alchemy symbols/timeframes used by the Brutus labs.

It does not bypass TradingView. You still need a logged-in TradingView session and chart-data export access.

## First-Time Setup

```powershell
corepack pnpm export:tradingview -- --setup
```

In the Chrome window that opens:

1. Log into TradingView.
2. Open any Alchemy chart.
3. Add the Brutus indicator/exportable indicator you want included in chart-data exports.
4. Maximize the Chrome window.
5. Zoom the chart out to the amount of history you want included.
6. Confirm that **Manage layouts > Download chart data** works manually once.

Then close the window or leave it open.

## Run The Batch

```powershell
corepack pnpm export:tradingview -- --manual-start
```

Manual-start mode opens the chart first and waits. Use that pause to confirm the chart is zoomed out, then press Enter in the terminal to begin the batch.

After each symbol/timeframe loads, the runner also sends mouse-wheel zoom-out events over the chart before downloading. This matters because TradingView may reset the visible range when the URL changes.

The runner attempts these symbols:

- `DJ30.R`
- `USTEC.R`
- `US500.R`
- `JPN225.R`
- `RUS2000.R`

And these timeframes:

- `1m`
- `3m`
- `5m`
- `15m`
- `30m`
- `45m`
- `1H`

Outputs are saved to:

```text
data/tradingview-exports
```

A `manifest.json` is written in the same folder after each attempted export. CSV files should appear during the run as each export succeeds. If you only see `manifest.json` and no CSV files, the runner is not reaching TradingView's download action.

## Safer / Slower Run

The runner waits 8 seconds between exports by default. If TradingView feels slow or you want the batch to look even less aggressive, run:

```powershell
corepack pnpm export:tradingview -- --manual-start --pause-ms=15000 --chart-load-ms=15000 --download-wait-ms=30000
```

If the exported CSVs still do not include enough history, increase the chart zoom-out pass:

```powershell
corepack pnpm export:tradingview -- --manual-start --pause-ms=15000 --zoom-out-steps=30
```

If it zooms too far or TradingView feels jumpy, reduce it:

```powershell
corepack pnpm export:tradingview -- --manual-start --zoom-out-steps=8
```

## Running From A Mac While Controlling The PC

Run these commands on the Windows PC, not in the Mac terminal. Your MacBook can be the remote-control screen, but the actual terminal should be Windows Terminal, PowerShell, or the Codex terminal on the PC.

Plain version:

1. Open the Windows PC screen from your Mac remote session.
2. Open Codex or Windows Terminal on the PC.
3. Go to the repo folder.
4. Run setup once.
5. Log into TradingView in the opened Chrome window.
6. Run the batch command.

## Notes

- TradingView UI changes can break this because the script clicks the same export controls a person clicks.
- The script opens Chrome large/maximized, but TradingView's actual visible candle range is still controlled by the chart. Use manual-start mode and zoom out before pressing Enter. The runner then performs another automatic zoom-out pass after each chart loads.
- If a chart loads slowly, retry with more waiting time:

```powershell
corepack pnpm export:tradingview -- --manual-start --chart-load-ms=15000 --download-wait-ms=30000
```

- If the script cannot find the export menu, do one manual export in the Chrome window first, then run it again. TradingView sometimes hides menu items until the layout/session is fully initialized.
- If the manifest says `export-ui-not-found`, stop the batch with `Ctrl+C`. That means the script clicked the wrong menu or TradingView changed the menu labels.
