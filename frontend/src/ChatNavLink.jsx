import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "./api";
import { Icon } from "./icons.jsx";

export default function ChatNavLink({ to }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = () => api.get("/api/chat/unread-count").then((data) => setCount(data.count || 0)).catch(() => {});
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <NavLink to={to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      <Icon name="chat" size={16} />
      <span>Chat</span>
      {count > 0 ? <span className="bell-count">{count}</span> : null}
    </NavLink>
  );
}
