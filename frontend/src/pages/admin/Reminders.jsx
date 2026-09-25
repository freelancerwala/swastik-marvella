import { useEffect, useState } from "react";
import { api } from "../../api";
import { Badge, Btn, Field, PageHeader, confirmRemove, localDateTime, when } from "../../ui.jsx";

const empty = { title: "", body: "", audience: "all", remind_at: "" };

function noticeText(item) {
  return [item.title, item.body].filter(Boolean).join("\n");
}

export default function Reminders() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [contacts, setContacts] = useState([]);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/api/notifications/reminders").then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        body: form.body,
        audience: form.audience,
        remind_at: form.remind_at ? new Date(form.remind_at).toISOString() : null,
      };
      if (form.id) await api.put(`/api/notifications/reminders/${form.id}`, payload);
      else await api.post("/api/notifications/reminders", payload);
      setForm(empty);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadContacts(item) {
    const notice = item || form;
    if (!notice.title || !notice.body) {
      setError("Write a title and message first.");
      return [];
    }
    setError("");
    const params = new URLSearchParams({
      audience: notice.audience || "all",
      title: notice.title,
      body: notice.body,
    });
    const rows = await api.get(`/api/notifications/reminders/contacts?${params.toString()}`);
    setContacts(rows);
    return rows;
  }

  async function shareAll(item) {
    try {
      const rows = await loadContacts(item);
      if (!rows.length) {
        setError("No phone number for this audience. Add a mobile on the resident, or type one below.");
        return;
      }
      window.open(rows[0].whatsapp_url, "_blank");
    } catch (err) {
      setError(err.message);
    }
  }

  function shareOne(item) {
    const notice = item || form;
    const digits = String(phone || "").replace(/\D/g, "");
    if (!notice.title || !notice.body) {
      setError("Write a title and message first.");
      return;
    }
    if (digits.length < 10) {
      setError("Enter a 10-digit WhatsApp mobile number.");
      return;
    }
    const number = digits.length === 10 ? `91${digits}` : digits;
    const url = `https://wa.me/${number}?text=${encodeURIComponent(noticeText(notice))}`;
    window.open(url, "_blank");
  }

  return (
    <>
      <PageHeader icon="reminders" title="Reminder notifications" blurb="Write the notice, then open WhatsApp. Only the title and message are sent. Each resident chat opens one at a time from their saved mobile number.">
        <Btn icon="notifications" className="btn gold" onClick={async () => { await api.post("/api/notifications/reminders/unpaid", {}); load(); }}>
          Remind unpaid maintenance
        </Btn>
      </PageHeader>
      {error ? <p className="error">{error}</p> : null}
      <div className="grid-2">
        <section className="card">
          <form onSubmit={save}>
            <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Message"><textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></Field>
            <div className="grid-form">
              <Field label="Audience">
                <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                  <option value="all">All members</option>
                  <option value="owner">Owners</option>
                  <option value="rent">Rent</option>
                  <option value="unpaid">Unpaid maintenance</option>
                </select>
              </Field>
              <Field label="Remind at">
                <input type="datetime-local" value={form.remind_at} onChange={(e) => setForm({ ...form, remind_at: e.target.value })} />
              </Field>
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <Btn icon="save" type="submit" disabled={busy}>{form.id ? "Update reminder" : "Insert reminder"}</Btn>
              <Btn icon="chat" type="button" className="btn gold" onClick={() => shareAll()}>Share on WhatsApp</Btn>
              {form.id ? <Btn icon="close" type="button" className="btn ghost" onClick={() => setForm(empty)}>Cancel edit</Btn> : null}
            </div>
            <div className="grid-form" style={{ marginTop: 12 }}>
              <Field label="Or one WhatsApp number">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9898805513" autoComplete="off" />
              </Field>
              <div className="btn-row" style={{ alignItems: "end" }}>
                <Btn icon="send" type="button" className="btn ghost" onClick={() => shareOne()}>Open WhatsApp</Btn>
              </div>
            </div>
            {contacts.length ? (
              <div className="demo-box">
                <p>{contacts.length} number{contacts.length === 1 ? "" : "s"} ready. WhatsApp opens one chat at a time.</p>
                <table>
                  <thead><tr><th>Name</th><th>Flat</th><th></th></tr></thead>
                  <tbody>
                    {contacts.map((row) => (
                      <tr key={`${row.phone}-${row.flat}`}>
                        <td>{row.name}<div className="hint">{row.role} · {row.phone}</div></td>
                        <td>{row.flat || "—"}</td>
                        <td><Btn icon="chat" className="btn small" href={row.whatsapp_url} target="_blank" rel="noreferrer">WhatsApp</Btn></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </form>
        </section>
        <section className="card">
          <h3>Scheduled and sent</h3>
          {items.length === 0 ? <p className="empty">No reminders yet. Insert one on the left.</p> : (
            <table>
              <thead><tr><th>Title</th><th>Audience</th><th>When</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.title}</strong><div className="hint">{item.body}</div></td>
                    <td>{item.audience}</td>
                    <td>{when(item.remind_at)}</td>
                    <td><Badge value={item.sent ? "paid" : "pending"} /></td>
                    <td className="btn-row">
                      <Btn icon="chat" className="btn small" onClick={() => shareAll(item)}>WhatsApp</Btn>
                      <Btn icon="edit" className="btn ghost small" onClick={() => setForm({ ...item, remind_at: localDateTime(item.remind_at) })}>Edit</Btn>
                      <Btn icon="delete" className="btn danger small" onClick={async () => { if (!confirmRemove("reminder")) return; await api.del(`/api/notifications/reminders/${item.id}`); load(); }}>Delete</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
