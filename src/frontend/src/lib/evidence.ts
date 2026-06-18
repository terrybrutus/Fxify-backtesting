export type EvidenceStatus =
  | "No evidence"
  | "Discovery only"
  | "Needs sample"
  | "Forward-test candidate"
  | "Avoid candidate";

export type EvidenceRating = {
  status: EvidenceStatus;
  detail: string;
};

export function classifyEvidence({
  trades,
  totalR,
  avgR,
  maxDrawdownR,
}: {
  trades: number;
  totalR: number;
  avgR: number;
  maxDrawdownR: number;
}): EvidenceRating {
  if (trades === 0) {
    return {
      status: "No evidence",
      detail: "No closed trades exist for this group.",
    };
  }
  if (trades < 10) {
    return {
      status: "Discovery only",
      detail: "Tiny sample. Use for review, not decisions.",
    };
  }
  if (totalR < 0 || avgR < 0) {
    return {
      status: "Avoid candidate",
      detail: "Negative current sample. Needs stricter filters or rejection.",
    };
  }
  if (trades < 30) {
    return {
      status: "Needs sample",
      detail: "Positive but under-sampled. Keep testing before trusting.",
    };
  }
  if (avgR > 0.15 && maxDrawdownR <= 4) {
    return {
      status: "Forward-test candidate",
      detail: "Enough sample to freeze rules and test unseen signals.",
    };
  }
  return {
    status: "Needs sample",
    detail: "Sample exists, but edge or drawdown quality is not yet strong.",
  };
}
