import { FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Leaf } from "lucide-react";
import { HOME, useAuth } from "../lib/auth";
import { btn, ErrorText, input } from "../components/ui";

const DEMO = [
  { email: "admin@gmail.com", label: "Admin" },
  { email: "inspector@gmail.com", label: "Inspector" },
  { email: "staff@gmail.com", label: "Staff" },
];
const DEMO_PASSWORD = "GreenPulse@123";

// only follow internal paths (prevents open-redirects)
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : null);

export default function Login() {
  const { user, login, loading } = useAuth();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={safeNext(sp.get("next")) || HOME[user.role]} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const u = await login(email, password); // role is looked up by the server from MongoDB
      nav(safeNext(sp.get("next")) || HOME[u.role], { replace: true });
    } catch (e2) { setErr(e2); } finally { setBusy(false); }
  }

  return (
    <div className="surface-grid flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar text-sidebar-primary"><Leaf className="h-6 w-6" /></span>
          <h1 className="text-2xl font-extrabold tracking-wide">GREENPULSE</h1>
          <p className="text-sm text-muted-foreground">Intelligent Swachhta & Sustainability Compliance Monitoring</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-card-border bg-card p-6 soft-shadow">
          <h2 className="text-lg font-bold">Sign in</h2>
          {sp.get("next")?.startsWith("/inspect/") && <p className="rounded-lg bg-muted p-3 text-sm">Sign in as an <b>inspector</b> to open this location's inspection.</p>}
          <label className="block text-sm font-semibold">Email<input className={`${input} mt-1`} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="block text-sm font-semibold">Password<input className={`${input} mt-1`} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <ErrorText e={err} />
          <button className={`${btn.primary} w-full`} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="text-center text-xs text-muted-foreground">Your role is detected automatically after you sign in.</p>
        </form>
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/60 p-4 text-sm">
          <p className="mb-2 font-semibold">Demo accounts <span className="font-normal text-muted-foreground">(click to fill — password <code className="mono">{DEMO_PASSWORD}</code>)</span></p>
          <div className="flex flex-wrap gap-2">
            {DEMO.map((d) => <button key={d.email} type="button" className={btn.ghost} onClick={() => { setEmail(d.email); setPassword(DEMO_PASSWORD); }}>{d.email}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
}
