import { useEffect, useState } from "react";
import { api, decorateUpdate } from "../../api";
import { Badge, Btn, Field, MediaGrid, Modal, PageHeader, confirmRemove } from "../../ui.jsx";
import { useAuth } from "../../AuthContext.jsx";

const empty = { title: "", body: "", category: "notice", is_pinned: true };

export default function Updates() {
  const { session } = useAuth();
  const secretary = session?.role === "secretary";
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(null);
  const [files, setFiles] = useState([]);
  const [picked, setPicked] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/api/updates").then((rows) => setItems(rows.map(decorateUpdate))).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const unpublished = items.filter((item) => !item.is_published);

  async function save(publish) {
    setError("");
    setBusy(true);
    try {
      const payload = { title: form.title, body: form.body, category: form.category, is_pinned: Boolean(form.is_pinned) };
      const saved = form.id ? await api.put(`/api/updates/${form.id}`, payload) : await api.post("/api/updates", payload);
      if (files.length) {
        const data = new FormData();
        files.forEach((file) => data.append("files", file));
        await api.upload(`/api/updates/${saved.id}/media`, data);
      }
      if (publish) await api.post(`/api/updates/${saved.id}/publish`, {});
      setForm(null);
      setFiles([]);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function generateSelected() {
    if (!picked) {
      setError("Create a notice in the list first, then select it to generate a post.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api.post(`/api/updates/${picked}/publish`, {});
      setPicked("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader icon="notices" title="Notices" blurb="Create a notice in the list first. If there is nothing to select, add one, then generate the post for residents.">
        {secretary ? <Btn icon="add" onClick={() => { setForm({ ...empty }); setFiles([]); setError(""); }}>Add notice</Btn> : null}
      </PageHeader>
      {error ? <p className="error">{error}</p> : null}
      {secretary ? (
        <section className="card generate-bar">
          <Field label="Select a notice from the list">
            <select value={picked} onChange={(e) => setPicked(e.target.value)}>
              <option value="">{unpublished.length ? "Select notice" : "No notice in the list to select"}</option>
              {unpublished.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </Field>
          <Btn icon="campaign" className="btn gold" type="button" disabled={busy || !picked} onClick={generateSelected}>
            Generate post
          </Btn>
          <p className="hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            {items.length === 0
              ? "The list is empty. Add a notice first, then generate a post for the notice board."
              : unpublished.length === 0
                ? "Every notice in the list already has a post. Add another notice to generate a new post."
                : "Pick a notice from the list, then generate the post. Residents only see generated posts."}
          </p>
        </section>
      ) : null}
      <section className="card">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Media</th>
              <th>Category</th>
              <th>Status</th>
              <th>Pinned</th>
              {secretary ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={secretary ? 6 : 5} className="empty">
                  {secretary ? "No notices in the list yet. Add a notice, then generate a post." : "No posts yet."}
                </td>
              </tr>
            ) : items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.title}</strong>
                  <div className="hint">{item.body}</div>
                </td>
                <td><MediaGrid media={item.media} compact /></td>
                <td><Badge value={item.category} /></td>
                <td><Badge value={item.is_published ? "posted" : "in_list"} /></td>
                <td>{item.is_pinned ? "Yes" : "No"}</td>
                {secretary ? (
                  <td className="btn-row">
                    {!item.is_published ? (
                      <Btn icon="campaign" className="btn small" disabled={busy} onClick={async () => { await api.post(`/api/updates/${item.id}/publish`, {}); load(); }}>Generate post</Btn>
                    ) : (
                      <Btn icon="visibility_off" className="btn ghost small" disabled={busy} onClick={async () => { await api.post(`/api/updates/${item.id}/unpublish`, {}); load(); }}>Remove post</Btn>
                    )}
                    <Btn icon="edit" className="btn ghost small" onClick={() => { setForm(item); setFiles([]); }}>Edit</Btn>
                    <Btn
                      icon="delete"
                      className="btn danger small"
                      onClick={async () => {
                        if (!confirmRemove("notice")) return;
                        await api.del(`/api/updates/${item.id}`);
                        load();
                      }}
                    >
                      Delete
                    </Btn>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {form ? (
        <Modal title={form.id ? "Edit notice" : "Add notice to list"} onClose={() => setForm(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(false);
            }}
          >
            <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Body"><textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></Field>
            <div className="grid-form">
              <Field label="Category">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="notice">Notice</option>
                  <option value="festival">Festival</option>
                  <option value="event">Event</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="general">General</option>
                </select>
              </Field>
              <Field label="Pin on dashboard">
                <select value={form.is_pinned ? "yes" : "no"} onChange={(e) => setForm({ ...form, is_pinned: e.target.value === "yes" })}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>
            </div>
            <Field label="Images or videos">
              <input type="file" multiple accept="image/*,video/mp4,video/webm,video/quicktime" onChange={(e) => setFiles([...e.target.files])} />
            </Field>
            {form.media?.length ? <MediaGrid media={form.media} compact /> : null}
            {form.media?.length ? (
              <div className="btn-row">
                {form.media.map((media) => (
                  <button key={media.id} type="button" className="btn danger small" onClick={async () => { await api.del(`/api/updates/media/${media.id}`); load(); setForm((current) => ({ ...current, media: current.media.filter((row) => row.id !== media.id) })); }}>
                    Remove media
                  </button>
                ))}
              </div>
            ) : null}
            <p className="hint">Save in list first if you only want it here. Generate post when it should appear on the notice board.</p>
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn ghost" type="submit" disabled={busy}>Save in list</button>
              <button className="btn gold" type="button" disabled={busy} onClick={() => save(true)}>Save & generate post</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
