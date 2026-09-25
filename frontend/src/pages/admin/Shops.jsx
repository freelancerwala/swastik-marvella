import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { Btn, Field, IconBtn, Modal, confirmRemove, downloadCsv, matches, money } from "../../ui.jsx";
import { Ico } from "../../icons.jsx";

const CATEGORIES = [
  ["grocery", "Daily Needs & Grocery"],
  ["pharmacy", "Health & Pharmacy"],
  ["cafe", "Food & Cafe"],
  ["salon", "Services & Salons"],
  ["bank", "Banking & ATM"],
  ["services", "Services"],
  ["other", "Other"],
];
const STATUSES = ["leased", "owner_operated", "vacant", "overdue", "renewal", "closed"];
const FACINGS = [
  "Main Road Frontage",
  "Society Plaza",
  "Central Courtyard",
  "East Wing Arcade",
  "Main Gate Arcade Entry",
  "Courtyard Walkway",
  "High Footfall Corner",
];
const PAGE_SIZE = 6;

function parseMeta(raw) {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function licenseList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
}

function categoryLabel(key) {
  return CATEGORIES.find(([id]) => id === key)?.[1] || "Shop";
}

function statusLabel(status) {
  if (status === "owner_operated") return "Owner-operated";
  if (status === "overdue") return "Overdue";
  if (status === "renewal") return "Renewal due";
  if (status === "vacant") return "Available for lease";
  if (status === "closed") return "Closed";
  return "Leased";
}

