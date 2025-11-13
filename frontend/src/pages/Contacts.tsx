// frontend/src/pages/Contacts.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listThreads, updateThread, getMessages, type Thread } from "../api";
import { getOverrideLevel, type LeadLevel } from "../hooks/useLeadScore";
import { computeLeadScoreFromMessages, levelFromScore } from "../utils/leadScore";
import type { UIMessage } from "../types/lead";

/** ===== Visual helpers ===== */
type Row = Thread & {
  _lastText?: string;
  _lastAt?: string;
  _phone?: string;
  _level?: LeadLevel;
  _score?: number;
};
function chipColors(level: LeadLevel) {
  switch (level) {
    case "quente":
      return { bg: "#2d0f12", fg: "#fecaca", bd: "#dc2626" };
    case "morno":
      return { bg: "#1f2937", fg: "#fde68a", bd: "#f59e0b" };
    case "frio":
      return { bg: "#0f172a", fg: "#93c5fd", bd: "#1d4ed8" };
    default:
      return { bg: "var(--panel)", fg: "var(--muted)", bd: "var(--border)" };
  }
}
function LeadTag({ level, score }: { level: LeadLevel; score?: number }) {
  const { bg, fg, bd } = chipColors(level);
  const label = level === "quente" ? "Quente" : level === "morno" ? "Morno" : level === "frio" ? "Frio" : "—";
  return (
    <span className="chip" style={{ background: bg, color: fg, border: `1px solid ${bd}` }}>
      {label}
      {typeof score === "number" ? ` (${score})` : ""}
    </span>
  );
}
function getDisplayName(t: Thread) {
  const title = String(t.title || "").trim();
  if (title) return title;
  const wa = (t.metadata?.wa_id || t.metadata?.phone || "").toString();
  if (wa) return `Contato • ${wa.slice(-4)}`;
  return "Sem nome";
}
function getPhone(t: Thread) {
  const raw =
    (t as any)?.metadata?.wa_id ||
    (t as any)?.metadata?.phone ||
    (t as any)?.external_user_phone ||
    "";
  const s = String(raw).trim();
  if (!s) return "";
  const e164 = s.startsWith("whatsapp:") ? s.replace(/^whatsapp:/, "") : s;
  return e164.startsWith("+") ? e164 : `+${e164}`;
}
function fmtTimeShort(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString();
}

