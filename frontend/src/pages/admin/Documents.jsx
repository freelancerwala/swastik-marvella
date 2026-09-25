import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../AuthContext.jsx";
import { Btn, Field, Modal, confirmRemove, matches } from "../../ui.jsx";
import { Ico } from "../../icons.jsx";

function readMeta(raw) {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

const emptyDoc = {
  module: "document",
  title: "",
  detail: "",
  category: "all",
  status: "current",
  notes: "",
  wing: "",
  floor: "",
  flat: "",
  occupancy: "all",
};

export default function Documents({ resident = false }) {
  const { session } = useAuth();
  const secretary = session?.role === "secretary";
  const [items, setItems] = useState([]);
  const [mine, setMine] = useState(null);
  const [form, setForm] = useState(null);
  const [wing, setWing] = useState("all");
  const [floor, setFloor] = useState("all");
  const [flatNo, setFlatNo] = useState("all");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [flats, setFlats] = useState([]);
  const [files, setFiles] = useState([]);

  const load = async () => {
    const [rows, allFlats] = await Promise.all([
      api.get("/api/society?module=document"),
      api.get("/api/flats").catch(() => []),
    ]);
    setItems(Array.isArray(rows) ? rows : []);
    setFlats(Array.isArray(allFlats) ? allFlats : []);
    if (!secretary) {
      const dash = await api.get("/api/dashboard").catch(() => null);
      const flats = await api.get("/api/flats").catch(() => []);
      const flat = flats.find((item) => item.number === dash?.my_flat);
      setMine(flat ? { wing: flat.wing, floor: flat.floor, number: flat.number, kind: session?.role === "owner" ? "owner" : "rent" } : { kind: session?.role === "owner" ? "owner" : "rent" });
    }
  };
  useEffect(() => { load().catch((e) => setError(e.message)); }, [secretary]);

  const docs = useMemo(() => items.map((item) => ({ ...item, extra: readMeta(item.meta) })), [items]);
  const visible = useMemo(() => docs.filter((item) => {
    const extra = item.extra || {};
    if (!secretary && mine) {
      if (extra.wing && mine.wing && extra.wing !== mine.wing) return false;
      if (extra.floor && mine.floor && Number(extra.floor) !== Number(mine.floor)) return false;
      if (extra.flat && mine.number && extra.flat !== mine.number) return false;
      if (extra.occupancy && extra.occupancy !== "all" && mine.kind && extra.occupancy !== mine.kind) return false;
    }
    if (wing !== "all" && (extra.wing || "") !== wing) return false;
    if (floor !== "all" && String(extra.floor || "") !== String(floor)) return false;
    if (flatNo !== "all" && (extra.flat || "") !== flatNo) return false;
    if (kind !== "all" && (extra.occupancy || "all") !== kind && (extra.occupancy || "all") !== "all") return false;
    return matches(query, item.title, item.detail, item.notes, extra.wing, extra.occupancy);
  }), [docs, secretary, mine, wing, floor, flatNo, kind, query]);

  const filterFloors = useMemo(() => {
    const list = Array.isArray(flats) ? flats : [];
    const source = wing === "all" ? list : list.filter((item) => item.wing === wing);
    return [...new Set(source.map((item) => item.floor).filter((value) => value || value === 0))].sort((a, b) => a - b);
  }, [flats, wing]);
  const formFlats = useMemo(() => {
    if (!form?.wing) return [];
    const list = Array.isArray(flats) ? flats : [];
    return list
      .filter((item) => item.wing === form.wing)
      .sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
  }, [flats, form?.wing]);
  const filterFlats = useMemo(() => {
    if (wing === "all") return [];
    const list = Array.isArray(flats) ? flats : [];
    return list
      .filter((item) => item.wing === wing && (floor === "all" || String(item.floor) === String(floor)))
      .sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
  }, [flats, wing, floor]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const chosen = files.length ? files : [null];
      if (!form.id && chosen.length > 1 && chosen.some((item) => !item)) {
        throw new Error("Choose the files to add.");
      }
      const batch = form.id ? [files[0] || null] : chosen;
      if (!form.id && !form.title.trim() && !batch[0]) throw new Error("Enter a document name or attach a file.");
      for (const attached of batch) {
        const chosenFlat = formFlats.find((item) => item.number === form.flat);
        const title = form.id
          ? form.title
          : (batch.length > 1 ? (form.title.trim() ? `${form.title.trim()} · ${attached.name}` : attached.name) : (form.title.trim() || attached?.name || ""));
        const payload = {
          module: "document",
          title,
          detail: form.detail || "",
          category: form.occupancy || "all",
          status: form.status || "current",
          notes: form.notes || "",
          meta: JSON.stringify({
            wing: form.wing || "",
            floor: form.wing ? (chosenFlat?.floor || form.floor || "") : "",
            flat: chosenFlat?.number || "",
            occupancy: form.occupancy || "all",
            file: attached ? "" : (form.fileName || ""),
            file_label: attached ? attached.name : (form.fileLabel || ""),
          }),
        };
        const saved = form.id ? await api.put(`/api/society/${form.id}`, payload) : await api.post("/api/society", payload);
        if (attached) {
          const data = new FormData();
          data.append("file", attached);
          await api.upload(`/api/society/${saved.id}/file`, data);
        }
      }
      setForm(null);
      setFiles([]);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openEdit(item) {
    const extra = item.extra || readMeta(item.meta);
    setForm({
      ...item,
      wing: extra.wing || "",
      floor: extra.floor || "",
      flat: extra.flat || "",
      occupancy: extra.occupancy || item.category || "all",
      fileName: extra.file || "",
      fileLabel: extra.file_label || extra.file_name || "",
    });
    setFiles([]);
  }

  return (
    <>
      <section className="dir-hero">
        <div className="page-heading">
          <span className="page-icon"><Ico name="folder" size={18} /></span>
          <div>
            <h2>Documents</h2>
            <p>{secretary ? "Secretary sees every document. Filter by wing, floor, owner, or rent." : "Documents for your wing, floor, and owner or rent record."}</p>
          </div>
        </div>
        {secretary ? <Btn icon="add" onClick={() => { setForm({ ...emptyDoc }); setFiles([]); setError(""); }}>Add document</Btn> : null}
      </section>
      {error ? <p className="error">{error}</p> : null}
      <section className="arcade-toolbar doc-filters">
        <label className="dir-search">
          <Ico name="search" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Document name…" />
        </label>
        <label>
          Wing
          <select value={wing} onChange={(e) => { setWing(e.target.value); setFloor("all"); setFlatNo("all"); }}>
            <option value="all">All wings</option>
            <option value="A">Wing A</option>
            <option value="B">Wing B</option>
          </select>
        </label>
        <label>
          Floor
          <select value={floor} onChange={(e) => { setFloor(e.target.value); setFlatNo("all"); }}>
            <option value="all">All floors</option>
            {(wing === "all" ? [] : filterFloors).map((item) => <option key={item} value={item}>Floor {item}</option>)}
          </select>
        </label>
        <label>
          Flat
          <select value={flatNo} onChange={(e) => setFlatNo(e.target.value)} disabled={wing === "all"}>
            <option value="all">{wing === "all" ? "Select a wing first" : "All flats"}</option>
            {filterFlats.map((item) => <option key={item.id} value={item.number}>{item.number}</option>)}
          </select>
        </label>
        <div className="seg">
          <button type="button" className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>All</button>
          <button type="button" className={kind === "owner" ? "on" : ""} onClick={() => setKind("owner")}>Owner</button>
          <button type="button" className={kind === "rent" ? "on" : ""} onClick={() => setKind("rent")}>Rent</button>
        </div>
      </section>
      <section className="card">
        <table className="resident-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Wing</th>
              <th>Flat</th>
              <th>For</th>
              <th>File</th>
              {secretary ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={secretary ? 6 : 5} className="empty">No documents in this filter. {secretary ? "Add a document and tag wing, floor, and owner or rent." : ""}</td></tr>
            ) : visible.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.title}</strong><div className="asset-line">{item.detail || item.status}</div></td>
                <td>{item.extra.wing ? `Wing ${item.extra.wing}` : "All wings"}</td>
                <td>{item.extra.flat || (item.extra.floor ? `Floor ${item.extra.floor}` : "All flats")}</td>
                <td>{item.extra.occupancy === "owner" ? "Owner" : item.extra.occupancy === "rent" ? "Rent" : "Everyone"}</td>
                <td>
                  {item.extra.file ? (
                    <a href={`/api/files/documents/${item.extra.file}?token=${encodeURIComponent(localStorage.getItem("sm_token") || "")}`} target="_blank" rel="noreferrer">
                      {item.extra.file_label || item.extra.file_name || "Open file"}
                    </a>
                  ) : "—"}
                  {item.notes ? <div className="asset-line">{item.notes}</div> : null}
                </td>
                {secretary ? (
                  <td className="btn-row">
                    <Btn icon="edit" className="btn ghost small" onClick={() => openEdit(item)}>Edit</Btn>
                    <Btn icon="delete" className="btn danger small" onClick={async () => { if (!confirmRemove("document")) return; await api.del(`/api/society/${item.id}`); load(); }}>Delete</Btn>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {form ? (
        <Modal title={form.id ? "Edit document" : "Add document"} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid-form">
            <Field label="Document name"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.id ? "" : "Optional if you attach files"} required={Boolean(form.id)} /></Field>
            <Field label="Category"><input value={form.detail || ""} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="Lease, NOC, ID" /></Field>
            <Field label="Wing">
              <select value={form.wing || ""} onChange={(e) => setForm({ ...form, wing: e.target.value, floor: "", flat: "" })}>
                <option value="">All wings</option>
                <option value="A">Wing A</option>
                <option value="B">Wing B</option>
              </select>
            </Field>
            <Field label="Flat number">
              <select
                value={form.flat || ""}
                onChange={(e) => {
                  const flat = formFlats.find((item) => item.number === e.target.value);
                  setForm({ ...form, flat: e.target.value, floor: flat?.floor || "" });
                }}
                disabled={!form.wing}
              >
                <option value="">{form.wing ? "All flats in this wing" : "Select a wing first"}</option>
                {formFlats.map((item) => <option key={item.id} value={item.number}>{item.number}</option>)}
              </select>
            </Field>
            <Field label="Shown to">
              <select value={form.occupancy || "all"} onChange={(e) => setForm({ ...form, occupancy: e.target.value })}>
                <option value="all">Owner and rent</option>
                <option value="owner">Owner only</option>
                <option value="rent">Rent only</option>
              </select>
            </Field>
            <Field label="Attach files">
              <input
                type="file"
                multiple={!form.id}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/*"
                onChange={(e) => setFiles([...(e.target.files || [])])}
              />
              {files.length ? <span className="hint">{files.length} file{files.length === 1 ? "" : "s"} selected. Each file is saved as its own document.</span> : null}
              {form.fileLabel && !files.length ? <span className="hint">Current file: {form.fileLabel}</span> : null}
            </Field>
            <Field label="Notes"><textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
              <Btn icon="save" type="submit" disabled={busy}>{form.id ? "Update" : "Insert"}</Btn>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
