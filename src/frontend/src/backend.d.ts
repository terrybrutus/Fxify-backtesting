import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export type Timestamp = bigint;
export interface AccountSettings {
    baseLotSize: number;
    scaleReference: number;
    accountSize: number;
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
export type Price = number;
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
export interface SundayLevel {
    id: bigint;
    levelLabel: string;
    price: Price;
    weekTimestamp: Timestamp;
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
export interface Candle {
    low: Price;
    timeframe: Timeframe;
    high: Price;
    close: Price;
    open: Price;
    volume: number;
    timestamp: Timestamp;
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
export interface FVGZone {
    id: bigint;
    top: Price;
    isBullish: boolean;
    bottom: Price;
    timestamp: Timestamp;
}
export enum Timeframe {
    H1 = "H1",
    H4 = "H4",
    Daily = "Daily"
}
export enum TradeDirection {
    Long = "Long"
}
export enum TradeOutcome {
    Win = "Win",
    Loss = "Loss",
    Open = "Open"
}
export interface backendInterface {
    addCandles(newCandles: Array<Candle>): Promise<void>;
    addFVGZone(timestamp: Timestamp, top: Price, bottom: Price, isBullish: boolean): Promise<bigint>;
    addSundayLevel(weekTimestamp: Timestamp, price: Price, levelLabel: string): Promise<bigint>;
    deleteAllCandles(timeframe: Timeframe): Promise<void>;
    deleteBacktestSession(id: bigint): Promise<void>;
    deleteFVGZone(id: bigint): Promise<void>;
    deleteSundayLevel(id: bigint): Promise<void>;
    getAccountSettings(): Promise<AccountSettings>;
    getBacktestSession(id: bigint): Promise<BacktestSession | null>;
    getBacktestTrades(sessionId: bigint): Promise<Array<TradeResult>>;
    getCandles(timeframe: Timeframe, from: Timestamp | null, to: Timestamp | null): Promise<Array<Candle>>;
    getFVGZones(): Promise<Array<FVGZone>>;
    getMovingAverages(timeframe: Timeframe): Promise<MovingAverages>;
    getPerformanceStats(sessionId: bigint): Promise<PerformanceStats | null>;
    getSundayLevels(): Promise<Array<SundayLevel>>;
    listBacktestSessions(): Promise<Array<BacktestSession>>;
    runBacktest(settings: BacktestSettings, sessionLabel: string): Promise<BacktestSession>;
    setAccountSettings(accountSize: number, baseLotSize: number, scaleReference: number): Promise<void>;
}
