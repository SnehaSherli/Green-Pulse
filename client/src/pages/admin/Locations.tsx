import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, QrCode } from "lucide-react";
import { api } from "../../lib/api";
import { btn, Card, ErrorText, input, PageHeader, QueryState, ScorePill, StatusPill, Table } from "../../components/ui";
import QrModal from "../../components/QrModal";
import { fmtDate } from "../../lib/utils";

export default function Locations() {
  const qc = useQueryClient();
  // Optional override so QR codes contain the laptop's network address (needed for the phone demo)
  const [base, setBase] = useState(() => localStorage.getItem("gp_qr_base") || "");
  const suffix = base ? `?base=${encodeURIComponent(base)}` : "";
  const q = useQuery({ queryKey: ["locations", base], queryFn: () => api.get(`/locations${suffix}`) });
  const [qr, setQr] = useState<any>(null);
  const [form, setForm] = useState({ name: "", department: "", description: "" });
  const create = useMutation({
    mutationFn: () => api.post(`/locations${suffix}`, form),
    onSuccess: (loc) => { setForm({ name: "", department: "", description: "" }); qc.invalidateQueries({ queryKey: ["locations"] }); setQr({ ...loc, __base: base }); },
  });
  const toggle = useMutation({
    mutationFn: (l: any) => api.patch(`/locations/${l.id}`, { status: l.status === "active" ? "inactive" : "active" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
  const saveBase = (v: string) => { setBase(v); v ? localStorage.setItem("gp_qr_base", v) : localStorage.removeItem("gp_qr_base"); };

  return (
    <>
      <PageHeader title="Locations & QR codes" sub="Every location has its own secure QR token stored in MongoDB." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <QueryState q={q}>{(list) => (
            <Table head={["Location", "Code", "Latest score", "Status", "Last inspected", ""]}>
              {list.map((l: any) => (
                <tr key={l.id}>
                  <td><p className="font-semibold">{l.name}</p><p className="text-xs text-muted-foreground">{l.department}</p></td>
                  <td className="mono text-xs">{l.code}</td>
                  <td><ScorePill score={l.latestScore} /></td>
                  <td><button onClick={() => toggle.mutate(l)} title="Click to toggle" className="cursor-pointer"><StatusPill v={l.status} /></button></td>
                  <td className="text-xs">{fmtDate(l.lastInspectionAt)}</td>
                  <td><button className={`${btn.ghost} whitespace-nowrap`} onClick={() => setQr({ ...l, __base: base })} data-testid={`view-qr-${l.name}`}><QrCode className="h-4 w-4" /> View QR</button></td>
                </tr>
              ))}
            </Table>
          )}</QueryState>
        </Card>
        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 font-bold">Create location</h2>
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
              <input className={input} placeholder="Location name (e.g. Main Canteen)" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="loc-name" />
              <input className={input} placeholder="Building / area (e.g. Facilities)" required minLength={2} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} data-testid="loc-dept" />
              <input className={input} placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <ErrorText e={create.error} />
              <button className={`${btn.primary} w-full`} disabled={create.isPending} data-testid="create-location"><Plus className="h-4 w-4" /> Create & generate QR</button>
            </form>
          </Card>
          <Card>
            <h2 className="mb-1 font-bold">QR base URL</h2>
            <p className="mb-2 text-xs text-muted-foreground">Address encoded in the QR codes. For the phone demo use your laptop's network address, e.g. <span className="mono">https://192.168.1.20:5173</span>. Leave empty to use the address in this browser.</p>
            <input className={input} placeholder={window.location.origin} value={base} onChange={(e) => saveBase(e.target.value.trim().replace(/\/+$/, ""))} data-testid="qr-base" />
          </Card>
        </div>
      </div>
      {qr && <QrModal key={qr.id + qr.qrToken} location={qr} onClose={() => setQr(null)} />}
    </>
  );
}
