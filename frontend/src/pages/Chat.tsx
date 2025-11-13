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
import { useLeadScore, getOverrideLevel, setOverrideLevel, type LeadLevel } from "../hooks/useLeadScore";
import { computeLeadScoreFromMessages, levelFromScore } from "../utils/leadScore";
import type { UIMessage } from "../types/lead";

/** Utils */
function clsx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}
function formatTime(dt: string | number | Date) {
  const d = new Date(dt);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatTimeShort(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString();
}

/** SSE helper (mantido caso volte ao SSE depois) */
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
function sseUrlForThread(threadId: number | string) {
  const token = localStorage.getItem("token") || "";
  return `${API_BASE}/threads/${threadId}/stream?token=${encodeURIComponent(token)}`;
}

/* ==== Lead Tagging ====================================================== */

function colorForLevel(level: LeadLevel) {
  switch (level) {
    case "frio": return { bg: "#0f172a", fg: "#93c5fd", bd: "#1d4ed8" };
    case "morno": return { bg: "#1f2937", fg: "#fde68a", bd: "#f59e0b" };
    case "quente": return { bg: "#2d0f12", fg: "#fecaca", bd: "#dc2626" };
    default: return { bg: "var(--panel)", fg: "var(--muted)", bd: "var(--border)" };
  }
}

function LeadTag({ level, score }: { level: LeadLevel; score?: number }) {
  const { bg, fg, bd } = colorForLevel(level);
  const label =
    level === "quente" ? "Quente" :
    level === "morno" ? "Morno" :
    level === "frio" ? "Frio" : "—";
  const title = typeof score === "number" ? `${label} (${score})` : label;
  return (
    <span
      className="chip"
      title={title}
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${bd}`,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        lineHeight: "16px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: bd }} />
      {label}
    </span>
  );
}

/* ======================================================================= */

/** Sidebar de threads */
function Sidebar({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
  loading,
  leadFilter,
  setLeadFilter,
  leadScores,
}: {
  threads: Thread[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
  leadFilter: LeadLevel | "todos";
  setLeadFilter: (l: LeadLevel | "todos") => void;
  leadScores: Record<string, { score?: number; level: LeadLevel }>;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = threads;
    if (s) {
      // Busca tanto no nome do contato quanto no título e última mensagem
      list = list.filter((t) => {
        const searchText = (t.contact_name || t.title || "Sem título").toLowerCase();
        const lastMsg = (t.last_message || "").toLowerCase();
        return searchText.includes(s) || lastMsg.includes(s);
      });
    }
    if (leadFilter !== "todos") {
      list = list.filter((t) => (leadScores[String(t.id)]?.level ?? "desconhecido") === leadFilter);
    }
    
    // Ordena por última mensagem (mais recente primeiro) - estilo WhatsApp
    return [...list].sort((a, b) => {
      const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
      const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
      return timeB - timeA; // Mais recente primeiro (descendente)
    });
  }, [q, threads, leadFilter, leadScores]);

  return (
    <aside
      style={{
        width: 300,
        borderRight: "1px solid var(--border)",
        height: "100%",
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "auto auto auto 1fr",
        background: "var(--panel)",
      }}
      aria-label="Lista de conversas"
    >
      <div style={{ padding: 12, display: "flex", gap: 8 }}>
        <button className="btn" onClick={onNew} style={{ width: "100%" }} aria-label="Criar nova conversa">
          + Nova
        </button>
      </div>

      <div style={{ padding: "0 12px 8px", display: "flex", gap: 6 }} role="tablist" aria-label="Filtros de temperatura">
        <button
          className={clsx("btn", leadFilter === "todos" ? "" : "soft")}
          onClick={() => setLeadFilter("todos")}
          title="Mostrar todas"
          style={{ flex: 1 }}
          aria-pressed={leadFilter === "todos"}
          aria-label="Mostrar todas as conversas"
        >
          Todos
        </button>
        <button
          className={clsx("btn", leadFilter === "frio" ? "" : "soft")}
          onClick={() => setLeadFilter("frio")}
          title="Somente Frios"
          style={{ flex: 1 }}
          aria-pressed={leadFilter === "frio"}
          aria-label="Filtrar conversas frias"
        >
          ❄️
        </button>
        <button
          className={clsx("btn", leadFilter === "morno" ? "" : "soft")}
          onClick={() => setLeadFilter("morno")}
          title="Somente Mornos"
          style={{ flex: 1 }}
          aria-pressed={leadFilter === "morno"}
          aria-label="Filtrar conversas mornas"
        >
          🌤️
        </button>
        <button
          className={clsx("btn", leadFilter === "quente" ? "" : "soft")}
          onClick={() => setLeadFilter("quente")}
          title="Somente Quentes"
          style={{ flex: 1 }}
          aria-pressed={leadFilter === "quente"}
          aria-label="Filtrar conversas quentes"
        >
          🔥
        </button>
      </div>

      <div style={{ padding: "0 12px 12px" }}>
        <input
          className="input"
          placeholder="Buscar conversa..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar conversa"
          type="search"
        />
      </div>

      <div style={{ overflowY: "auto", padding: 8 }} role="list" aria-label="Lista de conversas">
        {loading && (
          <div className="small" style={{ color: "var(--muted)", padding: "0 8px" }} role="status" aria-live="polite">
            Carregando conversas...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="small" style={{ color: "var(--muted)", padding: "0 8px" }} role="status">
            Nenhuma conversa encontrada.
          </div>
        )}

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((t) => {
            const entry = leadScores[String(t.id)] || { level: "desconhecido" as LeadLevel, score: undefined };
            // Prioriza o nome do contato, depois o título, depois "Sem título"
            const displayName = t.contact_name || t.title || "Sem título";
            const lastMsg = t.last_message || "";
            const lastMsgTime = t.last_message_at ? formatTimeShort(t.last_message_at) : "";
            const isActive = activeId === String(t.id);
            return (
              <li key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <button
                  className={clsx("item", isActive && "active")}
                  onClick={() => onSelect(String(t.id))}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Conversa com ${displayName}${lastMsg ? `, última mensagem: ${lastMsg}` : ""}`}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    padding: "14px 16px",
                    minHeight: "80px",
                    height: "auto",
                    boxSizing: "border-box",
                    position: "relative",
                    cursor: "pointer",
                    background: isActive ? "var(--bg)" : "transparent",
                    border: "none",
                    borderRadius: 0,
                    gap: 6,
                  }}
                  title={lastMsg ? `${displayName}\n${lastMsg}` : displayName}
                >
                  {/* Linha superior: Nome + Timestamp + Tag */}
                  <div style={{ 
                    display: "flex", 
                    alignItems: "flex-start", 
                    justifyContent: "space-between", 
                    gap: 8, 
                    width: "100%",
                    marginBottom: 2,
                  }}>
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        pointerEvents: "none",
                        fontWeight: 500,
                        fontSize: 15,
                        color: "var(--text)",
                        flex: 1,
                        minWidth: 0,
                        lineHeight: "1.3",
                      }}
                    >
                      {displayName}
                    </span>
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 8, 
                      flexShrink: 0,
                    }}>
                      {lastMsgTime && (
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--muted)",
                            whiteSpace: "nowrap",
                            pointerEvents: "none",
                            lineHeight: "1.2",
                          }}
                        >
                          {lastMsgTime}
                        </span>
                      )}
                      <LeadTag level={entry.level} score={entry.score} />
                    </div>
                  </div>
                  
                  {/* Linha inferior: Preview da mensagem (limitado a 2 linhas) */}
                  {lastMsg && (
                    <div style={{ 
                      display: "flex", 
                      alignItems: "flex-start", 
                      width: "100%",
                      minHeight: 0,
                      marginTop: 2,
                    }}>
                      <span
                        style={{
                          fontSize: 14,
                          color: "var(--muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          lineHeight: "1.5",
                          flex: 1,
                          pointerEvents: "none",
                          wordBreak: "break-word",
                          maxWidth: "100%",
                        }}
                        title={lastMsg}
                      >
                        {lastMsg}
                      </span>
                    </div>
                  )}
                  
                  {!lastMsg && (
                    <div style={{ 
                      fontSize: 14,
                      color: "var(--muted)",
                      fontStyle: "italic",
                      marginTop: 2,
                      pointerEvents: "none",
                      lineHeight: "1.5",
                    }}>
                      Sem mensagens
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

/** Bolha de mensagem */
function Bubble({ m }: { m: UIMessage }) {
  const isUser = m.role === "user";
  const assistantLabel = (m as any).is_human ? "Assistente (Humano)" : "Assistente";
  return (
    <div
      className={clsx("bubble", isUser ? "user" : "assistant")}
      aria-label={isUser ? "Mensagem do usuário" : "Resposta do assistente"}
    >
      <div className="meta">
        <span className="role">{isUser ? "Usuário" : assistantLabel}</span>
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

/** Página principal do Chat (sem Header interno) */
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

  // Lead Tagging (tempo real)
  const [leadFilter, setLeadFilter] = useState<LeadLevel | "todos">("todos");
  const [leadScores, setLeadScores] = useState<Record<string, { score?: number; level: LeadLevel }>>({});

  const listRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<number | null>(null);

  async function refreshLeadForThread(t: Thread, msgsCache?: UIMessage[]) {
    const override = getOverrideLevel(String(t.id));
    if (override && override !== "desconhecido") {
      const score = override === "quente" ? 75 : override === "morno" ? 45 : 15;
      setLeadScores((m) => ({
        ...m,
        [String(t.id)]: { score, level: override },
      }));
      return;
    }

    const beScore = t.lead_score;
    const beLevel = t.lead_level;

    let msgs = msgsCache;
    if (!msgs && (!beScore || !beLevel)) {
      try {
        msgs = await getMessages(Number(t.id)) as UIMessage[];
      } catch {
        setLeadScores((m) => ({ ...m, [String(t.id)]: { score: undefined, level: "desconhecido" } }));
        return;
      }
    }

    // Usa o hook logic (mas não pode usar hook aqui, então usa as funções diretamente)
    const score = beScore ?? (msgs ? computeLeadScoreFromMessages(msgs) : 0);
    // Prioridade: override > beLevel > calcular do score
    const level: LeadLevel = beLevel ? beLevel : levelFromScore(score);
    
    setLeadScores((m) => ({ ...m, [String(t.id)]: { score, level } }));
  }

  /** Carrega threads e pontua todas em background */
  useEffect(() => {
    (async () => {
      try {
        setLoadingThreads(true);
        const ts = await listThreads();
        // Ordena por última mensagem (mais recente primeiro) - estilo WhatsApp
        const sorted = [...ts].sort((a, b) => {
          const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
          const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
          return timeB - timeA; // Mais recente primeiro
        });
        setThreads(sorted);
        if (sorted.length > 0) setActiveId(String(sorted[0].id));

        const CONC = 4;
        for (let i = 0; i < sorted.length; i += CONC) {
          await Promise.all(sorted.slice(i, i + CONC).map(t => refreshLeadForThread(t)));
        }
      } catch (e: any) {
        setErrorMsg(e?.message || "Falha ao carregar conversas.");
      } finally {
        setLoadingThreads(false);
      }
    })();
  }, []);

  /** Carrega mensagens ao trocar de thread + repontua a ativa */
  useEffect(() => {
    if (!activeId) return;
    (async () => {
      try {
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

        const t = threads.find(x => String(x.id) === activeId);
        if (t) refreshLeadForThread(t, msgs as any);

        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
        });
      } catch (e: any) {
        setErrorMsg(e?.message || "Falha ao carregar mensagens.");
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Polling de mensagens da ativa a cada 2s (merge) */
  useEffect(() => {
    if (!activeId) return;

    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

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

        // repontua a ativa e atualiza thread (move para o topo se tiver nova mensagem)
        const t = threads.find(x => String(x.id) === activeId);
        if (t) {
          refreshLeadForThread(t, serverMsgs as any);
          // Atualiza a thread na lista para refletir nova mensagem
          if (serverMsgs && serverMsgs.length > 0) {
            const lastMsg = serverMsgs[serverMsgs.length - 1];
            setThreads((prev) => {
              const updated = prev.map((th) => 
                String(th.id) === activeId
                  ? { ...th, last_message: lastMsg.content, last_message_at: lastMsg.created_at }
                  : th
              );
              // Reordena: thread atualizada vai para o topo
              return updated.sort((a, b) => {
                const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
                const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
                return timeB - timeA;
              });
            });
          }
        }
      } catch {
        // silencioso
      }
    };

    fetchAndMerge();
    pollRef.current = window.setInterval(fetchAndMerge, 2000) as unknown as number;

    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeId, threads]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Polling leve para TODAS as threads a cada 15s (atualiza do backend primeiro) */
  useEffect(() => {
    if (!threads.length) return;
    const interval = window.setInterval(async () => {
      try {
        // Atualiza threads do backend primeiro para pegar beScore/beLevel atualizados
        const ts = await listThreads();
        // Ordena por última mensagem (mais recente primeiro) - estilo WhatsApp
        const sorted = [...ts].sort((a, b) => {
          const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
          const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
          return timeB - timeA; // Mais recente primeiro
        });
        setThreads(sorted);
        
        const CONC = 3;
        for (let i = 0; i < sorted.length; i += CONC) {
          await Promise.all(sorted.slice(i, i + CONC).map(t => refreshLeadForThread(t)));
        }
      } catch {
        // silencioso
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [threads.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
      refreshLeadForThread(t); // já calcula
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
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.detail || e?.message || "Falha ao enviar. Tente novamente.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
      setIsTyping(false);
    } finally {
      setSending(false);
      const t = threads.find(x => String(x.id) === activeId);
      if (t) {
        refreshLeadForThread(t); // repontua depois do envio
        // Atualiza thread e move para o topo (estilo WhatsApp)
        setThreads((prev) => {
          const now = new Date().toISOString();
          const updated = prev.map((th) => 
            String(th.id) === activeId
              ? { ...th, last_message: content, last_message_at: now }
              : th
          );
          // Reordena: thread atualizada vai para o topo
          return updated.sort((a, b) => {
            const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
            const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
            return timeB - timeA;
          });
        });
      }
    }
  }

  const activeLead = useMemo(() => {
    if (!activeId) return { level: "desconhecido" as LeadLevel, score: undefined as number | undefined };
    const entry = leadScores[activeId];
    return entry || { level: "desconhecido" as LeadLevel, score: undefined };
  }, [activeId, leadScores]);

  function handleOverride(level: LeadLevel | null) {
    if (!activeId) return;
    if (level) {
      setOverrideLevel(activeId, level);
    } else {
      localStorage.removeItem(`lead_override_${activeId}`);
    }
    const t = threads.find(x => String(x.id) === activeId);
    if (t) refreshLeadForThread(t, messages); // aplica na hora
  }

  return (
    <div
      style={{
        height: "calc(100vh - 56px)",
        minHeight: 0,
        overflow: "hidden",
        background: "var(--bg)",
        color: "var(--text)",
        display: "grid",
        gridTemplateColumns: "300px 1fr",
      }}
    >
      <Sidebar
        threads={threads}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNewThread}
        onDelete={handleDeleteThread}
        loading={loadingThreads}
        leadFilter={leadFilter}
        setLeadFilter={setLeadFilter}
        leadScores={leadScores}
      />

      {/* Main */}
      <main
        style={{
          height: "100%",
          minHeight: 0,
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
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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

          {/* Lead tag + override */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LeadTag level={activeLead.level} score={activeLead.score} />
            <div className="small" style={{ color: "var(--muted)" }}>Temperatura</div>
            <select
              className="input"
              value={getOverrideLevel(activeId || "") || "auto"}
              onChange={(e) => {
                const v = e.target.value as LeadLevel | "auto";
                handleOverride(v === "auto" ? null : (v as LeadLevel));
              }}
              title="Ajuste manual (salvo localmente)"
              aria-label="Ajustar temperatura do lead manualmente"
            >
              <option value="auto">Auto</option>
              <option value="frio">Frio</option>
              <option value="morno">Morno</option>
              <option value="quente">Quente</option>
            </select>
          </div>
        </div>

        {/* Lista de mensagens */}
        <div
          ref={listRef}
          style={{
            overflowY: "auto",
            padding: "12px 16px",
            background: "var(--bg)",
            minHeight: 0,
          }}
        >
          {loadingMessages && (
            <div className="small" style={{ color: "var(--muted)", padding: 8 }}>
              Carregando mensagens...
            </div>
          )}

          {!loadingMessages && messages.length === 0 && (
            <div className="card" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center", padding: 20 }}>
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

            {assistantBuffer && (
              <div className="bubble assistant">
                <div className="meta">
                  <span className="role">Assistente</span>
                  <span className="time">{formatTime(Date.now())}</span>
                </div>
                <div className="content">{assistantBuffer}</div>
              </div>
            )}

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
                  if (lastUser) setInput(lastUser.content);
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
  );
}
