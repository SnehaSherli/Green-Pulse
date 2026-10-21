import { Link, Navigate } from "react-router-dom";
import { Eye, Leaf, ShieldCheck, ScanLine, Wrench, Sparkles } from "lucide-react";
import { HOME, useAuth } from "../lib/auth";
import { btn } from "../components/ui";

const STEPS = [
  { icon: ScanLine, t: "Inspect", d: "Scan a location's QR and complete the digital checklist." },
  { icon: Eye, t: "Detect", d: "Failed standards become issues with severity and risk flags." },
  { icon: Wrench, t: "Act", d: "Admin assigns, staff fix and upload after-evidence." },
  { icon: ShieldCheck, t: "Verify", d: "Inspector compares before/after photos and approves." },
  { icon: Sparkles, t: "Improve", d: "Scores, trends and environmental impact update live." },
];

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to={HOME[user.role]} replace />;
  return (
    <div className="surface-grid min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between p-5">
        <div className="flex items-center gap-2 font-extrabold tracking-wide"><Leaf className="h-5 w-5 text-primary" /> GREENPULSE</div>
        <Link to="/login" className={btn.primary}>Sign in</Link>
      </header>
      <section className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Cleaner campuses, <span className="text-primary">proven by data.</span></h1>
        <p className="mt-4 text-lg text-muted-foreground">Intelligent Swachhta & Sustainability Compliance Monitoring for colleges, companies, hospitals and campuses.</p>
        <Link to="/login" className={`${btn.primary} mt-8 px-6 py-3 text-base`}>Sign in to GreenPulse</Link>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-5 pb-20 sm:grid-cols-5">
        {STEPS.map((s) => (
          <div key={s.t} className="rounded-xl border border-card-border bg-card p-4 soft-shadow">
            <s.icon className="h-5 w-5 text-primary" /><p className="mt-2 font-bold">{s.t}</p><p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
