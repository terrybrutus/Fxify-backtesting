import Map "mo:core/Map";
import List "mo:core/List";

module {
  type AccountSettings = {
    accountSize : Float;
    baseLotSize : Float;
    scaleReference : Float;
  };

  type Timeframe = { #H1; #H4; #Daily };

  type Candle = {
    timestamp : Int;
    open : Float;
    high : Float;
    low : Float;
    close : Float;
    volume : Float;
    timeframe : Timeframe;
  };

  type SundayLevel = {
    id : Nat;
    weekTimestamp : Int;
    price : Float;
    levelLabel : Text;
  };

  type FVGZone = {
    id : Nat;
    timestamp : Int;
    top : Float;
    bottom : Float;
    isBullish : Bool;
  };

  type TradeDirection = { #Long };

  type TradeOutcome = { #Win; #Loss; #Open };

  type ConfluenceScore = {
    total : Nat;
    hasSundayLevel : Bool;
    hasEma200 : Bool;
    hasEma20OrSma50 : Bool;
    hasFVG : Bool;
    maHolds : Bool;
    bullishDailyCandle : Bool;
    targetAbove : Bool;
  };

  type TradeResult = {
    tradeId : Nat;
    entryTimestamp : Int;
    exitTimestamp : ?Int;
    direction : TradeDirection;
    entryPrice : Float;
    stopPrice : Float;
    tp1Price : Float;
    exitPrice : ?Float;
    lotSize : Float;
    pnl : ?Float;
    rMultiple : ?Float;
    confluenceScore : ConfluenceScore;
    outcome : TradeOutcome;
  };

  type BacktestSettings = {
    confluenceThreshold : Nat;
    stopBufferPct : Float;
    tp1MultiplierR : Float;
    minCandlesForMA : Nat;
    accountSize : Float;
  };

  type PerformanceStats = {
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

  type BacktestSession = {
    id : Nat;
    createdAt : Int;
    settings : BacktestSettings;
    stats : PerformanceStats;
    tradeCount : Nat;
    sessionLabel : Text;
  };

  type OldActor = {};

  type NewActor = {
    candlesH1 : List.List<Candle>;
    candlesH4 : List.List<Candle>;
    candlesDaily : List.List<Candle>;
    sundayLevels : List.List<SundayLevel>;
    fvgZones : List.List<FVGZone>;
    backtestSessions : List.List<BacktestSession>;
    tradeResults : Map.Map<Nat, [TradeResult]>;
    accountSettings : { var data : AccountSettings };
    state : { var nextCandleId : Nat; var nextSundayId : Nat; var nextFVGId : Nat; var nextSessionId : Nat; var nextTradeId : Nat };
  };

  public func migration(_ : OldActor) : NewActor {
    {
      candlesH1 = List.empty<Candle>();
      candlesH4 = List.empty<Candle>();
      candlesDaily = List.empty<Candle>();
      sundayLevels = List.empty<SundayLevel>();
      fvgZones = List.empty<FVGZone>();
      backtestSessions = List.empty<BacktestSession>();
      tradeResults = Map.empty<Nat, [TradeResult]>();
      accountSettings = { var data = { accountSize = 15000.0; baseLotSize = 0.11; scaleReference = 15000.0 } };
      state = { var nextCandleId = 0; var nextSundayId = 0; var nextFVGId = 0; var nextSessionId = 0; var nextTradeId = 0 };
    };
  };
};
