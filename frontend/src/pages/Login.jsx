import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { Ico } from "../icons.jsx";

export default function Login() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) {
    return <Navigate to={session.panel === "admin" ? "/admin" : "/app"} replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await login(email, password);
      window.setTimeout(() => {
        navigate(data.panel === "admin" ? "/admin" : "/app");
      }, 80);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-panel" onSubmit={onSubmit}>
        <div className="login-panel-inner">
          <div className="brand-row">
            <div>
              <h2>Sign in</h2>
              <span>Swastik Marvella</span>
            </div>
          </div>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="current-password" />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <div className="btn-row">
            <button className="btn" disabled={busy}>
              <Ico name="login" size={16} />
              {busy ? "Checking..." : "Enter Swastik Marvella"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
