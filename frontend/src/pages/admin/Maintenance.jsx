import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "../../api";
import { Field, Modal, Btn, IconBtn, WingSelect, compactMoney, confirmRemove, downloadCsv, matches, money, when } from "../../ui.jsx";
import { Ico } from "../../icons.jsx";

function fyLabel(date = new Date()) {
  const year = date.getFullYear();
  const start = date.getMonth() >= 3 ? year : year - 1;
  return `FY ${start}-${String(start + 1).slice(-2)}`;
}

function monthShort(value, live = false) {
  if (!value) return "";
  const [year, month] = String(value).split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  const label = date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  return live ? `${label} (Live)` : label;
}

function monthLong(value) {
  if (!value) return "";
  const [year, month] = String(value).split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function daysPastDue(due, today) {
  if (!due || due >= today) return 0;
  return Math.max(1, Math.round((new Date(`${today}T00:00:00`) - new Date(`${due}T00:00:00`)) / 86400000));
}

function dueOn15(month) {
  return month ? `${month}-15` : "";
}

function effectiveDue(row) {
  return row.due_date || dueOn15(row.month);
}

function ledgerStatus(row, today) {
  if (row.payment_status === "paid") return "paid";
  if (row.payment_status === "pending_review") return "review";
  const due = effectiveDue(row);
  if (row.remaining_amount > 0 && due && due < today) return "overdue";
  if (row.payment_status === "partial") return "partial";
  return "grace";
}

function invoiceNo(row) {
  return row.slip_no || `SM-${String(row.month || "").replace("-", "")}-${String(row.id).padStart(4, "0")}`;
}

function payMethod(row) {
  if (row.payment_method) return row.payment_method;
  const note = row.latest_payment?.secretary_note || "";
  if (row.latest_payment?.screenshot_path) return "Screenshot / UPI";
  if (/record/i.test(note) || /offline/i.test(note) || /cash/i.test(note)) return "Offline / cash";
  if (row.latest_payment?.status === "pending") return "Proof pending";
  if (row.payment_status === "paid") return "Confirmed";
  return "";
}

const PAY_METHODS = ["Cash", "UPI", "Bank transfer", "Cheque", "Card"];

export default function Maintenance() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [charges, setCharges] = useState([]);
  const [flats, setFlats] = useState([]);
  const [shops, setShops] = useState([]);
  const [form, setForm] = useState(null);
  const [pay, setPay] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [draft, setDraft] = useState({ month: currentMonth, amount: 3500, description: "Society maintenance", due_date: `${currentMonth}-15` });
  const [review, setReview] = useState(null);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("all");
  const [wing, setWing] = useState("all");
  const [sort, setSort] = useState("overdue");
  const [error, setError] = useState("");
  const [dueNote, setDueNote] = useState("");
  const [notices, setNotices] = useState(null);
  const [busy, setBusy] = useState(false);
  const primed = useRef(false);

  const load = async () => {
    const [rows, allFlats, arcade, due] = await Promise.all([
      api.get("/api/maintenance/charges"),
      api.get("/api/flats"),
      api.get("/api/society?module=shop").catch(() => []),
      api.get("/api/maintenance/due-notices").catch(() => null),
    ]);
    setCharges(rows);
    setFlats(allFlats);
    setShops(arcade);
    setNotices(due);
    if (!primed.current) {
      primed.current = true;
      const latest = [...new Set(rows.map((row) => row.month))].sort().reverse()[0] || currentMonth;
      setMonth(latest);
    }
  };
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const needFlat = Boolean(form) && !form.id && flats.length === 0;
  const wings = useMemo(() => [...new Set([...flats.map((f) => f.wing), ...charges.map((row) => row.wing)].filter(Boolean))], [flats, charges]);
  const focusMonth = month || currentMonth;
  const monthRows = useMemo(() => charges.filter((row) => row.month === focusMonth), [charges, focusMonth]);

  const stats = useMemo(() => {
    const billed = monthRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const collected = monthRows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
    const pending = monthRows.reduce((sum, row) => sum + Number(row.remaining_amount || 0), 0);
    const graceUnits = monthRows.filter((row) => ledgerStatus(row, today) === "grace").length;
    const overdueRows = monthRows.filter((row) => ledgerStatus(row, today) === "overdue");
    const overdueAmt = overdueRows.reduce((sum, row) => sum + Number(row.remaining_amount || 0), 0);
    const settled = charges.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
    const due = monthRows.map((row) => row.due_date).filter(Boolean).sort()[0];
    return {
      billed,
      collected,
      pending,
      pct: billed ? Math.round((collected / billed) * 1000) / 10 : 0,
      graceUnits,
      overdueAmt,
      overdueUnits: overdueRows.length,
      settled,
      due,
      units: monthRows.length,
    };
  }, [monthRows, charges, today]);

  const bars = useMemo(() => {
    const map = new Map();
    charges.forEach((row) => {
      const bucket = map.get(row.month) || { billed: 0, collected: 0 };
      bucket.billed += Number(row.amount || 0);
      bucket.collected += Number(row.paid_amount || 0);
      map.set(row.month, bucket);
    });
    const keys = [...map.keys()].sort().slice(-6);
    const peak = Math.max(1, ...keys.map((key) => map.get(key).billed));
    return keys.map((key) => {
      const row = map.get(key);
      const pending = Math.max(row.billed - row.collected, 0);
      return {
        month: key,
        ...row,
        pending,
        collectH: Math.round((row.collected / peak) * 100),
        pendingH: Math.round((pending / peak) * 100),
        live: key === currentMonth,
      };
    });
  }, [charges, currentMonth]);

  const wingPace = useMemo(() => wings.map((item) => {
    const rows = monthRows.filter((row) => row.wing === item);
    const billed = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const collected = rows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
    const units = flats.filter((f) => f.wing === item).length;
    return { wing: item, billed, collected, units, pct: billed ? Math.round((collected / billed) * 100) : 0 };
  }), [wings, monthRows, flats]);

  const shopCollected = shops.filter((item) => ["leased", "active"].includes(item.status)).length;

  const defaulters = useMemo(() => {
    const map = new Map();
    charges.forEach((row) => {
      if (ledgerStatus(row, today) !== "overdue") return;
      const key = row.flat_id;
      const bucket = map.get(key) || { flat: row.flat_number, wing: row.wing, occupant: row.occupant, remaining: 0, cycles: 0, days: 0 };
      bucket.remaining += Number(row.remaining_amount || 0);
      bucket.cycles += 1;
      bucket.days = Math.max(bucket.days, daysPastDue(row.due_date, today));
      map.set(key, bucket);
    });
    return [...map.values()].sort((a, b) => b.remaining - a.remaining).slice(0, 6);
  }, [charges, today]);

  const counts = useMemo(() => ({
    all: monthRows.length,
    paid: monthRows.filter((row) => ledgerStatus(row, today) === "paid").length,
    grace: monthRows.filter((row) => ledgerStatus(row, today) === "grace" || ledgerStatus(row, today) === "partial").length,
    overdue: monthRows.filter((row) => ledgerStatus(row, today) === "overdue").length,
    review: monthRows.filter((row) => ledgerStatus(row, today) === "review").length,
  }), [monthRows, today]);

  const filtered = useMemo(() => {
    const rows = charges.filter((row) => {
      if (month !== "all" && row.month !== focusMonth) return false;
      if (wing === "shops") return /shop|arcade|commercial/i.test(`${row.description} ${row.flat_number}`);
      if (wing !== "all" && row.wing !== wing) return false;
      const state = ledgerStatus(row, today);
      if (status === "paid" && state !== "paid") return false;
      if (status === "grace" && state !== "grace" && state !== "partial") return false;
      if (status === "overdue" && state !== "overdue") return false;
      if (status === "review" && state !== "review") return false;
      return matches(query, row.flat_number, row.occupant, row.month, row.description, row.wing, row.slip_no);
    });
    const ranked = [...rows];
    ranked.sort((a, b) => {
      if (sort === "amount") return Number(b.amount || 0) - Number(a.amount || 0);
      if (sort === "flat") return String(a.flat_number).localeCompare(String(b.flat_number), undefined, { numeric: true });
      const ad = ledgerStatus(a, today) === "overdue" ? daysPastDue(a.due_date, today) : 0;
      const bd = ledgerStatus(b, today) === "overdue" ? daysPastDue(b.due_date, today) : 0;
      if (bd !== ad) return bd - ad;
      return Number(b.remaining_amount || 0) - Number(a.remaining_amount || 0);
    });
    return ranked;
  }, [charges, month, focusMonth, wing, status, query, sort, today]);

  async function saveCharge(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let flatId = form.flat_id;
      if (!flatId) {
        if (!form.new_flat_number) throw new Error("No flat in the list. Create one here first.");
        const created = await api.post("/api/flats", {
          wing: form.new_flat_wing || "A",
          number: form.new_flat_number,
          floor: Number(form.new_flat_floor || 1),
          area_sqft: 0,
          status: "vacant",
          notes: "",
        });
        flatId = created.id;
      }
      const payload = {
        flat_id: Number(flatId),
        month: form.month,
        amount: Number(form.amount),
        due_date: form.due_date || null,
        description: form.description,
        payment_method: form.payment_method || "",
      };
      if (form.id) await api.put(`/api/maintenance/charges/${form.id}`, payload);
      else await api.post("/api/maintenance/charges", payload);
      setForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      "swastik-marvella-maintenance.csv",
      ["Invoice", "Flat", "Wing", "Resident", "Month", "Amount", "Remaining", "Due", "Status", "Method"],
      filtered.map((row) => [invoiceNo(row), row.flat_number, row.wing, row.occupant, row.month, row.amount, row.remaining_amount, row.due_date, ledgerStatus(row, today), payMethod(row)]),
    );
  }

  function shiftMonth(step) {
    const [year, mon] = String(focusMonth).split("-").map(Number);
    const date = new Date(year, mon - 1 + step, 1);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  const monthDue = useMemo(() => {
    const dates = [...new Set(monthRows.map((row) => row.due_date || dueOn15(row.month)).filter(Boolean))];
    return dates.length === 1 ? dates[0] : dueOn15(focusMonth);
  }, [monthRows, focusMonth]);

  async function saveMonthDue(value) {
    setError("");
    setDueNote("");
    try {
      const result = await api.put("/api/maintenance/charges/month-due", { month: focusMonth, due_date: value || null });
      setDueNote(value
        ? `Same due date saved on ${result.updated} bills for ${monthLong(focusMonth)}.`
        : `Due date cleared on ${result.updated} bills for ${monthLong(focusMonth)}.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveDue(row, due_date) {
    setCharges((list) => list.map((item) => (item.id === row.id ? { ...item, due_date } : item)));
    try {
      await api.put(`/api/maintenance/charges/${row.id}`, {
        flat_id: row.flat_id,
        month: row.month,
        amount: Number(row.amount),
        due_date: due_date || null,
        description: row.description || "Society maintenance",
        payment_method: row.payment_method || "",
      });
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  const unpaid = charges.filter((row) => row.payment_status !== "paid");

  return (
    <>
      <section className="dir-hero fin-hero">
        <div>
          <div className="fin-tags">
            <span>Financial management</span>
            <span>{fyLabel()}</span>
            <span className={`live-pill${charges.length ? " on" : ""}`}>{charges.length ? "Billing on file" : "Generate first bill"}</span>
          </div>
          <h2>Maintenance & Payments Ledger</h2>
          <p>Monitor society billing cycles, collections, dues, and defaulters across {wings.map((item) => `Wing ${item}`).join(", ") || "all wings"}{shops.length ? " and commercial shops" : ""}.</p>
        </div>
        <div className="welcome-actions">
          <Btn icon="notifications" className="btn ghost" to="/admin/reminders">Send Reminders</Btn>
          <Btn icon="receipt_long" className="btn ghost" onClick={() => unpaid[0] ? setPay({ charge_id: unpaid[0].id, amount: unpaid[0].remaining_amount || unpaid[0].amount, secretary_note: "Recorded by secretary", payment_method: unpaid[0].payment_method || "" }) : setError("No unpaid charge to record. Generate a bill first.")}>Record Offline</Btn>
          <Btn icon="download" className="btn ghost" onClick={exportCsv}>Export Tally/CSV</Btn>
          <Btn icon="add_circle" onClick={() => { setDraft((current) => ({ ...current, month: focusMonth, due_date: dueOn15(focusMonth) })); setBulk(true); setError(""); }}>Generate Monthly Bill</Btn>
        </div>
      </section>
      {error ? <p className="error">{error}</p> : null}
      {dueNote ? <p className="hint">{dueNote}</p> : null}
      {notices ? (
        <section className="panel-card">
          <div className="panel-head">
            <h3><Ico name="chat" size={16} /> 11th WhatsApp due notice</h3>
            {notices.qr_url ? <img src={notices.qr_url} alt="Payment QR" style={{ width: 72, height: 72, objectFit: "contain", background: "#fff" }} /> : null}
          </div>
          <p className="hint">{notices.note}</p>
          {notices.contacts?.length ? (
            <div className="activity-list">
              {notices.contacts.map((item) => (
                <div key={`${item.phone}-${item.flat}`} className="activity-row">
                  <div>
                    <p>{item.name} · {item.role === "rent" ? "Rent" : "Owner"} · {item.flat}</p>
                    <small>{item.phone} · {money(item.amount)}</small>
                  </div>
                  <Btn icon="chat" className="btn small" href={item.whatsapp_url} target="_blank" rel="noreferrer">WhatsApp</Btn>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="fin-kpis">
        <article>
          <header><span>Total billed ({monthShort(focusMonth)})</span><span className="kpi-ico"><Ico name="request_quote" size={18} /></span></header>
          <b>{money(stats.billed)}</b>
          <p>{stats.units} units{stats.due ? ` · Due ${when(stats.due)}` : ""}</p>
          <i><i style={{ width: stats.billed ? "100%" : "0%" }} /></i>
        </article>
        <article>
          <header><span>Collected so far</span><span className="kpi-ico"><Ico name="account_balance_wallet" size={18} /></span></header>
          <b>{money(stats.collected)} <small>{stats.pct}%</small></b>
          <p>{stats.pct ? `${stats.pct}% of this month` : "No collections yet"}</p>
          <i><i className="ok" style={{ width: `${Math.min(stats.pct, 100)}%` }} /></i>
        </article>
        <article>
          <header><span>Pending dues (grace)</span><span className="kpi-ico"><Ico name="pending_actions" size={18} /></span></header>
          <b>{money(stats.pending)}</b>
          <p>{stats.graceUnits} units still inside due date</p>
          <i><i className="warn" style={{ width: stats.billed ? `${Math.min(100, Math.round((stats.pending / stats.billed) * 100))}%` : "0%" }} /></i>
        </article>
        <article className="warn">
          <header><span>Overdue / defaulters</span><span className="kpi-ico warn"><Ico name="error_outline" size={18} /></span></header>
          <b>{money(stats.overdueAmt)} <small>{stats.overdueUnits} units</small></b>
          <p>Past due date · follow up from the list</p>
          <i><i className="danger" style={{ width: stats.billed ? `${Math.min(100, Math.round((stats.overdueAmt / stats.billed) * 100))}%` : "0%" }} /></i>
        </article>
        <article>
          <header><span>Settled slips</span><span className="kpi-ico"><Ico name="savings" size={18} /></span></header>
          <b>{money(stats.settled)}</b>
          <p>Confirmed collections on record</p>
          <i><i className="ok" style={{ width: stats.settled ? "100%" : "0%" }} /></i>
        </article>
      </section>

      <div className="ledger-split fin-intel">
        <section className="pace-card">
          <header>
            <div>
              <h3>Collection Pace & Historical Trajectory</h3>
              <p>Target recovery is 95% by the 20th of each calendar month</p>
            </div>
            <div className="legend">
              <span><i className="collected" /> Collected</span>
              <span><i className="pending" /> Pending</span>
            </div>
          </header>
          {bars.length === 0 ? <p className="muted">No billing months yet. Generate a monthly bill to start the chart.</p> : (
            <div className="pace-chart">
              <div className="pace-target">Target 95%</div>
              {bars.map((bar) => (
                <div className={`pace-col${bar.live ? " live" : ""}`} key={bar.month} title={`${bar.month}: ${money(bar.collected)} collected`}>
                  <em>{compactMoney(bar.collected)}</em>
                  <div className="pace-stack">
                    <span className="pending" style={{ height: `${bar.pendingH}%` }} />
                    <span className="collected" style={{ height: `${bar.collectH}%` }} />
                  </div>
                  <small>{monthShort(bar.month, bar.live)}</small>
                </div>
              ))}
            </div>
          )}
          <div className="pace-wings">
            {wingPace.map((item) => (
              <div key={item.wing}>
                <span>Wing {item.wing} ({item.units} flats)</span>
                <b>{compactMoney(item.collected)} <small>{item.pct}%</small></b>
              </div>
            ))}
            <div>
              <span>Commercial ({shops.length} shops)</span>
              <b>{shopCollected} leased</b>
            </div>
          </div>
        </section>

        <section className="defaulter-card">
          <header>
            <h3>Defaulter Escalations</h3>
            <span>{defaulters.length} active cases</span>
          </header>
          {defaulters.length === 0 ? <p className="muted">No overdue units this cycle.</p> : defaulters.map((row) => (
            <article key={row.flat}>
              <span className="avatar-round sm">{(row.flat || "?").slice(-3)}</span>
              <div>
                <b>Flat {row.flat}</b>
                <em>{row.occupant || "Unassigned"}</em>
                <p>Overdue {row.days} days · {row.cycles} billing cycle{row.cycles === 1 ? "" : "s"}</p>
              </div>
              <strong>{money(row.remaining)}</strong>
              <Link className="icon-nudge" to="/admin/reminders" title="Send reminder">→</Link>
            </article>
          ))}
          <footer>
            <span>Follow up from Reminders, then record offline when cash is received.</span>
            <button type="button" className="text-link" onClick={() => setStatus("overdue")}>Defaulter list</button>
          </footer>
        </section>
      </div>

      <section className="search-ribbon">
        <div className="ribbon-row">
          <div className="seg">
            <button type="button" className={wing === "all" ? "on" : ""} onClick={() => setWing("all")}>All units ({counts.all})</button>
            {wings.map((item) => (
              <button type="button" key={item} className={wing === item ? "on" : ""} onClick={() => setWing(item)}>Wing {item}</button>
            ))}
            <button type="button" className={wing === "shops" ? "on" : ""} onClick={() => setWing("shops")}>Commercial shops ({shops.length})</button>
          </div>
          <div className="month-nav">
            <IconBtn icon="chevron_left" title="Previous month" onClick={() => shiftMonth(-1)} />
            <b>{monthLong(focusMonth)}</b>
            <IconBtn icon="chevron_right" title="Next month" onClick={() => shiftMonth(1)} />
            <label className="due-set">
              Same due date for all
              <input type="date" value={monthDue} onChange={(e) => saveMonthDue(e.target.value)} />
            </label>
          </div>
        </div>
        <label className="dir-search">
          <Ico name="search" size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search flat, resident, invoice..." />
        </label>
        <div className="ribbon-row">
          <div className="seg">
            <button type="button" className={status === "all" ? "on" : ""} onClick={() => setStatus("all")}>All records ({counts.all})</button>
            <button type="button" className={status === "paid" ? "on" : ""} onClick={() => setStatus("paid")}>Paid ({counts.paid})</button>
            <button type="button" className={status === "grace" ? "on" : ""} onClick={() => setStatus("grace")}>Pending in grace ({counts.grace})</button>
            <button type="button" className={status === "overdue" ? "on" : ""} onClick={() => setStatus("overdue")}>Overdue defaulters ({counts.overdue})</button>
            <button type="button" className={status === "review" ? "on" : ""} onClick={() => setStatus("review")}>Proof review ({counts.review})</button>
          </div>
          <label className="sort-field">
            <span>Sort:</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="overdue">Overdue first</option>
              <option value="flat">Flat no</option>
              <option value="amount">Amount high to low</option>
            </select>
          </label>
        </div>
      </section>

      <section className="dir-panel">
        <table className="resident-table ledger-table">
          <thead>
            <tr>
              <th>Unit & Resident</th>
              <th>Invoice #</th>
              <th>Bill breakdown</th>
              <th>Amount</th>
              <th>Due date</th>
              <th>Payment method</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="empty">No bills for {monthLong(focusMonth)}. Generate this month and the due date is the 15th. After the 15th, an unpaid bill becomes overdue.</td></tr>
            ) : filtered.map((row) => {
              const state = ledgerStatus(row, today);
              return (
                <tr key={row.id}>
                  <td>
                    <div className="resident-cell">
                      <span className="avatar-round sm">{String(row.flat_number || "?").slice(-3)}</span>
                      <div>
                        <strong>{row.flat_number}</strong>
                        <div className="unit-line">{row.occupant || "Unassigned"}{row.wing ? ` · Wing ${row.wing}` : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td>{invoiceNo(row)}</td>
                  <td>{row.description || "Society maintenance"}</td>
                  <td>
                    <b>{money(row.amount)}</b>
                    {row.remaining_amount > 0 && row.remaining_amount !== row.amount ? <div className="asset-line">Due {money(row.remaining_amount)}</div> : null}
                  </td>
                  <td>
                    <input className="method-select" type="date" value={row.due_date || dueOn15(row.month)} onChange={(e) => saveDue(row, e.target.value)} />
                  </td>
                  <td>
                    <select
                      className="method-select"
                      value={PAY_METHODS.includes(row.payment_method) ? row.payment_method : ""}
                      onChange={async (e) => {
                        const payment_method = e.target.value;
                        setCharges((list) => list.map((item) => (item.id === row.id ? { ...item, payment_method } : item)));
                        try {
                          await api.put(`/api/maintenance/charges/${row.id}/method`, { payment_method });
                        } catch (err) {
                          setError(err.message);
                          load();
                        }
                      }}
                    >
                      <option value="">{payMethod(row) && !PAY_METHODS.includes(row.payment_method) ? payMethod(row) : "Select method"}</option>
                      {PAY_METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className={`pay-pill ${state === "paid" ? "paid" : state === "overdue" ? "due" : "grace"}`}>
                      {state === "paid" ? "Paid" : state === "overdue" ? "Overdue" : state === "review" ? "Review" : state === "partial" ? "Partial" : "In grace"}
                    </span>
                  </td>
                  <td className="row-actions">
                    {row.latest_payment?.status === "pending" ? <IconBtn icon="rate_review" title="Review" onClick={() => setReview(row.latest_payment)} /> : null}
                    {row.payment_status !== "paid" ? <IconBtn icon="payments" title="Record paid" onClick={() => setPay({ charge_id: row.id, amount: row.remaining_amount || row.amount, secretary_note: "Recorded by secretary", payment_method: row.payment_method || "" })} /> : null}
                    {row.latest_payment?.screenshot_path ? <IconBtn icon="download" title="Proof" href={fileUrl(row.latest_payment.screenshot_path)} target="_blank" rel="noreferrer" /> : null}
                    <IconBtn icon="edit" title="Edit" onClick={() => setForm({ ...row, due_date: row.due_date || "", new_flat_wing: "A", new_flat_number: "", new_flat_floor: 1 })} />
                    <IconBtn icon="delete" className="icon-btn sm warn" title="Delete" onClick={async () => { if (!confirmRemove("maintenance month")) return; await api.del(`/api/maintenance/charges/${row.id}`); load(); }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {bulk ? (
        <Modal title="Generate Monthly Bill" onClose={() => setBulk(false)}>
          <form
            className="grid-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                if (flats.length === 0) throw new Error("No flats in the list. Add a flat first, then generate months.");
                await api.post("/api/maintenance/charges/bulk", { ...draft, amount: Number(draft.amount), due_date: draft.due_date || null });
                setBulk(false);
                setMonth(draft.month);
                load();
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            <p className="hint">Creates the month for every flat that does not already have it. Use Add single charge if you only need one unit.</p>
            <Field label="Month"><input type="month" value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} /></Field>
            <Field label="Amount"><input type="number" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></Field>
            <Field label="Same due date for all"><input type="date" value={draft.due_date || dueOn15(draft.month)} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></Field>
            <Field label="Description"><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
              <button className="btn gold">Generate remaining months</button>
              <button type="button" className="btn ghost" onClick={() => { setBulk(false); setForm({ flat_id: "", month: draft.month, amount: draft.amount, due_date: "", description: draft.description, new_flat_wing: "A", new_flat_number: "", new_flat_floor: 1 }); }}>Add single charge</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {form ? (
        <Modal title={form.id ? "Edit charge" : "Create charge"} onClose={() => setForm(null)}>
          <form onSubmit={saveCharge} className="grid-form">
            <Field label="Flat">
              <select value={form.flat_id} onChange={(e) => setForm({ ...form, flat_id: e.target.value })} required={!needFlat}>
                <option value="">{flats.length ? "Select flat" : "No flat in the list — create below"}</option>
                {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
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
            <Field label="Month"><input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} required /></Field>
            <Field label="Amount"><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
            <Field label="Due date"><input type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            <Field label="Payment method">
              <select value={form.payment_method || ""} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                <option value="">Select method</option>
                {PAY_METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}><button className="btn" disabled={busy}>{form.id ? "Update" : "Insert"}</button></div>
          </form>
        </Modal>
      ) : null}

      {pay ? (
        <Modal title="Record offline payment" onClose={() => setPay(null)}>
          <form
            className="grid-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await api.post("/api/maintenance/payments/record", { ...pay, amount: Number(pay.amount) });
                setPay(null);
                load();
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            {unpaid.length > 1 ? (
              <Field label="Charge">
                <select value={pay.charge_id} onChange={(e) => {
                  const row = charges.find((item) => String(item.id) === e.target.value);
                  setPay({ charge_id: Number(e.target.value), amount: row?.remaining_amount || row?.amount || pay.amount, secretary_note: pay.secretary_note, payment_method: row?.payment_method || pay.payment_method || "" });
                }}>
                  {unpaid.map((row) => <option key={row.id} value={row.id}>{row.flat_number} · {row.month} · {money(row.remaining_amount)}</option>)}
                </select>
              </Field>
            ) : null}
            <Field label="Amount"><input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} required /></Field>
            <Field label="Payment method">
              <select value={pay.payment_method || ""} onChange={(e) => setPay({ ...pay, payment_method: e.target.value })}>
                <option value="">Select method</option>
                {PAY_METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Note"><input value={pay.secretary_note} onChange={(e) => setPay({ ...pay, secretary_note: e.target.value })} /></Field>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}><button className="btn gold">Confirm and create slip</button></div>
          </form>
        </Modal>
      ) : null}

      {review ? (
        <Modal title="Confirm payment screenshot" onClose={() => setReview(null)}>
          <p>Payer: {review.payer_name} · {money(review.amount)}</p>
          {review.screenshot_path ? (
            <p><a href={fileUrl(review.screenshot_path)} target="_blank" rel="noreferrer">Open attached proof</a></p>
          ) : null}
          <div className="btn-row">
            <button className="btn" onClick={async () => { await api.post(`/api/maintenance/payments/${review.id}/review`, { status: "confirmed", secretary_note: "Verified" }); setReview(null); load(); }}>Confirm and create slip</button>
            <button className="btn danger" onClick={async () => { await api.post(`/api/maintenance/payments/${review.id}/review`, { status: "rejected", secretary_note: "Proof not clear" }); setReview(null); load(); }}>Reject</button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
