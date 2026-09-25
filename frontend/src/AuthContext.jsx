import { useCallback, useContext, createContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const token = localStorage.getItem("sm_token");
    if (!token) return null;
    return {
      token,
      name: localStorage.getItem("sm_name"),
      role: localStorage.getItem("sm_role"),
      panel: localStorage.getItem("sm_panel"),
      id: Number(localStorage.getItem("sm_id") || 0),
    };
  });
  const [gatePhase, setGatePhase] = useState("off");

  useEffect(() => {
    if (!session?.token || session.id) return;
    api.get("/api/auth/me").then((user) => {
      localStorage.setItem("sm_id", String(user.id));
      setSession((current) => (current ? { ...current, id: user.id } : current));
    }).catch(() => {});
  }, [session]);

  const openGate = useCallback(() => setGatePhase("opening"), []);
  const finishGate = useCallback(() => setGatePhase("off"), []);
  const beginClose = useCallback(() => setGatePhase("closing"), []);
  const completeLogout = useCallback(() => {
    localStorage.removeItem("sm_token");
    localStorage.removeItem("sm_name");
    localStorage.removeItem("sm_role");
    localStorage.removeItem("sm_panel");
    localStorage.removeItem("sm_id");
    setSession(null);
    setGatePhase("off");
  }, []);

  const value = useMemo(
    () => ({
      session,
      gatePhase,
      openGate,
      finishGate,
      beginClose,
      completeLogout,
      login: async (email, password) => {
        const data = await api.post("/api/auth/login", { email, password });
        localStorage.setItem("sm_token", data.access_token);
        localStorage.setItem("sm_name", data.name);
        localStorage.setItem("sm_role", data.role);
        localStorage.setItem("sm_panel", data.panel);
        localStorage.setItem("sm_id", String(data.user_id));
        setGatePhase("closed");
        setSession({
          token: data.access_token,
          name: data.name,
          role: data.role,
          panel: data.panel,
          id: data.user_id,
        });
        return data;
      },
      updateSession: (patch) => {
        setSession((current) => {
          if (!current) return current;
          const next = { ...current, ...patch };
          if (patch.name) localStorage.setItem("sm_name", patch.name);
          return next;
        });
      },
      logout: () => {
        setGatePhase((current) => (current === "off" ? "closing-prep" : current));
      },
    }),
    [session, gatePhase, openGate, finishGate, beginClose, completeLogout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
