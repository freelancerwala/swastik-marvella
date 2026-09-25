import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../AuthContext.jsx";
import { Badge, Btn, Field, Modal, PageHeader, Pill, SearchField, ago, confirmRemove, downloadCsv, matches } from "../../ui.jsx";
import { Ico } from "../../icons.jsx";

const CATEGORIES = ["plumbing", "electrical", "elevator", "intercom", "housekeeping", "carpentry", "other"];
const STATUSES = ["open", "urgent", "in_progress", "resolved"];

const emptyTicket = {
  module: "complaint",
  title: "",
  detail: "",
  category: "plumbing",
  status: "open",
  phone: "",
  notes: "",
};

export default function Complaints({ resident = false }) {
  const { session } = useAuth();
  const secretary = session?.role === "secretary";
  const canWrite = secretary || resident;
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [location, setLocation] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const tickets = await api.get("/api/society?module=complaint");
    setItems(tickets);
    if (secretary) {
      try {
        setStaff(await api.get("/api/society?module=staff"));
      } catch {
        setStaff([]);
      }
    }
  };
  useEffect(() => { load().catch((e) => setError(e.message)); }, [secretary]);

  const locations = useMemo(() => [...new Set(items.map((t) => t.detail).filter(Boolean))], [items]);
  const stats = useMemo(() => ({
    open: items.filter((t) => t.status === "open").length,
    urgent: items.filter((t) => t.status === "urgent").length,
    progress: items.filter((t) => t.status === "in_progress").length,
    resolved: items.filter((t) => t.status === "resolved").length,
  }), [items]);

  const filtered = useMemo(() => items.filter((item) => {
    if (category !== "all" && (item.category || "other") !== category) return false;
    if (status !== "all" && item.status !== status) return false;
    if (location !== "all" && item.detail !== location) return false;
    return matches(query, item.title, item.detail, item.phone, item.notes, item.category);
  }), [items, category, status, location, query]);

  async function save(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        module: "complaint",
        title: form.title,
        detail: form.detail || "",
        phone: form.phone || "",
        category: form.category || "other",
        status: form.status || "open",
        notes: form.notes || "",
      };
      if (form.id && secretary) await api.put(`/api/society/${form.id}`, payload);
      else await api.post("/api/society", payload);
      setForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setTicketStatus(item, next) {
    await api.put(`/api/society/${item.id}`, {
      module: "complaint",
      title: item.title,
      detail: item.detail || "",
      phone: item.phone || "",
      category: item.category || "other",
      status: next,
      notes: item.notes || "",
    });
    load();
  }

  function exportCsv() {
    downloadCsv(
      "swastik-marvella-complaints.csv",
      ["Subject", "Location", "Category", "Assigned", "Status", "Notes"],
      filtered.map((t) => [t.title, t.detail, t.category, t.phone, t.status, t.notes]),
    );
  }

  return (
    <>
      <PageHeader icon="complaints" title="Complaints" blurb="Ticket desk for plumbing, electrical, and society requests. Assign staff, change status, or raise a new ticket.">
        {canWrite ? <Btn icon="add" onClick={() => { setForm({ ...emptyTicket }); setError(""); }}>Raise ticket</Btn> : null}
        {secretary ? <Btn icon="download" className="btn ghost" onClick={exportCsv}>Export CSV</Btn> : null}
      </PageHeader>
      {error ? <p className="error">{error}</p> : null}

      <section className="kpi-grid kpi-4 ops-kpis">
        <article className="kpi-card"><div className="kpi-top"><span>Open</span><span className="kpi-ico"><Ico name="inbox" size={16} /></span></div><strong>{stats.open}</strong><p>Waiting assignment</p></article>
        <article className="kpi-card"><div className="kpi-top"><span>Urgent</span><span className="kpi-ico warn"><Ico name="priority_high" size={16} /></span></div><strong>{stats.urgent}</strong><p>Needs same-day care</p></article>
        <article className="kpi-card"><div className="kpi-top"><span>In progress</span><span className="kpi-ico"><Ico name="engineering" size={16} /></span></div><strong>{stats.progress}</strong><p>Staff working</p></article>
        <article className="kpi-card"><div className="kpi-top"><span>Resolved</span><span className="kpi-ico"><Ico name="check_circle" size={16} /></span></div><strong>{stats.resolved}</strong><p>Closed tickets</p></article>
      </section>

      <section className="ops-toolbar">
        <div className="pill-row">
          <Pill active={category === "all"} onClick={() => setCategory("all")}>All categories</Pill>
          {CATEGORIES.map((item) => <Pill key={item} active={category === item} onClick={() => setCategory(item)}>{item}</Pill>)}
        </div>
        <div className="pill-row">
          <Pill active={status === "all"} onClick={() => setStatus("all")}>All status</Pill>
          {STATUSES.map((item) => <Pill key={item} active={status === item} onClick={() => setStatus(item)}>{item.replaceAll("_", " ")}</Pill>)}
        </div>
        {locations.length ? (
          <div className="pill-row">
            <Pill active={location === "all"} onClick={() => setLocation("all")}>All locations</Pill>
            {locations.slice(0, 8).map((item) => <Pill key={item} active={location === item} onClick={() => setLocation(item)}>{item}</Pill>)}
          </div>
        ) : null}
        <SearchField value={query} onChange={setQuery} placeholder="Ticket, flat, staff…" />
      </section>

      {secretary && staff.length ? (
        <section className="staff-strip">
          {staff.filter((s) => s.status === "active").map((person) => (
            <span key={person.id} className="staff-chip">{person.title} · {person.detail || "staff"}</span>
          ))}
        </section>
      ) : null}

      {filtered.length === 0 ? (
        <section className="card empty-card">No tickets yet. Raise a ticket, or add staff first if you want to assign from the roster.</section>
      ) : (
        <div className="ticket-board">
          {filtered.map((ticket) => (
            <article key={ticket.id} className={`ticket-card ${ticket.status}`}>
              <header>
                <div>
                  <h3>{ticket.title}</h3>
                  <p>{ticket.detail || "Society"} · {ticket.category || "other"}</p>
                </div>
                <Badge value={ticket.status} />
              </header>
              {ticket.notes ? <p>{ticket.notes}</p> : null}
              <footer>
                <span>{ticket.phone ? `Assigned: ${ticket.phone}` : "Unassigned"}</span>
                <small>{ago(ticket.created_at)}</small>
              </footer>
              {secretary ? (
                <div className="btn-row wrap">
                  {ticket.status !== "in_progress" ? <Btn icon="play_arrow" className="btn ghost small" onClick={() => setTicketStatus(ticket, "in_progress")}>Start</Btn> : null}
                  {ticket.status !== "urgent" ? <Btn icon="priority_high" className="btn ghost small" onClick={() => setTicketStatus(ticket, "urgent")}>Mark urgent</Btn> : null}
                  {ticket.status !== "resolved" ? <Btn icon="check_circle" className="btn small" onClick={() => setTicketStatus(ticket, "resolved")}>Resolve</Btn> : null}
                  <Btn icon="edit" className="btn ghost small" onClick={() => { setForm(ticket); setError(""); }}>Edit / assign</Btn>
                  <Btn
                    icon="delete"
                    className="btn danger small"
                    onClick={async () => {
                      if (!confirmRemove("ticket")) return;
                      await api.del(`/api/society/${ticket.id}`);
                      load();
                    }}
                  >
                    Delete
                  </Btn>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {form ? (
        <Modal title={form.id ? "Edit ticket" : "Raise ticket"} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid-form">
            <Field label="Subject"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Flat / location"><input value={form.detail || ""} onChange={(e) => setForm({ ...form, detail: e.target.value })} /></Field>
            <Field label="Category">
              <select value={form.category || "other"} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status || "open"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
              </select>
            </Field>
            {secretary ? (
              <Field label="Assign to">
                {staff.length ? (
                  <select value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })}>
                    <option value="">Unassigned</option>
                    {staff.map((person) => <option key={person.id} value={person.title}>{person.title} · {person.detail || "staff"}</option>)}
                  </select>
                ) : (
                  <input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Add staff first, or type a name" />
                )}
              </Field>
            ) : null}
            <Field label="Details"><textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}><button className="btn" disabled={busy}>{form.id ? "Update" : "Insert"}</button></div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
