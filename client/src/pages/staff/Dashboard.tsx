import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Hammer, RotateCcw, ShieldCheck, Wrench } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Card, Empty, Metric, PageHeader, QueryState, SeverityPill, StatusPill } from "../../components/ui";
import { fmtDate, greeting, today } from "../../lib/utils";

export default function StaffDashboard() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["dash-staff"], queryFn: () => api.get("/dashboard/staff"), refetchInterval: 20000 });
  return (
    <>
      <PageHeader title={`${greeting()}, ${user!.name.split(" ")[0]}`} sub={today()} />
      <QueryState q={q}>{(d) => (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Metric label="New assignments" value={d.assigned} icon={<Wrench className="h-4 w-4" />} tone="amber" />
            <Metric label="In progress" value={d.inProgress} icon={<Hammer className="h-4 w-4" />} />
            <Metric label="Awaiting verification" value={d.awaitingVerification} icon={<ShieldCheck className="h-4 w-4" />} tone="teal" />
            <Metric label="Closed" value={d.closed} icon={<CheckCircle2 className="h-4 w-4" />} />
            <Metric label="Overdue" value={d.overdue} icon={<Clock className="h-4 w-4" />} tone="orange" />
            <Metric label="Sent back to me" value={d.sentBack} icon={<RotateCcw className="h-4 w-4" />} tone="orange" />
          </div>
          <Card><h2 className="mb-3 font-bold">Up next</h2>
            {d.upNext.length === 0 ? <Empty>No open assignments. Nice work!</Empty> : d.upNext.map((i: any) => (
              <Link key={i.id} to={`/staff/issues/${i.id}`} className="activity-row justify-between"><span><b>{i.title}</b><span className="block text-xs text-muted-foreground">{i.location} · due {fmtDate(i.dueDate)}{i.rejected && " · rejected — redo"}</span></span><span className="flex gap-2"><SeverityPill v={i.severity} /><StatusPill v={i.status} /></span></Link>))}
          </Card>
        </div>
      )}</QueryState>
    </>
  );
}
