import List "mo:core/List";
import Map "mo:core/Map";
import MixinViews "mo:caffeineai-data-viewer/MixinViews";
import Types "types/ohlc-strategy";
import OhlcStrategyApi "mixins/ohlc-strategy-api";

actor {
  let candlesH1 : List.List<Types.Candle>;
  let candlesH4 : List.List<Types.Candle>;
  let candlesDaily : List.List<Types.Candle>;
  let sundayLevels : List.List<Types.SundayLevel>;
  let fvgZones : List.List<Types.FVGZone>;
  let backtestSessions : List.List<Types.BacktestSession>;
  let tradeResults : Map.Map<Nat, [Types.TradeResult]>;
  let accountSettings : { var data : Types.AccountSettings };
  let state : { var nextCandleId : Nat; var nextSundayId : Nat; var nextFVGId : Nat; var nextSessionId : Nat; var nextTradeId : Nat };

  include OhlcStrategyApi(candlesH1, candlesH4, candlesDaily, sundayLevels, fvgZones, backtestSessions, tradeResults, accountSettings, state);
  include MixinViews();
};
