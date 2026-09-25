import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, decorateUpdate } from "../../api";
import { Ico } from "../../icons.jsx";
import { ago, compactMoney, Btn } from "../../ui.jsx";
import { useAuth } from "../../AuthContext.jsx";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function MonthCalendar({ marks = [] }) {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const today = new Date();
  const label = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i -= 1) cells.push({ day: prevDays - i, muted: true });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayMarks = marks.filter((item) => item.date === date);
    cells.push({
      day,
      date,
      today: today.getFullYear() === year && today.getMonth() === month && today.getDate() === day,
      kind: dayMarks[0]?.kind,
      title: dayMarks.map((item) => item.label).filter(Boolean).join(", "),
    });
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: next, muted: true, filler: true });
    next += 1;
  }

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3><Ico name="events" size={16} /> {label}</h3>
        <div className="cal-nav">
          <button className="icon-btn sm" type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month"><Ico name="chevron_left" size={18} /></button>
          <button className="icon-btn sm" type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month"><Ico name="chevron_right" size={18} /></button>
        </div>
      </div>
      <div className="cal-week">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="cal-grid">
        {cells.map((cell, index) => {
          const destination = cell.kind === "notice" || cell.kind === "event" ? "/admin/notices" : "/admin/maintenance";
          if (cell.muted) {
            return (
              <div key={`${cell.day}-${index}`} className="cal-day muted">
                {cell.filler ? "" : cell.day}
              </div>
            );
          }
          return (
            <button
              key={`${cell.day}-${index}`}
              type="button"
              className={`cal-day${cell.today ? " today" : ""}${cell.kind ? ` mark-${cell.kind}` : ""}`}
              title={cell.title || "Open maintenance"}
              onClick={() => navigate(destination)}
            >
              {cell.day}
              {cell.kind ? <i /> : null}
            </button>
          );
        })}
      </div>
      <div className="cal-legend">
        <span><i className="dot event" /> Event</span>
        <span><i className="dot maintenance" /> Maintenance</span>
        <span><i className="dot notice" /> Notice</span>
        <span><i className="dot due" /> Due date</span>
      </div>
    </section>
  );
}