export default function Contacts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState<string>("");
  const [level, setLevel] = useState<"todos" | "frio" | "morno" | "quente">("todos");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "ultimo", dir: "desc" });

  /** Carrega threads + enriquece com telefone e temperatura (OTIMIZADO: usa last_message do backend) */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const ts = await listThreads();
        const base: Row[] = ts.map(t => {
          const beScore = (t as any).lead_score as number | undefined;
          const beLevel = (t as any).lead_level as LeadLevel | undefined;
          const override = getOverrideLevel(String(t.id));
          const levelEff: LeadLevel =
            override && override !== "desconhecido"
              ? override
              : beLevel ?? levelFromScore(beScore);
          const scoreEff = typeof beScore === "number" ? beScore : undefined;
          
          // Usa last_message do backend se disponível (não precisa carregar todas as mensagens)
          const lastText = t.last_message || undefined;
          const lastAt = t.last_message_at || undefined;
          
          return { 
            ...t, 
            _phone: getPhone(t), 
            _level: levelEff, 
            _score: scoreEff,
            _lastText: lastText,
            _lastAt: lastAt,
          };
        });
        setRows(base);

        // Carrega mensagens para threads que não têm score do backend (mesmo que tenham last_message)
        // Isso garante que o score seja calculado localmente quando necessário
        const needsMessages = base.filter(t => 
          typeof t._score !== "number"
        );
        
        if (needsMessages.length > 0) {
          const CONC = 4;
          for (let i = 0; i < needsMessages.length; i += CONC) {
            await Promise.all(
              needsMessages.slice(i, i + CONC).map(async t => {
                try {
                  const msgs = (await getMessages(Number(t.id))) as UIMessage[];
                  if (!msgs?.length) return;
                  const last = msgs[msgs.length - 1];
                  const localScore = computeLeadScoreFromMessages(msgs);
                  // Recalcula o level considerando override, beLevel e score local
                  const override = getOverrideLevel(String(t.id));
                  const beLevel = (t as any).lead_level as LeadLevel | undefined;
                  const localLevel: LeadLevel = 
                    override && override !== "desconhecido"
                      ? override
                      : beLevel ?? levelFromScore(localScore);
                  setRows(prev =>
                    prev.map(r =>
                      r.id === t.id
                        ? { 
                            ...r, 
                            _lastText: last.content, 
                            _lastAt: last.created_at, 
                            _score: localScore, 
                            _level: localLevel 
                          }
                        : r
                    )
                  );
                } catch {
                  /* silencioso */
                }
              })
            );
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Atualização leve a cada 15s (sincroniza level/score vindos do backend e mantém override) */
  useEffect(() => {
    const id = window.setInterval(async () => {
      const ts = await listThreads();
      setRows(prev => {
        const map = new Map(prev.map(r => [String(r.id), r]));
        for (const t of ts) {
          const r = map.get(String(t.id));
          const beScore = (t as any).lead_score as number | undefined;
          const beLevel = (t as any).lead_level as LeadLevel | undefined;
          const override = getOverrideLevel(String(t.id));
          const levelEff: LeadLevel =
            override && override !== "desconhecido"
              ? override
              : beLevel ?? (r?._score !== undefined ? levelFromScore(r?._score) : r?._level ?? "desconhecido");
          const scoreEff = typeof beScore === "number" ? beScore : r?._score;
          if (r) map.set(String(t.id), { ...r, origin: t.origin, _level: levelEff, _score: scoreEff });
          else map.set(String(t.id), { ...(t as Row), _phone: getPhone(t), _level: levelEff, _score: scoreEff });
        }
        return Array.from(map.values());
      });
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const origins = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(t => t.origin && s.add(String(t.origin)));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(t => {
      const matchesQ =
        !s ||
        getDisplayName(t).toLowerCase().includes(s) ||
        (t._phone || "").toLowerCase().includes(s) ||
        (t._lastText || "").toLowerCase().includes(s);
      const matchesOrigin = !origin || (t.origin || "") === origin;
      const lvl = t._level && t._level !== "desconhecido" ? t._level : (t.lead_level || "frio");
      const matchesLevel = level === "todos" || lvl === level;
      return matchesQ && matchesOrigin && matchesLevel;
    });
  }, [q, origin, level, rows]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const k = sort.key;
      if (k === "nome") return getDisplayName(a).localeCompare(getDisplayName(b)) * dir;
      if (k === "numero") return (a._phone || "").localeCompare(b._phone || "") * dir;
      if (k === "origem") return (a.origin || "").localeCompare(b.origin || "") * dir;
      if (k === "score") return ((a._score ?? -1) - (b._score ?? -1)) * dir;
      if (k === "tempo") {
        const da = a._lastAt ? new Date(a._lastAt).getTime() : 0;
        const db = b._lastAt ? new Date(b._lastAt).getTime() : 0;
        return (da - db) * dir;
      }
      if (k === "level") {
        const ord = { quente: 3, morno: 2, frio: 1 } as Record<string, number>;
        const la = a._level && a._level !== "desconhecido" ? a._level : (a.lead_level || "frio");
        const lb = b._level && b._level !== "desconhecido" ? b._level : (b.lead_level || "frio");
        return ((ord[la as string] || 0) - (ord[lb as string] || 0)) * dir;
      }
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  async function handleChangeOrigin(t: Row, next: string) {
    const old = t.origin || "";
    setRows(prev => prev.map(x => (x.id === t.id ? { ...x, origin: next || null } : x)));
    try {
      await updateThread(t.id, { origin: next || undefined });
    } catch {
      setRows(prev => prev.map(x => (x.id === t.id ? { ...x, origin: old || null } : x)));
      alert("Falha ao atualizar a origem.");
    }
  }

  function toggleSort(key: string) {
    setSort(s => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div style={{ height: "calc(100vh - 56px)", display: "grid", gridTemplateRows: "auto 1fr" }}>
      {/* Filtros */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
        }}
      >
        <input
          className="input"
          placeholder="Buscar (nome, número, mensagem)..."
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <select className="select select--sm" value={origin} onChange={e => setOrigin(e.target.value)}>
          <option value="">Todas as origens</option>
          {[...new Set(origins)].map(o => (
            <option key={o} value={o}>
              {o.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select className="select select--sm" value={level} onChange={e => setLevel(e.target.value as any)}>
          <option value="todos">Todas as temperaturas</option>
          <option value="frio">Frio</option>
          <option value="morno">Morno</option>
          <option value="quente">Quente</option>
        </select>
        <div style={{ marginLeft: "auto", color: "var(--muted)" }} className="small">
          {sorted.length} contato(s)
        </div>
      </div>

      {/* Tabela */}
      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--panel)", zIndex: 1 }}>
            <tr>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("nome")}>
                  Nome {sort.key === "nome" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("numero")}>
                  Número {sort.key === "numero" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("origem")}>
                  Origem {sort.key === "origem" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>Última mensagem</th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("tempo")}>
                  Último contato {sort.key === "tempo" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("level")}>
                  Temperatura {sort.key === "level" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("score")}>
                  Score {sort.key === "score" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} style={{ padding: 12 }} className="small">
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 12, color: "var(--muted)" }} className="small">
                  Nenhum contato encontrado.
                </td>
              </tr>
            )}
            {sorted.map(t => {
              const effLevel = t._level && t._level !== "desconhecido" ? t._level : (t.lead_level || "frio");
              const effScore = typeof t._score === "number" ? t._score : ((t as any).lead_score as number | undefined);
              return (
                <tr key={t.id}>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", maxWidth: 280 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>
                      {getDisplayName(t)}
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ color: "var(--text)" }}>{t._phone || "—"}</code>
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    <select
                      className="select select--sm"
                      value={t.origin || ""}
                      onChange={e => handleChangeOrigin(t, e.target.value)}
                    >
                      <option value="">Sem origem</option>
                      <option value="whatsapp_organico">WhatsApp (orgânico)</option>
                      <option value="meta_ads">Campanha (Meta)</option>
                      <option value="qr_code">QR Code</option>
                      <option value="site">Site</option>
                      <option value="indicacao">Indicação</option>
                    </select>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--border)",
                      maxWidth: 420,
                    }}
                  >
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t._lastText || "—"}
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    {fmtTimeShort(t._lastAt)}
                  </td>

                  {/* Temperatura somente leitura */}
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    <LeadTag level={effLevel} score={effScore} />
                  </td>

                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    {typeof effScore === "number" ? effScore : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Link to={`/contacts/${t.id}`} className="btn soft" style={{ fontSize: 12, padding: "4px 8px" }}>
                        CRM
                      </Link>
                      <a className="btn soft" href={`/#/chat?thread=${t.id}`} style={{ fontSize: 12, padding: "4px 8px" }}>
                        Chat
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
