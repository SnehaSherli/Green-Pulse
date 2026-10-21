import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { btn, Card, Empty, PageHeader, QueryState, SeverityPill, StatusPill, Table } from "../../components/ui";
import { CATEGORY_LABEL, cn, fmtDate } from "../../lib/utils";

const TABS = [["", "All"], ["ASSIGNED", "Assigned"], ["IN_PROGRESS", "In progress"], ["VERIFICATION_PENDING", "Awaiting verification"], ["CLOSED", "Closed"]];

export default function StaffIssues() {
  const [tab, setTab] = useState("");
  const q = useQuery({ queryKey: ["issues", "staff"], queryFn: () => api.get("/issues") });
  return (
    <>
      <PageHeader title="Assigned issues" sub="Only issues assigned to you are shown." />
      <div className="mb-4 flex flex-wrap gap-2">{TABS.map(([v, l]) => <button key={v} onClick={() => setTab(v)} className={cn(btn.ghost, tab === v && "border-primary bg-primary/10")}>{l}</button>)}</div>
      <Card><QueryState q={q}>{(all) => {
        const list = tab ? all.filter((i: any) => i.status === tab) : all;
        return list.length === 0 ? <Empty>No issues here.</Empty> : (
          <Table head={["Issue", "Location", "Category", "Severity", "Status", "Due", ""]}>
            {list.map((i: any) => (
              <tr key={i.id}><td className="font-semibold">{i.title}{i.rejectionCount > 0 && i.status === "IN_PROGRESS" && <span className="status-pill status-critical ml-2">rejected</span>}{i.overdue && <span className="status-pill status-critical ml-1">overdue</span>}</td>
                <td>{i.location?.name}</td><td>{CATEGORY_LABEL[i.category]}</td><td><SeverityPill v={i.severity} /></td><td><StatusPill v={i.status} /></td><td className="text-xs">{fmtDate(i.dueDate)}</td>
                <td><Link className="font-semibold text-primary" to={`/staff/issues/${i.id}`} data-testid={`staff-open-${i.title}`}>Open</Link></td></tr>
            ))}
          </Table>);
      }}</QueryState></Card>
    </>
  );
}
