import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Ico } from "../../icons.jsx";
import { PageHeader, money } from "../../ui.jsx";

const rows = [
  ["Wings & Flats", "/admin/wings", "flats", "flats"],
  ["Residents", "/admin/residents", "residents", "owners"],
  ["Shops", "/admin/shops", "shops", "shop"],
  ["Parking", "/admin/parking", "parking", "parking"],
  ["Visitors", "/admin/visitors", "visitors", "visitor"],
  ["Complaints", "/admin/complaints", "complaints", "complaint"],
  ["Maintenance", "/admin/maintenance", "maintenance", "unpaid"],
  ["Payments", "/admin/payments", "payments", "slips"],
  ["Notices", "/admin/notices", "notices", "notices"],
  ["Events", "/admin/events", "events", "event"],
  ["Staff", "/admin/staff", "staff", "staff"],
  ["Security", "/admin/security", "security", "security"],
  ["Documents", "/admin/documents", "documents", "document"],
];

export default function Reports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/api/dashboard"), api.get("/api/society/summary")])
      .then(([dash, counts]) => setData({ dash, counts }))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="hint">Loading reports...</p>;

  const valueFor = (key) => {
    if (key === "flats") return data.dash.flats;
    if (key === "owners") return data.dash.owners;
    if (key === "unpaid") return data.dash.unpaid_charges;
    if (key === "slips") return data.dash.confirmed_slips;
    if (key === "notices") return data.dash.updates?.length || 0;
    return data.counts[key] || 0;
  };

  return (
    <>
      <PageHeader icon="reports" title="Reports" blurb="Society snapshot across flats, people, money, and operations." kicker="Operations intelligence" />
      <div className="kpi-grid kpi-4">
        <article className="kpi-card"><div className="kpi-top"><span>Remaining</span><span className="kpi-ico"><Ico name="payments" size={16} /></span></div><strong>{money(data.dash.remaining_maintenance)}</strong><p>Open dues</p><footer>{data.dash.unpaid_charges} unpaid months</footer></article>
        <article className="kpi-card"><div className="kpi-top"><span>Proofs</span><span className="kpi-ico"><Ico name="folder" size={16} /></span></div><strong>{data.dash.pending_payments}</strong><p>Pending review</p><footer>Payment screenshots</footer></article>
        <article className="kpi-card"><div className="kpi-top"><span>Rent</span><span className="kpi-ico"><Ico name="real_estate_agent" size={16} /></span></div><strong>{data.dash.active_tenants}</strong><p>Active tenants</p><footer>Live occupancy</footer></article>
        <article className="kpi-card"><div className="kpi-top"><span>Slips</span><span className="kpi-ico"><Ico name="receipt_long" size={16} /></span></div><strong>{data.dash.confirmed_slips}</strong><p>Confirmed receipts</p><footer>Paid months</footer></article>
      </div>
      <div className="module-grid">
        {rows.map(([label, to, icon, key]) => (
          <Link key={to} to={to} className="module-card">
            <span className="module-icon kpi-ico"><Ico name={icon} size={18} /></span>
            <div>
              <span>{label}</span>
              <strong>{valueFor(key)}</strong>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
