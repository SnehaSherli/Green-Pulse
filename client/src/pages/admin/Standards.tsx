import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { btn, Card, ErrorText, input, PageHeader, QueryState, SeverityPill, Table } from "../../components/ui";
import { CATEGORY_LABEL } from "../../lib/utils";

const blank = { title: "", description: "", category: "waste", severity: "medium", locations: [] as string[] };

export default function Standards() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["standards"], queryFn: () => api.get("/standards") });
  const locs = useQuery({ queryKey: ["locations", ""], queryFn: () => api.get("/locations") });
  const [f, setF] = useState<any>(blank);
  const done = () => qc.invalidateQueries({ queryKey: ["standards"] });
  const create = useMutation({ mutationFn: () => api.post("/standards", f), onSuccess: () => { setF(blank); done(); } });
  const toggle = useMutation({ mutationFn: (s: any) => api.patch(`/standards/${s.id}`, { active: !s.active }), onSuccess: done });
  const names = new Map((locs.data || []).map((l: any) => [l.id, l.name]));

  return (
    <>
      <PageHeader title="Standards & checklists" sub="These items become the inspector's checklist. Leave locations empty to apply to every location." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2"><QueryState q={q}>{(list) => (
          <Table head={["Standard", "Category", "Severity", "Applies to", "Active"]}>
            {list.map((s: any) => (
              <tr key={s.id} className={s.active ? "" : "opacity-50"}>
                <td><p className="font-semibold">{s.title}</p><p className="text-xs text-muted-foreground">{s.description}</p></td>
                <td>{CATEGORY_LABEL[s.category]}</td><td><SeverityPill v={s.severity} /></td>
                <td className="text-xs">{s.locations.length ? s.locations.map((l: string) => names.get(l) || "…").join(", ") : "All locations"}</td>
                <td><button className={btn.ghost} onClick={() => toggle.mutate(s)}>{s.active ? "Disable" : "Enable"}</button></td>
              </tr>
            ))}
          </Table>
        )}</QueryState></Card>
        <Card>
          <h2 className="mb-3 font-bold">Add standard</h2>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <input className={input} placeholder="Checklist item title" required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <input className={input} placeholder="What should the inspector check?" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select className={input} value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{["low", "medium", "high", "critical"].map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            <fieldset className="rounded-lg border border-border p-3"><legend className="px-1 text-xs font-semibold text-muted-foreground">Only for these locations (none = all)</legend>
              {(locs.data || []).map((l: any) => <label key={l.id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={f.locations.includes(l.id)} onChange={(e) => setF({ ...f, locations: e.target.checked ? [...f.locations, l.id] : f.locations.filter((x: string) => x !== l.id) })} /> {l.name}</label>)}
            </fieldset>
            <ErrorText e={create.error} />
            <button className={`${btn.primary} w-full`} disabled={create.isPending}>Add to checklist</button>
          </form>
        </Card>
      </div>
    </>
  );
}
