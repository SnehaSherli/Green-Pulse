import { Navigate, Route, Routes, useParams } from "react-router-dom";
import Shell from "./components/Layout";
import { RequireRole } from "./components/Guards";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Notifications from "./pages/shared/Notifications";
import IssueDetail from "./pages/shared/IssueDetail";
import InspectionDetail from "./pages/shared/InspectionDetail";
import InspectionList from "./pages/shared/InspectionList";
import AdminDashboard from "./pages/admin/Dashboard";
import Locations from "./pages/admin/Locations";
import Standards from "./pages/admin/Standards";
import Issues from "./pages/admin/Issues";
import Impact from "./pages/admin/Impact";
import Reports from "./pages/admin/Reports";
import Team from "./pages/admin/Team";
import InspectorDashboard from "./pages/inspector/Dashboard";
import Scan from "./pages/inspector/Scan";
import Inspect from "./pages/inspector/Inspect";
import Verifications from "./pages/inspector/Verifications";
import StaffDashboard from "./pages/staff/Dashboard";
import StaffIssues from "./pages/staff/Issues";

const RedirectInspect = () => { const { token } = useParams(); return <Navigate to={`/inspect/${token}`} replace />; };

/**
 * Every page is served by the same index.html, so any URL can be opened directly or refreshed.
 * Guards: not signed in -> /login?next=<url>; wrong role -> 403 "Access restricted" page.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      <Route path="/admin" element={<RequireRole role="ADMIN"><Shell /></RequireRole>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="locations" element={<Locations />} />
        <Route path="standards" element={<Standards />} />
        <Route path="issues" element={<Issues />} />
        <Route path="issues/:id" element={<IssueDetail />} />
        <Route path="inspections" element={<InspectionList />} />
        <Route path="inspections/:id" element={<InspectionDetail />} />
        <Route path="impact" element={<Impact />} />
        <Route path="environmental-impact" element={<Navigate to="/admin/impact" replace />} />
        <Route path="reports" element={<Reports />} />
        <Route path="team" element={<Team />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* QR URL target: /inspect/<token>. INSPECTOR only — others see the 403 page. */}
      <Route element={<RequireRole role="INSPECTOR"><Shell /></RequireRole>}>
        <Route path="/inspect/:token" element={<Inspect />} />
      </Route>
      <Route path="/inspector/inspect/:token" element={<RedirectInspect />} />

      <Route path="/inspector" element={<RequireRole role="INSPECTOR"><Shell /></RequireRole>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<InspectorDashboard />} />
        <Route path="scan" element={<Scan />} />
        <Route path="verifications" element={<Verifications />} />
        <Route path="verifications/:id" element={<IssueDetail />} />
        <Route path="inspections" element={<InspectionList />} />
        <Route path="inspections/:id" element={<InspectionDetail />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/staff" element={<RequireRole role="STAFF"><Shell /></RequireRole>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<StaffDashboard />} />
        <Route path="issues" element={<StaffIssues />} />
        <Route path="issues/:id" element={<IssueDetail />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
