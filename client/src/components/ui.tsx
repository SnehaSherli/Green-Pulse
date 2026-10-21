import { ReactNode } from "react";
import { UseQueryResult } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { cn, scoreBand, statusLabel } from "../lib/utils";

export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
  ghost: "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50",
  danger: "inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:opacity-90 disabled:opacity-50",
};
export const input = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-card-border bg-card p-5 soft-shadow", className)}>{children}</section>;
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Metric({ label, value, hint, icon, tone = "green" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "green" | "teal" | "amber" | "orange" }) {
  return (
    <div className="stagger-in rounded-xl border border-card-border bg-card p-4 soft-shadow">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className={cn("metric-icon", `metric-${tone}`)}>{icon}</span>}
      </div>
      <p className="mono mt-2 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const SEV: Record<string, string> = { low: "status-good", medium: "status-watch", high: "status-critical", critical: "status-critical" };
const STATUS: Record<string, string> = {
  REPORTED: "status-critical", ASSIGNED: "status-watch", IN_PROGRESS: "status-watch", RESOLVED: "status-good", VERIFICATION_PENDING: "status-watch", VERIFIED: "status-good", CLOSED: "status-good",
  active: "status-good", inactive: "status-critical",
};
export const SeverityPill = ({ v }: { v: string }) => <span className={cn("status-pill", SEV[v])}>{v}</span>;
export const StatusPill = ({ v }: { v: string }) => <span className={cn("status-pill", STATUS[v] || "status-watch")}>{statusLabel(v)}</span>;
export const ScorePill = ({ score }: { score: number | null }) => {
  const b = scoreBand(score);
  return <span className={cn("status-pill", b.cls)}>{score === null || score === undefined ? "—" : `${score}%`} · {b.label}</span>;
};

export function QueryState({ q, children }: { q: UseQueryResult<any>; children: (data: any) => ReactNode }) {
  if (q.isLoading) return <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  if (q.isError) return <Card className="border-destructive/30 text-sm text-destructive">Could not load data: {(q.error as Error).message}</Card>;
  return <>{children(q.data)}</>;
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>;
export const ErrorText = ({ e }: { e: unknown }) => (e ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{(e as Error).message}</p> : null);

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className={cn("max-h-[92vh] w-full overflow-auto rounded-2xl bg-card p-6 shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-xl leading-none text-muted-foreground hover:bg-muted" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-border/60 [&>tr>td]:px-3 [&>tr>td]:py-3">{children}</tbody>
      </table>
    </div>
  );
}
