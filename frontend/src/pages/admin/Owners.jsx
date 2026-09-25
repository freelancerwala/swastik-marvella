import { useEffect, useState } from "react";
import { api } from "../../api";
import { Btn, Field, Modal, PageHeader, WingSelect, confirmRemove } from "../../ui.jsx";

const empty = {
  user_id: "",
  flat_id: "",
  full_name: "",
  phone: "",
  email: "",
  alt_phone: "",
  parking_slot: "",
  vehicle_no: "",
  move_in_date: "",
  notes: "",
  new_login_name: "",
  new_login_email: "",
  new_login_phone: "",
  new_login_password: "",
  new_flat_wing: "A",
  new_flat_number: "",
  new_flat_floor: 1,
};

export default function Owners() {
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [owners, allUsers, allFlats] = await Promise.all([api.get("/api/owners"), api.get("/api/users?role=owner"), api.get("/api/flats")]);
    setItems(owners);
    setUsers(allUsers);
    setFlats(allFlats);
  };
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const linkedUserIds = new Set(items.map((row) => row.user_id));
  const linkedFlatIds = new Set(items.map((row) => row.flat_id));
  const availableUsers = users.filter((user) => !linkedUserIds.has(user.id) || user.id === Number(form?.user_id));
  const availableFlats = flats.filter((flat) => !linkedFlatIds.has(flat.id) || flat.id === Number(form?.flat_id));
  const needLogin = Boolean(form) && !form.id && availableUsers.length === 0;
  const needFlat = Boolean(form) && !form.id && availableFlats.length === 0;

  async function save(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let userId = form.user_id;
      let flatId = form.flat_id;
      if (!userId) {
        if (!form.new_login_email || !form.new_login_password) {
          throw new Error("No owner login in the list. Create one here first.");
        }
        const created = await api.post("/api/users", {
          name: form.new_login_name || form.full_name,
          email: form.new_login_email,
          phone: form.new_login_phone || form.phone,
          password: form.new_login_password,
          role: "owner",
          is_active: true,
        });
        userId = created.id;
      }
      if (!flatId) {
        if (!form.new_flat_number) {
          throw new Error("No flat in the list. Create one here first.");
        }
        const createdFlat = await api.post("/api/flats", {
          wing: form.new_flat_wing || "A",
          number: form.new_flat_number,
          floor: Number(form.new_flat_floor || 1),
          area_sqft: 0,
          status: "vacant",
          notes: "",
        });
        flatId = createdFlat.id;
      }
      const payload = {
        ...form,
        user_id: Number(userId),
        flat_id: Number(flatId),
        move_in_date: form.move_in_date || null,
      };
      if (form.id) await api.put(`/api/owners/${form.id}`, payload);
      else await api.post("/api/owners", payload);
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
      <PageHeader icon="owners" title="Owner details" blurb="Link an owner login to a purchased flat. If the list has nothing to select, create it here first.">
        <Btn icon="person_add" onClick={() => { setForm({ ...empty }); setError(""); }}>Add owner</Btn>
      </PageHeader>
      {error ? <p className="error">{error}</p> : null}
      <section className="card">
        <table>
          <thead><tr><th>Owner</th><th>Flat</th><th>Phone</th><th>Parking</th><th></th></tr></thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="empty">No owners in the list yet. Add an owner — create a login or flat first if those lists are empty.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.full_name}</strong>
                  <div className="hint">{item.email}</div>
                </td>
                <td>{item.flat ? `${item.flat.wing}-${item.flat.number}` : item.flat_id}</td>
                <td>{item.phone}</td>
                <td>{item.parking_slot} {item.vehicle_no}</td>
                <td className="btn-row">
                  <Btn icon="edit" className="btn ghost small" onClick={() => setForm({ ...empty, ...item, user_id: item.user_id, move_in_date: item.move_in_date || "" })}>Edit</Btn>
                  <Btn icon="delete" className="btn danger small" onClick={async () => { if (!confirmRemove("owner")) return; await api.del(`/api/owners/${item.id}`); load(); }}>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {form ? (
        <Modal title={form.id ? "Edit owner" : "Add owner"} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid-form">
            <Field label="Owner login">
              <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} disabled={Boolean(form.id)} required={!needLogin}>
                <option value="">{availableUsers.length ? "Select login" : "No login in the list — create below"}</option>
                {availableUsers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
              </select>
            </Field>
            {needLogin ? (
              <div className="inline-create">
                <h4>Create owner login in the list</h4>
                <Field label="Login name"><input value={form.new_login_name} onChange={(e) => setForm({ ...form, new_login_name: e.target.value, full_name: form.full_name || e.target.value })} required /></Field>
                <Field label="Login email"><input type="email" value={form.new_login_email} onChange={(e) => setForm({ ...form, new_login_email: e.target.value, email: form.email || e.target.value })} required /></Field>
                <Field label="Login phone"><input value={form.new_login_phone} onChange={(e) => setForm({ ...form, new_login_phone: e.target.value, phone: form.phone || e.target.value })} /></Field>
                <Field label="Login password"><input type="password" value={form.new_login_password} onChange={(e) => setForm({ ...form, new_login_password: e.target.value })} required minLength={6} /></Field>
              </div>
            ) : null}
            <Field label="Flat">
              <select value={form.flat_id} onChange={(e) => setForm({ ...form, flat_id: e.target.value })} required={!needFlat}>
                <option value="">{availableFlats.length ? "Select flat" : "No flat in the list — create below"}</option>
                {availableFlats.map((f) => <option key={f.id} value={f.id}>{f.wing}-{f.number}</option>)}
              </select>
            </Field>
            {needFlat ? (
              <div className="inline-create">
                <h4>Create flat in the list</h4>
                <Field label="Wing"><WingSelect value={form.new_flat_wing || "A"} onChange={(wing) => setForm({ ...form, new_flat_wing: wing })} /></Field>
                <Field label="Flat number"><input value={form.new_flat_number} onChange={(e) => setForm({ ...form, new_flat_number: e.target.value })} required /></Field>
                <Field label="Floor"><input type="number" value={form.new_flat_floor} onChange={(e) => setForm({ ...form, new_flat_floor: e.target.value })} /></Field>
              </div>
            ) : null}
            <Field label="Full name"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Alternate phone"><input value={form.alt_phone} onChange={(e) => setForm({ ...form, alt_phone: e.target.value })} /></Field>
            <Field label="Parking slot"><input value={form.parking_slot} onChange={(e) => setForm({ ...form, parking_slot: e.target.value })} /></Field>
            <Field label="Vehicle no"><input value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} /></Field>
            <Field label="Move-in date"><input type="date" value={form.move_in_date || ""} onChange={(e) => setForm({ ...form, move_in_date: e.target.value })} /></Field>
            <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}><button className="btn" disabled={busy}>{form.id ? "Update owner" : "Insert owner"}</button></div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
