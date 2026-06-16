export type Timestamp = bigint;
export type Price = number;

export interface Candle {
  low: Price;
  timeframe: Timeframe;
  high: Price;
  close: Price;
  open: Price;
  volume: number;
  timestamp: Timestamp;
}

export interface SundayLevel {
  id: bigint;
  levelLabel: string;
  price: Price;
  weekTimestamp: Timestamp;
}

export interface FVGZone {
  id: bigint;
  top: Price;
  isBullish: boolean;
  bottom: Price;
  timestamp: Timestamp;
}

export interface MovingAverages {
  ema200?: Price;
  ema20?: Price;
  sma50?: Price;
}

export interface ConfluenceScore {
  total: bigint;
  maHolds: boolean;
  hasEma20OrSma50: boolean;
  hasEma200: boolean;
  targetAbove: boolean;
  hasFVG: boolean;
  hasSundayLevel: boolean;
  bullishDailyCandle: boolean;
}

export interface TradeResult {
  pnl?: number;
  tp1Price: Price;
  direction: TradeDirection;
  entryTimestamp: Timestamp;
  rMultiple?: number;
  tradeId: bigint;
  exitTimestamp?: Timestamp;
  entryPrice: Price;
  confluenceScore: ConfluenceScore;
  exitPrice?: Price;
  stopPrice: Price;
  outcome: TradeOutcome;
  lotSize: number;
}

export interface PerformanceStats {
  totalTrades: bigint;
  avgRR: number;
  wins: bigint;
  losses: bigint;
  totalPnl: number;
  openTrades: bigint;
  winRate: number;
  maxDrawdown: number;
  profitFactor: number;
}

export interface BacktestSettings {
  tp1MultiplierR: number;
  minCandlesForMA: bigint;
  stopBufferPct: number;
  accountSize: number;
  confluenceThreshold: bigint;
}

export interface BacktestSession {
  id: bigint;
  sessionLabel: string;
  tradeCount: bigint;
  createdAt: Timestamp;
  stats: PerformanceStats;
  settings: BacktestSettings;
}

export interface AccountSettings {
  baseLotSize: number;
  scaleReference: number;
  accountSize: number;
}

export enum Timeframe {
  H1 = "H1",
  H4 = "H4",
  Daily = "Daily",
}

export enum TradeDirection {
  Long = "Long",
}

export enum TradeOutcome {
  Win = "Win",
  Loss = "Loss",
  Open = "Open",
}
