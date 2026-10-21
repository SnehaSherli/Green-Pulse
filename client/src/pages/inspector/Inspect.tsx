import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, MapPin, ScanLine, XCircle } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { btn, Card, ErrorText, input, SeverityPill, StatusPill } from "../../components/ui";
import { PhotoUpload } from "../../components/Evidence";
import { CATEGORY_LABEL, cn, fmtDateTime, scoreBand, today } from "../../lib/utils";

const OPTIONS = [["COMPLIANT", "Compliant"], ["NON_COMPLIANT", "Non-Compliant"], ["NOT_APPLICABLE", "Not Applicable"]] as const;
type Answer = { result?: string; remarks: string; evidence: any[] };

export default function Inspect() {
  const { token = "" } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  // 1) backend resolves the QR token against MongoDB (404 unknown, 409 inactive)
  const loc = useQuery({ queryKey: ["qr", token], queryFn: () => api.get(`/locations/qr/${token}`), retry: false });
  // 2) checklist for that location, from MongoDB
  const list = useQuery({ queryKey: ["checklist", token], queryFn: () => api.get(`/locations/qr/${token}/checklist`), enabled: loc.isSuccess, retry: false });

  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<any>(null);
  const get = (id: string): Answer => answers[id] || { remarks: "", evidence: [] };
  const set = (id: string, patch: Partial<Answer>) => setAnswers((a) => ({ ...a, [id]: { ...get(id), ...patch } }));

  const checklist: any[] = list.data?.checklist || [];
  const stats = useMemo(() => {
    const vals = checklist.map((c) => get(c.id).result);
    const ok = vals.filter((v) => v === "COMPLIANT").length, bad = vals.filter((v) => v === "NON_COMPLIANT").length;
    return { ok, bad, na: vals.filter((v) => v === "NOT_APPLICABLE").length, answered: vals.filter(Boolean).length, score: ok + bad ? Math.round((ok / (ok + bad)) * 1000) / 10 : null };
  }, [answers, checklist]); // eslint-disable-line

  const submit = useMutation({
    mutationFn: () => api.post("/inspections", {
      qrToken: token, notes,
      responses: checklist.map((c) => ({ standardId: c.id, result: get(c.id).result, remarks: get(c.id).remarks, evidenceIds: get(c.id).result === "NON_COMPLIANT" ? get(c.id).evidence.map((e) => e.id) : [] })),
    }),
    onSuccess: (r) => { setResult(r); qc.invalidateQueries(); },
  });

  if (loc.isLoading) return <p className="py-16 text-center text-sm text-muted-foreground">Identifying location from QR code…</p>;
  if (loc.isError) {
    const e = loc.error as ApiError;
    return (
      <Card className="mx-auto max-w-md text-center" >
        <XCircle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-2 text-lg font-bold" data-testid="qr-error-title">{e.status === 404 ? "Location not found" : e.status === 409 ? "Location is inactive" : "Cannot open inspection"}</h1>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="qr-error">{e.status === 404 ? "This QR code is not recognised. It may be invalid or it was replaced by a newer QR." : e.message}</p>
        <Link to="/inspector/scan" className={`${btn.primary} mt-4`}><ScanLine className="h-4 w-4" /> Scan another QR</Link>
      </Card>
    );
  }
  const L = loc.data.location;

  if (result) {
    const i = result.inspection, band = scoreBand(i.score);
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="inspection-result">
        <Card className="text-center">
          <p className="text-sm text-muted-foreground">Inspection submitted — {L.name}</p>
          <p className="mono my-2 text-6xl font-bold" data-testid="result-score">{i.score}%</p>
          <span className={cn("status-pill", band.cls)}>{band.label}</span>
          <p className="mono mt-3 text-sm">{i.compliant} compliant / {i.applicable} applicable{i.notApplicable ? ` (${i.notApplicable} not applicable excluded)` : ""}</p>
        </Card>
        {i.riskFlags.length > 0 && <Card><h2 className="mb-2 font-bold">Risk flags</h2>{i.riskFlags.map((f: any, k: number) => <p key={k} className="text-sm"><span className={cn("status-pill mr-2", f.level === "high" ? "status-critical" : "status-watch")}>{f.type.replace(/_/g, " ").toLowerCase()}</span>{f.message}</p>)}</Card>}
        <Card>
          <h2 className="mb-2 font-bold">Issues created automatically ({result.issues.length})</h2>
          {result.issues.length === 0 ? <p className="text-sm text-muted-foreground">No violations — nothing to fix. 🎉</p> : result.issues.map((x: any) => (
            <div key={x.id} className="activity-row justify-between"><span className="font-semibold">{x.title}</span><span className="flex gap-2"><SeverityPill v={x.severity} /><StatusPill v={x.status} /></span></div>))}
        </Card>
        {i.recommendations.length > 0 && <Card><h2 className="mb-2 flex items-center gap-2 font-bold"><Lightbulb className="h-4 w-4" /> Recommendations</h2><ul className="list-disc space-y-1 pl-5 text-sm">{i.recommendations.map((r: string) => <li key={r}>{r}</li>)}</ul></Card>}
        <div className="flex gap-2"><Link to="/inspector/scan" className={btn.primary}><ScanLine className="h-4 w-4" /> Scan another location</Link><Link to={`/inspector/inspections/${i.id}`} className={btn.ghost}>View inspection</Link></div>
      </div>
    );
  }

  const missingRemarks = checklist.some((c) => get(c.id).result === "NON_COMPLIANT" && get(c.id).remarks.trim().length < 3);
  const canSubmit = checklist.length > 0 && stats.answered === checklist.length && !missingRemarks && stats.ok + stats.bad > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-primary">Inspection</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold" data-testid="inspect-location"><MapPin className="h-5 w-5" />{L.name}</h1>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs uppercase text-muted-foreground">Location</dt><dd className="font-semibold">{L.name} <span className="text-xs text-muted-foreground">({L.code})</span></dd></div>
          <div><dt className="text-xs uppercase text-muted-foreground">Inspector</dt><dd className="font-semibold">{loc.data.inspector.name} · {user!.email}</dd></div>
          <div><dt className="text-xs uppercase text-muted-foreground">Date</dt><dd className="font-semibold">{today()}</dd></div>
        </dl>
      </Card>

      {list.isLoading && <p className="text-sm text-muted-foreground">Loading checklist…</p>}
      {checklist.map((c, idx) => {
        const a = get(c.id);
        return (
          <Card key={c.id} className={cn(a.result === "NON_COMPLIANT" && "border-destructive/50")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-bold">{idx + 1}. {c.title}</p><p className="text-xs text-muted-foreground">{CATEGORY_LABEL[c.category]} · {c.description}</p></div><SeverityPill v={c.severity} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {OPTIONS.map(([val, label]) => (
                <label key={val} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold", a.result === val ? (val === "NON_COMPLIANT" ? "border-destructive bg-destructive/10" : val === "COMPLIANT" ? "border-primary bg-primary/10" : "border-accent bg-accent/15") : "border-border")}>
                  <input type="radio" name={c.id} checked={a.result === val} onChange={() => set(c.id, { result: val })} data-testid={`res-${c.title}-${val}`} /> {label}
                </label>
              ))}
            </div>
            {a.result === "NON_COMPLIANT" && (
              <div className="mt-3 space-y-3 rounded-lg bg-muted p-3">
                <textarea className={input} rows={2} placeholder="Remarks (required) — what exactly is wrong?" value={a.remarks} onChange={(e) => set(c.id, { remarks: e.target.value })} data-testid={`remarks-${c.title}`} />
                <PhotoUpload label="Upload BEFORE photo" fields={{ type: "BEFORE", locationId: L.id }} files={a.evidence}
                  onUploaded={(ev) => set(c.id, { evidence: [...a.evidence, ev] })} onRemove={(ev) => set(c.id, { evidence: a.evidence.filter((x) => x.id !== ev.id) })} />
              </div>
            )}
          </Card>
        );
      })}

      {checklist.length > 0 && (
        <Card>
          <textarea className={input} rows={2} placeholder="Overall notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="mono text-sm" data-testid="live-score">Live score: {stats.score === null ? "—" : `${stats.score}%`} · {stats.answered}/{checklist.length} answered</p>
            <button className={btn.primary} disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()} data-testid="submit-inspection">{submit.isPending ? "Submitting…" : "Submit inspection"}</button>
          </div>
          {missingRemarks && <p className="mt-2 text-xs text-destructive">Add remarks for every Non-Compliant item.</p>}
          <div className="mt-2"><ErrorText e={submit.error} /></div>
          <p className="mt-2 text-xs text-muted-foreground">The final score is calculated by the server. Not Applicable items are excluded from the denominator.</p>
        </Card>
      )}
      <button className="text-sm text-muted-foreground underline" onClick={() => nav("/inspector/scan")}>Cancel and scan a different QR</button>
    </div>
  );
}
