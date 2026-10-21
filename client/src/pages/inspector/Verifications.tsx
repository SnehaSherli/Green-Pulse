import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card, Empty, PageHeader, QueryState, SeverityPill } from "../../components/ui";
import { fmtDateTime } from "../../lib/utils";

export default function Verifications() {
  const q = useQuery({ queryKey: ["queue"], queryFn: () => api.get("/issues/queue/verification"), refetchInterval: 15000 });
  return (
    <>
      <PageHeader title="Verification queue" sub="Staff fixes waiting for you. Compare before/after evidence, then approve or reject." />
      <QueryState q={q}>{(list) => list.length === 0 ? <Empty>Nothing to verify right now.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">{list.map((i: any) => (
          <Card key={i.id}>
            <div className="flex items-start justify-between gap-2"><div><p className="font-bold">{i.title}</p><p className="text-sm text-muted-foreground">{i.location?.name}</p></div><SeverityPill v={i.severity} /></div>
            <p className="mt-2 text-sm">Fixed by <b>{i.assignedTo?.name}</b> · submitted {fmtDateTime(i.submittedAt)}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">“{i.resolutionRemarks}”</p>
            <Link to={`/inspector/verifications/${i.id}`} className="mt-3 inline-block font-semibold text-primary" data-testid={`review-${i.title}`}>Review before / after →</Link>
          </Card>))}</div>
      )}</QueryState>
    </>
  );
}
