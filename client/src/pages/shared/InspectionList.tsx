import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Card, Empty, PageHeader, QueryState, ScorePill, Table } from "../../components/ui";
import { fmtDateTime } from "../../lib/utils";

export default function InspectionList() {
  const { user } = useAuth();
  const base = user!.role === "ADMIN" ? "/admin" : "/inspector";
  const q = useQuery({ queryKey: ["inspections"], queryFn: () => api.get("/inspections") });
  return (
    <>
      <PageHeader title={user!.role === "ADMIN" ? "Inspection history" : "My inspections"} sub="Every submitted checklist, newest first." />
      <Card><QueryState q={q}>{(list) => list.length === 0 ? <Empty>No inspections yet.</Empty> : (
        <Table head={["Location", "Inspector", "Date", "Score", "Failed items", ""]}>
          {list.map((i: any) => (
            <tr key={i.id}><td className="font-semibold">{i.location?.name}</td><td>{i.inspector?.name}</td><td className="text-xs">{fmtDateTime(i.inspectedAt)}</td><td><ScorePill score={i.score} /></td><td>{i.nonCompliant}</td>
              <td><Link className="font-semibold text-primary" to={`${base}/inspections/${i.id}`}>Details</Link></td></tr>
          ))}
        </Table>
      )}</QueryState></Card>
    </>
  );
}
