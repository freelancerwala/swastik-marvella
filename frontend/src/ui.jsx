import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Ico } from "./icons.jsx";

export function Btn({ icon, children, className = "btn", to, href, type = "button", ...props }) {
  const body = (
    <>
      {icon ? <Ico name={icon} size={15} /> : null}
      {children}
    </>
  );
  if (to) return <Link className={className} to={to} {...props}>{body}</Link>;
  if (href) return <a className={className} href={href} {...props}>{body}</a>;
  return (
    <button type={type} className={className} {...props}>
      {body}
    </button>
  );
}

export function IconBtn({ icon, title, className = "icon-btn sm", to, href, ...props }) {
  const body = <Ico name={icon} size={16} />;
  if (to) return <Link className={className} to={to} title={title} aria-label={title} {...props}>{body}</Link>;
  if (href) return <a className={className} href={href} title={title} aria-label={title} {...props}>{body}</a>;
  return (
    <button type="button" className={className} title={title} aria-label={title} {...props}>
      {body}
    </button>
  );
}

export function WingSelect({ value, onChange, allowAll = false, name }) {
  return (
    <select name={name} value={value || (allowAll ? "all" : "A")} onChange={(e) => onChange(e.target.value)}>
      {allowAll ? <option value="all">All wings</option> : null}
      <option value="A">Wing A</option>
      <option value="B">Wing B</option>
    </select>
  );
}

export function Badge({ value }) {
  return <span className={`badge ${value || ""}`}>{String(value || "").replaceAll("_", " ")}</span>;
}

export function PageHeader({ icon, title, blurb, kicker = "Society workspace", children }) {
  return (
    <section className="dash-welcome page-hero">
      <div className="page-heading">
        {icon ? <span className="page-icon"><Ico name={icon} size={18} /></span> : null}
        <div>
          <span className="dash-kicker">{kicker}</span>
          <h2>{title}</h2>
          {blurb ? <p>{blurb}</p> : null}
        </div>
      </div>
      {children ? <div className="welcome-actions">{children}</div> : null}
    </section>
  );
}

export function Modal({ title, children, onClose }) {
  useEffect(() => {
    const main = document.querySelector(".app > main");
    const previous = window.scrollY;
    document.documentElement.classList.add("modal-open");
    if (main) main.classList.add("modal-open");
    return () => {
      document.documentElement.classList.remove("modal-open");
      if (main) main.classList.remove("modal-open");
      window.scrollTo(0, previous);
    };
  }, []);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="page-title">
          <div>
            <h2>{title}</h2>
          </div>
          <button className="btn ghost small" onClick={onClose}>
            <Ico name="close" size={14} /> Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}

export function confirmRemove(label) {
  return window.confirm(`Remove this ${label}? This cannot be undone.`);
}

export function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function money(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function compactMoney(n) {
  const value = Number(n || 0);
  if (value >= 100000) return `₹${(value / 100000).toFixed(value >= 1000000 ? 2 : 2)}L`;
  if (value >= 1000) return `₹${Math.round(value).toLocaleString("en-IN")}`;
  return money(value);
}

export function when(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function ago(value) {
  if (!value) return "";
  const delta = Date.now() - new Date(value).getTime();
  const mins = Math.max(0, Math.round(delta / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function initials(name) {
  return String(name || "S")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function MediaGrid({ media = [], compact = false }) {
  if (!media.length) return null;
  return (
    <div className={`media-grid${compact ? " compact" : ""}`}>
      {media.map((item) =>
        item.kind === "video" ? (
          <video key={item.id} className="media-item" src={item.url} controls playsInline />
        ) : (
          <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
            <img className="media-item" src={item.url} alt={item.caption || "Society update"} />
          </a>
        )
      )}
    </div>
  );
}

export function UpdateCard({ item }) {
  return (
    <article className="update-item">
      <Badge value={item.category} />
      {item.is_pinned ? <Badge value="notice" /> : null}
      <h3>{item.title}</h3>
      <p>{item.body}</p>
      <MediaGrid media={item.media} compact />
    </article>
  );
}

export function Pill({ active, onClick, children }) {
  return (
    <button type="button" className={`filter-pill${active ? " on" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function SearchField({ value, onChange, placeholder = "Search" }) {
  return (
    <label className="search-field">
      <span>Search</span>
      <span className="search-field-input">
        <Ico name="search" size={16} />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </span>
    </label>
  );
}

export function downloadCsv(filename, headers, rows) {
  const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const blob = new Blob(
    [[headers.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))].join("\n")],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function matches(query, ...parts) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return parts.some((part) => String(part || "").toLowerCase().includes(needle));
}
