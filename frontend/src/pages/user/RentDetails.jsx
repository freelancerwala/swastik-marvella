import { useEffect, useState } from "react";
import { api } from "../../api";
import { Badge, Btn, Field, Modal, PageHeader, money } from "../../ui.jsx";
import { useAuth } from "../../AuthContext.jsx";

const empty = { full_name: "", phone: "", email: "", rent_amount: 0, deposit: 0, start_date: "", end_date: "", notes: "" };

export default function RentDetails() {
  const { session } = useAuth();
  const isOwner = session?.role === "owner";
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(null);

  const load = () => api.get("/api/tenants").then(setItems);
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    const payload = {
      ...form,
      rent_amount: Number(form.rent_amount),
      deposit: Number(form.deposit),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      is_active: true,
    };
    if (form.id) await api.put(`/api/tenants/${form.id}`, payload);
    else await api.post("/api/tenants", payload);
    setForm(null);
    load();
  }

  return (
    <>
      <PageHeader icon="rent" title={isOwner ? "House on rent" : "My rent details"} blurb={isOwner ? "Only the tenant of your own flat is listed here. Other houses stay hidden." : "Only your rent record is shown. Other residents are hidden."}>
        {isOwner ? <Btn icon="person_add" onClick={() => setForm({ ...empty })}>Create rent</Btn> : null}
      </PageHeader>
      <section className="card">
        {items.length === 0 ? <p className="empty">No rent record yet.</p> : (
          <table>
            <thead><tr><th>Tenant</th><th>Flat</th><th>Rent</th><th>Deposit</th><th>Period</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.full_name}</strong><div className="hint">{item.phone} · {item.email}</div></td>
                  <td>{item.flat?.number}</td>
                  <td>{money(item.rent_amount)}</td>
                  <td>{money(item.deposit)}</td>
                  <td>{item.start_date || "—"} {item.end_date ? `to ${item.end_date}` : ""}</td>
                  <td><Badge value={item.is_active ? "paid" : "unpaid"} /></td>
                  <td>
                    {isOwner ? (
                      <div className="btn-row">
                        <Btn icon="edit" className="btn ghost small" onClick={() => setForm({ ...item, start_date: item.start_date || "", end_date: item.end_date || "" })}>Edit</Btn>
                        <Btn icon="delete" className="btn danger small" onClick={async () => { await api.del(`/api/tenants/${item.id}`); load(); }}>Delete</Btn>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {form ? (
        <Modal title={form.id ? "Edit rent" : "Create rent"} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid-form">
            <Field label="Tenant name"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Monthly rent"><input type="number" value={form.rent_amount} onChange={(e) => setForm({ ...form, rent_amount: e.target.value })} /></Field>
            <Field label="Deposit"><input type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></Field>
            <Field label="Start date"><input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
            <Field label="End date"><input type="date" value={form.end_date || ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
            <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}><button className="btn">Save rent</button></div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
