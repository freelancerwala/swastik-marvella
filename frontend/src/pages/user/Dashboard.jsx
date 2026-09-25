import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, decorateUpdate } from "../../api";
import { Badge, Btn, money } from "../../ui.jsx";
import { Ico } from "../../icons.jsx";
import { useAuth } from "../../AuthContext.jsx";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function UserDashboard() {
  const { session } = useAuth();
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/api/dashboard").then((row) => setData({ ...row, updates: row.updates.map(decorateUpdate) })); }, []);
  if (!data) return <p className="hint">Loading your home...</p>;
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <section className="dash-welcome">
        <div>
          <span className="dash-kicker">{session?.role === "owner" ? "Owner panel" : "Rent panel"}</span>
          <h2>{greeting()}, {session?.name?.split(" ")[0]}</h2>
          <p>{data.society}{data.my_flat ? ` · Flat ${data.my_flat}` : ""} · {today}</p>
        </div>
        <div className="welcome-actions">
          <Btn icon="payments" to="/app/maintenance">Pay maintenance</Btn>
          <Btn icon="receipt_long" className="btn ghost" to="/app/slips">My slips</Btn>
        </div>
      </section>
      <div className="module-grid dash-grid">
        <Link to="/app/maintenance" className="module-card">
          <span className="module-icon kpi-ico"><Ico name="maintenance" size={18} /></span>
          <div><span>Remaining</span><strong>{money(data.remaining_maintenance)}</strong></div>
        </Link>
        <Link to="/app/slips" className="module-card">
          <span className="module-icon kpi-ico"><Ico name="payments" size={18} /></span>
          <div><span>Paid slips</span><strong>{data.confirmed_slips}</strong></div>
        </Link>
        <Link to={session?.role === "owner" ? "/app/owner" : "/app/rent"} className="module-card">
          <span className="module-icon kpi-ico"><Ico name={session?.role === "owner" ? "owners" : "rent"} size={18} /></span>
          <div><span>{session?.role === "owner" ? "My owner details" : "My rent details"}</span><strong>{data.my_flat || "—"}</strong></div>
        </Link>
        {session?.role === "owner" ? (
          <Link to="/app/rent" className="module-card">
            <span className="module-icon kpi-ico"><Ico name="rent" size={18} /></span>
            <div><span>House on rent</span><strong>{data.active_tenants || 0}</strong></div>
          </Link>
        ) : null}
      </div>
      <div className="stats">
        <div className="stat"><span>Unpaid months</span><strong>{data.unpaid_charges}</strong></div>
        <div className="stat"><span>Pending review</span><strong>{data.pending_payments}</strong></div>
        <div className="stat"><span>Paid slips</span><strong>{data.confirmed_slips}</strong></div>
        <div className="stat"><span>Alerts</span><strong>{data.unread_notifications}</strong></div>
      </div>
      <div className="grid-2">
        <section className="card">
          <h3>Your flat</h3>
          <p className="hint">{data.my_flat ? `Flat ${data.my_flat}` : "No flat linked yet."} Pay from Maintenance, then the slip appears under Payments.</p>
        </section>
        <section className="card">
          <h3>If maintenance is not paid</h3>
          {data.remaining_items.length === 0 ? <p className="empty">No remaining dues on your flat.</p> : (
            <table>
              <thead><tr><th>Month</th><th>Remaining</th><th>Status</th></tr></thead>
              <tbody>
                {data.remaining_items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.month}</td>
                    <td>{money(row.remaining_amount)}</td>
                    <td><Badge value={row.payment_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
