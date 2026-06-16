# Design Brief

## Direction

Trading Strategy Backtester — Bloomberg Terminal aesthetic with sharp precision for confluence-based long continuation detection and backtest results visualization.

## Tone

Brutalist, command-line trader; zero decoration, maximum data clarity, surgical border treatment.

## Differentiation

Every price level, confluence score, and entry/exit marker rendered in monospace at terminal scale; chart overlays use cyan accents on black for immediate visual scanning.

## Color Palette

| Token          | OKLCH           | Role                                      |
| -------------- | --------------- | ----------------------------------------- |
| background     | 0.11 0 0        | Pure black, chart and main content zones  |
| foreground     | 0.92 0 0        | Bright white, high contrast text          |
| card           | 0.14 0.005 260  | Slightly elevated surface, subtle hue     |
| primary        | 0.75 0.18 190   | Cyan accent, entry markers, confluence    |
| accent         | 0.75 0.18 190   | Same as primary; chart overlay emphasis   |
| destructive    | 0.55 0.22 25    | Red; stop-loss, invalidation, bearish     |
| muted          | 0.18 0.002 260  | Input/secondary surface backgrounds       |
| chart-1        | 0.7 0.22 120    | Green; bullish candles, entry zones       |
| chart-2        | 0.72 0.2 10     | Red; bearish candles, stop zones          |
| chart-3        | 0.65 0.2 190    | Cyan; 200 EMA, key moving average         |
| chart-4        | 0.6 0.18 45     | Amber; Sunday level lines                 |
| chart-5        | 0.68 0.19 160   | Teal; 1H FVG zones                        |

## Typography

- Display: JetBrains Mono — all heading, price level, confluence score labels; monospace terminal authority
- Body: General Sans — secondary labels, descriptions, table rows; clean readability
- Scale: hero `text-xl md:text-2xl font-bold tracking-tightest`, h2 `text-lg font-semibold`, label `text-xs font-bold tracking-wider uppercase`, body `text-sm`

## Elevation & Depth

Sharp, layered planes: chart container sits on pure black, stat cards use dark grey with 1px borders (no shadows), trade log table alternates row backgrounds for rhythm; no blur, no glows.

## Structural Zones

| Zone          | Background      | Border                  | Notes                                    |
| ------------- | --------------- | ----------------------- | ---------------------------------------- |
| Header        | card (0.14)     | 1px border-primary      | App title in monospace, navigation      |
| Chart Area    | background      | sharp 1px border        | Price chart, MA lines, levels, FVGs     |
| Results Panel | background      | 1px border-border       | 4 stat cards (win %, profit factor, etc) |
| Trade Log     | background      | none                    | Table with alternating row backgrounds  |
| Sidebar       | card            | 1px border-border       | Strategy settings, collapsible controls |

## Spacing & Rhythm

Micro-spaced: 4px/8px inner padding on cards, 1rem gaps between major sections, compact table rows (8px padding); zero margin bloat.

## Component Patterns

- Buttons: sharp 1px border, no fill, cyan text on hover, monospace font-mono uppercase labels
- Cards: 1px border-border, 14 background, no radius (0px), stacked semantic zones
- Badges: inline monospace, `text-xs`, cyan text with 1px cyan border, dark muted fill
- Level markers: vertical lines in amber (Sunday), teal (FVG), cyan (200 EMA); 1px stroke

## Motion

- Entrance: none (data loads instantly; no animation distraction)
- Hover: text-primary/opacity shift, 150ms ease-out
- Decorative: none; terminals don't animate

## Constraints

- No rounded corners anywhere (--radius: 0px)
- No gradients, shadows, or blur effects
- All numeric values and levels rendered in monospace (JetBrains Mono)
- Cyan accent used sparingly: entry markers, key levels, active states only
- Red only for destructive/stop-loss states
- Never use opacity for hierarchy; use font weight and size

## Signature Detail

Price level labels at chart edges rendered in `font-mono text-xs font-bold tracking-widest`, creating a data-console aesthetic that echoes professional trading platforms and immediately signals "serious backtesting tool" to traders.
