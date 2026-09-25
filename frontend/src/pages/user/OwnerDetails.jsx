import { useEffect, useState } from "react";
import { api } from "../../api";
import { Btn, Field, PageHeader } from "../../ui.jsx";

export default function OwnerDetails() {
  const [owner, setOwner] = useState(null);
  const [form, setForm] = useState({ flat_id: "", full_name: "", phone: "", email: "", alt_phone: "", parking_slot: "", vehicle_no: "", move_in_date: "", notes: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get("/api/owners").then((owners) => {
      const current = owners[0];
      if (!current) return;
      setOwner(current);
      setForm({
        flat_id: current.flat_id,
        full_name: current.full_name,
        phone: current.phone,
        email: current.email,
        alt_phone: current.alt_phone,
        parking_slot: current.parking_slot,
        vehicle_no: current.vehicle_no,
        move_in_date: current.move_in_date || "",
        notes: current.notes,
      });
    });
  }, []);

  async function save(e) {
    e.preventDefault();
    if (!owner) return;
    const payload = { ...form, flat_id: Number(form.flat_id), move_in_date: form.move_in_date || null };
    const saved = await api.put(`/api/owners/${owner.id}`, payload);
    setOwner(saved);
    setMessage("Your owner details are saved. Other flats stay hidden.");
  }

  return (
    <>
      <PageHeader icon="owners" title="My owner details" blurb="Only your flat is shown here. The secretary links the flat. If this house is on rent, open House on rent for that tenant." />
      <section className="card">
        {!owner ? <p className="empty">Your owner record is not linked yet. Ask the secretary to add your name on your Wing A or Wing B flat.</p> : (
          <form onSubmit={save} className="grid-form">
            <Field label="Flat">
              <input value={owner.flat ? `${owner.flat.wing}-${owner.flat.number}` : form.flat_id} readOnly />
            </Field>
            <Field label="Full name"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Alternate phone"><input value={form.alt_phone} onChange={(e) => setForm({ ...form, alt_phone: e.target.value })} /></Field>
            <Field label="Parking slot"><input value={form.parking_slot} onChange={(e) => setForm({ ...form, parking_slot: e.target.value })} /></Field>
            <Field label="Vehicle no"><input value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} /></Field>
            <Field label="Move-in date"><input type="date" value={form.move_in_date} onChange={(e) => setForm({ ...form, move_in_date: e.target.value })} /></Field>
            <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
              <Btn icon="save" type="submit">Update my details</Btn>
            </div>
          </form>
        )}
        {message ? <p className="hint">{message}</p> : null}
      </section>
    </>
  );
}
