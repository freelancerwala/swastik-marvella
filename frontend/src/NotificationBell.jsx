import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import { Ico } from "./icons.jsx";
import { when } from "./ui.jsx";

export default function NotificationBell({ compact = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);

  async function load() {
    const [list, unread] = await Promise.all([api.get("/api/notifications"), api.get("/api/notifications/unread-count")]);
    setItems(list);
    setCount(unread.count || 0);
  }

  useEffect(() => {
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, []);

  async function openItem(item) {
    if (!item.is_read) await api.post(`/api/notifications/${item.id}/read`, {});
    setOpen(false);
    load().catch(() => {});
    if (item.link) navigate(item.link);
  }

  return (
    <div className="bell-wrap">
      <button className={compact ? "icon-btn" : "btn ghost small bell-btn"} onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        {compact ? <Ico name="notifications" size={18} /> : "Alerts"}
        {count > 0 ? <span className="bell-count">{count}</span> : null}
      </button>
      {open ? (
        <div className="bell-panel">
          <div className="btn-row" style={{ marginBottom: 8 }}>
            <strong>Notifications</strong>
            <button className="btn ghost small" onClick={async () => { await api.post("/api/notifications/read-all", {}); load(); }}>
              Mark all read
            </button>
          </div>
          {items.length === 0 ? <p className="empty">No reminders yet.</p> : items.map((item) => (
            <button key={item.id} className={`bell-item${item.is_read ? "" : " unread"}`} onClick={() => openItem(item)}>
              <strong>{item.title}</strong>
              <span>{item.body}</span>
              <small>{when(item.created_at)}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
