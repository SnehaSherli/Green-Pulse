import { Link } from "react-router-dom";
import { useAuth, HOME } from "../lib/auth";
import { btn } from "../components/ui";

export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <p className="mono text-6xl font-bold text-primary">404</p>
        <h1 className="mt-2 text-xl font-bold">This page does not exist</h1>
        <p className="mt-1 text-sm text-muted-foreground">Check the address, or head back to a page that works.</p>
        <Link to={user ? HOME[user.role] : "/"} className={`${btn.primary} mt-5`}>{user ? "Go to my dashboard" : "Go home"}</Link>
      </div>
    </div>
  );
}
