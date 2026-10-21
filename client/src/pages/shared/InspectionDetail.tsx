import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Lightbulb } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Card, QueryState, ScorePill, StatusPill, SeverityPill } from "../../components/ui";
import { EvidenceGallery } from "../../components/Evidence";
import { CATEGORY_LABEL, cn, fmtDateTime } from "../../lib/utils";

const RES: Record<string, string> = { COMPLIANT: "status-good", NON_COMPLIANT: "status-critical", NOT_APPLICABLE: "status-watch" };

export default function InspectionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const base = user!.role === "ADMIN" ? "/admin" : "/inspector";
  const q = useQuery({ queryKey: ["inspection", id], queryFn: () => api.get(`/inspections/${id}`) });
  return (
    <>
      <Link to={`${base}/inspections`} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" /> Inspections</Link>
      <QueryState q={q}>{(d) => (
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h1 className="text-2xl font-bold">{d.location?.name}</h1><p className="text-sm text-muted-foreground">Inspected by {d.inspector?.name} · {fmtDateTime(d.inspectedAt)}</p></div>
              <ScorePill score={d.score} />
            </div>
            <p className="mono mt-3 text-sm">{d.compliant} compliant / {d.applicable} applicable = {d.score}% <span className="text-muted-foreground">({d.notApplicable} not applicable excluded)</span></p>
            {d.riskFlags.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{d.riskFlags.map((f: any, k: number) => <span key={k} className={cn("status-pill", f.level === "high" ? "status-critical" : "status-watch")} title={f.message}>{f.type.replace(/_/g, " ").toLowerCase()}: {f.message}</span>)}</div>}
            {d.notes && <p className="mt-3 text-sm">Notes: {d.notes}</p>}
          </Card>
          {d.recommendations.length > 0 && <Card><h2 className="mb-2 flex items-center gap-2 font-bold"><Lightbulb className="h-4 w-4" /> Recommendations</h2><ul className="list-disc space-y-1 pl-5 text-sm">{d.recommendations.map((r: string) => <li key={r}>{r}</li>)}</ul></Card>}
          <Card>
            <h2 className="mb-3 font-bold">Checklist responses</h2>
            <div className="space-y-3">
              {d.responses.map((r: any) => (
                <div key={r.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{r.standardTitle} <span className="text-xs font-normal text-muted-foreground">{CATEGORY_LABEL[r.category]}</span></p><span className={cn("status-pill", RES[r.result])}>{r.result.replace("_", "-").toLowerCase()}</span></div>
                  {r.remarks && <p className="mt-1 text-sm text-muted-foreground">“{r.remarks}”</p>}
                  {r.evidence.length > 0 && <div className="mt-2 max-w-sm"><EvidenceGallery items={r.evidence} /></div>}
                </div>
              ))}
            </div>
          </Card>
          {d.issues.length > 0 && (
            <Card><h2 className="mb-3 font-bold">Issues raised</h2>
              {d.issues.map((i: any) => (
                <div key={i.id} className="activity-row justify-between"><span className="font-semibold">{i.title}</span><span className="flex items-center gap-2"><SeverityPill v={i.severity} /><StatusPill v={i.status} />
                  {user!.role === "ADMIN" && <Link className="text-sm font-semibold text-primary" to={`/admin/issues/${i.id}`}>Open</Link>}</span></div>
              ))}
            </Card>
          )}
        </div>
      )}</QueryState>
    </>
  );
}
