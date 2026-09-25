import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { Btn, Field, IconBtn, Modal, WingSelect, confirmRemove, downloadCsv, initials, matches, money } from "../../ui.jsx";
import { Ico } from "../../icons.jsx";

function emptyResident() {
  return {
    kind: "owner",
    full_name: "",
    email: "",
    phone: "",
    password: "",
    wing: "A",
    number: "",
    floor: 1,
    parking_slot: "",
    parking_level: "",
    parking_id: "",
    vehicle_no: "",
    vehicles: [],
    vehicleType: "four",
    vehicleDraft: "",
    owner_id: "",
    user_id: "",
    flat_id: "",
    start_date: "",
    end_date: "",
    notes: "",
  };
}

const VEHICLE_TYPES = [
  ["two", "Two wheeler"],
  ["three", "Three wheeler"],
  ["four", "Four wheeler"],
];

function vehicleLabel(type) {
  return VEHICLE_TYPES.find(([id]) => id === type)?.[1] || "Vehicle";
}

function parseVehicles(raw, fallback = "") {
  try {
    const items = JSON.parse(raw || "[]");
    if (Array.isArray(items) && items.length) {
      return items.filter((item) => item && item.number).map((item) => ({ type: item.type || "four", number: String(item.number) }));
    }
  } catch {
    /* older records store one plate only */
  }
  return fallback ? [{ type: "four", number: fallback }] : [];
}

function slotMeta(slot) {
  try {
    const extra = JSON.parse(slot?.meta || "{}");
    return extra && typeof extra === "object" ? extra : {};
  } catch {
    return {};
  }
}

function slotForFlat(slots, flatNumber) {
  if (!flatNumber) return null;
  return slots.find((slot) => {
    const extra = slotMeta(slot);
    return extra.flat === flatNumber || slot.title === flatNumber || String(slot.detail || "").startsWith(`${flatNumber} `) || slot.detail === flatNumber;
  }) || null;
}

function chosenLevel(slot) {
  if (!slot || !slotMeta(slot).level_chosen) return "";
  return slot.category === "ground" ? "ground" : "basement";
}

function floorLabel(n) {
  const value = Number(n) || 0;
  if (!value) return "";
  const mod = value % 100;
  const suffix = mod >= 11 && mod <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[value % 10] || "th";
  return `${value}${suffix} Floor`;
}

function shortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Users() {
  const [people, setPeople] = useState([]);
  const [flats, setFlats] = useState([]);
  const [owners, setOwners] = useState([]);
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState(null);
  const [query, setQuery] = useState("");
  const [wing, setWing] = useState("all");
  const [kind, setKind] = useState("all");
  const [kyc, setKyc] = useState("all");
  const [sort, setSort] = useState("flat");
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [rows, allFlats, allOwners, parking] = await Promise.all([
      api.get("/api/users/directory"),
      api.get("/api/flats"),
      api.get("/api/owners"),
      api.get("/api/society?module=parking").catch(() => []),
    ]);
    setPeople(rows);
    setFlats(allFlats);
    setOwners(allOwners);
    setSlots(Array.isArray(parking) ? parking : []);
  };
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const household = useMemo(() => people.filter((row) => row.kind !== "login"), [people]);
  const wings = ["A", "B"];
  const occupied = flats.filter((f) => f.status && f.status !== "vacant").length;
  const occupancyPct = flats.length ? Math.round((occupied / flats.length) * 1000) / 10 : 0;
  const stats = useMemo(() => ({
    total: household.length,
    owners: household.filter((p) => p.kind === "owner").length,
    tenants: household.filter((p) => p.kind === "tenant").length,
    pending: household.filter((p) => p.kyc === "pending").length,
    verified: household.filter((p) => p.kyc === "verified").length,
  }), [household]);

  const filtered = useMemo(() => {
    const rows = household.filter((row) => {
      if (wing !== "all" && row.wing !== wing) return false;
      if (kind !== "all" && row.kind !== kind) return false;
      if (kyc !== "all" && row.kyc !== kyc) return false;
      return matches(query, row.name, row.email, row.phone, row.flat, row.vehicle, row.parking, row.owner_name);
    });
    const ranked = [...rows];
    ranked.sort((a, b) => {
      if (sort === "name") return String(a.name).localeCompare(String(b.name));
      if (sort === "recent") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sort === "dues") return Number(b.dues || 0) - Number(a.dues || 0);
      return `${a.wing}-${a.flat}`.localeCompare(`${b.wing}-${b.flat}`, undefined, { numeric: true });
    });
    return ranked;
  }, [household, wing, kind, kyc, query, sort]);

  function openEdit(row) {
    const owner = owners.find((item) => item.id === row.id);
    setError("");
    if (row.kind === "owner") {
      const allotted = slotForFlat(slots, row.flat);
      setForm({
        ...emptyResident(),
        kind: "owner",
        id: row.id,
        user_id: owner?.user_id || row.user_id || "",
        flat_id: owner?.flat_id || "",
        full_name: row.name,
        email: row.email,
        phone: row.phone,
        parking_slot: "",
        parking_level: chosenLevel(allotted),
        parking_id: allotted ? String(allotted.id) : "",
        vehicle_no: row.vehicle || "",
        vehicles: parseVehicles(row.vehicles, row.vehicle),
        vehicleType: "four",
        vehicleDraft: "",
        notes: row.notes || "",
        wing: row.wing,
        number: row.flat,
        floor: row.floor,
      });
      return;
    }
    setForm({
      ...emptyResident(),
      kind: "tenant",
      id: row.id,
      owner_id: row.owner_id || "",
      full_name: row.name,
      email: row.email,
      phone: row.phone,
      start_date: row.start_date || "",
      end_date: row.end_date || "",
      notes: row.notes || "",
      user_id: row.user_id || "",
    });
  }

  async function saveResident(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (form.kind === "owner") {
        let flatId = form.flat_id;
        if (!form.id && !flatId) {
          const match = flats.find((item) => item.wing === (form.wing || "A") && item.number === form.number);
          if (match) flatId = match.id;
          else {
            const created = await api.post("/api/flats", {
              wing: form.wing || "A",
              number: form.number,
              floor: Number(form.floor || 1),
              area_sqft: 0,
              status: "occupied_owner",
              layout: (form.wing || "A") === "B" && Number(form.floor) === 11 ? "3 BHK" : ((form.wing || "A") === "A" ? "3 BHK" : "2 BHK"),
              notes: "",
            });
            flatId = created.id;
          }
        }
        const vehicles = [...(form.vehicles || [])];
        const draft = String(form.vehicleDraft || "").trim();
        if (draft && !vehicles.some((item) => item.number === draft && item.type === (form.vehicleType || "four"))) {
          vehicles.push({ type: form.vehicleType || "four", number: draft });
        }
        const flat = flats.find((item) => String(item.id) === String(flatId));
        const flatLabel = flat?.number || form.number || "";
        const level = form.parking_level === "ground" ? "ground" : form.parking_level === "basement" ? "basement" : "";
        if (!level) throw new Error("Select Basement or Ground floor.");
        const chosenSlot = slotForFlat(slots, flatLabel);
        const parkingLabel = `${level === "ground" ? "Ground floor" : "Basement"} · ${flatLabel}`;
        const payload = {
          user_id: form.user_id ? Number(form.user_id) : null,
          flat_id: Number(flatId),
          full_name: form.full_name,
          phone: form.phone || "",
          email: form.email || "",
          parking_slot: parkingLabel,
          vehicle_no: vehicles.map((item) => `${vehicleLabel(item.type)} ${item.number}`).join(" · "),
          vehicles: JSON.stringify(vehicles),
          notes: form.notes || "",
        };
        if (form.id) await api.put(`/api/owners/${form.id}`, payload);
        else await api.post("/api/owners", payload);
        const vehicleText = vehicles.map((item) => `${vehicleLabel(item.type)} ${item.number}`).join(" · ");
        await syncParking(chosenSlot?.id || "", flatLabel, form.full_name, level, flatId, vehicleText, form.phone || "");
      } else {
        const ownerId = form.owner_id;
        if (!ownerId) throw new Error("Select an owner, or add an owner first.");
        const payload = {
          owner_id: Number(ownerId),
          user_id: form.user_id ? Number(form.user_id) : null,
          full_name: form.full_name,
          phone: form.phone || "",
          email: form.email || "",
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          notes: form.notes || "",
          is_active: true,
          rent_amount: 0,
          deposit: 0,
        };
        if (form.id) await api.put(`/api/tenants/${form.id}`, payload);
        else await api.post("/api/tenants", payload);
      }
      setForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function syncParking(slotId, flatLabel, residentName, level, flatId, vehicleText, phone) {
    const rows = await api.get("/api/society?module=parking").catch(() => []);
    const mapped = `${flatLabel}${residentName ? ` · ${residentName}` : ""}`;
    const mine = rows.filter((slot) => {
      const extra = slotMeta(slot);
      return String(slot.id) === String(slotId) || extra.flat === flatLabel || slot.title === flatLabel;
    });
    const primary = mine[0];
    const extra = primary ? slotMeta(primary) : {};
    extra.flat = flatLabel;
    if (flatId) extra.flat_id = Number(flatId);
    extra.level_chosen = true;
    const payload = {
      module: "parking",
      title: flatLabel,
      detail: mapped,
      phone: phone || "",
      category: level,
      status: "allotted",
      notes: vehicleText || "",
      meta: JSON.stringify(extra),
    };
    if (primary) await api.put(`/api/society/${primary.id}`, payload);
    else await api.post("/api/society", payload);
    await Promise.all(mine.slice(1).map((slot) => api.del(`/api/society/${slot.id}`)));
  }

  async function toggleKyc(row) {
    const next = row.kyc === "verified" ? "pending" : "verified";
    try {
      await api.put(`/api/users/directory/${row.kind}/${row.id}/kyc`, { kyc: next });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeRow(row) {
    const label = row.kind === "tenant" ? "rent record" : "owner";
    if (!confirmRemove(label)) return;
    if (row.kind === "owner") await api.del(`/api/owners/${row.id}`);
    else await api.del(`/api/tenants/${row.id}`);
    load();
  }

  function exportCsv() {
    downloadCsv(
      "swastik-marvella-residents.csv",
      ["Name", "Type", "Flat", "Wing", "Floor", "Phone", "Email", "Members", "Vehicle", "KYC", "Dues"],
      filtered.map((row) => [row.name, row.kind, row.flat, row.wing, row.floor, row.phone, row.email, row.members, row.vehicle, row.kyc, row.dues]),
    );
  }

  const wingText = wings.length ? wings.map((item) => `Wing ${item}`).join(" & ") : "all wings";

  return (
    <>
      <section className="dir-hero">
        <div className="page-heading">
          <span className="page-icon"><Ico name="badge" size={18} /></span>
          <div>
            <h2>Residents Directory</h2>
            <p>Split by wing, then by owner and rent. {stats.owners} owners and {stats.tenants} rent records across {wingText}.</p>
          </div>
        </div>
        <div className="welcome-actions">
          <Btn icon="download" className="btn ghost" onClick={exportCsv}>Export Directory</Btn>
          <Btn icon="campaign" className="btn ghost" to="/admin/broadcast">Broadcast SMS/Email</Btn>
          <Btn icon="person_add" onClick={() => { setForm(emptyResident()); setError(""); }}>Add New Resident</Btn>
        </div>
      </section>
      {error ? <p className="error">{error}</p> : null}

      <section className="stat-strip">
        <article>
          <span className="stat-ico"><Ico name="apartment" size={18} /></span>
          <div>
            <span>Total occupancy</span>
            <b>{stats.total} <small>{occupancyPct}%</small></b>
          </div>
        </article>
        <article>
          <span className="stat-ico"><Ico name="shield_person" size={18} /></span>
          <div>
            <span>Homeowners</span>
            <b>{stats.owners} <small>Units</small></b>
          </div>
        </article>
        <article>
          <span className="stat-ico"><Ico name="real_estate_agent" size={18} /></span>
          <div>
            <span>Active tenants</span>
            <b>{stats.tenants} <small>Agreements</small></b>
          </div>
        </article>
        <article className={stats.pending ? "warn" : ""}>
          <span className="stat-ico"><Ico name="pending_actions" size={18} /></span>
          <div>
            <span>Pending KYC</span>
            <b>{stats.pending} <small>Require verification</small></b>
          </div>
        </article>
      </section>

      <section className="search-ribbon">
        <label className="dir-search">
          <Ico name="search" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by resident name, flat number, phone, email, or vehicle number..."
          />
        </label>
        <div className="ribbon-row">
          <div className="seg">
            <button type="button" className={wing === "all" ? "on" : ""} onClick={() => setWing("all")}>All Wings</button>
            {wings.map((item) => {
              const rows = household.filter((person) => person.wing === item);
              const owners = rows.filter((person) => person.kind === "owner").length;
              const rents = rows.filter((person) => person.kind === "tenant").length;
              return (
                <button type="button" key={item} className={wing === item ? "on" : ""} onClick={() => setWing(item)}>
                  Wing {item} · {owners} owner · {rents} rent
                </button>
              );
            })}
          </div>
          <div className="seg">
            <button type="button" className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>All Types</button>
            <button type="button" className={kind === "owner" ? "on" : ""} onClick={() => setKind("owner")}>Owner ({stats.owners})</button>
            <button type="button" className={kind === "tenant" ? "on" : ""} onClick={() => setKind("tenant")}>Rent ({stats.tenants})</button>
          </div>
          <div className="seg">
            <button type="button" className={kyc === "verified" ? "on" : ""} onClick={() => setKyc(kyc === "verified" ? "all" : "verified")}>Verified ({stats.verified})</button>
            <button type="button" className={kyc === "pending" ? "on" : ""} onClick={() => setKyc(kyc === "pending" ? "all" : "pending")}>
              Pending KYC <i className="kyc-dot" /> <b>{stats.pending}</b>
            </button>
          </div>
          <label className="sort-field">
            <span>Sort by:</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="flat">Flat No (Ascending)</option>
              <option value="name">Name (A - Z)</option>
              <option value="recent">Recently Added</option>
              <option value="dues">Pending Dues (High to Low)</option>
            </select>
          </label>
        </div>
      </section>

      <section className="dir-panel">
        <table className="resident-table">
          <thead>
            <tr>
              <th>Resident & Unit</th>
              <th>Type & Tenancy</th>
              <th>Household & Assets</th>
              <th>Contact Details</th>
              <th>Maintenance</th>
              <th>KYC Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="empty">No residents yet. Use Add New Resident to insert an owner or tenant. Create the household here first, then it appears in this directory.</td></tr>
            ) : filtered.map((row) => (
              <tr key={`${row.kind}-${row.id}`}>
                <td data-label="Resident">
                  <div className="resident-cell">
                    <span className="avatar-round">{initials(row.name)}</span>
                    <div>
                      <strong>{row.name}</strong>
                      <div className="unit-line">
                        {row.flat ? <em>Flat {row.flat}</em> : <em>Unassigned</em>}
                        {row.wing ? <span>· Wing {row.wing}{row.floor ? `, ${floorLabel(row.floor)}` : ""}</span> : null}
                      </div>
                    </div>
                  </div>
                </td>
                <td data-label="Type">
                  <span className={`type-chip ${row.kind}`}>{row.kind === "tenant" ? "Rent" : "Owner"}</span>
                  {row.committee ? <span className="type-chip mc">MC Secretary</span> : null}
                  {row.kind === "tenant" ? (
                    <div className="asset-line">
                      {row.owner_name ? `Owner: ${row.owner_name}` : ""}
                      {row.start_date ? <div>{shortDate(row.start_date)}{row.end_date ? ` – ${shortDate(row.end_date)}` : ""}</div> : null}
                    </div>
                  ) : null}
                </td>
                <td data-label="Household">
                  <div className="asset-line">{row.members || 1} Member{(row.members || 1) === 1 ? "" : "s"}</div>
                  <div className="asset-line">{row.vehicle ? `Vehicle · ${row.vehicle}` : row.parking ? `Parking · ${row.parking}` : "No vehicle listed"}</div>
                </td>
                <td data-label="Contact">
                  <div className="contact-line">{row.phone || "—"}</div>
                  <div className="asset-line">{row.email || ""}</div>
                </td>
                <td data-label="Maintenance">
                  {row.billed > 0 && row.dues <= 0 ? (
                    <span className="pay-pill paid">Paid</span>
                  ) : row.dues > 0 ? (
                    <span className="pay-pill due">Due {money(row.dues)}</span>
                  ) : (
                    <span className="pay-pill grace">No bill</span>
                  )}
                </td>
                <td data-label="KYC">
                  <button
                    type="button"
                    className={row.kyc === "verified" ? "kyc-ok kyc-btn" : "kyc-wait kyc-btn"}
                    onClick={() => toggleKyc(row)}
                    title={row.kyc === "verified" ? "Click to mark pending" : "Click to mark verified"}
                  >
                    {row.kyc === "verified" ? "Verified" : "Pending verification"}
                  </button>
                </td>
                <td className="row-actions" data-label="Actions">
                  <IconBtn icon="edit" title="Edit" onClick={() => openEdit(row)} />
                  <IconBtn icon="receipt_long" title="Ledger" to="/admin/maintenance" />
                  <IconBtn
                    icon="campaign"
                    title="Send notice"
                    onClick={() => setNotice({ name: row.name, phone: row.phone || "", kind: row.kind, flat: row.flat, wing: row.wing, message: "" })}
                  />
                  <IconBtn icon="delete" className="icon-btn sm warn" title="Delete" onClick={() => removeRow(row)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {notice ? (
        <Modal title={`Send notice · ${notice.name}`} onClose={() => setNotice(null)}>
          <form
            className="grid-form"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              const digits = String(notice.phone || "").replace(/\D/g, "");
              if (digits.length < 10) {
                setError("This resident has no mobile number. Add a phone on the resident first.");
                return;
              }
              if (!notice.message.trim()) return;
              const number = digits.length === 10 ? `91${digits}` : digits;
              const text = notice.message.trim();
              window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
              setNotice(null);
            }}
          >
            <Field label="Resident">
              <input value={`${notice.name} · ${notice.kind === "tenant" ? "Rent" : "Owner"}`} readOnly />
            </Field>
            <Field label="WhatsApp number">
              <input value={notice.phone || "No number on this resident"} readOnly />
            </Field>
            <Field label="Message">
              <textarea value={notice.message} onChange={(e) => setNotice({ ...notice, message: e.target.value })} required placeholder="Write the notice" />
            </Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
              <Btn icon="chat" type="submit">Send on WhatsApp</Btn>
            </div>
          </form>
        </Modal>
      ) : null}

      {form ? (
        <Modal title={form.id ? "Edit resident" : "Add New Resident"} onClose={() => setForm(null)}>
          <form onSubmit={saveResident} className="grid-form" autoComplete="off">
            {!form.id ? (
              <Field label="Type">
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option value="owner">Owner</option>
                  <option value="tenant">Rent</option>
                </select>
              </Field>
            ) : null}
            <Field label="Full name"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required autoComplete="off" /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="off" /></Field>
            {form.kind === "owner" ? (
              <>
                <Field label="Wing">
                  <WingSelect value={form.wing || "A"} onChange={(wing) => setForm({ ...form, wing, flat_id: "" })} />
                </Field>
                <Field label="Flat in this wing">
                  <select
                    value={form.flat_id || ""}
                    onChange={(e) => {
                      const flat = flats.find((item) => String(item.id) === e.target.value);
                      const allotted = slotForFlat(slots, flat?.number);
                      setForm({
                        ...form,
                        flat_id: e.target.value,
                        number: flat?.number || "",
                        floor: flat?.floor || form.floor,
                        parking_id: allotted ? String(allotted.id) : "",
                        parking_level: chosenLevel(allotted),
                      });
                    }}
                    required
                  >
                    <option value="">Select flat</option>
                    {flats.filter((item) => item.wing === (form.wing || "A")).map((item) => (
                      <option key={item.id} value={item.id}>{item.number}{item.floor ? ` · floor ${item.floor}` : ""}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Parking">
                  <select value={form.parking_level || ""} onChange={(e) => setForm({ ...form, parking_level: e.target.value })} required>
                    <option value="">Select parking</option>
                    <option value="basement">Basement</option>
                    <option value="ground">Ground floor</option>
                  </select>
                </Field>
                <Field label="Vehicle type">
                  <select value={form.vehicleType || "four"} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
                    {VEHICLE_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Vehicle no">
                  <input
                    value={form.vehicleDraft || ""}
                    onChange={(e) => setForm({ ...form, vehicleDraft: e.target.value })}
                    placeholder="Enter number, then Add"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const number = String(form.vehicleDraft || "").trim();
                      if (!number) return;
                      setForm({
                        ...form,
                        vehicles: [...(form.vehicles || []), { type: form.vehicleType || "four", number }],
                        vehicleDraft: "",
                      });
                    }}
                  />
                </Field>
                <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
                  <Btn
                    icon="add"
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      const number = String(form.vehicleDraft || "").trim();
                      if (!number) return;
                      setForm({
                        ...form,
                        vehicles: [...(form.vehicles || []), { type: form.vehicleType || "four", number }],
                        vehicleDraft: "",
                      });
                    }}
                  >
                    Add vehicle
                  </Btn>
                </div>
                {(form.vehicles || []).length ? (
                  <ul className="vehicle-list">
                    {form.vehicles.map((item, index) => (
                      <li key={`${item.type}-${item.number}-${index}`}>
                        <span>{vehicleLabel(item.type)}</span>
                        <b>{item.number}</b>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, vehicles: form.vehicles.filter((_, i) => i !== index) })}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <>
                <Field label="Wing">
                  <WingSelect value={form.wing || "A"} onChange={(wing) => setForm({ ...form, wing, owner_id: "" })} />
                </Field>
                <Field label="Owner in this wing">
                  <select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} required>
                    <option value="">Select owner</option>
                    {owners.filter((item) => !item.flat || item.flat.wing === (form.wing || "A")).map((item) => (
                      <option key={item.id} value={item.id}>{item.full_name}{item.flat ? ` · ${item.flat.number}` : ""}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Lease start"><input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
                <Field label="Lease end"><input type="date" value={form.end_date || ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
              </>
            )}
            <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" disabled={busy}>{form.id ? "Update resident" : "Insert resident"}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