export default function AdminDashboard() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/dashboard").then((row) => setData({ ...row, updates: row.updates.map(decorateUpdate) })).catch((e) => setError(e.message));
  }, []);

  const shops = data?.shops_overview || { total: 0, occupied: 0, vacant: 0, retailers: [] };
  const wings = data?.wings || [];

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="hint">Loading dashboard...</p>;

  const kpis = [
    ["flats", "Flats", data.flats, wings.map((w) => `Wing ${w.wing}: ${w.flats}`).join(" • ") || "Wings A & B", `${data.occupancy || 0}% occupancy`, "/admin/wings"],
    ["shops", "Shops", shops.total, "Commercial arcade", `${shops.occupied} occupied`, "/admin/shops"],
    ["residents", "Residents", data.owners + data.active_tenants, `${data.owners} owner • ${data.active_tenants} rent`, "Wing-wise directory", "/admin/residents"],
    ["payments", "Due", compactMoney(data.remaining_maintenance), `${data.unpaid_charges} unpaid months`, `${data.confirmed_slips} slips`, "/admin/maintenance"],
    ["parking", "Parking", data.society_counts?.parking || 0, "Basement & ground", "Allotments", "/admin/parking"],
  ];

  return (
    <div className="command">
      <section className="dash-welcome">
        <div>
          <span className="dash-kicker">Executive command center</span>
          <h2>{greeting()}, {session?.name?.split(" ")[0] || "Secretary"}</h2>
          <p>
            Today’s society overview for {wings.length ? wings.map((wing) => `Wing ${wing.wing}`).join(", ") : "Swastik Marvella"}
            {shops.total ? " & commercial shops" : ""}.
          </p>
        </div>
        <div className="welcome-actions">
          <Btn icon="apartment" className="btn ghost" to="/admin/wings">Wings & flats</Btn>
          <Btn icon="badge" className="btn ghost" to="/admin/residents">Residents</Btn>
          <Btn icon="payments" to="/admin/maintenance">Record payment</Btn>
        </div>
      </section>

      <div className="kpi-grid kpi-4">
        {kpis.map(([icon, label, value, sub, foot, to]) => (
          <Link key={label} className="kpi-card" to={to}>
            <div className="kpi-top">
              <span>{label}</span>
              <em className="module-icon kpi-ico"><Ico name={icon} size={16} /></em>
            </div>
            <strong>{value}</strong>
            <p>{sub}</p>
            <footer>{foot}</footer>
          </Link>
        ))}
      </div>

      <div className="dash-split">
        <div className="dash-main">
          <div className="panel-head tight">
            <h3><Ico name="flats" size={16} /> Units & property structure</h3>
            <Link to="/admin/wings">Manage all units →</Link>
          </div>
          <div className="wing-grid">
            {wings.length === 0 ? (
              <section className="panel-card">
                <p className="empty">No wings yet. Add flats to see occupancy by tower.</p>
                <Link className="btn small" to="/admin/wings"><Ico name="add" size={14} /> Add flats</Link>
              </section>
            ) : wings.map((wing) => (
              <Link key={wing.wing} className="panel-card wing-card" to={`/admin/wings?wing=${wing.wing}`}>
                <div className="wing-top">
                  <div>
                    <span className="eyebrow">Residential tower</span>
                    <h3>Wing {wing.wing}</h3>
                  </div>
                  <span className="pill">{wing.flats} flats</span>
                </div>
                <div className="occ-row">
                  <span>Occupancy level</span>
                  <strong>{wing.occupancy}%</strong>
                </div>
                <div className="occ-bar"><span style={{ width: `${Math.min(wing.occupancy, 100)}%` }} /></div>
                <div className="chip-grid">
                  <div><span className="dot ok" /> Occupied <b>{wing.occupied}</b></div>
                  <div><span className="dot muted" /> Vacant <b>{wing.vacant}</b></div>
                  <div>Owners <b>{wing.owners}</b></div>
                  <div>Tenants <b>{wing.tenants}</b></div>
                </div>
                <span className="text-link">View Wing {wing.wing} flats →</span>
              </Link>
            ))}
          </div>

          <section className="panel-card arcade-card click-card" onClick={() => navigate("/admin/shops")} onKeyDown={(e) => { if (e.key === "Enter") navigate("/admin/shops"); }} role="link" tabIndex={0}>
            <div className="wing-top">
              <div>
                <span className="eyebrow">Retail & leasing</span>
                <h3>Ground floor commercial arcade</h3>
              </div>
              <span className="pill">{shops.total} total units</span>
            </div>
            <div className="arcade-stats">
              <div><span>Occupied units</span><strong>{shops.occupied}</strong></div>
              <div><span>Vacant / available</span><strong>{shops.vacant}</strong></div>
              <div className="due"><span>Maintenance due</span><strong>{compactMoney(data.remaining_maintenance)}</strong></div>
            </div>
            <span className="eyebrow">Key active retailers</span>
            <div className="retailer-grid">
              {shops.retailers.length === 0 ? <p className="hint">No shops added yet.</p> : shops.retailers.map((shop) => (
                <Link key={shop.code} className="retailer" to="/admin/shops" onClick={(e) => e.stopPropagation()}>
                  <b>{shop.code}</b>
                  <div>
                    <strong>{shop.title}</strong>
                    <span>{shop.detail || "Shop"}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-head">
              <h3><Ico name="payments" size={16} /> Recent society activity</h3>
              <Link to="/admin/payments">Open payments</Link>
            </div>
            <div className="activity-list">
              {(data.activity || []).length === 0 ? <p className="empty">Activity will appear as payments, visitors, and complaints are recorded.</p> : data.activity.map((item, index) => (
                <Link key={`${item.title}-${index}`} to={item.link || "/admin"} className="activity-row">
                  <span className={`activity-ico ${item.kind}`}><Ico name={item.kind === "payment" ? "payments" : item.kind === "security" ? "security" : item.kind === "maintenance" ? "complaints" : item.kind === "resident" ? "residents" : item.kind === "commercial" ? "shops" : "notices"} size={16} /></span>
                  <div>
                    <p>{item.title}</p>
                    <small>{ago(item.created_at)}{item.detail ? ` · ${item.detail}` : ""}</small>
                  </div>
                  <em>{item.kind}</em>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className="dash-side">
          <MonthCalendar marks={data.calendar_marks || []} />
          <section className="panel-card click-card" onClick={() => navigate("/admin/maintenance")} onKeyDown={(e) => { if (e.key === "Enter") navigate("/admin/maintenance"); }} role="link" tabIndex={0}>
            <div className="panel-head">
              <h3><Ico name="receipt_long" size={16} /> Maintenance & slips</h3>
            </div>
            <p className="hint">{data.unpaid_charges} unpaid months · {data.confirmed_slips} paid slips on file.</p>
            <div className="btn-row" onClick={(e) => e.stopPropagation()}>
              <Btn icon="payments" className="btn small" to="/admin/maintenance">Open ledger</Btn>
              <Btn icon="download" className="btn ghost small" to="/admin/payments">Paid slips</Btn>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
