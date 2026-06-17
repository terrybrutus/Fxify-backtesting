export type Timestamp = bigint;
export type Price = number;

export enum Timeframe {
  M1 = "1m",
  M5 = "5m",
  M15 = "15m",
  H1 = "1H",
  H4 = "4H",
  Daily = "1D",
  Weekly = "1W",
}

export enum TradeDirection {
  Long = "Long",
  Short = "Short",
}

export enum TradeOutcome {
  Win = "Win",
  Loss = "Loss",
  Open = "Open",
  Skipped = "Skipped",
}

export type DataMode = "none" | "real" | "demo" | "fixture";
export type MarketState =
  | "trending up"
  | "trending down"
  | "ranging"
  | "expanding"
  | "mixed/unclear";

export interface Candle {
  timestamp: Timestamp;
  open: Price;
  high: Price;
  low: Price;
  close: Price;
  volume: number;
  symbol: string;
  timeframe: Timeframe;
  timezone: string;
  source: string;
}

export interface DataIntegrityReport {
  mode: DataMode;
  source: string;
  symbols: string[];
  timeframes: Timeframe[];
  candleCount: number;
  start?: number;
  end?: number;
  missingCandles: number;
  duplicateCandles: number;
  invalidRows: number;
  timezone: string;
  hasRequiredTimeframes: boolean;
  requiredFieldsPresent: boolean;
  canRunBacktest: boolean;
  blockers: string[];
  warnings: string[];
}

export interface MovingAverages {
  ema200?: Price;
  ema20?: Price;
  sma50?: Price;
  rsi14?: number;
  atr14?: number;
}

export interface SundayLevel {
  id: bigint;
  weekTimestamp: Timestamp;
  price: Price;
  levelLabel: string;
  symbol?: string;
  fridayClose?: Price;
  sundayOpen?: Price;
  sundayHigh?: Price;
  sundayLow?: Price;
  gapMidpoint?: Price;
}

export interface FVGZone {
  id: bigint;
  timestamp: Timestamp;
  top: Price;
  bottom: Price;
  isBullish: boolean;
  symbol?: string;
  timeframe?: Timeframe;
  status?: "fresh" | "partially filled" | "fully filled" | "invalidated";
}

export interface ConfluenceScore {
  total: bigint;
  bullishDailyCandle: boolean;
  hasSundayLevel: boolean;
  hasEma200: boolean;
  hasEma20OrSma50: boolean;
  hasFVG: boolean;
  maHolds: boolean;
  targetAbove: boolean;
  rangeBlocked?: boolean;
  propRulesSafe?: boolean;
}

export interface AuditFactor {
  label: string;
  passed: boolean;
  detail: string;
}

export interface SignalAudit {
  id: string;
  timestamp: number;
  availableAt: number;
  symbol: string;
  timeframe: Timeframe;
  setupType:
    | "HTF Bullish Continuation"
    | "Old Sunday Reaction"
    | "200 EMA Reaction"
    | "15m 20 EMA Scalp"
    | "FVG Fill Continuation"
    | "Bearish Continuation"
    | "Countertrend Scalp";
  direction: TradeDirection;
  accepted: boolean;
  marketState: MarketState;
  score: number;
  reasons: AuditFactor[];
  blockers: AuditFactor[];
  warnings: string[];
  entry: Price;
  stop: Price;
  tp1: Price;
  rMultipleToTp1: number;
  dataSource: string;
  ruleEngineVersion: string;
  explanation: string;
}

export interface MarketStructureSnapshot {
  symbol: string;
  timestamp: number;
  previousDayHigh?: Price;
  previousDayLow?: Price;
  currentWeekHigh?: Price;
  currentWeekLow?: Price;
  nearestOldSundayAbove?: Price;
  nearestOldSundayBelow?: Price;
  nearestBullishFvgFill?: Price;
  nearestBearishFvgFill?: Price;
  targetModel?: string;
  stopModel?: string;
}

export interface TradeResult {
  tradeId: bigint;
  entryTimestamp: Timestamp;
  exitTimestamp?: Timestamp;
  direction: TradeDirection;
  entryPrice: Price;
  stopPrice: Price;
  tp1Price: Price;
  exitPrice?: Price;
  lotSize: number;
  pnl?: number;
  rMultiple?: number;
  confluenceScore: ConfluenceScore;
  outcome: TradeOutcome;
  auditId?: string;
}

export interface PerformanceStats {
  totalTrades: bigint;
  wins: bigint;
  losses: bigint;
  openTrades: bigint;
  winRate: number;
  profitFactor: number;
  totalPnl: number;
  maxDrawdown: number;
  avgRR: number;
  expectancy?: number;
}

export interface BacktestSettings {
  confluenceThreshold: bigint;
  stopBufferPct: number;
  tp1MultiplierR: number;
  minCandlesForMA: bigint;
  accountSize: number;
  riskPerTradePct?: number;
  maxDailyLossPct?: number;
  maxDrawdownPct?: number;
  minTp1R?: number;
  maHoldToleranceAtr?: number;
  newsAvoidMinutes?: number;
}

export interface BacktestSession {
  id: bigint;
  createdAt: Timestamp;
  settings: BacktestSettings;
  stats: PerformanceStats;
  tradeCount: bigint;
  sessionLabel: string;
}

export interface AccountSettings {
  accountSize: number;
  baseLotSize: number;
  scaleReference: number;
}

export interface RuleHealthCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface EngineRun {
  integrity: DataIntegrityReport;
  analysisCandleCount: number;
  derivedTimeframes: Timeframe[];
  movingAverages: MovingAverages;
  sundayLevels: SundayLevel[];
  fvgZones: FVGZone[];
  marketStructure: MarketStructureSnapshot[];
  acceptedSignals: SignalAudit[];
  rejectedSignals: SignalAudit[];
  trades: TradeResult[];
  stats: PerformanceStats;
  health: RuleHealthCheck[];
  generatedAt: number;
}
