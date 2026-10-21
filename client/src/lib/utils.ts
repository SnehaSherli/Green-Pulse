export const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const today = () => new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

/** GOOD 80-100, NEEDS IMPROVEMENT 60-79, CRITICAL < 60 */
export function scoreBand(score: number | null | undefined) {
  if (score === null || score === undefined) return { label: "NO DATA", cls: "status-watch" };
  if (score >= 80) return { label: "GOOD", cls: "status-good" };
  if (score >= 60) return { label: "NEEDS IMPROVEMENT", cls: "status-watch" };
  return { label: "CRITICAL", cls: "status-critical" };
}
export const statusLabel = (s: string) => s.replace(/_/g, " ").toLowerCase();
export const CATEGORY_LABEL: Record<string, string> = { waste: "Waste", water: "Water", energy: "Energy", cleanliness: "Cleanliness", green: "Green practice" };
