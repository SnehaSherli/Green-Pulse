import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, RotateCcw, ScanLine, ShieldCheck, Wrench } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { btn, Card, Empty, Metric, PageHeader, QueryState, ScorePill } from "../../components/ui";
import { fmtDateTime, greeting, today } from "../../lib/utils";

export default function InspectorDashboard() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["dash-inspector"], queryFn: () => api.get("/dashboard/inspector") });
  return (
    <>
      <PageHeader title={`${greeting()}, ${user!.name.split(" ")[0]}`} sub={today()} action={<Link to="/inspector/scan" className={btn.primary}><ScanLine className="h-4 w-4" /> Scan QR to inspect</Link>} />
      <QueryState q={q}>{(d) => (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Metric label="My inspections" value={d.totalInspections} icon={<ClipboardCheck className="h-4 w-4" />} hint={`${d.thisWeek} this week`} />
            <Metric label="Average score" value={d.averageScore === null ? "—" : `${d.averageScore}%`} icon={<CheckCircle2 className="h-4 w-4" />} tone="teal" />
            <Metric label="Issues I reported" value={d.issuesReported} icon={<Wrench className="h-4 w-4" />} tone="amber" />
            <Metric label="Awaiting my verification" value={d.pendingVerification} icon={<ShieldCheck className="h-4 w-4" />} tone="orange" hint={<Link to="/inspector/verifications" className="font-semibold text-primary">Open queue →</Link>} />
            <Metric label="Rejected & returned" value={d.rejectedReturned} icon={<RotateCcw className="h-4 w-4" />} tone="orange" />
          </div>
          <Card><h2 className="mb-3 font-bold">Recent inspections</h2>
            {d.recent.length === 0 ? <Empty>No inspections yet — scan a location QR to start.</Empty> : d.recent.map((r: any) => (
              <Link key={r.id} to={`/inspector/inspections/${r.id}`} className="activity-row justify-between"><span><b>{r.location}</b><span className="block text-xs text-muted-foreground">{fmtDateTime(r.inspectedAt)} · {r.nonCompliant} failed</span></span><ScorePill score={r.score} /></Link>))}
          </Card>
        </div>
      )}</QueryState>
    </>
  );
}
