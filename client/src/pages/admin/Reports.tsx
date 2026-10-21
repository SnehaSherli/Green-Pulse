import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { api } from "../../lib/api";
import { btn, Card, Empty, Metric, PageHeader, QueryState, Table } from "../../components/ui";
import { fmtDate } from "../../lib/utils";

export default function Reports() {
  const [period, setPeriod] = useState("month");
  const q = useQuery({ queryKey: ["report", period], queryFn: () => api.get(`/reports/summary?period=${period}`) });
  return (
    <>
      <PageHeader title="Reports" sub="Computed from MongoDB for the selected period."
        action={<div className="flex gap-2 print:hidden">
          <select className="rounded-lg border border-input bg-background px-3 py-2 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="period">
            <option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This year</option></select>
          <a className={btn.ghost} href={`/api/reports/issues.csv?period=${period}`}><Download className="h-4 w-4" /> CSV</a>
          <button className={btn.ghost} onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button></div>} />
      <QueryState q={q}>{(r) => (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">{r.label}: {fmtDate(r.from)} – {fmtDate(r.to)}</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="Inspections" value={r.inspections} /><Metric label="Average score" value={r.averageScore === null ? "—" : `${r.averageScore}%`} tone="teal" />
            <Metric label="Issues raised / closed" value={`${r.issuesRaised} / ${r.issuesClosed}`} tone="amber" /><Metric label="Repeated violations" value={r.repeatedViolations} tone="orange" hint={r.averageResolutionHours === null ? undefined : `Avg fix time ${r.averageResolutionHours} h`} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card><h2 className="mb-3 font-bold">Compliance by location</h2>{r.byLocation.length === 0 ? <Empty>No inspections in this period.</Empty> : (
              <Table head={["Location", "Inspections", "Avg score"]}>{r.byLocation.map((l: any) => <tr key={l.location}><td className="font-semibold">{l.location}</td><td>{l.inspections}</td><td>{l.averageScore}%</td></tr>)}</Table>)}</Card>
            <Card><h2 className="mb-3 font-bold">Open vs resolved by category</h2>
              <Table head={["Category", "Raised", "Closed", "Still open"]}>{r.byCategory.map((c: any) => <tr key={c.category}><td className="font-semibold">{c.label}</td><td>{c.raised}</td><td>{c.closed}</td><td>{c.raised - c.closed}</td></tr>)}</Table></Card>
          </div>
          <Card><h2 className="mb-2 font-bold">Environmental impact this period</h2>
            <p className="mono text-sm">{r.impact.wasteRecycledKg} kg waste · {r.impact.waterSavedL} L water · {r.impact.energySavedKwh} kWh energy · {r.impact.plasticReducedKg} kg plastic</p></Card>
        </div>
      )}</QueryState>
    </>
  );
}
