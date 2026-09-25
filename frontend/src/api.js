const API = import.meta.env.VITE_API_URL || "";

function headers(extra = {}) {
  const token = localStorage.getItem("sm_token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || "Request failed");
  }
  return data;
}

export const api = {
  get: (path) => fetch(`${API}${path}`, { headers: headers() }).then(handle),
  post: (path, body) =>
    fetch(`${API}${path}`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }).then(handle),
  put: (path, body) =>
    fetch(`${API}${path}`, {
      method: "PUT",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }).then(handle),
  del: (path) => fetch(`${API}${path}`, { method: "DELETE", headers: headers() }).then(handle),
  upload: (path, form) =>
    fetch(`${API}${path}`, { method: "POST", headers: headers(), body: form }).then(handle),
};

export function decorateUpdate(item) {
  return {
    ...item,
    media: (item.media || []).map((media) => ({ ...media, url: fileUrl(media.path) })),
  };
}

export function fileUrl(path) {
  if (!path) return "";
  const token = localStorage.getItem("sm_token");
  const url = path.startsWith("http") ? path : `${API}/api/files/${path}`;
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}
