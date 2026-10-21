import { Category, Severity, SEVERITIES } from "../models";

/** Compliance score: Not Applicable is excluded from the denominator. */
export function computeScore(compliant: number, nonCompliant: number) {
  const applicable = compliant + nonCompliant;
  return applicable === 0 ? null : Math.round((compliant / applicable) * 1000) / 10;
}

export function bumpSeverity(s: Severity): Severity {
  const i = SEVERITIES.indexOf(s);
  return SEVERITIES[Math.min(i + 1, SEVERITIES.length - 1)];
}

const DUE_DAYS: Record<Severity, number> = { critical: 1, high: 2, medium: 4, low: 7 };
export function dueDateFor(severity: Severity, from = new Date()) {
  return new Date(from.getTime() + DUE_DAYS[severity] * 86400000);
}

export const REPEAT_WINDOW_DAYS = 60;

export const RECOMMENDATIONS: Record<Category, string> = {
  waste: "Waste: install clearly labelled wet / dry / recyclable segregation bins, add signage and brief housekeeping staff on segregation.",
  water: "Water: inspect taps, pipes and fittings for leakage, schedule a plumbing repair and add a routine leak check to the daily round.",
  energy: "Energy: switch off idle lights and equipment, fit timers or occupancy sensors and replace inefficient fixtures.",
  cleanliness: "Cleanliness: increase cleaning frequency, publish a cleaning roster with a sign-off sheet and add a mid-day spot check.",
  green: "Green practice: replace single-use plastics with reusable alternatives and reinforce green practices with signage and awareness sessions.",
};

// Rule-based estimates of the environmental benefit of resolving an issue (multiplied by a severity factor).
const IMPACT_BASE: Record<Category, { wasteRecycledKg: number; waterSavedL: number; energySavedKwh: number; plasticReducedKg: number }> = {
  waste: { wasteRecycledKg: 12, waterSavedL: 0, energySavedKwh: 0, plasticReducedKg: 1 },
  water: { wasteRecycledKg: 0, waterSavedL: 180, energySavedKwh: 0, plasticReducedKg: 0 },
  energy: { wasteRecycledKg: 0, waterSavedL: 0, energySavedKwh: 9, plasticReducedKg: 0 },
  cleanliness: { wasteRecycledKg: 4, waterSavedL: 0, energySavedKwh: 0, plasticReducedKg: 0 },
  green: { wasteRecycledKg: 2, waterSavedL: 0, energySavedKwh: 1, plasticReducedKg: 3 },
};
const SEV_FACTOR: Record<Severity, number> = { low: 0.5, medium: 1, high: 1.5, critical: 2 };
export function impactFor(category: Category, severity: Severity) {
  const b = IMPACT_BASE[category];
  const f = SEV_FACTOR[severity];
  return {
    wasteRecycledKg: b.wasteRecycledKg * f,
    waterSavedL: b.waterSavedL * f,
    energySavedKwh: b.energySavedKwh * f,
    plasticReducedKg: b.plasticReducedKg * f,
  };
}

export const CATEGORY_LABEL: Record<Category, string> = {
  waste: "Waste management",
  water: "Water management",
  energy: "Energy management",
  cleanliness: "Cleanliness",
  green: "Green practices",
};

export interface RiskFlag {
  type: "LOW_SCORE" | "REPEATED_VIOLATION" | "DECLINING_SCORE";
  level: "medium" | "high";
  message: string;
}

/** Score-based risk rules (repeat detection is added by the caller, per issue). */
export function scoreRisk(score: number, previousScores: number[]): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (score < 60) flags.push({ type: "LOW_SCORE", level: "high", message: `Compliance score ${score}% is below the 60% high-risk threshold` });
  else if (score < 75) flags.push({ type: "LOW_SCORE", level: "medium", message: `Compliance score ${score}% is below the 75% target` });
  // previousScores is newest-first
  const prev = previousScores[0];
  const seq = [score, ...previousScores.slice(0, 2)];
  const threeDown = seq.length === 3 && seq[0] < seq[1] && seq[1] < seq[2];
  if (prev !== undefined && (score <= prev - 10 || threeDown)) {
    flags.push({
      type: "DECLINING_SCORE",
      level: "medium",
      message: threeDown && score > prev - 10 ? `Score has fallen for 3 consecutive inspections (${seq.reverse().join("% → ")}%)` : `Score dropped ${Math.round((prev - score) * 10) / 10} points since the previous inspection (${prev}% → ${score}%)`,
    });
  }
  return flags;
}
