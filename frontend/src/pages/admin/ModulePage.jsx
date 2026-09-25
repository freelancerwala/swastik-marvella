import { useEffect, useState } from "react";
import { api } from "../../api";
import { MODULES } from "../../modules.js";
import { Badge, Btn, Field, IconBtn, Modal, PageHeader, confirmRemove } from "../../ui.jsx";
import { useAuth } from "../../AuthContext.jsx";

export default function ModulePage({ slug, resident = false }) {
  const config = MODULES[slug];
  const { session } = useAuth();
  const secretary = session?.role === "secretary";
  const canWrite = secretary || (resident && ["complaints", "visitors"].includes(slug));
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const empty = () => {
    const row = {
      module: config.key,
      title: "",
      detail: "",
      phone: "",
      status: config.fields.find((f) => f.key === "status")?.options?.[0] || "active",
      category: config.fields.find((f) => f.key === "category")?.options?.[0] || "",
      notes: "",
    };
    return row;
  };

  const load = () => api.get(`/api/society?module=${config.key}`).then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [config.key]);

  async function save(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        module: config.key,
        title: form.title,
        detail: form.detail || "",
        phone: form.phone || "",
        status: form.status || "active",
        category: form.category || "",
        notes: form.notes || "",
      };
      if (form.id && secretary) await api.put(`/api/society/${form.id}`, payload);
      else await api.post("/api/society", payload);
      setForm(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function cell(item, col) {
    const value = item[col.key];
    if (col.badge) return <Badge value={value} />;
    return value || "—";
  }

  return (
    <>
      <PageHeader icon={slug} title={config.title} blurb={config.blurb}>
        {canWrite ? <Btn icon="add" onClick={() => { setForm(empty()); setError(""); }}>{config.add}</Btn> : null}
      </PageHeader>
      {error ? <p className="error">{error}</p> : null}
      <section className="card">
        <table>
          <thead>
            <tr>
              {config.columns.map((col) => <th key={col.label}>{col.label}</th>)}
              {secretary ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={config.columns.length + (secretary ? 1 : 0)} className="empty">
                  {canWrite ? `No records yet. Use ${config.add} to insert the first one.` : "No records yet."}
                </td>
              </tr>
            ) : items.map((item) => (
              <tr key={item.id}>
                {config.columns.map((col) => <td key={col.label}>{cell(item, col)}</td>)}
                {secretary ? (
                  <td className="row-actions">
                    <IconBtn icon="edit" title="Edit" onClick={() => { setForm(item); setError(""); }} />
                    <IconBtn
                      icon="delete"
                      className="icon-btn sm warn"
                      title="Delete"
                      onClick={async () => {
                        if (!confirmRemove(config.title.toLowerCase().replace(/s$/, ""))) return;
                        await api.del(`/api/society/${item.id}`);
                        load();
                      }}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {form ? (
        <Modal title={form.id ? `Edit ${config.title.toLowerCase()}` : config.add} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid-form">
            {config.fields.map((field) => (
              <Field key={field.key} label={field.label}>
                {field.options ? (
                  <select value={form[field.key] || ""} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}>
                    {field.options.map((opt) => <option key={opt} value={opt}>{opt.replaceAll("_", " ")}</option>)}
                  </select>
                ) : field.key === "notes" ? (
                  <textarea value={form[field.key] || ""} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} />
                ) : (
                  <input value={form[field.key] || ""} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} required={Boolean(field.required)} />
                )}
              </Field>
            ))}
            <div className="btn-row" style={{ gridColumn: "1 / -1", marginTop: 12 }}>
              <button className="btn" disabled={busy}>{form.id ? "Update" : "Insert"}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
