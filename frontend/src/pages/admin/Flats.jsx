import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { Btn, Field, IconBtn, Modal, WingSelect, confirmRemove, downloadCsv, initials, matches, money } from "../../ui.jsx";
import { Ico } from "../../icons.jsx";

function layoutFor(wing, floor = 0) {
  if (String(wing || "A").toUpperCase() === "B" && Number(floor) === 11) return "3 BHK";
  return String(wing || "A").toUpperCase() === "A" ? "3 BHK" : "2 BHK";
}

const emptyUnit = {
  wing: "A",
  number: "",
  floor: 1,
  area_sqft: 0,
  status: "vacant",
  layout: "3 BHK",
  intercom: "",
  facing: "",
  members: 1,
  keys_at: "",
  bike_slot: "",
  bike_vehicle: "",
  notes: "",
};

const FACINGS = ["East Facing", "West Facing", "North Facing", "South Facing", "Garden Facing", "Road Facing"];

function occupancyOf(unit) {
  if (unit.occupant_kind === "rented" || unit.status === "occupied_rent") return "rented";
  if (unit.occupant_kind === "owner" || unit.status === "occupied_owner") return "owner";
  return "vacant";
}

function floorTitle(n) {
  if (n === 0) return "Ground Floor";
  const j = n % 10;
  const k = n % 100;
  const suf = j === 1 && k !== 11 ? "st" : j === 2 && k !== 12 ? "nd" : j === 3 && k !== 13 ? "rd" : "th";
  return n === 1 ? "1st Floor (Podium Level)" : `${n}${suf} Floor`;
}

function floorTag(list) {
  const vacant = list.filter((u) => occupancyOf(u) === "vacant").length;
  const paid = list.filter((u) => !(u.dues > 0)).length;
  if (list.some((u) => /garden/i.test(u.facing || ""))) return "Garden Facing";
  if (vacant) return "Vacancy Available";
  if (paid === list.length) return "Fully Settled";
  if (vacant === 0) return "Full Floor Active";
  return "Active Floor";
}

function memberSince(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { year: "numeric", month: "short" });
}

function FloorPlan({ layout = "", facing = "" }) {
  const rooms = /3/.test(layout) ? 3 : /1/.test(layout) ? 1 : 2;
  return (
    <div className="floor-plan" aria-hidden="true">
      <div className="plan-grid">
        {Array.from({ length: rooms }, (_, i) => <span key={i} className={`plan-room r${i}`} />)}
        <span className="plan-hall" />
        <span className="plan-balc" />
      </div>
      <em>{facing || layout || "Unit layout"}</em>
    </div>
  );
}

