import { useEffect, useState } from "react";
import { api } from "../../api";
import { Badge, Btn, Field, Modal, PageHeader, WingSelect, confirmRemove, money } from "../../ui.jsx";

const empty = {
  owner_id: "",
  user_id: "",
  flat_id: "",
  full_name: "",
  phone: "",
  email: "",
  rent_amount: 0,
  deposit: 0,
  start_date: "",
  end_date: "",
  is_active: true,
  notes: "",
  new_owner_name: "",
  new_owner_email: "",
  new_owner_password: "",
  new_flat_wing: "A",
  new_flat_number: "",
  new_rent_name: "",
  new_rent_email: "",
  new_rent_password: "",
};

export default function Tenants() {
  const [items, setItems] = useState([]);
  const [owners, setOwners] = useState([]);
  const [users, setUsers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [tenants, allOwners, rentUsers, allFlats] = await Promise.all([
      api.get("/api/tenants"),
      api.get("/api/owners"),
      api.get("/api/users?role=rent"),
      api.get("/api/flats"),
    ]);
    setItems(tenants);
    setOwners(allOwners);
    setUsers(rentUsers);
    setFlats(allFlats);
  };
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const needOwner = Boolean(form) && !form.id && owners.length === 0;

  async function save(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let ownerId = form.owner_id;
      let flatId = form.flat_id;
      let userId = form.user_id;
      if (!ownerId) {
        if (!form.new_owner_email || !form.new_owner_password || !form.new_flat_number) {
          throw new Error("No owner in the list. Create an owner login and flat here first.");
        }
        const login = await api.post("/api/users", {
          name: form.new_owner_name || form.full_name,
          email: form.new_owner_email,
          phone: form.phone || "",
          password: form.new_owner_password,
          role: "owner",
          is_active: true,
        });
        const flat = await api.post("/api/flats", {
          wing: form.new_flat_wing || "A",
          number: form.new_flat_number,
          floor: 1,
          area_sqft: 0,
          status: "vacant",
          notes: "",
        });
        const owner = await api.post("/api/owners", {
          user_id: login.id,
          flat_id: flat.id,
          full_name: form.new_owner_name || form.full_name,
          phone: form.phone || "",
          email: form.new_owner_email,
        });
        ownerId = owner.id;
        flatId = flat.id;
      }
      if (!userId && form.new_rent_email && form.new_rent_password) {
        const rent = await api.post("/api/users", {
          name: form.new_rent_name || form.full_name,
          email: form.new_rent_email,
          phone: form.phone || "",
          password: form.new_rent_password,
          role: "rent",
          is_active: true,
        });
        userId = rent.id;
      }
      const payload = {
        ...form,
        owner_id: Number(ownerId),
        user_id: userId ? Number(userId) : null,
        flat_id: flatId ? Number(flatId) : null,
        rent_amount: Number(form.rent_amount),
        deposit: Number(form.deposit),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };
      if (form.id) await api.put(`/api/tenants/${form.id}`, payload);
      else await api.post("/api/tenants", payload);
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
      <PageHeader icon="rent" title="Rent details" blurb="All tenant records. If no owner is in the list to select, create the owner here first, then save rent.">
        <Btn icon="person_add" onClick={() => { setForm({ ...empty }); setError(""); }}>Add rent</Btn>
      </PageHeader>
      {error ? <p className="error">{error}</p> : null}
      <section className="card">
        <table>
          <thead><tr><th>Tenant</th><th>Flat</th><th>Rent</th><th>From</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="empty">No rent records yet. Add rent — create an owner first if that list is empty.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.full_name}</strong><div className="hint">{item.phone}</div></td>
                <td>{item.flat ? item.flat.number : item.flat_id}</td>
                <td>{money(item.rent_amount)}</td>
                <td>{item.start_date || "—"}</td>
                <td><Badge value={item.is_active ? "paid" : "unpaid"} /></td>
                <td className="btn-row">
                  <Btn icon="edit" className="btn ghost small" onClick={() => setForm({ ...empty, ...item, user_id: item.user_id || "", start_date: item.start_date || "", end_date: item.end_date || "" })}>Edit</Btn>
                  <Btn icon="delete" className="btn danger small" onClick={async () => { if (!confirmRemove("rent record")) return; await api.del(`/api/tenants/${item.id}`); load(); }}>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {form ? (
        <Modal title={form.id ? "Edit rent" : "Add rent"} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid-form">
            <Field label="Owner">
              <select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} required={!needOwner}>
                <option value="">{owners.length ? "Select owner" : "No owner in the list — create below"}</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
              </select>
            </Field>
            {needOwner ? (
              <div className="inline-create">
                <h4>Create owner in the list</h4>
                <Field label="Owner name"><input value={form.new_owner_name} onChange={(e) => setForm({ ...form, new_owner_name: e.target.value })} required={needOwner} /></Field>
                <Field label="Owner email"><input type="email" value={form.new_owner_email} onChange={(e) => setForm({ ...form, new_owner_email: e.target.value })} required={needOwner} /></Field>
                <Field label="Owner password"><input type="password" value={form.new_owner_password} onChange={(e) => setForm({ ...form, new_owner_password: e.target.value })} required={needOwner} minLength={6} /></Field>
                <Field label="Wing"><WingSelect value={form.new_flat_wing || "A"} onChange={(wing) => setForm({ ...form, new_flat_wing: wing })} /></Field>
                <Field label="Flat number"><input value={form.new_flat_number} onChange={(e) => setForm({ ...form, new_flat_number: e.target.value })} required={needOwner} /></Field>
              </div>
            ) : null}
            <Field label="Rent login (optional)">
              <select value={form.user_id || ""} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                <option value="">Not linked</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
              </select>
            </Field>
            {!form.id && !form.user_id ? (
              <div className="inline-create">
                <h4>Or create a rent login</h4>
                <Field label="Rent name"><input value={form.new_rent_name} onChange={(e) => setForm({ ...form, new_rent_name: e.target.value })} /></Field>
                <Field label="Rent email"><input type="email" value={form.new_rent_email} onChange={(e) => setForm({ ...form, new_rent_email: e.target.value })} /></Field>
                <Field label="Rent password"><input type="password" value={form.new_rent_password} onChange={(e) => setForm({ ...form, new_rent_password: e.target.value })} minLength={6} /></Field>
              </div>
            ) : null}
            <Field label="Flat">
              <select value={form.flat_id || ""} onChange={(e) => setForm({ ...form, flat_id: e.target.value })}>
                <option value="">Owner flat</option>
                {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
              </select>
            </Field>
            <Field label="Tenant name"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Monthly rent"><input type="number" value={form.rent_amount} onChange={(e) => setForm({ ...form, rent_amount: e.target.value })} /></Field>
            <Field label="Deposit"><input type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></Field>
            <Field label="Start date"><input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
            <Field label="End date"><input type="date" value={form.end_date || ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
            <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}><button className="btn" disabled={busy}>{form.id ? "Update rent" : "Insert rent"}</button></div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
