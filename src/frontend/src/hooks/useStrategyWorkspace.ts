import { runEngine } from "@/lib/strategyEngine";
import type { Candle, EngineRun } from "@/types/strategy";
import { useEffect, useState } from "react";

const LEGACY_STORAGE_KEY = "ict-ma-strategy-workspace-v1";
const DB_NAME = "ict-ma-strategy-workspace";
const DB_VERSION = 1;
const STORE_NAME = "workspace";
const WORKSPACE_KEY = "active";
const BUNDLED_PROXY_FILE_NAMES = new Set([
  "yahoo_futures_proxy_latest.csv",
  "yahoo_futures_proxy_master.csv",
]);
const BUNDLED_PROXY_NAME_PATTERN = /yahoo[_-]futures[_-]proxy/i;

type StoredWorkspace = {
  candles: Array<Omit<Candle, "timestamp"> & { timestamp?: string }>;
  invalidRows: number;
  missingColumns: string[];
  importedAt?: number;
  fileName?: string;
};

const emptyWorkspace: StoredWorkspace = {
  candles: [],
  invalidRows: 0,
  missingColumns: [],
};

let currentWorkspace = emptyWorkspace;
let currentCandles: Candle[] = [];
let hasLoaded = false;
let revision = 0;
let cachedEngineKey = "";
let cachedEngineRun: EngineRun | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  revision += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
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

function normalizeWorkspace(value: unknown): StoredWorkspace {
  if (!value || typeof value !== "object") return emptyWorkspace;
  const parsed = value as Partial<StoredWorkspace>;
  return {
    candles: Array.isArray(parsed.candles) ? parsed.candles : [],
    invalidRows: parsed.invalidRows ?? 0,
    missingColumns: Array.isArray(parsed.missingColumns)
      ? parsed.missingColumns
      : [],
    importedAt: parsed.importedAt,
    fileName: parsed.fileName,
  };
}

function isBundledProxyWorkspace(workspace: StoredWorkspace | null) {
  if (!workspace?.fileName) return false;
  return (
    BUNDLED_PROXY_FILE_NAMES.has(workspace.fileName) ||
    BUNDLED_PROXY_NAME_PATTERN.test(workspace.fileName)
  );
}

function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readFromIndexedDb(): Promise<StoredWorkspace | null> {
  const db = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(WORKSPACE_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function writeToIndexedDb(workspace: StoredWorkspace): Promise<void> {
  const db = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(workspace, WORKSPACE_KEY);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function clearIndexedDb(): Promise<void> {
  const db = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(WORKSPACE_KEY);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function readLegacyLocalStorage(): StoredWorkspace | null {
  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalizeWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function loadWorkspace() {
  if (typeof window === "undefined" || hasLoaded) return;
  hasLoaded = true;

  try {
    const indexedWorkspace = await readFromIndexedDb();
    if (indexedWorkspace) {
      if (isBundledProxyWorkspace(indexedWorkspace)) {
        currentWorkspace = emptyWorkspace;
        currentCandles = [];
        await clearIndexedDb();
        emitChange();
        return;
      }
      currentWorkspace = normalizeWorkspace(indexedWorkspace);
      currentCandles = reviveCandles(currentWorkspace);
      emitChange();
      return;
    }

    const legacyWorkspace = readLegacyLocalStorage();
    if (legacyWorkspace && legacyWorkspace.candles.length > 0) {
      if (isBundledProxyWorkspace(legacyWorkspace)) {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        currentWorkspace = emptyWorkspace;
        currentCandles = [];
        emitChange();
        return;
      }
      currentWorkspace = legacyWorkspace;
      currentCandles = reviveCandles(currentWorkspace);
      await writeToIndexedDb(legacyWorkspace);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      emitChange();
      return;
    }
  } catch (error) {
    console.error("Failed to load strategy workspace", error);
  }

  currentWorkspace = emptyWorkspace;
  currentCandles = [];
  emitChange();
}

function getCachedEngineRun(workspace: StoredWorkspace): EngineRun {
  const key = [
    workspace.importedAt ?? 0,
    currentCandles.length,
    workspace.invalidRows ?? 0,
    workspace.missingColumns.join("|"),
  ].join(":");

  if (cachedEngineRun && cachedEngineKey === key) return cachedEngineRun;
  cachedEngineKey = key;
  cachedEngineRun = runEngine(
    currentCandles,
    workspace.invalidRows ?? 0,
    workspace.missingColumns ?? [],
  );
  return cachedEngineRun;
}

export async function saveWorkspace(
  candles: Candle[],
  invalidRows: number,
  missingColumns: string[],
  fileName?: string,
) {
  const payload: StoredWorkspace = {
    candles: serializeCandles(candles),
    invalidRows,
    missingColumns,
    importedAt: Date.now(),
    fileName,
  };

  currentWorkspace = payload;
  currentCandles = candles;
  cachedEngineRun = null;
  emitChange();
  await writeToIndexedDb(payload);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export async function clearWorkspace() {
  currentWorkspace = emptyWorkspace;
  currentCandles = [];
  cachedEngineRun = null;
  emitChange();
  await clearIndexedDb();
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function useStrategyWorkspace(): {
  candles: Candle[];
  run: EngineRun;
  importedAt?: number;
  invalidRows: number;
  missingColumns: string[];
  fileName?: string;
  isLoading: boolean;
} {
  const [, setWorkspaceRevision] = useState(revision);
  const [isLoading, setIsLoading] = useState(!hasLoaded);

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setWorkspaceRevision(revision);
      setIsLoading(false);
    });
    void loadWorkspace().finally(() => setIsLoading(false));
    return unsubscribe;
  }, []);

  return {
    candles: currentCandles,
    importedAt: currentWorkspace.importedAt,
    invalidRows: currentWorkspace.invalidRows ?? 0,
    missingColumns: currentWorkspace.missingColumns ?? [],
    fileName: currentWorkspace.fileName,
    isLoading,
    run: getCachedEngineRun(currentWorkspace),
  };
}