export default function Flats() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [shops, setShops] = useState([]);
  const [form, setForm] = useState(null);
  const [selected, setSelected] = useState(null);
  const [assign, setAssign] = useState(null);
  const [nameEdit, setNameEdit] = useState(null);
  const initialWing = params.get("wing");
  const [wing, setWing] = useState(initialWing === "A" || initialWing === "B" ? initialWing : "all");
  const [occ, setOcc] = useState("all");
  const [query, setQuery] = useState("");
  const [broadcast, setBroadcast] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  const load = () =>
    Promise.all([
      api.get("/api/flats/directory"),
      api.get("/api/society?module=shop").catch(() => []),
    ]).then(([rows, arcade]) => {
      setUnits(rows);
      setShops(arcade);
      setSelected((cur) => (cur ? rows.find((row) => row.id === cur.id) || null : null));
    }).catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const next = params.get("wing");
    if (next === "A" || next === "B") setWing(next);
  }, [params]);

  const wings = ["A", "B"];
  const scoped = useMemo(() => (wing === "all" ? units : units.filter((u) => u.wing === wing)), [units, wing]);

  const stats = useMemo(() => {
    const owners = scoped.filter((u) => occupancyOf(u) === "owner").length;
    const tenants = scoped.filter((u) => occupancyOf(u) === "rented").length;
    const vacant = scoped.filter((u) => occupancyOf(u) === "vacant").length;
    const floors = [...new Set(scoped.map((u) => u.floor))];
    const perFloor = floors.length ? Math.round(scoped.length / floors.length) : 0;
    const paid = scoped.filter((u) => !(u.dues > 0)).length;
    return {
      floors: floors.length,
      perFloor,
      total: scoped.length,
      owners,
      tenants,
      vacant,
      occupied: owners + tenants,
      occupancy: scoped.length ? Math.round(((owners + tenants) / scoped.length) * 100) : 0,
      health: scoped.length ? Math.round((paid / scoped.length) * 100) : 0,
    };
  }, [scoped]);

  const filtered = useMemo(() => scoped.filter((unit) => {
    const kind = occupancyOf(unit);
    if (occ === "owner" && kind !== "owner") return false;
    if (occ === "rented" && kind !== "rented") return false;
    if (occ === "vacant" && kind !== "vacant") return false;
    if (occ === "occupied" && kind === "vacant") return false;
    if (occ === "due" && !(unit.dues > 0)) return false;
    return matches(query, unit.number, unit.occupant, unit.wing, unit.layout, unit.parking, unit.vehicle, unit.facing);
  }), [scoped, occ, query]);

  const floors = useMemo(() => {
    const groups = new Map();
    filtered.forEach((unit) => {
      if (!groups.has(unit.floor)) groups.set(unit.floor, []);
      groups.get(unit.floor).push(unit);
    });
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const floorNumbers = useMemo(
    () => [...new Set(scoped.map((u) => u.floor))].sort((a, b) => b - a),
    [scoped],
  );

  useEffect(() => {
    setBroadcast(selected?.wing ? `Swastik Marvella · Wing ${selected.wing}: ` : "Swastik Marvella · ");
  }, [selected?.wing]);

  async function save(e) {
    e.preventDefault();
    setError("");
    const payload = {
      ...form,
      floor: Number(form.floor || 0),
      area_sqft: Number(form.area_sqft || 0),
      members: Number(form.members || 1),
      layout: form.layout || "",
      intercom: form.intercom || "",
      facing: form.facing || "",
      keys_at: form.keys_at || "",
      bike_slot: form.bike_slot || "",
      bike_vehicle: form.bike_vehicle || "",
    };
    try {
      if (form.id) await api.put(`/api/flats/${form.id}`, payload);
      else await api.post("/api/flats", payload);
      setForm(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function sendWingNote() {
    if (!broadcast.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/broadcasts", { message: broadcast, send_cloud: false });
      setNotice("Wing notice saved. Open WhatsApp from Broadcast if you need to share it.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      "swastik-marvella-flats.csv",
      ["Wing", "Flat", "Floor", "Layout", "Facing", "Status", "Occupant", "Members", "Phone", "Intercom", "Parking", "Vehicle", "Dues"],
      filtered.map((u) => [u.wing, u.number, u.floor, u.layout, u.facing, occupancyOf(u), u.occupant, u.members, u.occupant_phone, u.intercom, u.parking, u.vehicle, u.dues]),
    );
  }

  const selKind = selected ? occupancyOf(selected) : "vacant";

  function showFlats(next) {
    setOcc(next);
    requestAnimationFrame(() => {
      document.getElementById("floor-board")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <>
      <section className="dir-hero arcade-hero">
        <div>
          <div className="fin-tags">
            <span>Tower asset management</span>
            <span>{wings.length ? wings.map((item) => `Wing ${item}`).join(" · ") : "Add a wing"}</span>
          </div>
          <h2>Wings & Flats Directory</h2>
          <p>Floor-wise flats for Wing A and Wing B. Each floor has four units, A-101 to A-104 through A-1101 to A-1104, and the same on Wing B. Cards show owner or renter.</p>
        </div>
        <div className="welcome-actions">
          <Btn icon="add" onClick={() => setForm({ ...emptyUnit, wing: wing === "all" ? (wings[0] || "A") : wing })}>Add New Unit / Modify Allocation</Btn>
          <Btn icon="download" className="btn ghost" onClick={exportCsv}>Export Master CSV</Btn>
        </div>
      </section>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="hint" style={{ color: "var(--ok)" }}>{notice}</p> : null}

      <section className="tower-toolbar">
        <div className="seg">
          <button type="button" className={wing === "all" ? "on" : ""} onClick={() => setWing("all")}>All wings ({units.length})</button>
          {wings.map((item) => (
            <button type="button" key={item} className={wing === item ? "on" : ""} onClick={() => setWing(item)}>
              <Ico name="apartment" size={14} /> Wing {item} ({units.filter((u) => u.wing === item).length} flats)
            </button>
          ))}
          <Btn icon="storefront" className="btn ghost small" to="/admin/shops">Commercial shops ({shops.length})</Btn>
        </div>
        <div className="tower-tools">
          {floorNumbers.length ? (
            <label>
              Jump to floor
              <select onChange={(e) => document.getElementById(`floor-${e.target.value}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} defaultValue="">
                <option value="">Select floor</option>
                {floorNumbers.map((n) => <option key={n} value={n}>{floorTitle(n)}</option>)}
              </select>
            </label>
          ) : null}
          <label className="dir-search">
            <Ico name="search" size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search flat (e.g. A-501), resident…" />
          </label>
        </div>
      </section>

      <div className="seg occ-seg">
        <span>Occupancy</span>
        <button type="button" className={occ === "all" ? "on" : ""} onClick={() => setOcc("all")}>All ({stats.total})</button>
        <button type="button" className={occ === "owner" ? "on" : ""} onClick={() => setOcc("owner")}>Owner occupied ({stats.owners})</button>
        <button type="button" className={occ === "rented" ? "on" : ""} onClick={() => setOcc("rented")}>Renter ({stats.tenants})</button>
        <button type="button" className={occ === "vacant" ? "on" : ""} onClick={() => setOcc("vacant")}>Vacant ({stats.vacant})</button>
      </div>

      <div className="tower-stats">
        <section className="tower-kpis">
          <button type="button" onClick={() => showFlats("all")}><span className="kpi-ico"><Ico name="layers" size={16} /></span><div><em>Total floors</em><b>{stats.floors}</b></div></button>
          <button type="button" onClick={() => showFlats(occ)}><span className="kpi-ico"><Ico name="grid_view" size={16} /></span><div><em>Flats / floor</em><b>{stats.perFloor}</b></div></button>
          <button type="button" onClick={() => showFlats("all")}><span className="kpi-ico"><Ico name="apartment" size={16} /></span><div><em>Total units</em><b>{stats.total}</b></div></button>
          <button type="button" className={occ === "occupied" ? "on" : ""} onClick={() => showFlats("occupied")}><span className="kpi-ico"><Ico name="verified" size={16} /></span><div><em>Occupancy rate</em><b>{stats.occupancy}%</b></div></button>
          <button type="button" onClick={() => navigate("/admin/maintenance")}><span className="kpi-ico"><Ico name="payments" size={16} /></span><div><em>Maint. health</em><b>{stats.health}%</b></div></button>
        </section>
        <section className="alloc-card">
          <header>
            <span>Allocation snapshot</span>
            <button type="button" className={occ === "occupied" ? "on" : ""} onClick={() => showFlats("occupied")}>{stats.occupied} / {stats.total} occupied</button>
          </header>
          <div className="alloc-bar">
            <button type="button" className="owner" style={{ width: `${stats.total ? (stats.owners / stats.total) * 100 : 0}%` }} onClick={() => showFlats("owner")} aria-label="Show owners" />
            <button type="button" className="rent" style={{ width: `${stats.total ? (stats.tenants / stats.total) * 100 : 0}%` }} onClick={() => showFlats("rented")} aria-label="Show renters" />
            <button type="button" className="vacant" style={{ width: `${stats.total ? (stats.vacant / stats.total) * 100 : 0}%` }} onClick={() => showFlats("vacant")} aria-label="Show vacant" />
          </div>
          <p>
            <button type="button" className={occ === "owner" ? "on" : ""} onClick={() => showFlats("owner")}><span className="dot ok" /> {stats.owners} owners</button>
            <button type="button" className={occ === "rented" ? "on" : ""} onClick={() => showFlats("rented")}><span className="dot warn" /> {stats.tenants} tenants</button>
            <button type="button" className={occ === "vacant" ? "on" : ""} onClick={() => showFlats("vacant")}><span className="dot muted" /> {stats.vacant} vacant</button>
          </p>
        </section>
      </div>

      <div className={`tower-split${selected ? " open" : ""}`}>
        <div className="floor-board" id="floor-board">
          {floors.length === 0 ? (
            <section className="card empty-card">No units match. Add a unit so owners, rent, and maintenance have a list to select.</section>
          ) : floors.map(([floor, list]) => {
            const owners = list.filter((u) => occupancyOf(u) === "owner").length;
            const tenants = list.filter((u) => occupancyOf(u) === "rented").length;
            const vacant = list.filter((u) => occupancyOf(u) === "vacant").length;
            const occPct = list.length ? Math.round(((list.length - vacant) / list.length) * 100) : 0;
            return (
              <section className="floor-band" id={`floor-${floor}`} key={floor}>
                <header>
                  <div className="floor-mark">{floor}</div>
                  <div>
                    <strong>{floorTitle(floor)}</strong>
                    <span>{list.length} flats · {occPct}% occupancy ({owners} owners, {tenants} tenant{tenants === 1 ? "" : "s"}{vacant ? `, ${vacant} vacant` : ""})</span>
                  </div>
                  <em className={`floor-chip${vacant ? " vac" : ""}`}>{floorTag(list)}</em>
                </header>
                <div className="unit-board">
                  {list.map((unit) => {
                    const kind = occupancyOf(unit);
                    const vacantUnit = kind === "vacant";
                    return (
                      <button
                        type="button"
                        key={unit.id}
                        className={`flat-card ${kind}${unit.dues > 0 ? " due" : ""}${selected?.id === unit.id ? " selected" : ""}`}
                        onClick={() => setSelected(unit)}
                      >
                        <div className="flat-top">
                          <b>{unit.number}</b>
                          <i className={`occ-dot ${kind}`} />
                        </div>
                        <span>{[unit.layout || "Unit", unit.area_sqft ? `${Number(unit.area_sqft).toLocaleString("en-IN")} sq.ft` : ""].filter(Boolean).join(" · ")}</span>
                        <strong>{vacantUnit ? "Vacant unit" : unit.occupant}</strong>
                        <small>
                          {vacantUnit
                            ? (unit.keys_at ? `Keys at ${unit.keys_at}` : "Ready to allot")
                            : `${kind === "rented" ? "Renter" : "Owner"}${unit.members ? ` · Family of ${unit.members}` : ""}`}
                        </small>
                        <div className="flat-foot">
                          {vacantUnit ? (
                            <span
                              className="assign-hit"
                              onClick={(e) => {
                              e.stopPropagation();
                              setSelected(unit);
                              setAssign({ id: unit.id, wing: unit.wing, number: unit.number, kind: "owner", full_name: "", phone: "", email: "", password: "" });
                            }}
                            >
                              Assign resident
                            </span>
                          ) : (
                            <em className={unit.dues > 0 ? "due" : "paid"}>{unit.dues > 0 ? "Due" : "Paid"}</em>
                          )}
                          <span>{unit.parking || "No slot"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {selected ? (
          <aside className="unit-panel">
            <header>
              <span className={`shop-pill ${selKind}`}>{selKind === "rented" ? "Renter" : selKind === "owner" ? "Owner" : "Vacant"}</span>
              <span>Wing {selected.wing} · Level {selected.floor}</span>
              <IconBtn icon="edit" title="Edit unit" onClick={() => setForm({ ...emptyUnit, ...selected })} />
              <div className="more-wrap">
                <IconBtn icon="more_vert" title="More" onClick={() => setMenu((v) => !v)} />
                {menu ? (
                  <div className="more-menu">
                    <button type="button" onClick={() => { setMenu(false); setForm({ ...emptyUnit, ...selected }); }}>Modify allocation</button>
                    <button type="button" onClick={async () => {
                      setMenu(false);
                      if (!confirmRemove("flat")) return;
                      await api.del(`/api/flats/${selected.id}`);
                      setSelected(null);
                      load();
                    }}>Delete unit</button>
                  </div>
                ) : null}
              </div>
            </header>
            <h3>{selected.number}</h3>
            <p>{[selected.layout, selected.area_sqft ? `${Number(selected.area_sqft).toLocaleString("en-IN")} sq.ft` : "", selected.facing].filter(Boolean).join(" · ") || "Unit details"}</p>
            <FloorPlan layout={selected.layout} facing={selected.facing} />

            <div className="occupant-box">
              <span className="avatar-round sm">{initials(selected.occupant || selected.number)}</span>
              <div>
                <em>Current occupant</em>
                <strong>{selected.occupant || "No occupant yet"}</strong>
                <small>
                  {selKind === "vacant"
                    ? (selected.keys_at ? `Keys at ${selected.keys_at}` : "Assign an owner or tenant")
                    : `${selKind === "rented" ? "Renter" : "Owner"}${selected.members ? ` · Family of ${selected.members}` : ""}`}
                </small>
              </div>
              {selKind !== "vacant" ? (
                <Btn icon="edit" className="btn ghost small" onClick={() => setNameEdit({ name: selected.occupant || "", phone: selected.occupant_phone || "", email: selected.occupant_email || "" })}>Edit name</Btn>
              ) : null}
              {memberSince(selected.move_in) ? <b>Member since {memberSince(selected.move_in)}</b> : null}
            </div>

            <div className="panel-bits">
              <div><Ico name="ring_volume" size={16} /><span>Intercom</span><b>{selected.intercom || "—"}</b></div>
              <div><Ico name="payments" size={16} /><span>Maintenance</span><b className={selected.dues > 0 ? "warn" : ""}>{selected.dues > 0 ? `Due ${money(selected.dues)}` : "Paid"}</b></div>
            </div>

            <div className="park-box">
              <span><Ico name="local_parking" size={15} /> Assigned parking & vehicles</span>
              <p><b>Slot: {selected.parking || "—"}</b><em>Car: {selected.vehicle || "—"}</em></p>
              <p><b>Two-wheeler: {selected.bike_slot || "—"}</b><em>{selected.bike_vehicle || "—"}</em></p>
            </div>

            {selected.occupant_phone ? (
              <Btn icon="call" href={`tel:${selected.occupant_phone}`}>Call {selected.intercom ? `intercom #${selected.intercom}` : selected.occupant_phone}</Btn>
            ) : selected.intercom ? (
              <Btn icon="ring_volume" className="btn ghost">Intercom #{selected.intercom}</Btn>
            ) : null}

            <div className="btn-row wrap">
              <Btn icon="badge" className="btn ghost" to="/admin/residents">Resident profile</Btn>
              <Btn icon="receipt_long" className="btn ghost" to="/admin/maintenance">Ledger details</Btn>
              {selKind === "vacant" ? (
                <>
                  <Btn icon="shield_person" className="btn ghost" to="/admin/owners">Assign owner</Btn>
                  <Btn icon="real_estate_agent" className="btn ghost" to="/admin/tenants">Assign rent</Btn>
                </>
              ) : null}
            </div>

            <form className="wing-note" onSubmit={(e) => { e.preventDefault(); sendWingNote(); }}>
              <span>Broadcast to Wing {selected.wing}</span>
              <small>Notify {scoped.length} resident unit{scoped.length === 1 ? "" : "s"}</small>
              <textarea value={broadcast} onChange={(e) => setBroadcast(e.target.value)} rows={2} />
              <Btn icon="send" type="submit" disabled={busy}>Send</Btn>
            </form>
          </aside>
        ) : null}
      </div>

      {nameEdit && selected ? (
        <Modal title={`Edit name · ${selected.number}`} onClose={() => setNameEdit(null)}>
          <form
            className="grid-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (selKind === "rented" && selected.tenant_id) {
                  const rows = await api.get("/api/tenants");
                  const row = rows.find((item) => item.id === selected.tenant_id);
                  if (!row) throw new Error("Rent record not found for this flat.");
                  await api.put(`/api/tenants/${row.id}`, {
                    owner_id: row.owner_id,
                    user_id: row.user_id,
                    flat_id: row.flat_id,
                    full_name: nameEdit.name,
                    phone: nameEdit.phone || "",
                    email: nameEdit.email || "",
                    rent_amount: row.rent_amount || 0,
                    deposit: row.deposit || 0,
                    start_date: row.start_date || null,
                    end_date: row.end_date || null,
                    is_active: row.is_active !== false,
                    notes: row.notes || "",
                  });
                  if (row.user_id) await api.put(`/api/users/${row.user_id}`, { name: nameEdit.name, phone: nameEdit.phone || "", ...(nameEdit.email ? { email: nameEdit.email } : {}) });
                } else if (selected.owner_id) {
                  const rows = await api.get("/api/owners");
                  const row = rows.find((item) => item.id === selected.owner_id);
                  if (!row) throw new Error("Owner record not found for this flat.");
                  await api.put(`/api/owners/${row.id}`, {
                    user_id: row.user_id,
                    flat_id: row.flat_id,
                    full_name: nameEdit.name,
                    phone: nameEdit.phone || "",
                    email: nameEdit.email || row.email || "",
                    alt_phone: row.alt_phone || "",
                    parking_slot: row.parking_slot || "",
                    vehicle_no: row.vehicle_no || "",
                    move_in_date: row.move_in_date || null,
                    notes: row.notes || "",
                  });
                  if (row.user_id) await api.put(`/api/users/${row.user_id}`, { name: nameEdit.name, phone: nameEdit.phone || "", ...(nameEdit.email ? { email: nameEdit.email } : {}) });
                } else {
                  throw new Error("No person is linked to this flat yet. Use Assign resident first.");
                }
                setNameEdit(null);
                await load();
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Name"><input value={nameEdit.name} onChange={(e) => setNameEdit({ ...nameEdit, name: e.target.value })} required /></Field>
            <Field label="Phone"><input value={nameEdit.phone} onChange={(e) => setNameEdit({ ...nameEdit, phone: e.target.value })} /></Field>
            <Field label="Email"><input type="email" value={nameEdit.email} onChange={(e) => setNameEdit({ ...nameEdit, email: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
              <Btn icon="save" type="submit" disabled={busy}>Save name</Btn>
            </div>
          </form>
        </Modal>
      ) : null}

      {assign ? (
        <Modal title={`Add name · Wing ${assign.wing} · ${assign.number}`} onClose={() => setAssign(null)}>
          <form
            className="grid-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (assign.kind === "rent") {
                  const owners = await api.get("/api/owners");
                  const owner = owners.find((item) => item.flat_id === assign.id || item.flat?.number === assign.number);
                  if (!owner) throw new Error("Add the owner on this flat first, then add the rent name.");
                  await api.post("/api/tenants", {
                    owner_id: owner.id,
                    flat_id: assign.id,
                    full_name: assign.full_name,
                    phone: assign.phone || "",
                    email: "",
                    is_active: true,
                    rent_amount: 0,
                    deposit: 0,
                  });
                } else {
                  await api.post("/api/owners", {
                    flat_id: assign.id,
                    full_name: assign.full_name,
                    phone: assign.phone || "",
                    email: "",
                  });
                }
                setAssign(null);
                await load();
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="hint">This name is saved on Wing {assign.wing}, flat {assign.number}. Only the secretary signs in.</p>
            <Field label="Who">
              <select value={assign.kind} onChange={(e) => setAssign({ ...assign, kind: e.target.value })}>
                <option value="owner">Owner</option>
                <option value="rent">Rent</option>
              </select>
            </Field>
            <Field label="Name"><input value={assign.full_name} onChange={(e) => setAssign({ ...assign, full_name: e.target.value })} required autoComplete="off" /></Field>
            <Field label="Phone"><input value={assign.phone} onChange={(e) => setAssign({ ...assign, phone: e.target.value })} autoComplete="off" /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
              <Btn icon="person_add" type="submit" disabled={busy}>Save {assign.kind === "rent" ? "rent" : "owner"}</Btn>
            </div>
          </form>
        </Modal>
      ) : null}

      {form ? (
        <Modal title={form.id ? "Modify allocation" : "Add new unit"} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid-form">
            <Field label="Wing"><WingSelect value={form.wing || "A"} onChange={(wing) => setForm({ ...form, wing, layout: layoutFor(wing, form.floor) })} /></Field>
            <Field label="Flat number"><input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} required /></Field>
            <Field label="Floor"><input type="number" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value, layout: layoutFor(form.wing, e.target.value) })} /></Field>
            <Field label="Layout">
              <select value={form.layout || layoutFor(form.wing, form.floor)} onChange={(e) => setForm({ ...form, layout: e.target.value })}>
                <option value="3 BHK">3 BHK</option>
                <option value="2 BHK">2 BHK</option>
              </select>
            </Field>
            <Field label="Area sq.ft"><input type="number" value={form.area_sqft} onChange={(e) => setForm({ ...form, area_sqft: e.target.value })} /></Field>
            <Field label="Facing">
              <select value={form.facing || ""} onChange={(e) => setForm({ ...form, facing: e.target.value })}>
                <option value="">Select facing</option>
                {FACINGS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Intercom"><input value={form.intercom || ""} onChange={(e) => setForm({ ...form, intercom: e.target.value })} /></Field>
            <Field label="Household members"><input type="number" min="1" value={form.members || 1} onChange={(e) => setForm({ ...form, members: e.target.value })} /></Field>
            <Field label="Keys held at"><input value={form.keys_at || ""} onChange={(e) => setForm({ ...form, keys_at: e.target.value })} placeholder="Gate / office" /></Field>
            <Field label="Two-wheeler slot"><input value={form.bike_slot || ""} onChange={(e) => setForm({ ...form, bike_slot: e.target.value })} /></Field>
            <Field label="Two-wheeler no."><input value={form.bike_vehicle || ""} onChange={(e) => setForm({ ...form, bike_vehicle: e.target.value })} /></Field>
            <Field label="Occupancy">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="vacant">Vacant</option>
                <option value="occupied_owner">Occupied by owner</option>
                <option value="occupied_rent">Occupied on rent</option>
              </select>
            </Field>
            <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}><Btn icon="save" type="submit">Save unit</Btn></div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
