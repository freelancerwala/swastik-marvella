import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Btn, Field, Modal, PageHeader, confirmRemove, when } from "../ui.jsx";
import { useAuth } from "../AuthContext.jsx";

export default function Chat() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [people, setPeople] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState("");
  const endRef = useRef(null);

  async function loadConversations() {
    const items = await api.get("/api/chat/conversations");
    setConversations(items);
    const requested = Number(params.get("c") || 0);
    setActive((current) => {
      if (requested) return items.find((item) => item.id === requested) || current || items[0] || null;
      return current || items[0] || null;
    });
  }

  async function loadMessages(id) {
    if (!id) return;
    setMessages(await api.get(`/api/chat/conversations/${id}/messages`));
    const items = await api.get("/api/chat/conversations");
    setConversations(items);
  }

  useEffect(() => {
    loadConversations().catch((e) => setError(e.message));
    api.get("/api/chat/directory").then(setPeople).catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) return;
    loadMessages(active.id).catch(() => {});
    const timer = setInterval(() => loadMessages(active.id).catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [active?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e) {
    e.preventDefault();
    if (!active || !body.trim()) return;
    const saved = await api.post(`/api/chat/conversations/${active.id}/messages`, { body });
    setMessages((current) => [...current, saved]);
    setBody("");
    loadConversations().catch(() => {});
  }

  async function createGroup(e) {
    e.preventDefault();
    const created = await api.post("/api/chat/groups", { title: groupTitle, member_ids: picked });
    setGroupOpen(false);
    setGroupTitle("");
    setPicked([]);
    await loadConversations();
    setActive(created);
    setParams({ c: String(created.id) });
  }

  function toggleMember(id) {
    setPicked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  return (
    <>
      <PageHeader icon="chat" title="Society chat" blurb="Create a group, chat with the secretary, and get an alert when a new message arrives.">
        <Btn icon="group_add" onClick={() => setGroupOpen(true)}>Create group</Btn>
        {session?.role === "secretary" && active?.kind === "group" ? (
          <Btn
            icon="delete"
            className="btn danger"
            onClick={async () => {
              if (!confirmRemove("group chat")) return;
              await api.del(`/api/chat/conversations/${active.id}`);
              setActive(null);
              await loadConversations();
            }}
          >
            Delete group
          </Btn>
        ) : null}
      </PageHeader>
      {error ? <p className="error">{error}</p> : null}
      <section className="chat-shell card">
        <aside className="chat-list">
          {conversations.map((item) => (
            <button
              key={item.id}
              className={`chat-thread${active?.id === item.id ? " active" : ""}`}
              onClick={() => { setActive(item); setParams({ c: String(item.id) }); }}
            >
              <strong>
                {item.title}
                {item.unread > 0 ? <span className="bell-count">{item.unread}</span> : null}
              </strong>
              <span>{item.kind === "group" ? `Group · ${item.member_count} members` : item.last_message || "No messages yet"}</span>
            </button>
          ))}
        </aside>
        <div className="chat-main">
          <div className="chat-messages">
            {messages.map((item) => (
              <div key={item.id} className={`bubble${item.sender_id === session?.id ? " mine" : ""}`}>
                <small>{item.sender_name} · {when(item.created_at)}</small>
                <p>{item.body}</p>
                {session?.role === "secretary" || item.sender_id === session?.id ? (
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={async () => {
                      if (!confirmRemove("message")) return;
                      await api.del(`/api/chat/messages/${item.id}`);
                      setMessages((current) => current.filter((row) => row.id !== item.id));
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form className="chat-compose" onSubmit={send}>
            <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message..." required />
            <Btn icon="send" type="submit">Send</Btn>
          </form>
        </div>
      </section>
      {groupOpen ? (
        <Modal title="Create group" onClose={() => setGroupOpen(false)}>
          <form onSubmit={createGroup}>
            <Field label="Group name">
              <input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Ganesh Chaturthi committee" required />
            </Field>
            <p className="hint">Select members to add. The secretary stays in every group.</p>
            <div className="member-pick">
              {people.filter((person) => person.id !== session?.id).map((person) => (
                <label key={person.id} className="pick-row">
                  <input type="checkbox" checked={picked.includes(person.id)} onChange={() => toggleMember(person.id)} />
                  {person.name} · {person.role}
                </label>
              ))}
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn">Create group</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
