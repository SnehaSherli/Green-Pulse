import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, Printer, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { btn, ErrorText, Modal } from "./ui";

/** Draws a REAL QR code (qrcode library) that encodes the location's inspection URL: <base>/inspect/<token> */
export default function QrModal({ location, onClose }: { location: any; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const qc = useQueryClient();
  const [loc, setLoc] = useState(location);
  const regen = useMutation({
    mutationFn: () => api.post(`/locations/${loc.id}/regenerate-qr${location.__base ? `?base=${encodeURIComponent(location.__base)}` : ""}`),
    onSuccess: (l) => { setLoc({ ...l, __base: location.__base }); qc.invalidateQueries({ queryKey: ["locations"] }); },
  });

  useEffect(() => {
    if (canvas.current) QRCode.toCanvas(canvas.current, loc.qrUrl, { width: 300, margin: 2, errorCorrectionLevel: "M", color: { dark: "#163931", light: "#ffffff" } });
  }, [loc.qrUrl]);

  const isLocal = /^https?:\/\/(localhost|127\.|\[::1\])/i.test(loc.qrUrl);
  const png = () => canvas.current!.toDataURL("image/png");

  function print() {
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`<html><head><title>${loc.name} QR</title></head><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h1 style="margin:0">GREENPULSE</h1><p style="color:#555">Swachhta & Sustainability Inspection</p>
      <h2 style="margin:24px 0 8px">${loc.name}</h2><p style="color:#555;margin:0 0 16px">${loc.code} · ${loc.department}</p>
      <img src="${png()}" style="width:340px;height:340px"/><p style="font-size:18px;margin-top:16px"><b>Scan this QR to inspect ${loc.name}</b></p>
      <p style="font-size:11px;color:#888;word-break:break-all">${loc.qrUrl}</p></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }
  function download() {
    const a = document.createElement("a"); a.href = png(); a.download = `${loc.code}-${loc.name.replace(/\s+/g, "-")}-QR.png`; a.click();
  }

  return (
    <Modal title={`QR code — ${loc.name}`} onClose={onClose}>
      <div className="text-center">
        <canvas ref={canvas} className="mx-auto rounded-xl border border-border" data-testid="qr-canvas" />
        <p className="mt-3 font-semibold">Scan this QR to inspect {loc.name}</p>
        <p className="mono mt-1 break-all text-xs text-muted-foreground" data-testid="qr-url">{loc.qrUrl}</p>
        <p className="mt-1 text-xs text-muted-foreground">QR version {loc.qrVersion} · status: {loc.status}</p>
      </div>
      {isLocal && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-accent/20 p-3 text-xs"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>This QR points to <b>localhost</b>, which a phone cannot open. Set the “QR base URL” on the Locations page to your laptop's network address (e.g. https://192.168.1.20:5173) so the phone can reach it.</span></p>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button className={btn.primary} onClick={print}><Printer className="h-4 w-4" /> Print</button>
        <button className={btn.ghost} onClick={download}><Download className="h-4 w-4" /> Download PNG</button>
        <button className={btn.ghost} disabled={regen.isPending} onClick={() => { if (confirm(`Regenerate the QR for ${loc.name}? The OLD printed QR will stop working immediately.`)) regen.mutate(); }}><RefreshCw className="h-4 w-4" /> Regenerate</button>
      </div>
      <div className="mt-2"><ErrorText e={regen.error} /></div>
    </Modal>
  );
}
