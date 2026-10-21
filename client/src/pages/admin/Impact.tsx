import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Droplets, Recycle, Wind, Zap } from "lucide-react";
import { api } from "../../lib/api";
import { Card, Empty, Metric, PageHeader, QueryState, Table } from "../../components/ui";

export default function Impact() {
  const q = useQuery({ queryKey: ["impact"], queryFn: () => api.get("/impact") });
  return (
    <>
      <PageHeader title="Environmental impact" sub="Recorded in MongoDB each time an inspector verifies and closes an issue." />
      <QueryState q={q}>{(d) => (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="Waste recycled" value={`${d.totals.wasteRecycledKg} kg`} icon={<Recycle className="h-4 w-4" />} />
            <Metric label="Water saved" value={`${d.totals.waterSavedL} L`} icon={<Droplets className="h-4 w-4" />} tone="teal" />
            <Metric label="Energy saved" value={`${d.totals.energySavedKwh} kWh`} icon={<Zap className="h-4 w-4" />} tone="amber" />
            <Metric label="Plastic reduced" value={`${d.totals.plasticReducedKg} kg`} icon={<Wind className="h-4 w-4" />} tone="orange" />
          </div>
          <Card>
            <h2 className="mb-3 font-bold">Monthly impact ({d.totals.issuesClosed} issues closed)</h2>
            {d.byMonth.length === 0 ? <Empty>Impact appears after the first issue is verified and closed.</Empty> : (
              <div className="h-64"><ResponsiveContainer><BarChart data={d.byMonth}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
                <Bar isAnimationActive={false} dataKey="wasteRecycledKg" name="Waste (kg)" fill="hsl(161 44% 30%)" /><Bar isAnimationActive={false} dataKey="waterSavedL" name="Water (L)" fill="hsl(183 34% 42%)" /><Bar isAnimationActive={false} dataKey="energySavedKwh" name="Energy (kWh)" fill="hsl(28 61% 56%)" /><Bar isAnimationActive={false} dataKey="plasticReducedKg" name="Plastic (kg)" fill="hsl(9 54% 58%)" />
              </BarChart></ResponsiveContainer></div>
            )}
          </Card>
          <Card><h2 className="mb-3 font-bold">By location</h2>
            {d.byLocation.length === 0 ? <Empty>No data yet.</Empty> : (
              <Table head={["Location", "Issues closed", "Waste kg", "Water L", "Energy kWh", "Plastic kg"]}>
                {d.byLocation.map((l: any) => <tr key={l.location}><td className="font-semibold">{l.location}</td><td>{l.issuesClosed}</td><td>{l.wasteRecycledKg}</td><td>{l.waterSavedL}</td><td>{l.energySavedKwh}</td><td>{l.plasticReducedKg}</td></tr>)}
              </Table>)}
            <p className="mt-3 text-xs text-muted-foreground">{d.note}</p>
          </Card>
        </div>
      )}</QueryState>
    </>
  );
}
