import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { Btn, Field, Modal, confirmRemove, matches } from "../../ui.jsx";
import { Ico } from "../../icons.jsx";

const emptySlot = {
  module: "parking",
  title: "",
  detail: "",
  phone: "",
  category: "basement",
  status: "vacant",
  notes: "",
  flat_id: "",
  owner_id: "",
  vehicle: "",
};

function slotMeta(slot) {
  try {
    const extra = JSON.parse(slot?.meta || "{}");
    return extra && typeof extra === "object" ? extra : {};
  } catch {
    return {};
  }
}

function residentName(slot) {
  const detail = String(slot.detail || "");
  const parts = detail.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ") : "";
}

function SlotBoard({ title, icon, items, onEdit, onDelete, canWrite }) {
  return (
    <section className="panel-card park-board">
      <div className="panel-head">
        <h3><Ico name={icon} size={16} /> {title}</h3>
        <span className="pill">{items.length} slots</span>
      </div>
      {items.length === 0 ? <p className="empty">No flats here yet. Select Basement or Ground floor on a resident to show that flat.</p> : (
        <div className="park-grid">
          {items.map((slot) => {
            const name = residentName(slot);
            return (
              <article
                key={slot.id}
                className={`park-card ${slot.status}`}
                onClick={() => { if (canWrite) onEdit(slot); }}
                role={canWrite ? "button" : undefined}
              >
                <header>
                  <b>{slot.title}</b>
                  <span className={`shop-pill ${slot.status === "vacant" ? "vacant" : "owner"}`}>{slot.status === "vacant" ? "Vacant" : "Allotted"}</span>
                </header>
                <p>{name || "No resident yet"}</p>
                <small>{slot.notes || "No vehicle"}</small>
                {canWrite ? (
                  <div className="btn-row" onClick={(e) => e.stopPropagation()}>
                    <Btn icon="edit" className="btn ghost small" onClick={() => onEdit(slot)}>Edit</Btn>
                    <Btn icon="delete" className="btn danger small" onClick={() => onDelete(slot)}>Delete</Btn>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function Parking({ resident = false }) {
  const [items, setItems] = useState([]);
  const [flats, setFlats] = useState([]);
  const [owners, setOwners] = useState([]);
  const [form, setForm] = useState(null);
  const [level, setLevel] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [slots, flatRows, ownerRows] = await Promise.all([
      api.get("/api/society?module=parking"),
      api.get("/api/flats").catch(() => []),
      api.get("/api/owners").catch(() => []),
    ]);
    setItems(Array.isArray(slots) ? slots : []);
    setFlats(Array.isArray(flatRows) ? flatRows : []);
    setOwners(Array.isArray(ownerRows) ? ownerRows : []);
  };
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  function openEdit(slot) {
    const extra = slotMeta(slot);
    const flat = flats.find((item) => String(item.id) === String(extra.flat_id)) || flats.find((item) => item.number === slot.title);
    const owner = owners.find((item) => flat && String(item.flat_id) === String(flat.id))
      || owners.find((item) => residentName(slot) && item.full_name === residentName(slot));
    setForm({
      ...slot,
      category: slot.category === "ground" ? "ground" : "basement",
      flat_id: flat ? String(flat.id) : "",
      owner_id: owner ? String(owner.id) : "",
      vehicle: slot.notes || "",
      status: slot.status === "vacant" ? "vacant" : "allotted",
    });
    setError("");
  }

  const filtered = useMemo(() => items.filter((item) => {
    if (level !== "all" && (item.category || "basement") !== level) return false;
    return matches(query, item.title, item.detail, item.phone, item.notes, item.status);
  }), [items, level, query]);

  const basement = filtered.filter((item) => (item.category || "basement") !== "ground");
  const ground = filtered.filter((item) => item.category === "ground");

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const flat = flats.find((item) => String(item.id) === String(form.flat_id));
      const owner = owners.find((item) => String(item.id) === String(form.owner_id));
      const flatNumber = flat?.number || form.title;
      const level = form.category === "ground" ? "ground" : "basement";
      const payload = {
        module: "parking",
        title: flatNumber,
        detail: owner ? `${flatNumber} · ${owner.full_name}` : "",
        phone: (owner?.phone || form.phone || "").slice(0, 20),
        category: level,
        status: owner ? "allotted" : (form.status || "vacant"),
        notes: form.vehicle || "",
        meta: JSON.stringify({
          ...slotMeta(form),
          flat_id: flat ? flat.id : slotMeta(form).flat_id,
          flat: flatNumber,
          level_chosen: true,
        }),
      };
      if (form.id) await api.put(`/api/society/${form.id}`, payload);
      else await api.post("/api/society", payload);
      if (owner) {
        await api.put(`/api/owners/${owner.id}`, {
          user_id: owner.user_id || null,
          flat_id: owner.flat_id,
          full_name: owner.full_name,
          phone: owner.phone || "",
          email: owner.email || "",
          alt_phone: owner.alt_phone || "",
          parking_slot: `${level === "ground" ? "Ground floor" : "Basement"} · ${flatNumber}`,
          vehicle_no: form.vehicle || owner.vehicle_no || "",
          move_in_date: owner.move_in_date ? String(owner.move_in_date).slice(0, 10) : null,
          notes: owner.notes || "",
        });
      }
      setForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="dir-hero">
        <div className="page-heading">
          <span className="page-icon"><Ico name="local_parking" size={18} /></span>
          <div>
            <h2>Parking allotment</h2>
            <p>A flat appears here only after you select Basement or Ground floor on that resident.</p>
          </div>
        </div>
        {resident ? null : (
          <Btn icon="add" onClick={() => { setForm({ ...emptySlot, category: level === "ground" ? "ground" : "basement" }); setError(""); }}>Add allotment</Btn>
        )}
      </section>
      {error ? <p className="error">{error}</p> : null}
      <section className="arcade-toolbar">
        <label className="dir-search">
          <Ico name="search" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Slot, flat, vehicle…" />
        </label>
        <div className="seg">
          <button type="button" className={level === "all" ? "on" : ""} onClick={() => setLevel("all")}>All levels</button>
          <button type="button" className={level === "basement" ? "on" : ""} onClick={() => setLevel("basement")}>Basement ({items.filter((i) => (i.category || "basement") !== "ground").length})</button>
          <button type="button" className={level === "ground" ? "on" : ""} onClick={() => setLevel("ground")}>Ground floor ({items.filter((i) => i.category === "ground").length})</button>
        </div>
      </section>
      <div className="park-split">
        {level !== "ground" ? (
          <SlotBoard
            title="Basement allotment"
            icon="garage"
            items={basement}
            onEdit={openEdit}
            onDelete={async (slot) => { if (!confirmRemove("parking slot")) return; await api.del(`/api/society/${slot.id}`); load(); }}
            canWrite={!resident}
          />
        ) : null}
        {level !== "basement" ? (
          <SlotBoard
            title="Ground floor allotment"
            icon="local_parking"
            items={ground}
            onEdit={openEdit}
            onDelete={async (slot) => { if (!confirmRemove("parking slot")) return; await api.del(`/api/society/${slot.id}`); load(); }}
            canWrite={!resident}
          />
        ) : null}
      </div>
      {form ? (
        <Modal title={form.id ? "Edit allotment" : "Add parking allotment"} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid-form">
            <Field label="Level">
              <select value={form.category || "basement"} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="basement">Basement</option>
                <option value="ground">Ground floor</option>
              </select>
            </Field>
            <Field label="Flat">
              <select
                value={form.flat_id || ""}
                onChange={(e) => {
                  const flat = flats.find((item) => String(item.id) === e.target.value);
                  const owner = owners.find((item) => flat && String(item.flat_id) === String(flat.id));
                  setForm({
                    ...form,
                    flat_id: e.target.value,
                    title: flat?.number || form.title,
                    owner_id: owner ? String(owner.id) : "",
                    vehicle: owner?.vehicle_no || form.vehicle || "",
                    status: owner ? "allotted" : "vacant",
                  });
                }}
                required
              >
                <option value="">Select flat</option>
                {flats.map((item) => (
                  <option key={item.id} value={item.id}>{item.number} · Wing {item.wing}</option>
                ))}
              </select>
            </Field>
            <Field label="Resident">
              <select
                value={form.owner_id || ""}
                onChange={(e) => {
                  const owner = owners.find((item) => String(item.id) === e.target.value);
                  const flat = owner ? flats.find((item) => String(item.id) === String(owner.flat_id)) : null;
                  setForm({
                    ...form,
                    owner_id: e.target.value,
                    flat_id: flat ? String(flat.id) : form.flat_id,
                    title: flat?.number || form.title,
                    vehicle: owner?.vehicle_no || "",
                    status: owner ? "allotted" : "vacant",
                  });
                }}
              >
                <option value="">No resident yet</option>
                {owners.map((item) => {
                  const flat = flats.find((row) => String(row.id) === String(item.flat_id));
                  return <option key={item.id} value={item.id}>{item.full_name}{flat ? ` · ${flat.number}` : ""}</option>;
                })}
              </select>
            </Field>
            <Field label="Vehicle no.">
              <input value={form.vehicle || ""} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="GJ01AB1234" />
            </Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
              <Btn icon="save" type="submit" disabled={busy}>{form.id ? "Update" : "Insert"}</Btn>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
