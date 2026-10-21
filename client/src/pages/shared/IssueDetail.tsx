import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Lightbulb, XCircle } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { btn, Card, ErrorText, input, QueryState, SeverityPill, StatusPill } from "../../components/ui";
import { EvidenceGallery, PhotoUpload } from "../../components/Evidence";
import { CATEGORY_LABEL, fmtDate, fmtDateTime } from "../../lib/utils";

const BACK: Record<string, [string, string]> = { ADMIN: ["/admin/issues", "Issue desk"], STAFF: ["/staff/issues", "Assigned issues"], INSPECTOR: ["/inspector/verifications", "Verification queue"] };

export default function IssueDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["issue", id], queryFn: () => api.get(`/issues/${id}`) });
  const refresh = () => qc.invalidateQueries();
  const [back, backLabel] = BACK[user!.role];

  return (
    <>
      <Link to={back} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" /> {backLabel}</Link>
      <QueryState q={q}>{(i) => {
        const before = i.evidence.filter((e: any) => e.type === "BEFORE");
        const after = i.evidence.filter((e: any) => e.type === "AFTER");
        const currentAfter = after.filter((e: any) => e.round === i.rejectionCount);
        const olderAfter = after.filter((e: any) => e.round !== i.rejectionCount);
        return (
          <div className="space-y-5">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold">{i.title}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">{i.location?.name} · {CATEGORY_LABEL[i.category]} · reported by {i.reportedBy?.name} on {fmtDate(i.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill v={i.status} /> <SeverityPill v={i.severity} />
                  {i.isRepeated && <span className="status-pill status-critical">repeated ×{i.repeatCount + 1}</span>}
                  {i.overdue && <span className="status-pill status-critical">overdue</span>}
                </div>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs uppercase text-muted-foreground">Assigned to</dt><dd className="font-semibold">{i.assignedTo?.name ?? "Not assigned"}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">Due date</dt><dd className="font-semibold">{fmtDate(i.dueDate)}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">Inspector remarks</dt><dd className="font-semibold">{i.inspectorRemarks || "—"}</dd></div>
              </dl>
              {i.recommendation && <p className="mt-4 flex gap-2 rounded-lg bg-muted p-3 text-sm"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" /> {i.recommendation}</p>}
              {i.rejectionRemarks && i.status === "IN_PROGRESS" && (
                <p className="mt-3 flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="rejection-banner"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span><b>Rejected by inspector (attempt {i.rejectionCount}):</b> {i.rejectionRemarks}</span></p>
              )}
            </Card>

            <div className="grid gap-5 md:grid-cols-2">
              <Card><h2 className="mb-3 font-bold">Before evidence</h2><EvidenceGallery items={before} empty="No before-photo was attached during the inspection." /></Card>
              <Card>
                <h2 className="mb-3 font-bold">After evidence</h2>
                <EvidenceGallery items={user!.role === "STAFF" && i.status === "IN_PROGRESS" ? [] : currentAfter} empty="No after-photo uploaded yet." />
                {olderAfter.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Earlier (rejected) attempts</summary><div className="mt-2"><EvidenceGallery items={olderAfter} /></div></details>}
                {i.resolutionRemarks && <p className="mt-3 rounded-lg bg-muted p-3 text-sm"><b>Staff resolution:</b> {i.resolutionRemarks}</p>}
              </Card>
            </div>

            {user!.role === "ADMIN" && <AssignPanel issue={i} onDone={refresh} />}
            {user!.role === "STAFF" && <StaffPanel issue={i} currentAfter={currentAfter} onDone={refresh} />}
            {user!.role === "INSPECTOR" && i.status === "VERIFICATION_PENDING" && <VerifyPanel issue={i} onDone={refresh} />}

            <Card>
              <h2 className="mb-3 font-bold">History</h2>
              <ol className="space-y-3">
                {i.history.map((h: any, k: number) => (
                  <li key={k} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <span><b>{h.action}</b> <span className="text-muted-foreground">— {h.byName} · {fmtDateTime(h.at)}</span>{h.note && <span className="block text-muted-foreground">“{h.note}”</span>}</span></li>
                ))}
              </ol>
            </Card>
          </div>
        );
      }}</QueryState>
    </>
  );
}

function AssignPanel({ issue, onDone }: { issue: any; onDone: () => void }) {
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get("/users") });
  const [staffId, setStaffId] = useState("");
  const [due, setDue] = useState("");
  const m = useMutation({ mutationFn: () => api.post(`/issues/${issue.id}/assign`, { staffId, ...(due ? { dueDate: due } : {}) }), onSuccess: onDone });
  if (!["REPORTED", "ASSIGNED", "IN_PROGRESS"].includes(issue.status)) return null;
  const staff = (users.data || []).filter((u: any) => u.role === "STAFF" && u.active);
  return (
    <Card>
      <h2 className="mb-3 font-bold">{issue.assignedTo ? "Re-assign issue" : "Assign to staff"}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Staff member
          <select className={`${input} mt-1 min-w-56`} value={staffId} onChange={(e) => setStaffId(e.target.value)} data-testid="assign-select">
            <option value="">Select staff…</option>{staff.map((u: any) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
          </select></label>
        <label className="text-sm font-semibold">Due date (optional)<input type="date" className={`${input} mt-1`} value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <button className={btn.primary} disabled={!staffId || m.isPending} onClick={() => m.mutate()}>Assign</button>
      </div>
      <div className="mt-2"><ErrorText e={m.error} /></div>
    </Card>
  );
}

function StaffPanel({ issue, currentAfter, onDone }: { issue: any; currentAfter: any[]; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [remarks, setRemarks] = useState("");
  const start = useMutation({ mutationFn: () => api.post(`/issues/${issue.id}/start`), onSuccess: onDone });
  const addNote = useMutation({ mutationFn: () => api.post(`/issues/${issue.id}/note`, { note }), onSuccess: () => { setNote(""); onDone(); } });
  const submit = useMutation({ mutationFn: () => api.post(`/issues/${issue.id}/submit`, { resolutionRemarks: remarks }), onSuccess: onDone });

  if (issue.status === "ASSIGNED") return <Card><h2 className="mb-2 font-bold">Start work</h2><p className="mb-3 text-sm text-muted-foreground">Mark the issue as In Progress when you begin fixing it.</p><button className={btn.primary} onClick={() => start.mutate()} disabled={start.isPending}>Start work</button><ErrorText e={start.error} /></Card>;
  if (issue.status === "VERIFICATION_PENDING") return <Card><p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-primary" /> Submitted — waiting for an inspector to verify your fix.</p></Card>;
  if (issue.status !== "IN_PROGRESS") return null;
  return (
    <Card className="space-y-5">
      <h2 className="font-bold">Update issue</h2>
      <div>
        <p className="mb-1 text-sm font-semibold">Progress update</p>
        <div className="flex gap-2"><input className={input} placeholder="e.g. Bins ordered, arriving tomorrow" value={note} onChange={(e) => setNote(e.target.value)} /><button className={btn.ghost} disabled={note.trim().length < 2 || addNote.isPending} onClick={() => addNote.mutate()}>Add</button></div>
        <ErrorText e={addNote.error} />
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">After evidence (photo of the fixed area)</p>
        <PhotoUpload label="Upload AFTER photo" fields={{ type: "AFTER", issueId: issue.id }} files={currentAfter} onUploaded={onDone} onRemove={onDone} />
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">Resolution remarks</p>
        <textarea className={input} rows={3} placeholder="Describe how the issue was fixed…" value={remarks} onChange={(e) => setRemarks(e.target.value)} data-testid="resolution-remarks" />
      </div>
      <ErrorText e={submit.error} />
      <button className={btn.primary} disabled={submit.isPending || currentAfter.length === 0 || remarks.trim().length < 5} onClick={() => submit.mutate()} data-testid="submit-verification">Submit for verification</button>
      {currentAfter.length === 0 && <p className="text-xs text-muted-foreground">Upload at least one after-photo to enable submission.</p>}
    </Card>
  );
}

function VerifyPanel({ issue, onDone }: { issue: any; onDone: () => void }) {
  const [remarks, setRemarks] = useState("");
  const m = useMutation({ mutationFn: (decision: "APPROVE" | "REJECT") => api.post(`/issues/${issue.id}/verify`, { decision, remarks }), onSuccess: onDone });
  return (
    <Card className="border-primary/40">
      <h2 className="mb-1 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 text-accent-foreground" /> Verify this fix</h2>
      <p className="mb-3 text-sm text-muted-foreground">Compare the before and after photos above and read the staff resolution, then decide.</p>
      <textarea className={input} rows={2} placeholder="Verification remarks (required when rejecting)" value={remarks} onChange={(e) => setRemarks(e.target.value)} data-testid="verify-remarks" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn.primary} disabled={m.isPending} onClick={() => m.mutate("APPROVE")} data-testid="approve-btn"><CheckCircle2 className="h-4 w-4" /> Approve & close</button>
        <button className={btn.danger} disabled={m.isPending || remarks.trim().length < 3} onClick={() => m.mutate("REJECT")} data-testid="reject-btn"><XCircle className="h-4 w-4" /> Reject</button>
      </div>
      <div className="mt-2"><ErrorText e={m.error} /></div>
    </Card>
  );
}
