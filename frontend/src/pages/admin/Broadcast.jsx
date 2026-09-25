import { useEffect, useState } from "react";
import { api } from "../../api";
import { Btn, PageHeader, confirmRemove } from "../../ui.jsx";

export default function Broadcast() {
  const [message, setMessage] = useState("Swastik Marvella\n");
  const [members, setMembers] = useState([]);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/broadcasts/members").then(setMembers).catch((e) => setError(e.message));
    api.get("/api/broadcasts").then(setHistory).catch(() => {});
  }, []);

  async function share(sendCloud) {
    setError("");
    const data = await api.post("/api/broadcasts", { message, send_cloud: sendCloud });
    setResult(data);
    setIndex(0);
    setHistory(await api.get("/api/broadcasts"));
    if (data.group_share_url) window.open(data.group_share_url, "_blank");
  }

  const list = result?.members || members;

  function openNext() {
    const row = list[index];
    if (!row) return;
    window.open(row.whatsapp_url || result?.group_share_url, "_blank");
    setIndex((value) => value + 1);
  }

  return (
    <>
      <PageHeader icon="whatsapp" title="WhatsApp to all members" blurb="Write one message. Share it to the society WhatsApp group, or send the same text to every member one by one." />
      {error ? <p className="error">{error}</p> : null}
      <div className="grid-2">
        <section className="card">
          <label>
            One message for everyone
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} required />
          </label>
          <p className="hint">WhatsApp cannot open every personal chat in a single tap. This keeps one message and gives you a group share plus the same text for each member.</p>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <Btn icon="share" onClick={() => share(false)}>Share one message</Btn>
            <Btn icon="send" className="btn gold" onClick={() => share(true)}>Send via Cloud API</Btn>
            <Btn icon="content_copy" className="btn ghost" onClick={() => navigator.clipboard.writeText(message)}>Copy message</Btn>
          </div>
          {result ? (
            <div className="demo-box">
              Saved for {result.recipient_count} members. Cloud sent: {result.cloud_sent} ({result.cloud_mode}).
              <div className="btn-row" style={{ marginTop: 10 }}>
                <a className="btn small" href={result.group_share_url} target="_blank" rel="noreferrer">Open WhatsApp group share</a>
                <button className="btn ghost small" onClick={openNext} disabled={index >= list.length}>
                  Send same message to next member ({Math.min(index + 1, list.length)}/{list.length})
                </button>
              </div>
            </div>
          ) : null}
        </section>
        <section className="card">
          <h3>Members</h3>
          {list.length === 0 ? <p className="empty">No owner or rent phone numbers yet.</p> : (
            <table>
              <thead><tr><th>Name</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {list.map((row) => (
                  <tr key={`${row.user_id}-${row.phone}`}>
                    <td>{row.name}<div className="hint">{row.phone}</div></td>
                    <td>{row.role}</td>
                    <td>
                      {row.whatsapp_url || result?.group_share_url ? (
                        <a href={row.whatsapp_url || result.group_share_url} target="_blank" rel="noreferrer">WhatsApp</a>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <h3>Recent broadcasts</h3>
        {history.length === 0 ? <p className="empty">No broadcasts yet.</p> : history.map((item) => (
          <article key={item.id} className="update-item">
            <p>{item.message}</p>
            <div className="hint">{item.recipient_count} members</div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn danger small" onClick={async () => { if (!confirmRemove("broadcast")) return; await api.del(`/api/broadcasts/${item.id}`); setHistory(await api.get("/api/broadcasts")); }}>Delete</button>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
