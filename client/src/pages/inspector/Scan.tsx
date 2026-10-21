import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, ImageUp, Link2 } from "lucide-react";
import { btn, Card, ErrorText, input, PageHeader } from "../../components/ui";

/** Accepts a full URL (…/inspect/<token>) or a bare token and returns the token, otherwise null. */
export function extractToken(text: string): string | null {
  const m = text.match(/\/inspect\/([a-f0-9]{16,128})/i) || text.trim().match(/^([a-f0-9]{32,128})$/i);
  return m ? m[1] : null;
}

export default function Scan() {
  const nav = useNavigate();
  const scanner = useRef<Html5Qrcode | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const handled = useRef(false);

  const secure = window.isSecureContext;

  function handleText(text: string) {
    if (handled.current) return;
    const token = extractToken(text);
    if (!token) { setError("That QR code is not a GreenPulse location code."); return; }
    handled.current = true;
    stop().finally(() => nav(`/inspect/${token}`)); // the BACKEND validates the token against MongoDB on the next page
  }

  async function start() {
    setError(null); handled.current = false;
    try {
      const s = new Html5Qrcode("qr-reader", { verbose: false });
      scanner.current = s;
      // no qrbox => the WHOLE camera frame is scanned, so the QR can be at any distance / position
      await s.start({ facingMode: "environment" }, { fps: 12 }, handleText, () => undefined);
      setRunning(true);
    } catch (e: any) {
      setRunning(false);
      setError(!secure
        ? "The browser blocks camera access on non-secure (http) pages. Open GreenPulse over https (npm run dev:https) or use “Scan from a photo” below."
        : `Could not start the camera: ${e?.message || e}. Allow camera permission and try again.`);
    }
  }
  async function stop() {
    const s = scanner.current;
    if (s?.isScanning) await s.stop().catch(() => undefined);
    setRunning(false);
  }
  useEffect(() => () => { const s = scanner.current; if (s?.isScanning) s.stop().catch(() => undefined); }, []);

  async function fromFile(f?: File | null) {
    if (!f) return;
    setError(null); handled.current = false;
    try {
      const s = new Html5Qrcode("qr-file-reader", { verbose: false });
      handleText(await s.scanFile(f, false));
    } catch { setError("No QR code could be read from that image."); }
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <>
      <PageHeader title="QR inspection scanner" sub="Point your camera at a location's QR code to open its inspection." />
      <div className="mx-auto max-w-lg space-y-4">
        <Card>
          <div id="qr-reader" className="overflow-hidden rounded-xl bg-black/5" style={{ minHeight: running ? undefined : 0 }} data-testid="qr-reader" />
          {!running && <div className="flex h-56 flex-col items-center justify-center rounded-xl bg-muted text-muted-foreground"><Camera className="mb-2 h-8 w-8" /><p className="text-sm">Point your camera at the location QR code.</p></div>}
          <div className="mt-4 flex gap-2">
            {!running ? <button className={`${btn.primary} flex-1`} onClick={start} data-testid="start-camera"><Camera className="h-4 w-4" /> Start camera</button>
              : <button className={`${btn.ghost} flex-1`} onClick={stop}><CameraOff className="h-4 w-4" /> Stop camera</button>}
          </div>
          {error && <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="scan-error">{error}</p>}
          {!secure && !error && <p className="mt-3 rounded-lg bg-accent/20 p-3 text-xs">Heads-up: this page is not on https, so the phone browser may refuse camera access. Use the https demo address or the photo option below.</p>}
        </Card>
        <Card>
          <h2 className="mb-2 text-sm font-bold">Other ways to open a location</h2>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => fromFile(e.target.files?.[0])} data-testid="scan-file" />
          <button className={btn.ghost} onClick={() => fileInput.current?.click()}><ImageUp className="h-4 w-4" /> Scan from a photo / screenshot</button>
          <div id="qr-file-reader" className="hidden" />
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); handleText(manual); }}>
            <input className={input} placeholder="Paste QR link or token" value={manual} onChange={(e) => setManual(e.target.value)} data-testid="manual-token" />
            <button className={btn.ghost}><Link2 className="h-4 w-4" /> Open</button>
          </form>
          <ErrorText e={null} />
        </Card>
        <p className="text-center text-xs text-muted-foreground">Opening a location this way still requires the backend to recognise the QR token — nothing is trusted from the browser.</p>
      </div>
    </>
  );
}
