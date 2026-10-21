import { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { HOME, Role, useAuth } from "../lib/auth";
import { RoleBadge } from "./Layout";
import { btn } from "./ui";

/** Frontend guard. (The backend enforces the same rules independently on every API call.) */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (user.role !== role) return <AccessRestricted />;
  return <>{children}</>;
}

export function AccessRestricted() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-2xl border border-card-border bg-card p-8 text-center soft-shadow" data-testid="access-restricted">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-3 text-xl font-bold">403 — Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are signed in as <b>{user?.name}</b> ({user?.email}) <RoleBadge role={user!.role} />. This page is not available to your role
          {" "}— for example only an INSPECTOR can carry out an inspection.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to={user ? HOME[user.role] : "/"} className={btn.primary}>Go to my dashboard</Link>
          <button className={btn.ghost} onClick={() => logout()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
