import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { api } from "../../lib/api";
import { btn, Card, Empty, PageHeader, QueryState } from "../../components/ui";
import { cn, fmtDateTime } from "../../lib/utils";

export default function Notifications() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api.get("/notifications") });
  const readAll = useMutation({ mutationFn: () => api.post("/notifications/read-all"), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  async function open(n: any) {
    if (!n.read) await api.patch(`/notifications/${n.id}/read`, {}).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ["notifications"] });
    if (n.link) nav(n.link);
  }
  return (
    <>
      <PageHeader title="Notifications" sub="Saved in MongoDB — you will still see them after signing in again." action={<button className={btn.ghost} onClick={() => readAll.mutate()}>Mark all read</button>} />
      <QueryState q={q}>{(d) => (
        <Card>
          {d.items.length === 0 ? <Empty>No notifications yet.</Empty> : d.items.map((n: any) => (
            <button key={n.id} onClick={() => open(n)} className="activity-row w-full text-left">
              <span className={cn("metric-icon", n.read ? "metric-teal" : "metric-amber")}><Bell className="h-4 w-4" /></span>
              <span className="flex-1"><span className={cn("block text-sm", !n.read && "font-bold")}>{n.title}</span><span className="block text-xs text-muted-foreground">{n.message}</span></span>
              <span className="text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</span>
            </button>
          ))}
        </Card>
      )}</QueryState>
    </>
  );
}
