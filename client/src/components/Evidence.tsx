import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { btn, ErrorText } from "./ui";
import { fmtDateTime } from "../lib/utils";

export function EvidenceGallery({ items, empty = "No photos" }: { items: any[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((e) => (
        <a key={e.id} href={e.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
          <img src={e.url} alt={`${e.type} evidence`} className="h-32 w-full object-cover" />
          <div className="bg-muted px-2 py-1 text-[11px] text-muted-foreground">{e.uploadedBy?.name} · {fmtDateTime(e.createdAt)}</div>
        </a>
      ))}
    </div>
  );
}

/** Uploads a photo to POST /api/evidence (file stored on the server, metadata in MongoDB). */
export function PhotoUpload({ fields, label, onUploaded, files, onRemove }: { fields: Record<string, string>; label: string; onUploaded: (ev: any) => void; files?: any[]; onRemove?: (ev: any) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  async function pick(f?: File | null) {
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      fd.append("file", f);
      onUploaded(await api.upload("/evidence", fd));
    } catch (e) { setErr(e); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  async function remove(ev: any) {
    try { await api.del(`/evidence/${ev.id}`); onRemove?.(ev); } catch (e) { setErr(e); }
  }

  return (
    <div className="space-y-2">
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} data-testid="photo-input" />
      <button type="button" className={btn.ghost} disabled={busy} onClick={() => ref.current?.click()}>
        <Camera className="h-4 w-4" /> {busy ? "Uploading…" : label}
      </button>
      {!!files?.length && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <div key={f.id} className="relative">
              <img src={f.url} alt="evidence" className="h-20 w-20 rounded-lg border border-border object-cover" />
              <button type="button" onClick={() => remove(f)} className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-1 text-white" aria-label="Remove photo"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}
      <ErrorText e={err} />
    </div>
  );
}
