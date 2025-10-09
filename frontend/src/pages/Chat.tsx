// frontend/src/pages/Chat.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  listThreads,
  createThread,
  getMessages,
  postMessage,
  deleteThread,
  setTakeover,
  postHumanReply,
  type Thread,
  type Message,
} from "../api";
import { useAuth } from "../auth";
import { useNavigate } from "react-router-dom";

/** Utils */
function clsx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}
function formatTime(dt: string | number | Date) {
  const d = new Date(dt);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** SSE helper (mantido caso volte ao SSE depois) */
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
function sseUrlForThread(threadId: number | string) {
  const token = localStorage.getItem("token") || "";
  return `${API_BASE}/threads/${threadId}/stream?token=${encodeURIComponent(token)}`;
}

/** Header */
function Header({ onNew }: { onNew: () => void }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const PROFILE_PATH = "/profile";

  return (
    <header
      style={{
        height: 56,
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--bg)",
      }}
      aria-label="Barra superior"
    >
      <div
        className="logo"
        style={{ cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}
        onClick={() => navigate("/")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <defs>
            <linearGradient id="g2" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="var(--brand)" />
              <stop offset="1" stopColor="var(--brand-2)" />
            </linearGradient>
          </defs>
          <circle cx="12" cy="12" r="10" fill="url(#g2)" />
          <path d="M7 12h10M12 7v10" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>Sway</span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="btn soft"
          onClick={() => navigate(PROFILE_PATH)}
          title="Minha conta (P)"
          style={{ padding: "6px 10px" }}
        >
          👤 Minha conta
        </button>
        <button
          className="btn soft"
          onClick={logout}
          aria-label="Sair"
          title="Sair"
          style={{ padding: "6px 10px" }}
        >
          Sair
        </button>
      </div>
    </header>
  );
}

/** Sidebar de threads */
function Sidebar({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
  loading,
}: {
  threads: Thread[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return threads;
    return threads.filter((t) => (t.title || "Sem título").toLowerCase().includes(s));
  }, [q, threads]);

  return (
    <aside
      style={{
        width: 300,
        borderRight: "1px solid var(--border)",
        height: "calc(100vh - 56px)",
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "auto auto 1fr",
        background: "var(--panel)",
      }}
      aria-label="Conversas"
    >
      <div style={{ padding: 12, display: "flex", gap: 8 }}>
        <button className="btn" onClick={onNew} style={{ width: "100%" }}>
          + Nova
        </button>
      </div>

      <div style={{ padding: "0 12px 12px" }}>
        <input
          className="input"
          placeholder="Buscar conversa..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar conversa"
        />
      </div>

      <div style={{ overflowY: "auto", padding: 8 }}>
        {loading && (
          <div className="small" style={{ color: "var(--muted)", padding: "0 8px" }}>
            Carregando conversas...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="small" style={{ color: "var(--muted)", padding: "0 8px" }}>
            Nenhuma conversa encontrada.
          </div>
        )}

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {filtered.map((t) => (
            <li key={t.id}>
              <button
                className={clsx("item", activeId === String(t.id) && "active")}
                onClick={() => onSelect(String(t.id))}
                title={t.title || "Sem título"}
                aria-current={activeId === String(t.id) ? "page" : undefined}
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    pointerEvents: "none",
                  }}
                >
                  {t.title || "Sem título"}
                </span>

                <span
                  role="button"
                  aria-label="Excluir conversa"
                  title="Excluir"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Excluir esta conversa? Essa ação não pode ser desfeita.")) {
                      onDelete(String(t.id));
                    }
                  }}
                  className="chip danger"
                >
                  Excluir
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/** Bolha de mensagem */
type UIMessage = Message & { is_human?: boolean; created_at?: string };

function Bubble({ m }: { m: UIMessage }) {
  const isUser = m.role === "user";
  const assistantLabel = (m as any).is_human ? "Assistente (Humano)" : "Assistente";
  return (
    <div
      className={clsx("bubble", isUser ? "user" : "assistant")}
      aria-label={isUser ? "Mensagem do usuário" : "Resposta do assistente"}
    >
      <div className="meta">
        <span className="role">{isUser ? "Você" : assistantLabel}</span>
        <span className="time">{formatTime(m.created_at || Date.now())}</span>
      </div>
      <div className="content">{m.content}</div>
    </div>
  );
}

/** Indicador de digitando */
function Typing() {
  return (
    <div className="typing">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </div>
  );
}

/** Composer */
function Composer({
  value,
  setValue,
  onSend,
  disabled,
  takeoverActive,
}: {
  value: string;
  setValue: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  takeoverActive: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(220, Math.max(48, el.scrollHeight)) + "px";
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  return (
    <div style={{ padding: 12, borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
      <div className="composer">
        <textarea
          ref={ref}
          className="input"
          placeholder={takeoverActive ? "Você está respondendo como HUMANO..." : "Escreva sua mensagem..."}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="Caixa de mensagem"
        />
        <button className="btn" onClick={onSend} disabled={disabled || !value.trim()}>
          {takeoverActive ? "Enviar (humano)" : "Enviar"}
        </button>
      </div>
      <div className="small" style={{ color: "var(--muted)", marginTop: 6 }}>
        Enter para enviar • Shift + Enter para nova linha
      </div>
    </div>
  );
}

/** Página principal do Chat */
export default function Chat() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // estados de tempo real (mantidos caso você use SSE depois)
  const [isTyping, setIsTyping] = useState(false);
  const [assistantBuffer, setAssistantBuffer] = useState<string>("");

  // takeover (estado local; persistido no backend ao alternar)
  const [takeoverActive, setTakeoverActive] = useState<boolean>(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null); // não usado no polling, mantido pra compatibilidade
  const pollRef = useRef<number | null>(null);    // ✅ MOVIDO PARA DENTRO DO COMPONENTE

  /** Carrega threads ao abrir */
  useEffect(() => {
    (async () => {
      try {
        setLoadingThreads(true);
        const ts = await listThreads();
        setThreads(ts);
        if (ts.length > 0) setActiveId(String(ts[0].id));
      } catch (e: any) {
        setErrorMsg(e?.message || "Falha ao carregar conversas.");
      } finally {
        setLoadingThreads(false);
      }
    })();
  }, []);

  /** Carrega mensagens ao trocar de thread */
  useEffect(() => {
    if (!activeId) return;
    (async () => {
      try {
        // fecha SSE anterior (se houver)
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }

        setLoadingMessages(true);
        setErrorMsg(null);
        const msgs = await getMessages(Number(activeId));
        setMessages(msgs as any);
        setTakeoverActive(false);
        setAssistantBuffer("");
        setIsTyping(false);

        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
        });
      } catch (e: any) {
        setErrorMsg(e?.message || "Falha ao carregar mensagens.");
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [activeId]);

  /** Polling de mensagens a cada 2s (fallback de “ao vivo”) */
  useEffect(() => {
    if (!activeId) return;

    // limpa intervalo anterior
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    // busca e mescla novas mensagens sem duplicar
    const fetchAndMerge = async () => {
      try {
        const serverMsgs = await getMessages(Number(activeId));
        setMessages((prev) => {
          const map = new Map(prev.map((m) => [String(m.id), m]));
          for (const m of serverMsgs as UIMessage[]) {
            map.set(String(m.id), m);
          }
          return Array.from(map.values()).sort((a, b) => {
            const ai = String(a.id), bi = String(b.id);
            if (ai.startsWith("temp-") && !bi.startsWith("temp-")) return -1;
            if (!ai.startsWith("temp-") && bi.startsWith("temp-")) return 1;
            return Number(a.id) - Number(b.id);
          });
        });
      } catch {
        // silencioso
      }
    };

    // primeira sincronização imediata
    fetchAndMerge();

    // intervalo de 2s
    pollRef.current = window.setInterval(fetchAndMerge, 2000) as unknown as number;

    // cleanup
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeId]);

  /** Scroll automático quando chegam novas mensagens */
  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [messages.length, assistantBuffer]);

  async function handleNewThread() {
    try {
      const t = await createThread();
      setThreads((prev) => [t, ...prev]);
      setActiveId(String(t.id));
      setMessages([]);
      setInput("");
      setTakeoverActive(false);
      setAssistantBuffer("");
      setIsTyping(false);
    } catch (e: any) {
      setErrorMsg(e?.message || "Não foi possível criar a conversa.");
    }
  }

  async function handleDeleteThread(id: string) {
    try {
      await deleteThread(Number(id));
      setThreads((prev) => prev.filter((t) => String(t.id) !== id));
      if (activeId === id) {
        const rest = threads.filter((t) => String(t.id) !== id);
        setActiveId(rest[0] ? String(rest[0].id) : undefined);
        setMessages([]);
        setTakeoverActive(false);
        setAssistantBuffer("");
        setIsTyping(false);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Não foi possível excluir a conversa.");
    }
  }

  async function toggleTakeover(next: boolean) {
    if (!activeId) return;
    try {
      await setTakeover(Number(activeId), next);
      setTakeoverActive(next);
    } catch (e: any) {
      setErrorMsg(e?.message || "Falha ao alternar takeover.");
    }
  }

  async function handleSend() {
    if (!activeId) {
      await handleNewThread();
    }
    if (!activeId) return;
    const content = input.trim();
    if (!content) return;

    // Otimista
    const optimistic: UIMessage = {
      id: "temp-" + Date.now(),
      role: takeoverActive ? "assistant" : "user",
      is_human: takeoverActive ? true : undefined,
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);
    if (!takeoverActive) setIsTyping(true);
    setErrorMsg(null);

    try {
      if (takeoverActive) {
        await postHumanReply(Number(activeId), content);
      } else {
        await postMessage(Number(activeId), content);
      }
      // Polling vai sincronizar a versão final
    } catch (e: any) {
      setErrorMsg(
        e?.response?.data?.detail || e?.message || "Falha ao enviar. Tente novamente."
      );
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
      setIsTyping(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        display: "grid",
        gridTemplateRows: "56px 1fr",
      }}
    >
      <Header onNew={handleNewThread} />

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", minHeight: 0 }}>
        <Sidebar
          threads={threads}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={handleNewThread}
          onDelete={handleDeleteThread}
          loading={loadingThreads}
        />

        {/* Main */}
        <main
          style={{
            height: "calc(100vh - 56px)",
            display: "grid",
            gridTemplateRows: "auto 1fr auto",
          }}
          aria-label="Janela do chat"
        >
          {/* Barra de status / takeover */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--panel)",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={takeoverActive}
                onChange={(e) => toggleTakeover(e.target.checked)}
              />
              <span>👤 Assumir conversa (pausar IA)</span>
            </label>

            {takeoverActive && (
              <span className="chip" style={{ background: "#1e3a8a", color: "white" }}>
                Modo humano ativo — a IA está pausada
              </span>
            )}
          </div>

          {/* Lista de mensagens */}
          <div
            ref={listRef}
            style={{ overflowY: "auto", padding: "12px 16px", background: "var(--bg)" }}
          >
            {loadingMessages && (
              <div className="small" style={{ color: "var(--muted)", padding: 8 }}>
                Carregando mensagens...
              </div>
            )}

            {!loadingMessages && messages.length === 0 && (
              <div
                className="card"
                style={{
                  maxWidth: 560,
                  margin: "40px auto",
                  textAlign: "center",
                  padding: 20,
                }}
              >
                <h3 style={{ marginTop: 0 }}>Bem-vindo 👋</h3>
                <p className="small" style={{ color: "var(--muted)" }}>
                  Comece uma conversa enviando uma mensagem abaixo ou crie uma nova conversa.
                </p>
              </div>
            )}

            <div style={{ display: "grid", gap: 10 }}>
              {messages.map((m) => (
                <Bubble key={m.id} m={m} />
              ))}

              {/* mensagem parcial (reservado para SSE futuro) */}
              {assistantBuffer && (
                <div className="bubble assistant">
                  <div className="meta">
                    <span className="role">Assistente</span>
                    <span className="time">{formatTime(Date.now())}</span>
                  </div>
                  <div className="content">{assistantBuffer}</div>
                </div>
              )}

              {/* indicador "digitando..." (útil quando a IA ainda vai responder) */}
              {!assistantBuffer && !takeoverActive && isTyping && (
                <div className="bubble assistant">
                  <div className="meta">
                    <span className="role">Assistente</span>
                    <span className="time">{formatTime(Date.now())}</span>
                  </div>
                  <Typing />
                </div>
              )}
            </div>

            {errorMsg && (
              <div
                role="alert"
                style={{
                  border: "1px solid #7f1d1d",
                  background: "#1b0f10",
                  color: "#fecaca",
                  padding: "10px 12px",
                  borderRadius: 10,
                  fontSize: 14,
                  marginTop: 12,
                  maxWidth: 560,
                }}
              >
                {errorMsg}{" "}
                <button
                  className="btn soft"
                  onClick={() => {
                    setErrorMsg(null);
                    if (messages.length === 0) return;
                    const lastUser = [...messages].reverse().find((m) => m.role === "user");
                    if (lastUser) {
                      setInput(lastUser.content);
                    }
                  }}
                  style={{ marginLeft: 8 }}
                >
                  Recarregar / Reenviar
                </button>
              </div>
            )}
          </div>

          {/* Composer */}
          <Composer
            value={input}
            setValue={setInput}
            onSend={handleSend}
            disabled={sending}
            takeoverActive={takeoverActive}
          />
        </main>
      </div>
    </div>
  );
}
