import type { ExperimentRow } from "@/pages/ExperimentLabPage";

export type FrozenVariant = {
  id: string;
  variantId: string;
  ruleFamily: string;
  setup: string;
  symbolScope: string;
  sessionScope: string;
  targetModel: string;
  description: string;
  frozenAt: number;
  discoveryEndTimestamp?: number;
  sourceValidationTrades: number;
  sourceValidationTotalR: number;
  sourcePromotionGate: string;
  ruleHash: string;
};

const STORAGE_KEY = "ict-forward-tracker-frozen-v1";

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function ruleHashForRow(row: ExperimentRow) {
  return hashText(
    [
      row.variant.setup,
      row.variant.ruleFamily,
      row.variant.symbolScope,
      row.variant.sessionScope,
      row.variant.targetModel,
      row.variant.description,
    ].join("|"),
  );
}

export function freezeVariant(
  row: ExperimentRow,
  discoveryEndTimestamp?: number,
): FrozenVariant {
  return {
    id: `${row.variant.id}-${Date.now()}`,
    variantId: row.variant.id,
    ruleFamily: row.variant.ruleFamily,
    setup: row.variant.setup,
    symbolScope: row.variant.symbolScope,
    sessionScope: row.variant.sessionScope,
    targetModel: row.variant.targetModel,
    description: row.variant.description,
    frozenAt: Date.now(),
    discoveryEndTimestamp,
    sourceValidationTrades: row.validation.trades,
    sourceValidationTotalR: row.validation.totalR,
    sourcePromotionGate: row.promotionGate,
    ruleHash: ruleHashForRow(row),
  };
}

export function loadFrozenVariants(): FrozenVariant[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is FrozenVariant =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.variantId === "string" &&
        typeof item.frozenAt === "number",
    );
  } catch {
    return [];
  }
}

export function saveFrozenVariants(variants: FrozenVariant[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(variants));
}
