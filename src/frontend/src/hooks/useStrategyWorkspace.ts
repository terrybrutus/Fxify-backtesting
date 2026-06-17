import { runEngine } from "@/lib/strategyEngine";
import type { Candle, EngineRun } from "@/types/strategy";
import { useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "ict-ma-strategy-workspace-v1";

type StoredWorkspace = {
  candles: Array<Omit<Candle, "timestamp"> & { timestamp?: string }>;
  invalidRows: number;
  missingColumns: string[];
  importedAt?: number;
};

const emptyWorkspace: StoredWorkspace = {
  candles: [],
  invalidRows: 0,
  missingColumns: [],
};

function emitChange() {
  window.dispatchEvent(new Event("strategy-workspace-change"));
}

function readStored(): StoredWorkspace {
  if (typeof window === "undefined") return emptyWorkspace;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyWorkspace;
  try {
    const parsed = JSON.parse(raw) as StoredWorkspace;
    return {
      ...emptyWorkspace,
      ...parsed,
      candles: Array.isArray(parsed.candles) ? parsed.candles : [],
    };
  } catch {
    return emptyWorkspace;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("strategy-workspace-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("strategy-workspace-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function serializeCandles(candles: Candle[]) {
  return candles.map((candle) => ({
    ...candle,
    timestamp: candle.timestamp.toString(),
  }));
}

function reviveCandles(stored: StoredWorkspace): Candle[] {
  return stored.candles
    .map((candle) => ({
      ...candle,
      timestamp: BigInt(candle.timestamp ?? "0"),
    }))
    .filter((candle) => candle.timestamp > 0n) as Candle[];
}

export function saveWorkspace(
  candles: Candle[],
  invalidRows: number,
  missingColumns: string[],
) {
  const payload = {
    candles: serializeCandles(candles),
    invalidRows,
    missingColumns,
    importedAt: Date.now(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  emitChange();
}

export function clearWorkspace() {
  window.localStorage.removeItem(STORAGE_KEY);
  emitChange();
}

export function useStrategyWorkspace(): {
  candles: Candle[];
  run: EngineRun;
  importedAt?: number;
  invalidRows: number;
  missingColumns: string[];
} {
  const stored = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(readStored()),
    () => JSON.stringify(emptyWorkspace),
  );

  return useMemo(() => {
    const parsed = JSON.parse(stored) as StoredWorkspace;
    const candles = reviveCandles(parsed);
    return {
      candles,
      importedAt: parsed.importedAt,
      invalidRows: parsed.invalidRows ?? 0,
      missingColumns: parsed.missingColumns ?? [],
      run: runEngine(candles, parsed.invalidRows ?? 0, parsed.missingColumns ?? []),
    };
  }, [stored]);
}
