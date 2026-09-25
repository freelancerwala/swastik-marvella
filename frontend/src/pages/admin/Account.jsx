import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../AuthContext.jsx";
import { Btn, Field, PageHeader } from "../../ui.jsx";

export default function Account() {
  const { session, updateSession } = useAuth();
  const [name, setName] = useState(session?.name || "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState({ phone: "", bank_name: "", account_name: "", account_number: "", ifsc: "", upi_id: "", qr_url: "" });
  const [payOk, setPayOk] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    api.get("/api/auth/me").then((user) => {
      setName(user.name || "");
      setPhone(user.phone || "");
      setEmail(user.email || "");
    }).catch((e) => setError(e.message));
    api.get("/api/society/payment").then((row) => {
      setPay(row);
      if (row.phone) setPhone(row.phone);
    }).catch(() => {});
  }, []);

  async function save(e) {
    e.preventDefault();
    setError("");
    setOk("");
    if (newPassword && newPassword !== confirmPassword) {
      setError("New password and confirm password do not match");
      return;
    }
    setBusy(true);
    try {
      const payload = { name, phone };
      if (newPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }
      const user = await api.put("/api/auth/profile", payload);
      updateSession({ name: user.name });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOk(newPassword ? "Name and password saved. Use the new password next time you sign in." : "Profile saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader icon="account" title="My account" blurb="Secretary mobile, bank details, and QR code are added to the WhatsApp maintenance notice sent on the 11th." />
      <section className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={save} className="grid-form">
          <Field label="Full name">
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email (login id)">
            <input value={email} type="email" disabled />
          </Field>
          <p className="hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            Email stays the same for login. Fill the password fields only when you want to change the password.
          </p>
          <Field label="Current password">
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password">
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} autoComplete="new-password" />
          </Field>
          {error ? <p className="error" style={{ gridColumn: "1 / -1" }}>{error}</p> : null}
          {ok ? <p className="hint" style={{ gridColumn: "1 / -1", color: "var(--ok)" }}>{ok}</p> : null}
          <div className="btn-row" style={{ gridColumn: "1 / -1", marginTop: 8 }}>
            <Btn icon="save" type="submit" disabled={busy}>{busy ? "Saving..." : "Save account"}</Btn>
          </div>
        </form>
      </section>
      <section className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <form
          className="grid-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setPayOk("");
            setError("");
            setPayBusy(true);
            try {
              const saved = await api.put("/api/society/payment", {
                phone: pay.phone || phone,
                bank_name: pay.bank_name,
                account_name: pay.account_name,
                account_number: pay.account_number,
                ifsc: pay.ifsc,
                upi_id: pay.upi_id,
              });
              setPay(saved);
              setPhone(saved.phone || "");
              setPayOk("Secretary mobile and bank details saved. The 11th WhatsApp notice uses these.");
            } catch (err) {
              setError(err.message);
            } finally {
              setPayBusy(false);
            }
          }}
        >
          <Field label="Secretary mobile">
            <input value={pay.phone} onChange={(e) => setPay({ ...pay, phone: e.target.value })} placeholder="10-digit mobile" />
          </Field>
          <Field label="Bank name">
            <input value={pay.bank_name} onChange={(e) => setPay({ ...pay, bank_name: e.target.value })} />
          </Field>
          <Field label="Account name">
            <input value={pay.account_name} onChange={(e) => setPay({ ...pay, account_name: e.target.value })} />
          </Field>
          <Field label="Account number">
            <input value={pay.account_number} onChange={(e) => setPay({ ...pay, account_number: e.target.value })} />
          </Field>
          <Field label="IFSC">
            <input value={pay.ifsc} onChange={(e) => setPay({ ...pay, ifsc: e.target.value })} />
          </Field>
          <Field label="UPI ID">
            <input value={pay.upi_id} onChange={(e) => setPay({ ...pay, upi_id: e.target.value })} placeholder="name@upi" />
          </Field>
          <Field label="Payment QR code">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const body = new FormData();
                body.append("file", file);
                try {
                  const saved = await api.upload("/api/society/payment/qr", body);
                  setPay(saved);
                  setPayOk("QR code saved.");
                } catch (err) {
                  setError(err.message);
                }
              }}
            />
          </Field>
          {pay.qr_url ? <img src={pay.qr_url} alt="Payment QR code" style={{ width: 140, height: 140, objectFit: "contain", background: "#fff" }} /> : null}
          {payOk ? <p className="hint" style={{ gridColumn: "1 / -1", color: "var(--ok)" }}>{payOk}</p> : null}
          <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
            <Btn icon="save" type="submit" disabled={payBusy}>{payBusy ? "Saving..." : "Save payment details"}</Btn>
          </div>
        </form>
      </section>
    </>
  );
}
