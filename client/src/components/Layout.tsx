import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, ClipboardCheck, FileBarChart, Gauge, History, Leaf, ListChecks, LogOut, MapPin, Menu, ScanLine, Trees, Users, Wrench, X, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { Role, useAuth } from "../lib/auth";
import { cn, today } from "../lib/utils";

const NAV: Record<Role, { to: string; label: string; icon: any }[]> = {
  ADMIN: [
    { to: "/admin/dashboard", label: "Dashboard", icon: Gauge },
    { to: "/admin/locations", label: "Locations & QR", icon: MapPin },
    { to: "/admin/standards", label: "Standards", icon: ListChecks },
    { to: "/admin/issues", label: "Issue desk", icon: Wrench },
    { to: "/admin/inspections", label: "Inspections", icon: ClipboardCheck },
    { to: "/admin/impact", label: "Environmental impact", icon: Trees },
    { to: "/admin/reports", label: "Reports", icon: FileBarChart },
    { to: "/admin/team", label: "Team", icon: Users },
    { to: "/admin/notifications", label: "Notifications", icon: Bell },
  ],
  INSPECTOR: [
    { to: "/inspector/dashboard", label: "Dashboard", icon: Gauge },
    { to: "/inspector/scan", label: "Scan QR", icon: ScanLine },
    { to: "/inspector/verifications", label: "Verification queue", icon: ShieldCheck },
    { to: "/inspector/inspections", label: "My inspections", icon: History },
    { to: "/inspector/notifications", label: "Notifications", icon: Bell },
  ],
  STAFF: [
    { to: "/staff/dashboard", label: "Dashboard", icon: Gauge },
    { to: "/staff/issues", label: "Assigned issues", icon: Wrench },
    { to: "/staff/notifications", label: "Notifications", icon: Bell },
  ],
};

const ROLE_BADGE: Record<Role, string> = { ADMIN: "bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]", INSPECTOR: "bg-sky-200 text-sky-950", STAFF: "bg-emerald-200 text-emerald-950" };

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wider", ROLE_BADGE[role], className)}>{role}</span>;
}

export default function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = useQuery({ queryKey: ["notifications"], queryFn: () => api.get("/notifications"), refetchInterval: 15000 });
  if (!user) return null;
  const count = unread.data?.unread ?? 0;

  const side = (
    <div className="flex h-full flex-col bg-sidebar p-4 text-sidebar-foreground">
      <div className="mb-6 flex items-center gap-2.5 px-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Leaf className="h-5 w-5" /></span>
        <div><p className="text-base font-extrabold leading-none tracking-wide">GREENPULSE</p><p className="mt-1 text-[10px] uppercase tracking-widest opacity-60">Swachhta & Sustainability</p></div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {NAV[user.role].map((n) => (
          <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)} className={({ isActive }) => cn("nav-link", isActive && "nav-active")}>
            <n.icon className="h-4 w-4" /> <span className="flex-1">{n.label}</span>
            {n.label === "Notifications" && count > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">{count}</span>}
          </NavLink>
        ))}
      </nav>
      {/* Who is logged in — visible at all times so the role is obvious during the demo */}
      <div className="mt-4 rounded-xl border border-sidebar-border bg-sidebar-accent p-3" data-testid="user-card">
        <div className="mb-1 flex items-center justify-between gap-2"><p className="truncate text-sm font-bold">{user.name}</p><RoleBadge role={user.role} /></div>
        <p className="truncate text-xs opacity-70">{user.email}</p>
        <p className="mt-1 text-[11px] font-semibold opacity-90">Role: {user.role}</p>
        <button onClick={async () => { await logout(); nav("/login"); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border py-2 text-xs font-semibold hover:bg-sidebar"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{side}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><div className="absolute left-0 top-0 h-full w-72">{side}</div></div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button className="rounded-lg border border-border p-2 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
            <span className="hidden text-sm text-muted-foreground sm:block">{today()}</span>
          </div>
          <div className="flex items-center gap-3 text-right" data-testid="header-user">
            <div className="leading-tight"><p className="text-sm font-bold">{user.name}</p><p className="text-[11px] text-muted-foreground">{user.email}</p></div>
            <RoleBadge role={user.role} className="text-xs" />
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
