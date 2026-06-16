import List "mo:core/List";
import CommonTypes "../types/common";
import Types "../types/ohlc-strategy";
import Float "mo:core/Float";
import Array "mo:core/Array";

module {
  // ---- MA computation helpers ----

  // Exponential Moving Average over the last `period` candles (close price).
  // Returns null when there are fewer than `period` candles.
  public func computeEMA(
    candles : List.List<Types.Candle>,
    period : Nat,
  ) : ?CommonTypes.Price {
    let n = candles.size();
    if (n < period or period == 0) return null;

    // seed = SMA of first `period` closes
    var sum : Float = 0.0;
    var i = 0;
    for (c in candles.values()) {
      if (i < period) { sum += c.close; i += 1 };
    };
    let seed = sum / Float.fromInt(period);
    let k = 2.0 / (Float.fromInt(period) + 1.0);

    // walk the rest of the list applying EMA formula
    var ema = seed;
    var idx = 0;
    for (c in candles.values()) {
      if (idx >= period) {
        ema := c.close * k + ema * (1.0 - k);
      };
      idx += 1;
    };
    ?ema;
  };

  // Simple Moving Average of last `period` candles
  public func computeSMA(
    candles : List.List<Types.Candle>,
    period : Nat,
  ) : ?CommonTypes.Price {
    let n = candles.size();
    if (n < period or period == 0) return null;
    var sum : Float = 0.0;
    var counted = 0;
    // iterate all; only use the last `period` candles
    let skip = n - period;
    var idx = 0;
    for (c in candles.values()) {
      if (idx >= skip) { sum += c.close; counted += 1 };
      idx += 1;
    };
    ?(sum / Float.fromInt(period));
  };

  // Returns ema200, ema20, sma50 computed on the same candle list
  public func computeMovingAverages(
    candles : List.List<Types.Candle>,
  ) : Types.MovingAverages {
    {
      ema200 = computeEMA(candles, 200);
      ema20  = computeEMA(candles, 20);
      sma50  = computeSMA(candles, 50);
    };
  };

  // ---- Confluence detection ----

  // Proximity tolerance: within 0.5 % of entry price counts as "at level"
  func near(price : Float, ref : Float) : Bool {
    let diff = if (price > ref) { price - ref } else { ref - price };
    diff / ref < 0.005;
  };

  // Previous daily candle is bullish-engulfing when it closed higher than it opened
  // and its body exceeds the prior body size (simple version: close > open)
  func isBullishEngulfing(prev : ?Types.Candle) : Bool {
    switch (prev) {
      case null false;
      case (?c) c.close > c.open;
    };
  };

  public func scoreSetup(
    candle : Types.Candle,
    prevDailyCandle : ?Types.Candle,
    sundays : List.List<Types.SundayLevel>,
    fvgs : List.List<Types.FVGZone>,
    mas : Types.MovingAverages,
    candlesH1 : List.List<Types.Candle>,
  ) : Types.ConfluenceScore {
    let price = candle.close;

    // 1. Bullish daily candle bias
    let bullishDailyCandle = isBullishEngulfing(prevDailyCandle);

    // 2. Sunday level proximity
    let hasSundayLevel = sundays.find(func(s : Types.SundayLevel) : Bool {
      near(price, s.price);
    }) != null;

    // 3. 200 EMA proximity
    let hasEma200 = switch (mas.ema200) {
      case null false;
      case (?e) near(price, e);
    };

    // 4. 20 EMA or 50 SMA proximity
    let hasEma20OrSma50 = switch (mas.ema20, mas.sma50) {
      case (?e20, _) near(price, e20);
      case (_, ?s50) near(price, s50);
      case (null, null) false;
    };

    // 5. 1H FVG: candle close is inside an active bullish FVG
    let hasFVG = fvgs.find(func(z : Types.FVGZone) : Bool {
      z.isBullish and price >= z.bottom and price <= z.top;
    }) != null;

    // 6. MA holds: close is above all available MAs
    let maHolds = (switch (mas.ema20)  { case (?e) price >= e; case null true }) and
                  (switch (mas.sma50)  { case (?s) price >= s; case null true }) and
                  (switch (mas.ema200) { case (?e) price >= e; case null true });

    // 7. Target (buy-side liquidity) exists above entry on 1H candles
    let targetAbove = candlesH1.find(func(c : Types.Candle) : Bool {
      c.high > price and c.timestamp > candle.timestamp;
    }) != null;

    // Score = count of true flags
    var total : Nat = 0;
    if (bullishDailyCandle)  total += 1;
    if (hasSundayLevel)      total += 1;
    if (hasEma200)           total += 1;
    if (hasEma20OrSma50)     total += 1;
    if (hasFVG)              total += 1;
    if (maHolds)             total += 1;
    if (targetAbove)         total += 1;

    { total; hasSundayLevel; hasEma200; hasEma20OrSma50; hasFVG; maHolds; bullishDailyCandle; targetAbove };
  };

  // ---- Backtest engine ----

  // Invalidation: candle closes below 20 EMA, 200 EMA, or the nearest Sunday level
  func isInvalidated(
    candle : Types.Candle,
    mas : Types.MovingAverages,
    sundays : List.List<Types.SundayLevel>,
  ) : Bool {
    let price = candle.close;
    let belowEma20  = switch (mas.ema20)  { case (?e) price < e; case null false };
    let belowEma200 = switch (mas.ema200) { case (?e) price < e; case null false };
    if (belowEma20 or belowEma200) return true;
    // below nearest Sunday level
    let nearest = sundays.foldLeft<?(Types.SundayLevel), Types.SundayLevel>(null, func(acc, s) {
      switch acc {
        case null ?(s);
        case (?best) {
          let dNew  = if (s.price    > price) { s.price    - price } else { price - s.price };
          let dBest = if (best.price > price) { best.price - price } else { price - best.price };
          if (dNew < dBest) ?(s) else acc;
        };
      };
    });
    switch nearest {
      case null false;
      case (?s) price < s.price;
    };
  };

  // Minimum of available MA values (for stop placement)
  func minMA(mas : Types.MovingAverages) : ?Float {
    var m : ?Float = null;
    let update = func(v : ?Float) {
      switch (v, m) {
        case (?vv, null)   { m := ?vv };
        case (?vv, ?mm)    { if (vv < mm) m := ?vv };
        case _ {};
      };
    };
    update(mas.ema20);
    update(mas.sma50);
    update(mas.ema200);
    m;
  };

  public func runBacktest(
    candlesH1 : List.List<Types.Candle>,
    candlesH4 : List.List<Types.Candle>,
    candlesDaily : List.List<Types.Candle>,
    sundays : List.List<Types.SundayLevel>,
    fvgs : List.List<Types.FVGZone>,
    settings : Types.BacktestSettings,
  ) : [Types.TradeResult] {
    ignore candlesH4; // H4 used for trend context — future extension

    let results = List.empty<Types.TradeResult>();
    var tradeCounter : Nat = 0;
    var inTrade = false;
    var addedAtNextSunday = false;
    var activeTrade : ?Types.TradeResult = null;

    // Convert to array so we can index forward candles
    let arr = candlesH1.toArray();
    let total = arr.size();

    var idx = 0;
    label scanLoop while (idx < total) {
      let candle = arr[idx];

      // Build a list of candles up to (and including) this index for MA computation
      let pastList = List.empty<Types.Candle>();
      var k = 0;
      while (k <= idx) { pastList.add(arr[k]); k += 1; };

      if (pastList.size() < settings.minCandlesForMA) { idx += 1; continue scanLoop; };

      let mas = computeMovingAverages(pastList);

      // Get previous daily candle for bias
      let prevDaily : ?Types.Candle = candlesDaily.find(func(c : Types.Candle) : Bool {
        c.timestamp < candle.timestamp;
      });

      // ---- Manage open trade ----
      switch (activeTrade) {
        case (?trade) {
          // Check invalidation
          if (isInvalidated(candle, mas, sundays)) {
            // Close at current price as loss
            let pnl = (candle.close - trade.entryPrice) * trade.lotSize * 100000.0;
            let rRisk = trade.entryPrice - trade.stopPrice;
            let rMult = if (rRisk > 0.0) { (candle.close - trade.entryPrice) / rRisk } else { 0.0 };
            let outcome : Types.TradeOutcome = if (pnl >= 0.0) #Win else #Loss;
            results.add({
              trade with
              exitTimestamp = ?candle.timestamp;
              exitPrice     = ?candle.close;
              pnl           = ?pnl;
              rMultiple     = ?rMult;
              outcome;
            });
            activeTrade := null;
            inTrade := false;
            addedAtNextSunday := false;
            idx += 1;
            continue scanLoop;
          };

          // Check TP1 hit
          if (candle.high >= trade.tp1Price) {
            let exitPx = trade.tp1Price;
            let pnl = (exitPx - trade.entryPrice) * trade.lotSize * 100000.0;
            let rRisk = trade.entryPrice - trade.stopPrice;
            let rMult = if (rRisk > 0.0) { (exitPx - trade.entryPrice) / rRisk } else { 0.0 };
            results.add({
              trade with
              exitTimestamp = ?candle.timestamp;
              exitPrice     = ?exitPx;
              pnl           = ?pnl;
              rMultiple     = ?rMult;
              outcome       = #Win;
            });
            activeTrade := null;
            inTrade := false;
            addedAtNextSunday := false;
            idx += 1;
            continue scanLoop;
          };

          // Check stop hit
          if (candle.low <= trade.stopPrice) {
            let pnl = (trade.stopPrice - trade.entryPrice) * trade.lotSize * 100000.0;
            let rRisk = trade.entryPrice - trade.stopPrice;
            let rMult = if (rRisk > 0.0) { -1.0 } else { 0.0 };
            results.add({
              trade with
              exitTimestamp = ?candle.timestamp;
              exitPrice     = ?trade.stopPrice;
              pnl           = ?pnl;
              rMultiple     = ?rMult;
              outcome       = #Loss;
            });
            activeTrade := null;
            inTrade := false;
            addedAtNextSunday := false;
            idx += 1;
            continue scanLoop;
          };

          // Add at next Sunday level if not yet added and confluence holds
          if (not addedAtNextSunday) {
            let atSunday = sundays.find(func(s : Types.SundayLevel) : Bool {
              near(candle.close, s.price);
            }) != null;
            if (atSunday) {
              let score = scoreSetup(candle, prevDaily, sundays, fvgs, mas, pastList);
              if (score.total >= settings.confluenceThreshold) {
                // Add to existing trade (increase lot — represented by updating lotSize)
                let addLot = calcLotSize(settings.accountSize, {
                  accountSize    = settings.accountSize;
                  baseLotSize    = 0.11;
                  scaleReference = 15000.0;
                });
                activeTrade := ?{ trade with lotSize = trade.lotSize + addLot };
                addedAtNextSunday := true;
              };
            };
          };
        };
        case null {};
      };

      // ---- Look for new entry ----
      if (not inTrade) {
        let score = scoreSetup(candle, prevDaily, sundays, fvgs, mas, pastList);
        if (score.total >= settings.confluenceThreshold) {
          // Confirmation: candle closes bullish or MA holds
          let candleClosesBullish = candle.close > candle.open;
          if (candleClosesBullish or score.maHolds) {
            let entry = candle.close;

            // Stop = min MA - buffer
            let stop = switch (minMA(mas)) {
              case (?m) m * (1.0 - settings.stopBufferPct / 100.0);
              case null entry * 0.99;
            };

            // Build forward candle list for TP1 search
            let forward = List.empty<Types.Candle>();
            var fwdIdx = idx + 1;
            while (fwdIdx < total) { forward.add(arr[fwdIdx]); fwdIdx += 1; };
            let tp1 = findTP1(entry, forward);

            let lot = calcLotSize(settings.accountSize, {
              accountSize    = settings.accountSize;
              baseLotSize    = 0.11;
              scaleReference = 15000.0;
            });

            tradeCounter += 1;
            let newTrade : Types.TradeResult = {
              tradeId          = tradeCounter;
              entryTimestamp   = candle.timestamp;
              exitTimestamp    = null;
              direction        = #Long;
              entryPrice       = entry;
              stopPrice        = stop;
              tp1Price         = tp1;
              exitPrice        = null;
              lotSize          = lot;
              pnl              = null;
              rMultiple        = null;
              confluenceScore  = score;
              outcome          = #Open;
            };
            activeTrade := ?newTrade;
            inTrade     := true;
            addedAtNextSunday := false;
          };
        };
      };

      idx += 1;
    };

    // Any still-open trade at end of data is recorded as Open
    switch (activeTrade) {
      case (?trade) { results.add(trade) };
      case null {};
    };

    results.toArray();
  };

  // ---- Performance stats ----

  public func computeStats(trades : [Types.TradeResult]) : Types.PerformanceStats {
    let n = trades.size();
    if (n == 0) {
      return {
        totalTrades  = 0; wins = 0; losses = 0; openTrades = 0;
        winRate      = 0.0; profitFactor = 0.0; totalPnl = 0.0;
        maxDrawdown  = 0.0; avgRR = 0.0;
      };
    };

    var wins = 0; var losses = 0; var opens = 0;
    var totalPnl : Float = 0.0;
    var grossWin : Float = 0.0;
    var grossLoss : Float = 0.0;
    var sumRR : Float = 0.0;
    var rrCount = 0;
    var peak : Float = 0.0;
    var maxDD : Float = 0.0;
    var runningPnl : Float = 0.0;

    for (t in trades.vals()) {
      switch (t.outcome) {
        case (#Win)  { wins += 1 };
        case (#Loss) { losses += 1 };
        case (#Open) { opens += 1 };
      };
      switch (t.pnl) {
        case (?p) {
          totalPnl   += p;
          runningPnl += p;
          if (p > 0.0) { grossWin  += p }
          else         { grossLoss += (-p) };
          if (runningPnl > peak) { peak := runningPnl };
          let dd = peak - runningPnl;
          if (dd > maxDD) { maxDD := dd };
        };
        case null {};
      };
      switch (t.rMultiple) {
        case (?r) { sumRR += r; rrCount += 1 };
        case null {};
      };
    };

    let winRate = if (wins + losses > 0) {
      Float.fromInt(wins) / Float.fromInt(wins + losses);
    } else 0.0;

    let profitFactor = if (grossLoss > 0.0) {
      grossWin / grossLoss;
    } else if (grossWin > 0.0) 999.0 else 0.0;

    let avgRR = if (rrCount > 0) {
      sumRR / Float.fromInt(rrCount);
    } else 0.0;

    {
      totalTrades  = n;
      wins;
      losses;
      openTrades   = opens;
      winRate;
      profitFactor;
      totalPnl;
      maxDrawdown  = maxDD;
      avgRR;
    };
  };

  // ---- Position sizing ----

  // Linear interpolation between $15k→0.11 and $50k→0.35
  public func calcLotSize(accountSize : Float, accountSettings : Types.AccountSettings) : Float {
    let base   = accountSettings.baseLotSize;    // 0.11 at reference
    let refAcc = accountSettings.scaleReference; // e.g. 15000
    if (refAcc <= 0.0) return base;
    // Linear scale: lot = base * (accountSize / refAcc)
    // Clamped to [0.01, 10.0] for safety
    let scaled = base * (accountSize / refAcc);
    if (scaled < 0.01) 0.01
    else if (scaled > 10.0) 10.0
    else scaled;
  };

  // ---- Nearest TP1 (buy-side liquidity) ----

  // Returns the nearest prior high above entry in the forward candle list.
  // Falls back to entry * 1.01 if no candle is found.
  public func findTP1(
    entryPrice : CommonTypes.Price,
    candlesAbove : List.List<Types.Candle>,
  ) : CommonTypes.Price {
    var nearest : ?Float = null;
    for (c in candlesAbove.values()) {
      if (c.high > entryPrice) {
        switch nearest {
          case null       { nearest := ?c.high };
          case (?best)    { if (c.high < best) nearest := ?c.high };
        };
      };
    };
    switch nearest {
      case (?tp) tp;
      case null  entryPrice * 1.01;
    };
  };
};
