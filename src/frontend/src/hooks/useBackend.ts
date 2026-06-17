import { createActor } from "@/backend";
import type {
  AccountSettings,
  BacktestSession,
  BacktestSettings,
  Candle,
  FVGZone,
  MovingAverages,
  PerformanceStats,
  SundayLevel,
  Timeframe,
  TradeResult,
} from "@/types/strategy";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ─── Query Hooks ──────────────────────────────────────────────────────────────

export function useCandles(timeframe: Timeframe, from?: bigint, to?: bigint) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery<Candle[]>({
    queryKey: ["candles", timeframe, from?.toString(), to?.toString()],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getCandles(timeframe as never, from ?? null, to ?? null) as unknown as Candle[];
    },
    enabled: !!actor && !isFetching,
  });
}

export function useSundayLevels() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery<SundayLevel[]>({
    queryKey: ["sundayLevels"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getSundayLevels();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useFVGZones() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery<FVGZone[]>({
    queryKey: ["fvgZones"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getFVGZones();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useMovingAverages(timeframe: Timeframe) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery<MovingAverages>({
    queryKey: ["movingAverages", timeframe],
    queryFn: async () => {
      if (!actor) return {};
      return actor.getMovingAverages(timeframe as never);
    },
    enabled: !!actor && !isFetching,
  });
}

export function useBacktestSessions() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery<BacktestSession[]>({
    queryKey: ["backtestSessions"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listBacktestSessions();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useBacktestTrades(sessionId: bigint | null) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery<TradeResult[]>({
    queryKey: ["backtestTrades", sessionId?.toString()],
    queryFn: async () => {
      if (!actor || sessionId === null) return [];
      return actor.getBacktestTrades(sessionId);
    },
    enabled: !!actor && !isFetching && sessionId !== null,
  });
}

export function usePerformanceStats(sessionId: bigint | null) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery<PerformanceStats | null>({
    queryKey: ["performanceStats", sessionId?.toString()],
    queryFn: async () => {
      if (!actor || sessionId === null) return null;
      return actor.getPerformanceStats(sessionId);
    },
    enabled: !!actor && !isFetching && sessionId !== null,
  });
}

export function useAccountSettings() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery<AccountSettings>({
    queryKey: ["accountSettings"],
    queryFn: async () => {
      if (!actor)
        return { baseLotSize: 0.11, scaleReference: 15000, accountSize: 15000 };
      return actor.getAccountSettings();
    },
    enabled: !!actor && !isFetching,
  });
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

export function useAddCandles() {
  const { actor } = useActor(createActor);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candles: Candle[]) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.addCandles(candles as never);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candles"] }),
  });
}

export function useAddSundayLevel() {
  const { actor } = useActor(createActor);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      weekTimestamp: bigint;
      price: number;
      levelLabel: string;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.addSundayLevel(
        args.weekTimestamp,
        args.price,
        args.levelLabel,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sundayLevels"] }),
  });
}

export function useDeleteSundayLevel() {
  const { actor } = useActor(createActor);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.deleteSundayLevel(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sundayLevels"] }),
  });
}

export function useAddFVGZone() {
  const { actor } = useActor(createActor);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      timestamp: bigint;
      top: number;
      bottom: number;
      isBullish: boolean;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.addFVGZone(
        args.timestamp,
        args.top,
        args.bottom,
        args.isBullish,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fvgZones"] }),
  });
}

export function useDeleteFVGZone() {
  const { actor } = useActor(createActor);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.deleteFVGZone(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fvgZones"] }),
  });
}

export function useRunBacktest() {
  const { actor } = useActor(createActor);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      settings: BacktestSettings;
      sessionLabel: string;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.runBacktest(args.settings, args.sessionLabel);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backtestSessions"] });
      qc.invalidateQueries({ queryKey: ["performanceStats"] });
    },
  });
}

export function useDeleteBacktestSession() {
  const { actor } = useActor(createActor);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.deleteBacktestSession(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backtestSessions"] });
      qc.invalidateQueries({ queryKey: ["backtestTrades"] });
      qc.invalidateQueries({ queryKey: ["performanceStats"] });
    },
  });
}

export function useSetAccountSettings() {
  const { actor } = useActor(createActor);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      accountSize: number;
      baseLotSize: number;
      scaleReference: number;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.setAccountSettings(
        args.accountSize,
        args.baseLotSize,
        args.scaleReference,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accountSettings"] }),
  });
}