function day(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysLeft(end) {
  if (!end) return null;
  return Math.round((new Date(`${end}T00:00:00`).getTime() - Date.now()) / 86400000);
}

function whatsappHref(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

function shopView(item, index) {
  const extra = parseMeta(item.meta);
  const status = item.status === "active" ? "leased" : item.status || "leased";
  return {
    ...item,
    extra,
    status,
    code: extra.code || `S-${String(index + 1).padStart(2, "0")}`,
    area_sqft: Number(extra.area_sqft || 0),
    facing: extra.facing || "",
    lease_start: extra.lease_start || "",
    lease_end: extra.lease_end || "",
    utility: extra.utility || "",
    monthly_amount: Number(extra.monthly_amount || 0),
    licenses: licenseList(extra.licenses),
    suitable_for: extra.suitable_for || "",
    expected_rent: Number(extra.expected_rent || 0),
    keys_at: extra.keys_at || "",
    inquiries: Number(extra.inquiries || 0),
    submeter_kwh: Number(extra.submeter_kwh || 0),
    dg_hours: Number(extra.dg_hours || 0),
  };
}

function emptyShop() {
  return {
    module: "shop",
    title: "",
    detail: "",
    phone: "",
    category: "grocery",
    status: "leased",
    notes: "",
    code: "",
    area_sqft: "",
    facing: "",
    lease_start: "",
    lease_end: "",
    utility: "",
    monthly_amount: "",
    licenses: "",
    suitable_for: "",
    expected_rent: "",
    keys_at: "",
    inquiries: 0,
    submeter_kwh: "",
    dg_hours: "",
  };
}

function toForm(shop) {
  return {
    ...emptyShop(),
    ...shop,
    area_sqft: shop.area_sqft || "",
    monthly_amount: shop.monthly_amount || "",
    licenses: (shop.licenses || []).join(", "),
    expected_rent: shop.expected_rent || "",
    submeter_kwh: shop.submeter_kwh || "",
    dg_hours: shop.dg_hours || "",
  };
}

function toPayload(form) {
  return {
    module: "shop",
    title: form.title,
    detail: form.detail || "",
    phone: form.phone || "",
    category: form.category || "other",
    status: form.status || "leased",
    notes: form.notes || "",
    meta: JSON.stringify({
      code: form.code || "",
      area_sqft: Number(form.area_sqft || 0),
      facing: form.facing || "",
      lease_start: form.lease_start || "",
      lease_end: form.lease_end || "",
      utility: form.utility || "",
      monthly_amount: Number(form.monthly_amount || 0),
      licenses: licenseList(form.licenses),
      occupancy: form.status,
      suitable_for: form.suitable_for || "",
      expected_rent: Number(form.expected_rent || 0),
      keys_at: form.keys_at || "",
      inquiries: Number(form.inquiries || 0),
      submeter_kwh: Number(form.submeter_kwh || 0),
      dg_hours: Number(form.dg_hours || 0),
    }),
  };
}

function duesFor(shop, charges) {
  const keys = [shop.title, shop.code, shop.detail].filter(Boolean).map((part) => String(part).toLowerCase());
  return charges.reduce((sum, row) => {
    const hay = `${row.description || ""} ${row.flat_number || ""} ${row.occupant || ""}`.toLowerCase();
    if (!keys.some((key) => key && hay.includes(key))) return sum;
    return sum + Number(row.remaining_amount || 0);
  }, 0);
}

export default function Shops() {
  const [items, setItems] = useState([]);
  const [charges, setCharges] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [form, setForm] = useState(null);
  const [meters, setMeters] = useState(null);
  const [inquiry, setInquiry] = useState(null);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [facing, setFacing] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [shops, bills, gate] = await Promise.all([
      api.get("/api/society?module=shop"),
      api.get("/api/maintenance/charges").catch(() => []),
      api.get("/api/society?module=visitor").catch(() => []),
    ]);
    setItems(shops);
    setCharges(bills);
    setVisitors(gate);
  };

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const shops = useMemo(() => items.map((item, index) => {
    const view = shopView(item, index);
    const dues = duesFor(view, charges);
    return { ...view, dues, displayStatus: dues > 0 ? "overdue" : view.status };
  }), [items, charges]);

  const stats = useMemo(() => {
    const occupied = shops.filter((s) => !["vacant", "closed"].includes(s.status)).length;
    const vacant = shops.filter((s) => s.status === "vacant").length;
    const billed = shops.reduce((sum, s) => sum + (s.monthly_amount || 0), 0);
    const collected = shops.filter((s) => s.displayStatus !== "overdue" && !["vacant", "closed"].includes(s.status)).reduce((sum, s) => sum + (s.monthly_amount || 0), 0);
    const overdue = shops.filter((s) => s.displayStatus === "overdue");
    const licensed = shops.filter((s) => s.licenses.length);
    const renewal = shops.filter((s) => s.status === "renewal" || s.licenses.some((item) => /renew/i.test(item)));
    const codes = shops.map((s) => s.code).filter(Boolean).sort();
    return {
      total: shops.length,
      occupied,
      vacant,
      occupancy: shops.length ? Math.round((occupied / shops.length) * 1000) / 10 : 0,
      billed,
      collected,
      realized: billed ? Math.round((collected / billed) * 100) : 0,
      overdue,
      overdueAmt: overdue.reduce((sum, s) => sum + (s.dues || s.monthly_amount || 0), 0),
      licensed: licensed.length,
      renewal: renewal.length,
      range: codes.length ? `${codes[0]} to ${codes[codes.length - 1]}` : "No units yet",
    };
  }, [shops]);

  const facings = useMemo(() => [...new Set(shops.map((s) => s.facing).filter(Boolean))], [shops]);

  const filtered = useMemo(() => shops.filter((shop) => {
    if (category === "vacant" && shop.status !== "vacant") return false;
    if (category !== "all" && category !== "vacant" && (shop.category || "other") !== category) return false;
    if (status !== "all" && shop.displayStatus !== status && shop.status !== status) return false;
    if (facing !== "all" && shop.facing !== facing) return false;
    return matches(query, shop.title, shop.detail, shop.phone, shop.code, shop.category, shop.facing, shop.licenses.join(" "));
  }), [shops, category, status, facing, query]);

  useEffect(() => { setPage(1); }, [category, status, facing, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const today = new Date().toISOString().slice(0, 10);
  const visitorsToday = visitors.filter((row) => String(row.created_at || "").startsWith(today) || row.status === "inside");
  const inside = visitors.filter((row) => row.status === "inside");
  const latestVisit = visitors[0];
  const renewals = shops
    .map((shop) => ({ ...shop, left: daysLeft(shop.lease_end) }))
    .filter((shop) => shop.left !== null && shop.left <= 90 && !["vacant", "closed"].includes(shop.status))
    .sort((a, b) => a.left - b.left)
    .slice(0, 4);
  const kwh = shops.reduce((sum, s) => sum + (s.submeter_kwh || 0), 0);
  const dg = shops.reduce((sum, s) => sum + (s.dg_hours || 0), 0);
  const meterEst = shops.reduce((sum, s) => sum + (s.submeter_kwh || 0) * 9.5, 0);

  async function save(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = toPayload(form);
      if (form.id) await api.put(`/api/society/${form.id}`, payload);
      else await api.post("/api/society", payload);
      setForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveShop(shop, extra) {
    await api.put(`/api/society/${shop.id}`, toPayload({ ...toForm(shop), ...extra }));
    await load();
  }

  async function saveMeters(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await Promise.all(meters.map((row) => {
        const shop = shops.find((item) => item.id === row.id);
        if (!shop) return null;
        return api.put(`/api/society/${row.id}`, toPayload({ ...toForm(shop), submeter_kwh: row.submeter_kwh, dg_hours: row.dg_hours }));
      }));
      setMeters(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function exportLease() {
    downloadCsv(
      "swastik-marvella-lease-report.csv",
      ["Code", "Shop", "Occupant", "Phone", "Category", "Status", "Facing", "Area", "Lease start", "Lease end", "CAM / rent", "Licenses", "Dues"],
      filtered.map((s) => [s.code, s.title, s.detail, s.phone, s.category, s.displayStatus, s.facing, s.area_sqft, s.lease_start, s.lease_end, s.monthly_amount, s.licenses.join("; "), s.dues]),
    );
  }

  function exportMeters() {
    downloadCsv(
      "swastik-marvella-shop-meters.csv",
      ["Code", "Shop", "Sub-meter kWh", "DG hours", "Est. amount"],
      shops.map((s) => [s.code, s.title, s.submeter_kwh, s.dg_hours, Math.round((s.submeter_kwh || 0) * 9.5)]),
    );
  }

  return (
    <>
      <section className="dir-hero arcade-hero">
        <div>
          <div className="fin-tags">
            <span>Retail & commercial management</span>
            <span>Ground floor arcade & plaza</span>
          </div>
          <h2>Shops & Commercial Arcade Directory</h2>
          <p>
            Manage {stats.total} commercial premises, retail tenancy, trade licences, and arcade maintenance
            {stats.total ? ` · ${stats.range}` : ""}.
          </p>
        </div>
        <div className="welcome-actions">
          <Btn icon="download" className="btn ghost" onClick={exportLease}>Export Lease Report</Btn>
          <Btn icon="bolt" className="btn ghost" onClick={() => {
            if (!shops.length) { setError("Onboard a shop first, then save meter readings."); return; }
            setMeters(shops.map((s) => ({ id: s.id, title: s.title, code: s.code, submeter_kwh: s.submeter_kwh, dg_hours: s.dg_hours })));
          }}>Utility & DG Billing</Btn>
          <Btn icon="storefront" onClick={() => { setForm(emptyShop()); setError(""); }}>Onboard Commercial Tenant</Btn>
        </div>
      </section>
      {error ? <p className="error">{error}</p> : null}

      <section className="arcade-kpis">
        <article>
          <header><span>Commercial units</span><span className="kpi-ico"><Ico name="storefront" size={16} /></span></header>
          <b>{stats.total} <small>units</small></b>
          <p>{stats.total ? "Ground floor arcade" : "Onboard the first shop"} · {stats.range}</p>
        </article>
        <article>
          <header><span>Occupancy rate</span><span className="kpi-ico"><Ico name="verified" size={16} /></span></header>
          <b>{stats.occupancy}%</b>
          <p>{stats.occupied} occupied · {stats.vacant} vacant</p>
        </article>
        <article>
          <header><span>Monthly retail billing</span><span className="kpi-ico"><Ico name="payments" size={16} /></span></header>
          <b>{money(stats.billed)}</b>
          <p>Rent + CAM{stats.billed ? ` · ${stats.realized}% realized` : ""}</p>
        </article>
        <article className={stats.overdue.length ? "warn" : ""}>
          <header><span>Commercial defaulters</span><span className={`kpi-ico${stats.overdue.length ? " warn" : ""}`}><Ico name="error" size={16} /></span></header>
          <b>{stats.overdue.length} <small>overdue</small></b>
          <p>{stats.overdue.length ? `${money(stats.overdueAmt)} pending` : "No overdue shop bills"}</p>
          {stats.overdue.length ? <Btn icon="campaign" className="btn ghost small" to="/admin/reminders">View notice</Btn> : null}
        </article>
        <article>
          <header><span>Trade licences</span><span className="kpi-ico"><Ico name="workspace_premium" size={16} /></span></header>
          <b>{stats.licensed} <small>verified</small></b>
          <p>{stats.renewal ? `${stats.renewal} renewal due` : "FSSAI, GST, municipal"}</p>
        </article>
      </section>

      <section className="arcade-toolbar">
        <label className="dir-search">
          <Ico name="search" size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shop name, shop no, trade category, proprietor..." />
        </label>
        <label>
          Facing
          <select value={facing} onChange={(e) => setFacing(e.target.value)}>
            <option value="all">All facings</option>
            {(facings.length ? facings : FACINGS).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {STATUSES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
          </select>
        </label>
      </section>

      <div className="seg arcade-cats">
        <button type="button" className={category === "all" ? "on" : ""} onClick={() => setCategory("all")}>All commercial ({shops.length})</button>
        {CATEGORIES.map(([id, label]) => (
          <button type="button" key={id} className={category === id ? "on" : ""} onClick={() => setCategory(id)}>
            {label} ({shops.filter((s) => (s.category || "other") === id).length})
          </button>
        ))}
        <button type="button" className={category === "vacant" ? "on" : ""} onClick={() => setCategory("vacant")}>Vacant premises ({stats.vacant})</button>
      </div>

      <div className="arcade-layout">
        <div>
          {visible.length === 0 ? (
            <section className="card empty-card">No shops yet. Use Onboard Commercial Tenant to insert the first arcade unit.</section>
          ) : (
            <div className="arcade-cards">
              {visible.map((shop) => {
                const vacant = shop.status === "vacant";
                const overdue = shop.displayStatus === "overdue";
                return (
                  <article key={shop.id} className={`arcade-card ${shop.displayStatus}`}>
                    <header>
                      <span className="shop-code">{shop.code}</span>
                      <div>
                        <h3>{shop.title}</h3>
                        <p>{categoryLabel(shop.category)}</p>
                      </div>
                      <span className={`shop-pill ${shop.displayStatus}`}>{statusLabel(shop.displayStatus)}</span>
                    </header>

                    {overdue && shop.dues > 0 ? (
                      <div className="shop-alert">
                        <Ico name="error" size={16} />
                        {money(shop.dues)} overdue on CAM / DG. Follow up from ledger.
                      </div>
                    ) : null}

                    <ul className="shop-meta">
                      {(shop.area_sqft || shop.facing) ? (
                        <li><Ico name="square_foot" size={15} /> {[shop.area_sqft ? `${shop.area_sqft} sq.ft` : "", shop.facing].filter(Boolean).join(" · ")}</li>
                      ) : null}
                      {vacant ? (
                        <>
                          {shop.suitable_for ? <li><Ico name="store" size={15} /> Suitable for {shop.suitable_for}</li> : null}
                          {shop.expected_rent ? <li><Ico name="payments" size={15} /> Expected rent {money(shop.expected_rent)} / month</li> : null}
                          {shop.keys_at ? <li><Ico name="key" size={15} /> Keys at {shop.keys_at}</li> : null}
                          <li><Ico name="group" size={15} /> {shop.inquiries} inquir{shop.inquiries === 1 ? "y" : "ies"} on file</li>
                        </>
                      ) : (
                        <>
                          <li><Ico name="person" size={15} /> Proprietor {shop.detail || "Unassigned"}</li>
                          <li><Ico name="call" size={15} /> Contact {shop.phone || "—"}</li>
                          <li><Ico name="event" size={15} /> Lease {shop.lease_start || shop.lease_end ? `${day(shop.lease_start)} – ${day(shop.lease_end)}` : "Not set"}</li>
                          {shop.utility ? <li><Ico name="bolt" size={15} /> {shop.utility}</li> : null}
                        </>
                      )}
                    </ul>

                    {shop.licenses.length ? (
                      <div className="license-row">
                        {shop.licenses.map((item) => <span key={item}>{item}</span>)}
                      </div>
                    ) : null}

                    <footer>
                      <div>
                        <span>{vacant ? "Asking / CAM" : overdue ? "Overdue balance" : "Monthly CAM & rent"}</span>
                        <b className={overdue ? "warn" : ""}>{money(overdue && shop.dues ? shop.dues : shop.monthly_amount || shop.expected_rent)}</b>
                      </div>
                      <div className="row-actions">
                        {overdue ? (
                          <>
                            {whatsappHref(shop.phone) ? <Btn icon="whatsapp" className="btn ghost small" href={whatsappHref(shop.phone)} target="_blank" rel="noreferrer">WhatsApp</Btn> : null}
                            <Btn icon="receipt_long" className="btn small" to="/admin/maintenance">View ledger</Btn>
                          </>
                        ) : vacant ? (
                          <>
                            <Btn icon="person_search" className="btn ghost small" onClick={() => setInquiry({ ...shop, note: "" })}>Record inquiry / tour</Btn>
                            <Btn icon="person_add" className="btn small" onClick={() => { setForm({ ...toForm(shop), status: "leased" }); setError(""); }}>Assign vendor</Btn>
                          </>
                        ) : shop.status === "renewal" ? (
                          <Btn icon="history" className="btn small" onClick={() => { setForm(toForm(shop)); setError(""); }}>Process renewal</Btn>
                        ) : (
                          <>
                            <IconBtn icon="edit" title="Edit shop" onClick={() => { setForm(toForm(shop)); setError(""); }} />
                            <IconBtn icon="receipt_long" title="Open ledger" to="/admin/maintenance" />
                          </>
                        )}
                        <IconBtn
                          icon="delete"
                          className="icon-btn sm warn"
                          title="Delete shop"
                          onClick={async () => {
                            if (!confirmRemove("shop")) return;
                            await api.del(`/api/society/${shop.id}`);
                            load();
                          }}
                        />
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}

          <div className="arcade-pager">
            <span>
              Showing {filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)}` : 0} of {filtered.length} commercial units
              <em>
                <i className="dot ok" /> Active / paid
                <i className="dot warn" /> Renewal due
                <i className="dot danger" /> Defaulter
                <i className="dot muted" /> Vacant
              </em>
            </span>
            <div className="pager-btns">
              <button type="button" className="btn ghost small" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Previous</button>
              {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 6).map((n) => (
                <button type="button" key={n} className={`btn small${n === page ? "" : " ghost"}`} onClick={() => setPage(n)}>{n}</button>
              ))}
              <button type="button" className="btn ghost small" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>Next</button>
            </div>
          </div>
        </div>

        <aside className="arcade-side">
          <section className="panel-card">
            <div className="panel-head">
              <h3><Ico name="sensors" size={16} /> Arcade footfall & access</h3>
              <span className="live-pill on">Live</span>
            </div>
            <b className="footfall-num">{visitorsToday.length}</b>
            <p>Gate / visitor records today · {inside.length} inside now</p>
            <small>{shops.length} shop{shops.length === 1 ? "" : "s"} added</small>
            <div className="side-note">
              <Ico name="local_shipping" size={16} />
              {latestVisit ? `${latestVisit.title} · ${latestVisit.detail || latestVisit.status}${latestVisit.notes ? ` · ${latestVisit.notes}` : ""}` : "No loading-bay or visitor log yet."}
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-head">
              <h3><Ico name="gavel" size={16} /> Regulatory & safety</h3>
            </div>
            <ul className="comply-list">
              <li><Ico name="check_circle" size={15} /> Fire NOC / extinguisher {shops.filter((s) => s.licenses.some((item) => /fire|noc/i.test(item))).length}/{shops.length || 0} tagged</li>
              <li><Ico name="workspace_premium" size={15} /> Trade licences {stats.licensed} verified{stats.renewal ? ` · ${stats.renewal} renewal due` : ""}</li>
              <li><Ico name="recycling" size={15} /> Licence chips saved on each shop card (FSSAI, GST, municipal)</li>
            </ul>
          </section>

          <section className="panel-card">
            <div className="panel-head">
              <h3><Ico name="event_upcoming" size={16} /> Upcoming lease renewals</h3>
              <span>Next 90 days</span>
            </div>
            {renewals.length === 0 ? <p className="hint">No lease end-dates in the next 90 days.</p> : renewals.map((shop) => (
              <div key={shop.id} className="renew-row">
                <div>
                  <strong>{shop.code} · {shop.title}</strong>
                  <small>{shop.detail || categoryLabel(shop.category)}</small>
                </div>
                <div>
                  <em className={shop.left < 0 ? "warn" : ""}>{shop.left < 0 ? `${Math.abs(shop.left)} days overdue` : `${shop.left} days left`}</em>
                  <button type="button" className="text-link" onClick={() => { setForm(toForm(shop)); setError(""); }}>View terms</button>
                </div>
              </div>
            ))}
            <Btn icon="folder" className="btn ghost small" style={{ width: "100%", justifyContent: "center" }} to="/admin/documents">Manage all tenancy leases</Btn>
          </section>

          <section className="panel-card">
            <div className="panel-head">
              <h3><Ico name="electric_meter" size={16} /> Commercial sub-meter board</h3>
              <span>{new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
            </div>
            <div className="meter-grid">
              <div><span>Sub-meter units</span><b>{kwh.toLocaleString("en-IN")} kWh</b></div>
              <div><span>DG run-time</span><b>{dg.toLocaleString("en-IN")} hrs</b></div>
            </div>
            <p className="hint">Est. {money(meterEst)} at ₹9.50 / kWh. Save readings in Utility & DG Billing.</p>
            <Btn icon="receipt_long" onClick={exportMeters}>Generate meter invoice</Btn>
          </section>
        </aside>
      </div>

      {form ? (
        <Modal title={form.id ? "Edit commercial unit" : "Onboard commercial tenant"} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid-form">
            <Field label="Shop no. / code"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="S-01" /></Field>
            <Field label="Shop / trade name"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Proprietor / occupant"><input value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} /></Field>
            <Field label="Contact"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Category">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
              </select>
            </Field>
            <Field label="Facing">
              <select value={form.facing} onChange={(e) => setForm({ ...form, facing: e.target.value })}>
                <option value="">Select facing</option>
                {FACINGS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Area (sq.ft)"><input type="number" value={form.area_sqft} onChange={(e) => setForm({ ...form, area_sqft: e.target.value })} /></Field>
            <Field label="Lease start"><input type="date" value={form.lease_start} onChange={(e) => setForm({ ...form, lease_start: e.target.value })} /></Field>
            <Field label="Lease end"><input type="date" value={form.lease_end} onChange={(e) => setForm({ ...form, lease_end: e.target.value })} /></Field>
            <Field label="DG / parking"><input value={form.utility} onChange={(e) => setForm({ ...form, utility: e.target.value })} placeholder="5 kVA · Slot P-01" /></Field>
            <Field label="Monthly CAM & rent"><input type="number" value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })} /></Field>
            <Field label="Trade licences"><input value={form.licenses} onChange={(e) => setForm({ ...form, licenses: e.target.value })} placeholder="FSSAI, GST, Fire NOC" /></Field>
            {form.status === "vacant" ? (
              <>
                <Field label="Suitable for"><input value={form.suitable_for} onChange={(e) => setForm({ ...form, suitable_for: e.target.value })} placeholder="Bank, bakery, clinic" /></Field>
                <Field label="Expected rent"><input type="number" value={form.expected_rent} onChange={(e) => setForm({ ...form, expected_rent: e.target.value })} /></Field>
                <Field label="Keys held at"><input value={form.keys_at} onChange={(e) => setForm({ ...form, keys_at: e.target.value })} /></Field>
              </>
            ) : null}
            <Field label="Notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
              <Btn icon="save" type="submit" disabled={busy}>{form.id ? "Update unit" : "Insert unit"}</Btn>
            </div>
          </form>
        </Modal>
      ) : null}

      {meters ? (
        <Modal title="Utility & DG billing" onClose={() => setMeters(null)}>
          <form onSubmit={saveMeters}>
            <p className="hint">Save live sub-meter kWh and DG hours for each shop, then generate the meter invoice CSV.</p>
            <table>
              <thead><tr><th>Unit</th><th>Sub-meter kWh</th><th>DG hours</th></tr></thead>
              <tbody>
                {meters.map((row, index) => (
                  <tr key={row.id}>
                    <td>{row.code} · {row.title}</td>
                    <td><input type="number" value={row.submeter_kwh} onChange={(e) => setMeters((cur) => cur.map((item, i) => i === index ? { ...item, submeter_kwh: e.target.value } : item))} /></td>
                    <td><input type="number" value={row.dg_hours} onChange={(e) => setMeters((cur) => cur.map((item, i) => i === index ? { ...item, dg_hours: e.target.value } : item))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <Btn icon="save" type="submit" disabled={busy}>Save readings</Btn>
              <Btn icon="download" className="btn ghost" onClick={exportMeters}>Generate meter invoice</Btn>
            </div>
          </form>
        </Modal>
      ) : null}

      {inquiry ? (
        <Modal title={`Inquiry / tour · ${inquiry.code}`} onClose={() => setInquiry(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const note = [inquiry.notes, inquiry.note && `Inquiry: ${inquiry.note}`].filter(Boolean).join("\n");
                await saveShop(inquiry, { inquiries: Number(inquiry.inquiries || 0) + 1, notes: note });
                setInquiry(null);
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="hint">Adds one inquiry to this vacant unit and stores the note on the shop record.</p>
            <Field label="Visitor / interest note"><textarea value={inquiry.note} onChange={(e) => setInquiry({ ...inquiry, note: e.target.value })} required /></Field>
            <div className="btn-row"><Btn icon="person_search" type="submit" disabled={busy}>Save inquiry</Btn></div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
