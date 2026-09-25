import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import GateDoors from "./GateDoors.jsx";
import { AdminLayout, UserLayout } from "./layouts.jsx";
import Login from "./pages/Login.jsx";
import AdminDashboard from "./pages/admin/Dashboard.jsx";
import Updates from "./pages/admin/Updates.jsx";
import Users from "./pages/admin/Users.jsx";
import Flats from "./pages/admin/Flats.jsx";
import Owners from "./pages/admin/Owners.jsx";
import Tenants from "./pages/admin/Tenants.jsx";
import AdminMaintenance from "./pages/admin/Maintenance.jsx";
import Broadcast from "./pages/admin/Broadcast.jsx";
import Reminders from "./pages/admin/Reminders.jsx";
import Account from "./pages/admin/Account.jsx";
import Reports from "./pages/admin/Reports.jsx";
import ModulePage from "./pages/admin/ModulePage.jsx";
import Shops from "./pages/admin/Shops.jsx";
import Parking from "./pages/admin/Parking.jsx";
import Documents from "./pages/admin/Documents.jsx";
import Complaints from "./pages/admin/Complaints.jsx";
import Slips from "./pages/Slips.jsx";
import Chat from "./pages/Chat.jsx";
import UserDashboard from "./pages/user/Dashboard.jsx";
import OwnerDetails from "./pages/user/OwnerDetails.jsx";
import RentDetails from "./pages/user/RentDetails.jsx";
import UserMaintenance from "./pages/user/Maintenance.jsx";

function Guard({ panel }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/" replace />;
  if (session.panel !== panel) {
    return <Navigate to={session.panel === "admin" ? "/admin" : "/app"} replace />;
  }
  return panel === "admin" ? <AdminLayout /> : <UserLayout />;
}

export default function App() {
  return (
    <>
      <GateDoors />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<Guard panel="admin" />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/wings" element={<Flats />} />
          <Route path="/admin/flats" element={<Navigate to="/admin/wings" replace />} />
          <Route path="/admin/residents" element={<Users />} />
          <Route path="/admin/users" element={<Navigate to="/admin/residents" replace />} />
          <Route path="/admin/shops" element={<Shops />} />
          <Route path="/admin/parking" element={<Parking />} />
          <Route path="/admin/visitors" element={<ModulePage slug="visitors" />} />
          <Route path="/admin/complaints" element={<Complaints />} />
          <Route path="/admin/maintenance" element={<AdminMaintenance />} />
          <Route path="/admin/payments" element={<Slips title="Payments & paid slips" />} />
          <Route path="/admin/slips" element={<Navigate to="/admin/payments" replace />} />
          <Route path="/admin/notices" element={<Updates />} />
          <Route path="/admin/updates" element={<Navigate to="/admin/notices" replace />} />
          <Route path="/admin/events" element={<ModulePage slug="events" />} />
          <Route path="/admin/staff" element={<ModulePage slug="staff" />} />
          <Route path="/admin/security" element={<ModulePage slug="security" />} />
          <Route path="/admin/documents" element={<Documents />} />
          <Route path="/admin/reports" element={<Reports />} />
          <Route path="/admin/owners" element={<Owners />} />
          <Route path="/admin/tenants" element={<Tenants />} />
          <Route path="/admin/broadcast" element={<Broadcast />} />
          <Route path="/admin/chat" element={<Chat />} />
          <Route path="/admin/reminders" element={<Reminders />} />
          <Route path="/admin/account" element={<Account />} />
        </Route>
        <Route element={<Guard panel="user" />}>
          <Route path="/app" element={<UserDashboard />} />
          <Route path="/app/notices" element={<Updates />} />
          <Route path="/app/events" element={<ModulePage slug="events" resident />} />
          <Route path="/app/complaints" element={<Complaints resident />} />
          <Route path="/app/visitors" element={<ModulePage slug="visitors" resident />} />
          <Route path="/app/parking" element={<Parking resident />} />
          <Route path="/app/documents" element={<Documents resident />} />
          <Route path="/app/owner" element={<OwnerDetails />} />
          <Route path="/app/rent" element={<RentDetails />} />
          <Route path="/app/maintenance" element={<UserMaintenance />} />
          <Route path="/app/slips" element={<Slips title="My payments" />} />
          <Route path="/app/chat" element={<Chat />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
