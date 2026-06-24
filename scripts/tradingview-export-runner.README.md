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
4. Confirm that **Manage layouts > Download chart data** works manually once.

Then close the window or leave it open.

## Run The Batch

```powershell
corepack pnpm export:tradingview
```

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

A `manifest.json` is written in the same folder. If an export fails, the manifest tells you which symbol/timeframe failed and why.

## Notes

- TradingView UI changes can break this because the script clicks the same export controls a person clicks.
- If a chart loads slowly, retry with more waiting time:

```powershell
corepack pnpm export:tradingview -- --chart-load-ms=15000 --download-wait-ms=30000
```

- If the script cannot find the export menu, do one manual export in the Chrome window first, then run it again. TradingView sometimes hides menu items until the layout/session is fully initialized.
