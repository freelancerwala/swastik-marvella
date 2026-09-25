import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Btn, PageHeader, confirmRemove, money, when } from "../ui.jsx";
import { Ico } from "../icons.jsx";
import { useAuth } from "../AuthContext.jsx";

export default function Slips({ title = "Payments & paid slips" }) {
  const { session } = useAuth();
  const secretary = session?.role === "secretary";
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [wing, setWing] = useState("all");
  const [floor, setFloor] = useState("all");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");

  const load = () => api.get("/api/slips").then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const floors = useMemo(() => [...new Set(items.map((item) => item.floor).filter((n) => n || n === 0))].sort((a, b) => a - b), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    if (wing !== "all" && item.wing !== wing) return false;
    if (floor !== "all" && String(item.floor) !== String(floor)) return false;
    if (kind === "owner" && item.occupant_kind !== "owner") return false;
    if (kind === "rent" && item.occupant_kind !== "rent") return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [item.slip_no, item.flat_number, item.occupant, item.phone, item.month].some((part) => String(part || "").toLowerCase().includes(needle));
  }), [items, wing, floor, kind, query]);

  async function sharePdf(item) {
    setError("");
    const digits = String(item.phone || "").replace(/\D/g, "");
    if (digits.length < 10) {
      setError("This owner or rent record has no mobile number.");
      return;
    }
    const number = digits.length === 10 ? `91${digits}` : digits;
    const fileName = `${item.slip_no}.pdf`;
    const pdfUrl = item.pdf_path || `/api/files/slips/${fileName}`;
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error("Paid slip PDF is not ready.");
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const download = document.createElement("a");
      download.href = URL.createObjectURL(blob);
      download.download = fileName;
      download.click();
      window.open(`https://wa.me/${number}`, "_blank");
    } catch (err) {
      if (err?.name === "AbortError") return;
      setError(err.message || "Could not share the slip.");
    }
  }

  return (
    <>
      <PageHeader icon="payments" title={title} blurb="Paid slips. PDF opens the receipt. WhatsApp uses the owner or rent mobile already on the row and shares that PDF." />
      {error ? <p className="error">{error}</p> : null}
      <section className="arcade-toolbar doc-filters">
        <label className="dir-search">
          <Ico name="search" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Slip, flat, name, mobile…" />
        </label>
        <label>
          Wing
          <select value={wing} onChange={(e) => setWing(e.target.value)}>
            <option value="all">All wings</option>
            <option value="A">Wing A</option>
            <option value="B">Wing B</option>
          </select>
        </label>
        <label>
          Floor
          <select value={floor} onChange={(e) => setFloor(e.target.value)}>
            <option value="all">All floors</option>
            {floors.map((item) => <option key={item} value={item}>Floor {item}</option>)}
          </select>
        </label>
        <div className="seg">
          <button type="button" className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>All</button>
          <button type="button" className={kind === "owner" ? "on" : ""} onClick={() => setKind("owner")}>Owner</button>
          <button type="button" className={kind === "rent" ? "on" : ""} onClick={() => setKind("rent")}>Rent</button>
        </div>
      </section>
      <section className="card">
        {filtered.length === 0 && !error ? <p className="empty">No paid slips in this filter. Confirm a maintenance payment to create a slip.</p> : (
          <table className="resident-table">
            <thead>
              <tr>
                <th>Slip</th>
                <th>Flat</th>
                <th>Occupant</th>
                <th>Mobile</th>
                <th>Month</th>
                <th>Amount</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>{item.slip_no}</td>
                  <td>{item.flat_number}{item.wing ? <div className="asset-line">Wing {item.wing}{item.floor ? ` · Floor ${item.floor}` : ""}</div> : null}</td>
                  <td>{item.occupant || "—"}<div className="asset-line">{item.occupant_kind === "rent" ? "Rent" : item.occupant_kind === "owner" ? "Owner" : ""}</div></td>
                  <td>{item.phone || "—"}</td>
                  <td>{item.month}</td>
                  <td>{money(item.amount)}</td>
                  <td>{when(item.created_at)}</td>
                  <td className="btn-row">
                    <Btn icon="picture_as_pdf" className="btn ghost small" href={item.pdf_path || `/api/files/slips/${item.slip_no}.pdf`} target="_blank" rel="noreferrer">PDF</Btn>
                    <Btn icon="chat" className="btn small" onClick={() => sharePdf(item)}>WhatsApp</Btn>
                    {secretary ? (
                      <Btn icon="delete" className="btn danger small" onClick={async () => { if (!confirmRemove("paid slip")) return; await api.del(`/api/slips/${item.id}`); load(); }}>Delete</Btn>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
