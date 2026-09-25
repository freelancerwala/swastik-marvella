export function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  const paths = {
    dashboard: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
      </>
    ),
    flats: (
      <>
        <path d="M4 20V7.5L12 3.5l8 4V20" />
        <path d="M9 20v-6h6v6" />
        <path d="M8 9h.01M12 9h.01M16 9h.01M8 13h.01M16 13h.01" />
      </>
    ),
    residents: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19c.8-3.2 3.4-5 7-5s6.2 1.8 7 5" />
      </>
    ),
    shops: (
      <>
        <path d="M4 9.5 5.2 5h13.6L20 9.5" />
        <path d="M5 9.5h14v10H5z" />
        <path d="M10 19.5v-6h4v6" />
        <path d="M8 5V4a4 4 0 0 1 8 0v1" />
      </>
    ),
    parking: (
      <>
        <path d="M4 16V11l2.2-5.5h11.6L20 11v5" />
        <circle cx="7.4" cy="16.6" r="1.7" />
        <circle cx="16.6" cy="16.6" r="1.7" />
        <path d="M4.5 11h15" />
      </>
    ),
    visitors: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2.4" />
        <circle cx="12" cy="10" r="2.3" />
        <path d="M8 16.2c.7-1.8 2.1-2.7 4-2.7s3.3.9 4 2.7" />
      </>
    ),
    complaints: (
      <>
        <path d="M8 14.5 5.5 12l8.4-8.4 2.5 2.5L8 14.5Z" />
        <path d="M5.5 12 3.8 17.4 9.2 15.8" />
        <circle cx="17.5" cy="17" r="2.4" />
        <path d="M17.5 15.8v1.4h1.2" />
      </>
    ),
    maintenance: (
      <>
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 4.2V3h6v1.2" />
        <path d="M9 10h6M9 13.5h6M9 17h4" />
      </>
    ),
    payments: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2.2" />
        <path d="M3 10h18" />
        <path d="M7 15h3M16 15h2" />
      </>
    ),
    notices: (
      <>
        <path d="M5 10v4h2.2L12 17V7L7.2 10H5Z" />
        <path d="M15.2 9.2a3.6 3.6 0 0 1 0 5.6" />
        <path d="M17.6 7.2a6.4 6.4 0 0 1 0 9.6" />
      </>
    ),
    events: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2.2" />
        <path d="M8 3.5v3.5M16 3.5v3.5M4 10h16" />
        <path d="M8 14h.01M12 14h.01M16 14h.01" />
      </>
    ),
    staff: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19c.8-3.2 3.4-5 7-5s6.2 1.8 7 5" />
        <path d="M17.2 6.2 18.5 8l2.3-.8" />
      </>
    ),
    security: (
      <>
        <path d="M12 3 4.8 6.2v5.8c0 4.4 3.1 7.8 7.2 9 4.1-1.2 7.2-4.6 7.2-9V6.2L12 3Z" />
        <path d="M9.4 12.1 11.2 14l3.6-4" />
      </>
    ),
    documents: (
      <>
        <path d="M7 3h7l5 5v13H7V3Z" />
        <path d="M14 3v5h5" />
        <path d="M10 13h6M10 17h4" />
      </>
    ),
    reports: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 16v-5M12 16V8M16 16v-8" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16.2 16.2 21 21" />
      </>
    ),
    chat: <path d="M5 18.5v-2.2A6.3 6.3 0 0 1 11.3 10H16a4.8 4.8 0 0 1 0 9.6H8.2L5 18.5Z" />,
    whatsapp: (
      <>
        <path d="M5 19l1.2-3.2A7.5 7.5 0 1 1 8.4 18.4L5 19Z" />
        <path d="M9.2 10.2c.2.8 1 1.8 1.8 2.4.8.6 1.8 1.2 2.7 1.3" />
      </>
    ),
    reminders: (
      <>
        <path d="M12 6a6 6 0 0 1 6 6v4l1.2 2H4.8L6 16v-4a6 6 0 0 1 6-6Z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </>
    ),
    account: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19c.8-3.2 3.4-5 7-5s6.2 1.8 7 5" />
        <circle cx="18" cy="7" r="2" />
      </>
    ),
    owners: (
      <>
        <path d="M4 20V9l8-5 8 5v11" />
        <path d="M10 20v-6h4v6" />
      </>
    ),
    rent: (
      <>
        <path d="M5 20V10h14v10" />
        <path d="M3 10 12 4l9 6" />
      </>
    ),
  };
  return <svg {...common}>{paths[name] || paths.dashboard}</svg>;
}

export const PAGE_MS = {
  dashboard: "dashboard",
  flats: "apartment",
  residents: "badge",
  shops: "storefront",
  parking: "local_parking",
  visitors: "how_to_reg",
  complaints: "report",
  maintenance: "receipt_long",
  payments: "payments",
  notices: "campaign",
  events: "event",
  staff: "groups",
  security: "security",
  documents: "folder",
  reports: "analytics",
  owners: "shield_person",
  rent: "real_estate_agent",
  reminders: "notifications",
  whatsapp: "chat",
  chat: "forum",
  account: "manage_accounts",
  search: "search",
};

export function Ico({ name, size = 16, className = "" }) {
  const glyph = PAGE_MS[name] || name;
  return (
    <span className={`ms ${className}`.trim()} style={{ fontSize: size, width: size, height: size }} aria-hidden="true">
      {glyph}
    </span>
  );
}
