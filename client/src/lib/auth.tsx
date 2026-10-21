import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Role = "ADMIN" | "INSPECTOR" | "STAFF";
export interface User { id: string; name: string; email: string; role: Role }

export const HOME: Record<Role, string> = { ADMIN: "/admin/dashboard", INSPECTOR: "/inspector/dashboard", STAFF: "/staff/dashboard" };

interface Ctx { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<User>; logout: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  // Ask the server who we are. The role comes from MongoDB via the server — never chosen by the user.
  useEffect(() => {
    api.get("/auth/me").then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post("/auth/login", { email, password });
    qc.clear();
    setUser(r.user);
    return r.user as User;
  }, [qc]);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    qc.clear();
    setUser(null);
  }, [qc]);

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}
