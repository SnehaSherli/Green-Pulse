import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertOctagon, CheckCircle2, ClipboardCheck, Clock, Lightbulb, MapPin, Repeat, ShieldCheck, TrendingDown, TrendingUp, Wrench } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Card, Empty, Metric, PageHeader, QueryState, ScorePill } from "../../components/ui";
import { cn, greeting, today } from "../../lib/utils";

const SEV_CLS: Record<string, string> = { critical: "status-critical", high: "status-critical", medium: "status-watch" };

export default function AdminDashboard() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["dash-admin"], queryFn: () => api.get("/dashboard/admin"), refetchInterval: 20000 });
  return (
    <>
      <PageHeader title={`${greeting()}, ${user!.name.split(" ")[0]}`} sub={`${today()} — live from MongoDB`} />
      <QueryState q={q}>{(d) => {
        const s = d.summary;
        const trendData = d.trends.filter((t: any) => t.score !== null);
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Metric label="Campus compliance" value={s.overallScore === null ? "—" : `${s.overallScore}%`} icon={<Activity className="h-4 w-4" />}
                hint={s.scoreChange === null ? "Not enough data for a trend" : <span className={cn("inline-flex items-center gap-1", s.scoreChange >= 0 ? "text-primary" : "text-destructive")}>{s.scoreChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(s.scoreChange)} pts vs previous 30 days</span>} />
              <Metric label="Spaces monitored" value={s.totalLocations} icon={<MapPin className="h-4 w-4" />} tone="teal" hint="Active locations" />
              <Metric label="Open issues" value={s.openIssues} icon={<Wrench className="h-4 w-4" />} tone="amber" hint={`${s.unassignedIssues} awaiting assignment`} />
              <Metric label="Completed inspections" value={s.totalInspections} icon={<ClipboardCheck className="h-4 w-4" />} />
              <Metric label="Resolved issues" value={s.resolvedIssues} icon={<CheckCircle2 className="h-4 w-4" />} hint={`${s.pendingVerification} waiting verification`} />
              <Metric label="High-risk areas" value={s.highRiskLocations} icon={<AlertOctagon className="h-4 w-4" />} tone="orange" hint="Score below 60%" />
              <Metric label="Repeated violations" value={s.repeatedViolations} icon={<Repeat className="h-4 w-4" />} tone="orange" hint="Open, seen before" />
              <Metric label="Overdue (escalated)" value={s.overdueIssues} icon={<Clock className="h-4 w-4" />} tone="amber" />
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <h2 className="mb-3 font-bold">Compliance trend (6 months)</h2>
                {trendData.length < 2 ? <Empty>The trend appears after inspections happen in at least two different months.</Empty> : (
                  <div className="h-64"><ResponsiveContainer><AreaChart data={d.trends.map((t: any) => ({ ...t, score: t.score ?? undefined }))}>
                    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(161 44% 30%)" stopOpacity={0.35} /><stop offset="100%" stopColor="hsl(161 44% 30%)" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" fontSize={12} /><YAxis domain={[0, 100]} fontSize={12} /><Tooltip />
                    <Area isAnimationActive={false} type="monotone" dataKey="score" name="Avg score %" stroke="hsl(161 44% 30%)" strokeWidth={2.5} fill="url(#g)" connectNulls />
                  </AreaChart></ResponsiveContainer></div>
                )}
              </Card>
              <Card>
                <h2 className="mb-3 font-bold">Compliance by category</h2>
                <div className="h-64"><ResponsiveContainer><BarChart data={d.categories.map((c: any) => ({ ...c, value: c.value ?? 0 }))} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} fontSize={12} /><YAxis type="category" dataKey="label" width={110} fontSize={11} /><Tooltip />
                  <Bar isAnimationActive={false} dataKey="value" name="Compliance %" fill="hsl(161 44% 30%)" radius={[0, 6, 6, 0]} />
                </BarChart></ResponsiveContainer></div>
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <h2 className="mb-3 font-bold">Risk alerts <span className="text-xs font-normal text-muted-foreground">(rule-based, computed from live data)</span></h2>
                {d.risks.length === 0 ? <Empty>No active risks. 🎉</Empty> : d.risks.slice(0, 8).map((r: any) => (
                  <div key={r.id} className="activity-row"><span className={cn("status-pill", SEV_CLS[r.severity])}>{r.severity}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{r.title}</p><p className="truncate text-xs text-muted-foreground">{r.location} · {r.detail}</p></div>
                    {r.issueId && <Link to={`/admin/issues/${r.issueId}`} className="text-xs font-semibold text-primary">Open</Link>}</div>
                ))}
              </Card>
              <Card>
                <h2 className="mb-3 font-bold">Leaderboard <span className="text-xs font-normal text-muted-foreground">(latest inspection score)</span></h2>
                {d.leaderboard.length === 0 ? <Empty>No inspected locations yet.</Empty> : d.leaderboard.map((r: any) => (
                  <div key={r.locationId} className="activity-row"><span className="mono w-6 text-sm font-bold text-muted-foreground">{r.rank}</span>
                    <div className="flex-1"><p className="text-sm font-semibold">{r.location}</p><p className="text-xs text-muted-foreground">{r.department}</p></div>
                    <span className={cn("mono text-xs", r.change >= 0 ? "text-primary" : "text-destructive")}>{r.change > 0 ? "+" : ""}{r.change}</span><ScorePill score={r.score} /></div>
                ))}
              </Card>
            </div>

            <Card>
              <h2 className="mb-3 flex items-center gap-2 font-bold"><Lightbulb className="h-4 w-4" /> Smart recommendations</h2>
              {d.recommendations.length === 0 ? <Empty>Recommendations appear when there are open issues.</Empty> : (
                <div className="grid gap-3 md:grid-cols-2">{d.recommendations.map((r: any) => <div key={r.category} className="rounded-lg bg-muted p-3 text-sm"><p className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />{r.label} <span className="text-xs font-normal text-muted-foreground">({r.openIssues} open)</span></p>{r.text}</div>)}</div>
              )}
            </Card>
          </div>
        );
      }}</QueryState>
    </>
  );
}
