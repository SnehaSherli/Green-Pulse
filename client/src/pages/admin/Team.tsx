import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { btn, Card, ErrorText, input, PageHeader, QueryState, Table } from "../../components/ui";
import { RoleBadge } from "../../components/Layout";
import { fmtDateTime } from "../../lib/utils";

export default function Team() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["users"], queryFn: () => api.get("/users") });
  const [f, setF] = useState({ name: "", email: "", password: "", role: "STAFF" });
  const done = () => qc.invalidateQueries({ queryKey: ["users"] });
  const create = useMutation({ mutationFn: () => api.post("/users", f), onSuccess: () => { setF({ name: "", email: "", password: "", role: "STAFF" }); done(); } });
  const patch = useMutation({ mutationFn: ({ id, body }: any) => api.patch(`/users/${id}`, body), onSuccess: done });
  return (
    <>
      <PageHeader title="Team & access" sub="Roles are stored in MongoDB; the server decides what each person may do." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2"><QueryState q={q}>{(list) => (
          <Table head={["Name", "Email", "Role", "Last login", "Active"]}>
            {list.map((u: any) => (
              <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                <td className="font-semibold">{u.name}{u.id === user!.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</td><td className="text-xs">{u.email}</td>
                <td><select className="rounded-md border border-input bg-background px-2 py-1 text-xs" value={u.role} disabled={u.id === user!.id} onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value } })}>{["ADMIN", "INSPECTOR", "STAFF"].map((r) => <option key={r}>{r}</option>)}</select> <RoleBadge role={u.role} /></td>
                <td className="text-xs">{fmtDateTime(u.lastLoginAt)}</td>
                <td><button className={btn.ghost} disabled={u.id === user!.id} onClick={() => patch.mutate({ id: u.id, body: { active: !u.active } })}>{u.active ? "Deactivate" : "Activate"}</button></td>
              </tr>
            ))}
          </Table>
        )}</QueryState><div className="mt-3"><ErrorText e={patch.error} /></div></Card>
        <Card>
          <h2 className="mb-3 font-bold">Add team member</h2>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <input className={input} placeholder="Full name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input className={input} type="email" placeholder="Email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input className={input} type="password" placeholder="Password (min 8 characters)" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <select className={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{["STAFF", "INSPECTOR", "ADMIN"].map((r) => <option key={r}>{r}</option>)}</select>
            <ErrorText e={create.error} /><button className={`${btn.primary} w-full`} disabled={create.isPending}>Create user</button>
          </form>
        </Card>
      </div>
    </>
  );
}
