import { useEffect, useState } from "react";
import { api } from "../../api";
import { Badge, Btn, Field, Modal, PageHeader, money } from "../../ui.jsx";

export default function UserMaintenance() {
  const [items, setItems] = useState([]);
  const [pay, setPay] = useState(null);
  const [file, setFile] = useState(null);
  const [amount, setAmount] = useState("");
  const load = () => api.get("/api/maintenance/charges").then(setItems);
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    const form = new FormData();
    form.append("charge_id", pay.id);
    form.append("amount", amount || pay.remaining_amount);
    form.append("screenshot", file);
    await api.upload("/api/maintenance/payments", form);
    setPay(null);
    setFile(null);
    load();
  }

  return (
    <>
      <PageHeader icon="maintenance" title="Maintenance" blurb="Unpaid months stay in remaining. After you attach a screenshot, the secretary confirms it and the month slip appears automatically." />
      <section className="card">
        <table>
          <thead><tr><th>Month</th><th>Amount</th><th>Remaining</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.month}<div className="hint">{row.description}</div></td>
                <td>{money(row.amount)}</td>
                <td>{money(row.remaining_amount)}</td>
                <td><Badge value={row.payment_status} /></td>
                <td>
                  {row.remaining_amount > 0 && row.payment_status !== "pending_review" ? (
                    <Btn icon="payments" className="btn small" onClick={() => { setPay(row); setAmount(row.remaining_amount); }}>Pay & attach screenshot</Btn>
                  ) : row.payment_status === "pending_review" ? <span className="hint">Waiting for secretary</span> : "Paid"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {pay ? (
        <Modal title={`Pay ${pay.month}`} onClose={() => setPay(null)}>
          <form onSubmit={submit}>
            <p>Share the payment screenshot with the secretary for confirmation.</p>
            <Field label="Amount"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
            <Field label="Screenshot"><input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files[0])} required /></Field>
            <div className="btn-row" style={{ marginTop: 12 }}><Btn icon="send" type="submit" disabled={!file}>Send to secretary</Btn></div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
