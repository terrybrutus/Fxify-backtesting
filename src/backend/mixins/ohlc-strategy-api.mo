import List "mo:core/List";
import Map "mo:core/Map";
import Time "mo:core/Time";
import CommonTypes "../types/common";
import Types "../types/ohlc-strategy";
import Lib "../lib/ohlc-strategy";
import Array "mo:core/Array";

mixin (
  candlesH1 : List.List<Types.Candle>,
  candlesH4 : List.List<Types.Candle>,
  candlesDaily : List.List<Types.Candle>,
  sundayLevels : List.List<Types.SundayLevel>,
  fvgZones : List.List<Types.FVGZone>,
  backtestSessions : List.List<Types.BacktestSession>,
  tradeResults : Map.Map<Nat, [Types.TradeResult]>,
  accountSettings : { var data : Types.AccountSettings },
  state : { var nextCandleId : Nat; var nextSundayId : Nat; var nextFVGId : Nat; var nextSessionId : Nat; var nextTradeId : Nat },
) {
  // ---- Helpers ----

  func tfMatch(a : CommonTypes.Timeframe, b : CommonTypes.Timeframe) : Bool {
    switch (a, b) {
      case (#H1,    #H1)    true;
      case (#H4,    #H4)    true;
      case (#Daily, #Daily) true;
      case _                false;
    };
  };

  func candleListFor(tf : CommonTypes.Timeframe) : List.List<Types.Candle> {
    switch tf {
      case (#H1)    candlesH1;
      case (#H4)    candlesH4;
      case (#Daily) candlesDaily;
    };
  };

  // ---- OHLC candle management ----

  public shared func addCandles(newCandles : [Types.Candle]) : async () {
    for (c in newCandles.vals()) {
      candleListFor(c.timeframe).add(c);
    };
  };

  public query func getCandles(
    timeframe : CommonTypes.Timeframe,
    from : ?CommonTypes.Timestamp,
    to   : ?CommonTypes.Timestamp,
  ) : async [Types.Candle] {
    let src = candleListFor(timeframe);
    src.filter(func(c : Types.Candle) : Bool {
      let afterFrom = switch from { case (?f) c.timestamp >= f; case null true };
      let beforeTo  = switch to   { case (?t) c.timestamp <= t; case null true };
      tfMatch(c.timeframe, timeframe) and afterFrom and beforeTo;
    }).toArray();
  };

  public shared func deleteAllCandles(timeframe : CommonTypes.Timeframe) : async () {
    let src = candleListFor(timeframe);
    src.retain(func(_ : Types.Candle) : Bool { false });
  };

  // ---- Sunday levels ----

  public shared func addSundayLevel(
    weekTimestamp : CommonTypes.Timestamp,
    price         : CommonTypes.Price,
    levelLabel    : Text,
  ) : async Nat {
    let id = state.nextSundayId;
    state.nextSundayId += 1;
    sundayLevels.add({ id; weekTimestamp; price; levelLabel });
    id;
  };

  public query func getSundayLevels() : async [Types.SundayLevel] {
    sundayLevels.toArray();
  };

  public shared func deleteSundayLevel(id : Nat) : async () {
    sundayLevels.retain(func(s : Types.SundayLevel) : Bool { s.id != id });
  };

  // ---- 1H FVG zones ----

  public shared func addFVGZone(
    timestamp : CommonTypes.Timestamp,
    top       : CommonTypes.Price,
    bottom    : CommonTypes.Price,
    isBullish : Bool,
  ) : async Nat {
    let id = state.nextFVGId;
    state.nextFVGId += 1;
    fvgZones.add({ id; timestamp; top; bottom; isBullish });
    id;
  };

  public query func getFVGZones() : async [Types.FVGZone] {
    fvgZones.toArray();
  };

  public shared func deleteFVGZone(id : Nat) : async () {
    fvgZones.retain(func(z : Types.FVGZone) : Bool { z.id != id });
  };

  // ---- Moving averages ----

  public query func getMovingAverages(timeframe : CommonTypes.Timeframe) : async Types.MovingAverages {
    Lib.computeMovingAverages(candleListFor(timeframe));
  };

  // ---- Backtest ----

  public shared func runBacktest(
    settings     : Types.BacktestSettings,
    sessionLabel : Text,
  ) : async Types.BacktestSession {
    let trades = Lib.runBacktest(candlesH1, candlesH4, candlesDaily, sundayLevels, fvgZones, settings);
    let stats  = Lib.computeStats(trades);

    let sessionId = state.nextSessionId;
    state.nextSessionId += 1;

    let session : Types.BacktestSession = {
      id           = sessionId;
      createdAt    = Time.now();
      settings;
      stats;
      tradeCount   = trades.size();
      sessionLabel;
    };
    backtestSessions.add(session);

    // Assign trade IDs and store under session
    var tradeIdx = state.nextTradeId;
    let indexed = Array.tabulate(trades.size(), func(i) {
      let t = trades[i];
      let r = { t with tradeId = tradeIdx };
      tradeIdx += 1;
      r;
    });
    state.nextTradeId := tradeIdx;
    tradeResults.add(sessionId, indexed);
    session;
  };

  public query func getBacktestSession(id : Nat) : async ?Types.BacktestSession {
    backtestSessions.find(func(s : Types.BacktestSession) : Bool { s.id == id });
  };

  public query func listBacktestSessions() : async [Types.BacktestSession] {
    backtestSessions.toArray();
  };

  public query func getBacktestTrades(sessionId : Nat) : async [Types.TradeResult] {
    switch (tradeResults.get(sessionId)) {
      case (?ts) ts;
      case null  [];
    };
  };

  public shared func deleteBacktestSession(id : Nat) : async () {
    backtestSessions.retain(func(s : Types.BacktestSession) : Bool { s.id != id });
    tradeResults.remove(id);
  };

  // ---- Performance stats ----

  public query func getPerformanceStats(sessionId : Nat) : async ?Types.PerformanceStats {
    switch (backtestSessions.find(func(s : Types.BacktestSession) : Bool { s.id == sessionId })) {
      case (?s) ?s.stats;
      case null null;
    };
  };

  // ---- Account settings ----

  public shared func setAccountSettings(
    accountSize    : Float,
    baseLotSize    : Float,
    scaleReference : Float,
  ) : async () {
    accountSettings.data := { accountSize; baseLotSize; scaleReference };
  };

  public query func getAccountSettings() : async Types.AccountSettings {
    accountSettings.data;
  };
};
