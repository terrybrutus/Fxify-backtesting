import type { ExperimentRow } from "@/pages/ExperimentLabPage";

export type FrozenVariant = {
  id: string;
  variantId: string;
  sourceType?: "experiment" | "coco-risk-promotion";
  promotionCandidateId?: string;
  ruleFamily: string;
  setup: string;
  symbolScope: string;
  sessionScope: string;
  targetModel: string;
  stopModel?: string;
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
    sourceType: "experiment",
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

export function freezeCocoPromotionCandidate({
  id,
  label,
  rule,
  symbolScope,
  sessionScope,
  sourceValidationTrades,
  sourceValidationTotalR,
  sourcePromotionGate,
  discoveryEndTimestamp,
}: {
  id: string;
  label: string;
  rule: string;
  symbolScope: string;
  sessionScope: string;
  sourceValidationTrades: number;
  sourceValidationTotalR: number;
  sourcePromotionGate: string;
  discoveryEndTimestamp?: number;
}): FrozenVariant {
  const variantId = `coco-risk-${id}`;
  const frozenAt = Date.now();
  const ruleHash = hashText(
    [
      "Coco risk promotion",
      label,
      symbolScope,
      sessionScope,
      "Coco exact weekly low stop",
      "old Sunday level",
      rule,
    ].join("|"),
  );
  return {
    id: `${variantId}-${frozenAt}`,
    variantId,
    sourceType: "coco-risk-promotion",
    promotionCandidateId: id,
    ruleFamily: "Coco risk promotion",
    setup: label,
    symbolScope,
    sessionScope,
    targetModel: "old Sunday level",
    stopModel: "Coco exact weekly low stop",
    description: rule,
    frozenAt,
    discoveryEndTimestamp,
    sourceValidationTrades,
    sourceValidationTotalR,
    sourcePromotionGate,
    ruleHash,
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
