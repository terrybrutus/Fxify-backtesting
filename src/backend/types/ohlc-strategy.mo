import Time "mo:core/Time";
import Types "common";

module {
  public type Candle = {
    timestamp : Types.Timestamp;
    open : Types.Price;
    high : Types.Price;
    low : Types.Price;
    close : Types.Price;
    volume : Float;
    timeframe : Types.Timeframe;
  };

  public type SundayLevel = {
    id : Nat;
    weekTimestamp : Types.Timestamp;
    price : Types.Price;
    levelLabel : Text;
  };

  public type FVGZone = {
    id : Nat;
    timestamp : Types.Timestamp;
    top : Types.Price;
    bottom : Types.Price;
    isBullish : Bool;
  };

  public type MovingAverages = {
    ema200 : ?Types.Price;
    ema20 : ?Types.Price;
    sma50 : ?Types.Price;
  };

  public type ConfluenceScore = {
    total : Nat;
    hasSundayLevel : Bool;
    hasEma200 : Bool;
    hasEma20OrSma50 : Bool;
    hasFVG : Bool;
    maHolds : Bool;
    bullishDailyCandle : Bool;
    targetAbove : Bool;
  };

  public type TradeDirection = { #Long };

  public type TradeResult = {
    tradeId : Nat;
    entryTimestamp : Types.Timestamp;
    exitTimestamp : ?Types.Timestamp;
    direction : TradeDirection;
    entryPrice : Types.Price;
    stopPrice : Types.Price;
    tp1Price : Types.Price;
    exitPrice : ?Types.Price;
    lotSize : Float;
    pnl : ?Float;
    rMultiple : ?Float;
    confluenceScore : ConfluenceScore;
    outcome : TradeOutcome;
  };

  public type TradeOutcome = { #Win; #Loss; #Open };

  public type PerformanceStats = {
    totalTrades : Nat;
    wins : Nat;
    losses : Nat;
    openTrades : Nat;
    winRate : Float;
    profitFactor : Float;
    totalPnl : Float;
    maxDrawdown : Float;
    avgRR : Float;
  };

  public type BacktestSettings = {
    confluenceThreshold : Nat;
    stopBufferPct : Float;
    tp1MultiplierR : Float;
    minCandlesForMA : Nat;
    accountSize : Float;
  };

  public type BacktestSession = {
    id : Nat;
    createdAt : Types.Timestamp;
    settings : BacktestSettings;
    stats : PerformanceStats;
    tradeCount : Nat;
    sessionLabel : Text;
  };

  public type AccountSettings = {
    accountSize : Float;
    baseLotSize : Float;
    scaleReference : Float;
  };
};
