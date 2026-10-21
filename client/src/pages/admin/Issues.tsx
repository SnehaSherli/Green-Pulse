import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card, Empty, input, PageHeader, QueryState, SeverityPill, StatusPill, Table } from "../../components/ui";
import { CATEGORY_LABEL, fmtDate } from "../../lib/utils";

const STATUSES = ["REPORTED", "ASSIGNED", "IN_PROGRESS", "VERIFICATION_PENDING", "CLOSED"];

export default function Issues() {
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["issues", status], queryFn: () => api.get(`/issues${status ? `?status=${status}` : ""}`) });
  return (
    <>
      <PageHeader title="Issue desk" sub="Issues are created automatically from failed checklist items. Open an issue to assign it to staff."
        action={<select className={`${input} w-52`} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="status-filter"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}</select>} />
      <Card><QueryState q={q}>{(list) => list.length === 0 ? <Empty>No issues.</Empty> : (
        <Table head={["Issue", "Location", "Category", "Severity", "Status", "Assigned to", "Due", ""]}>
          {list.map((i: any) => (
            <tr key={i.id}>
              <td className="font-semibold">{i.title}{i.isRepeated && <span className="status-pill status-critical ml-2">repeat</span>}{i.overdue && <span className="status-pill status-critical ml-1">overdue</span>}</td>
              <td>{i.location?.name}</td><td>{CATEGORY_LABEL[i.category]}</td><td><SeverityPill v={i.severity} /></td><td><StatusPill v={i.status} /></td>
              <td>{i.assignedTo?.name ?? <span className="text-muted-foreground">—</span>}</td><td className="text-xs">{fmtDate(i.dueDate)}</td>
              <td><Link className="font-semibold text-primary" to={`/admin/issues/${i.id}`} data-testid={`open-issue-${i.title}`}>{i.status === "REPORTED" ? "Assign" : "Open"}</Link></td>
            </tr>
          ))}
        </Table>
      )}</QueryState></Card>
    </>
  );
}
