import { useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import { Icon, Ico } from "./icons.jsx";
import { Btn, initials } from "./ui.jsx";

const adminLinks = [
  ["Dashboard", "/admin", "dashboard", true],
  ["Wings & Flats", "/admin/wings", "flats"],
  ["Residents", "/admin/residents", "residents"],
  ["Shops", "/admin/shops", "shops"],
  ["Parking", "/admin/parking", "parking"],
  ["Maintenance", "/admin/maintenance", "maintenance"],
  ["Payments", "/admin/payments", "payments"],
  ["Documents", "/admin/documents", "documents"],
];

const adminFoot = [
  ["WhatsApp all", "/admin/broadcast", "whatsapp"],
  ["Reminders", "/admin/reminders", "reminders"],
  ["Owner details", "/admin/owners", "owners"],
  ["Rent details", "/admin/tenants", "rent"],
  ["My account", "/admin/account", "account"],
];

const userLinks = (role) =>
  role === "owner"
    ? [
        ["Dashboard", "/app", "dashboard", true],
        ["Owner details", "/app/owner", "owners"],
        ["House on rent", "/app/rent", "rent"],
        ["Maintenance", "/app/maintenance", "maintenance"],
        ["Payments", "/app/slips", "payments"],
      ]
    : [
        ["Dashboard", "/app", "dashboard", true],
        ["Rent details", "/app/rent", "rent"],
        ["Maintenance", "/app/maintenance", "maintenance"],
        ["Payments", "/app/slips", "payments"],
      ];

function NavItem({ to, icon, label, end }) {
  return (
    <NavLink to={to} end={Boolean(end)} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      <Icon name={icon} size={16} />
      <span>{label}</span>
    </NavLink>
  );
}

function TopChrome({ subtitle, roleLabel, links, accountTo }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState(false);
  const today = useMemo(
    () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" }),
    []
  );
  const hits = links.filter(([label]) => query.trim() && label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);

  function go(e) {
    e.preventDefault();
    const match = hits[0] || links.find(([label]) => label.toLowerCase().includes(query.trim().toLowerCase()));
    if (match) {
      navigate(match[1]);
      setQuery("");
    }
  }

  return (
    <div className="topbar">
      <div className="top-brand">
        <img src="/emblem.png" alt="" />
        <div>
          <strong>Swastik Marvella</strong>
          <div className="hint">{subtitle}</div>
        </div>
      </div>
      <form className="top-search" onSubmit={go}>
        <Ico name="search" size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search flats, residents, shops, parking..."
        />
        {query.trim() ? (
          <div className="search-hits">
            {hits.length === 0 ? <p className="hint">No matching module</p> : hits.map(([label, to, icon]) => (
              <button key={to} type="button" onClick={() => { navigate(to); setQuery(""); }}>
                <Ico name={icon} size={16} /> {label}
              </button>
            ))}
          </div>
        ) : null}
      </form>
      <div className="top-actions">
        <span className="top-date">{today}</span>
        <div className="quick-wrap">
          <Btn icon="add" className="btn small" type="button" onClick={() => setQuick((v) => !v)}>
            Quick Action
          </Btn>
          {quick ? (
            <div className="quick-menu">
              {(session?.panel === "admin"
                ? [
                    ["Record payment", "/admin/maintenance"],
                    ["Add resident", "/admin/residents"],
                    ["Onboard shop", "/admin/shops"],
                    ["Allot parking", "/admin/parking"],
                    ["Add document", "/admin/documents"],
                  ]
                : [
                    ["Pay maintenance", "/app/maintenance"],
                    ["My payments", "/app/slips"],
                    ["My details", session?.role === "owner" ? "/app/owner" : "/app/rent"],
                  ]
              ).map(([label, to]) => (
                <button key={to} type="button" onClick={() => { setQuick(false); navigate(to); }}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <NotificationBell compact />
        <button className="avatar-chip" type="button" onClick={() => navigate(accountTo)} title={session?.name}>
          <span>{initials(session?.name)}</span>
          <em>{roleLabel}</em>
        </button>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const { session, logout } = useAuth();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <img src="/emblem.png" alt="Swastik Marvella" />
          <div>
            <small>Society admin</small>
            <h1>Swastik Marvella</h1>
          </div>
        </div>
        <nav className="side-nav">
          {adminLinks.map(([label, to, icon, end]) => (
            <NavItem key={to} to={to} icon={icon} label={label} end={end} />
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="nav-mini">
            {adminFoot.map(([label, to]) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
                {label}
              </NavLink>
            ))}
          </div>
          <div className="profile-card">
            <span className="avatar-chip mini">{initials(session?.name)}</span>
            <div>
              <strong>{session?.name}</strong>
              <small>Estate secretary</small>
            </div>
          </div>
          <Btn icon="logout" className="btn gold" onClick={logout}>
            Logout
          </Btn>
        </div>
      </aside>
      <main>
        <TopChrome subtitle="Society management dashboard" roleLabel="Secretary" links={[...adminLinks, ...adminFoot]} accountTo="/admin/account" />
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function UserLayout() {
  const { session, logout } = useAuth();
  const links = userLinks(session?.role);
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <img src="/emblem.png" alt="Swastik Marvella" />
          <div>
            <small>Resident panel</small>
            <h1>Swastik Marvella</h1>
          </div>
        </div>
        <nav className="side-nav">
          {links.map(([label, to, icon, end]) => (
            <NavItem key={to} to={to} icon={icon} label={label} end={end} />
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="profile-card">
            <span className="avatar-chip mini">{initials(session?.name)}</span>
            <div>
              <strong>{session?.name}</strong>
              <small>{session?.role === "owner" ? "Owner" : "Resident"}</small>
            </div>
          </div>
          <Btn icon="logout" className="btn gold" onClick={logout}>
            Logout
          </Btn>
        </div>
      </aside>
      <main>
        <TopChrome
          subtitle={session?.role === "owner" ? "Owner workspace" : "Rent workspace"}
          roleLabel={session?.role}
          links={links}
          accountTo={session?.role === "owner" ? "/app/owner" : "/app/rent"}
        />
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
