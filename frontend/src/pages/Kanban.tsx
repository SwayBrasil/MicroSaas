// frontend/src/pages/Kanban.tsx
import React, { useEffect, useMemo, useState } from "react";
import { listThreads, updateThread, getMessages, type Thread } from "../api";

type Level = "frio" | "morno" | "quente";
type LeadLevelFull = Level | "desconhecido";
type UIMessage = { id: number | string; role: "user" | "assistant"; content: string; created_at?: string };

// ===== Config de layout (altura fixa dos cards) =====
const CARD_HEIGHT = 240; // ajuste aqui se quiser mais/menos

// ===== Heurística (mesma base das outras telas) =====
function levelFromScore(score?: number): LeadLevelFull {
  if (typeof score !== "number") return "desconhecido";
  if (score >= 60) return "quente";
  if (score >= 30) return "morno";
  return "frio";
}
function minutesBetween(a: Date, b: Date) {
  return Math.abs(b.getTime() - a.getTime()) / 60000;
}
function median(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  const arr = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}
/**
 * Heurística 0–100:
 * 1) Recência da última mensagem (qualquer lado) — até 35 pts
 * 2) Volume/engajamento (72h e dias ativos/7d) — até 35 pts
 * 3) Tempo de resposta do assistente (mediana) — até 20 pts
 * 4) Ritmo (pares user→assistant/48h) — até 10 pts
 * Penalidade por inatividade longa do usuário — até -30
 */
function computeLeadScoreFromMessages(msgs: UIMessage[], nowTs = Date.now()): number {
  if (!Array.isArray(msgs) || msgs.length === 0) return 0;

  const timeline = [...msgs].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  const now = new Date(nowTs);

  // 1) Recência (qualquer lado)
  const last = timeline[timeline.length - 1];
  const lastAt = new Date(last.created_at || now).getTime();
  const diffH = (nowTs - lastAt) / 36e5;
  let recencyScore = 0;
  if (diffH <= 6) recencyScore = 35;
  else if (diffH <= 24) recencyScore = 25;
  else if (diffH <= 72) recencyScore = 15;
  else if (diffH <= 7 * 24) recencyScore = 5;

  // 2) Volume/engajamento
  const last72hCut = nowTs - 72 * 36e5;
  const last7dCut = nowTs - 7 * 24 * 36e5;

  const recent72 = timeline.filter(m => new Date(m.created_at || 0).getTime() >= last72hCut);
  const volumeRecent = recent72.length; // user + assistant
  const volumeScore = Math.min(20, volumeRecent * 4); // até 20 pts (4 por msg)

  // dias ativos (7d)
  const daysActiveSet = new Set<string>();
  for (const m of timeline) {
    const ts = new Date(m.created_at || 0).getTime();
    if (ts >= last7dCut) {
      const d = new Date(ts);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
      daysActiveSet.add(key);
    }
  }
  const daysActiveScore = Math.min(15, daysActiveSet.size * 5); // até 15 pts

  // 3) Tempo de resposta do assistente (mediana)
  const gapsMin: number[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const m = timeline[i];
    if (m.role !== "user") continue;
    const tUser = new Date(m.created_at || 0);
    for (let j = i + 1; j < timeline.length; j++) {
      const n = timeline[j];
      if (n.role === "assistant") {
        const tAssistant = new Date(n.created_at || 0);
        const gapMin = minutesBetween(tUser, tAssistant);
        if (gapMin <= 12 * 60) gapsMin.push(gapMin);
        break;
      }
    }
  }
  const medGap = median(gapsMin);
  let responseScore = 0;
  if (typeof medGap === "number") {
    if (medGap <= 5) responseScore = 20;
    else if (medGap <= 20) responseScore = 12;
    else if (medGap <= 60) responseScore = 6;
    else responseScore = 0;
  }

  // 4) Ritmo (pares user→assistant nas últimas 48h)
  const last48hCut = nowTs - 48 * 36e5;
  let pairs48h = 0;
  for (let i = 0; i < timeline.length; i++) {
    const m = timeline[i];
    if (m.role !== "user") continue;
    const tUser = new Date(m.created_at || 0).getTime();
    if (tUser < last48hCut) continue;
    const reply = timeline.slice(i + 1).find(n => n.role === "assistant");
    if (reply && new Date(reply.created_at || 0).getTime() >= last48hCut) pairs48h += 1;
  }
  const rhythmScore = Math.min(10, pairs48h * 3 + (pairs48h >= 3 ? 1 : 0));

  // Penalidade por inatividade (último USUÁRIO)
  const lastUser = [...timeline].reverse().find(m => m.role === "user");
  let inactivityPenalty = 0;
  if (lastUser) {
    const lastUserAt = new Date(lastUser.created_at || 0).getTime();
    const diffUserDays = (nowTs - lastUserAt) / (36e5 * 24);
    if (diffUserDays > 14) inactivityPenalty = -30;
    else if (diffUserDays > 7) inactivityPenalty = -15;
  }

  let score = recencyScore + volumeScore + daysActiveScore + responseScore + rhythmScore + inactivityPenalty;
  score = Math.max(0, Math.min(100, score));
  return score;
}

// ===== Override compartilhado com Chat/Contatos =====
function getOverrideLevel(threadId: string): LeadLevelFull | null {
  const v = localStorage.getItem(`lead_override_${threadId}`);
  return v ? (v as LeadLevelFull) : null;
}
function setOverrideLevel(threadId: string, level: Level) {
  localStorage.setItem(`lead_override_${threadId}`, level);
}

// ===== Helpers visuais =====
function name(t: Thread) {
  return (
    (t.title || "").trim() ||
    `Contato • ${(t.metadata?.wa_id || t.metadata?.phone || "").toString().slice(-4) || "—"}`
  );
}
function phone(t: Thread) {
  const wa = (t.metadata?.wa_id || t.metadata?.phone || "").toString();
  return wa ? (wa.startsWith("+") ? wa : `+${wa}`) : "";
}
function colStyle(level: Level) {
  const map: Record<Level, { header: string; badge: string }> = {
    frio: { header: "#1e293b", badge: "#2563eb" },
    morno: { header: "#374151", badge: "#f59e0b" },
    quente: { header: "#3f1a1d", badge: "#dc2626" },
  };
  return map[level];
}
function scoreBadge(score?: number) {
  return typeof score === "number" ? <span className="chip soft">Score {score}</span> : null;
}

// ===== Tipagem enriquecida =====
type Row = Thread & {
  _level?: LeadLevelFull;
  _score?: number;
  _phone?: string;
  _lastAt?: string;
  _lastText?: string;
};

export default function Kanban() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // Carrega e aplica prioridade: override → backend → heurística
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const ts = await listThreads();
        const base: Row[] = ts.map((t) => {
          const beScore = (t as any).lead_score as number | undefined;
          const beLevel = (t as any).lead_level as LeadLevelFull | undefined;
          const override = getOverrideLevel(String(t.id));
          const effLevel: LeadLevelFull =
            override && override !== "desconhecido" ? override : beLevel ?? levelFromScore(beScore);
          const effScore = typeof beScore === "number" ? beScore : undefined;
          return { ...t, _phone: phone(t), _level: effLevel, _score: effScore };
        });
        setItems(base);

        // Completar com última msg + score/level local se faltar
        const CONC = 4;
        for (let i = 0; i < base.length; i += CONC) {
          await Promise.all(
            base.slice(i, i + CONC).map(async (t) => {
              try {
                const msgs = (await getMessages(Number(t.id))) as UIMessage[];
                if (!msgs?.length) return;
                const last = msgs[msgs.length - 1];
                const localScore =
                  typeof t._score === "number" ? t._score : computeLeadScoreFromMessages(msgs);
                const localLevel =
                  t._level && t._level !== "desconhecido" ? t._level : levelFromScore(localScore);
                setItems((prev) =>
                  prev.map((r) =>
                    r.id === t.id
                      ? {
                          ...r,
                          _lastText: last.content,
                          _lastAt: last.created_at,
                          _score: localScore,
                          _level: localLevel,
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
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Refresh leve a cada 15s (mantendo override)
  useEffect(() => {
    const id = window.setInterval(async () => {
      const ts = await listThreads();
      setItems((prev) => {
        const map = new Map(prev.map((x) => [String(x.id), x]));
        for (const t of ts) {
          const r = map.get(String(t.id));
          const beScore = (t as any).lead_score as number | undefined;
          const beLevel = (t as any).lead_level as LeadLevelFull | undefined;
          const override = getOverrideLevel(String(t.id));
          const effLevel: LeadLevelFull =
            override && override !== "desconhecido"
              ? override
              : beLevel ?? (r?._score !== undefined ? levelFromScore(r._score) : r?._level ?? "desconhecido");
          const effScore = typeof beScore === "number" ? beScore : r?._score;

          if (r) map.set(String(t.id), { ...r, origin: t.origin, _level: effLevel, _score: effScore });
          else map.set(String(t.id), { ...(t as Row), _phone: phone(t), _level: effLevel, _score: effScore });
        }
        return Array.from(map.values());
      });
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (t) =>
        name(t).toLowerCase().includes(s) ||
        (t._phone || "").toLowerCase().includes(s) ||
        (t._lastText || "").toLowerCase().includes(s)
    );
  }, [q, items]);

  const byLevel = useMemo(() => {
    const out: Record<Level, Row[]> = { frio: [], morno: [], quente: [] };
    for (const t of filtered) {
      const eff = t._level && t._level !== "desconhecido" ? t._level : ((t.lead_level as Level) || "frio");
      const bucket: Level = eff === "quente" ? "quente" : eff === "morno" ? "morno" : "frio";
      out[bucket].push(t);
    }
    const sortCol = (arr: Row[]) =>
      arr.sort((a, b) => {
        const sa = a._score ?? (a as any).lead_score ?? -1;
        const sb = b._score ?? (b as any).lead_score ?? -1;
        if (sb !== sa) return sb - sa;
        const ta = a._lastAt ? new Date(a._lastAt).getTime() : 0;
        const tb = b._lastAt ? new Date(b._lastAt).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return name(a).localeCompare(name(b));
      });
    return { frio: sortCol(out.frio), morno: sortCol(out.morno), quente: sortCol(out.quente) };
  }, [filtered]);

  async function move(t: Row, to: Level) {
    const id = t.id;
    const prev = t._level && t._level !== "desconhecido" ? (t._level as Level) : ((t.lead_level as Level) || "frio");
    setItems((prevItems) => prevItems.map((x) => (x.id === id ? { ...x, _level: to, lead_level: to } : x)));
    try {
      setOverrideLevel(String(id), to); // salva localmente
      await updateThread(Number(id), { lead_level: to }); // tenta persistir no backend
    } catch {
      setItems((prevItems) => prevItems.map((x) => (x.id === id ? { ...x, _level: prev, lead_level: prev } : x)));
      alert("Falha ao atualizar o nível.");
    }
  }

  function onDragStart(e: React.DragEvent, t: Row) {
    e.dataTransfer.setData("text/plain", String(t.id));
  }
  function onDrop(e: React.DragEvent, to: Level) {
    const id = e.dataTransfer.getData("text/plain");
    const t = items.find((x) => String(x.id) === id);
    if (t) move(t, to);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function Column({ level, title }: { level: Level; title: string }) {
    const data = byLevel[level];
    const style = colStyle(level);

    const btnBase: React.CSSProperties = {
      height: 36,
      borderRadius: 6,
      border: "1px solid var(--border)",
      background: "var(--bg)",
      color: "var(--text)",
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
    };

    return (
      <div
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${style.badge}`,
          background: "var(--bg)",
          minHeight: "calc(100vh - 180px)",
          maxHeight: "calc(100vh - 180px)",
          overflow: "hidden",
        }}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, level)}
      >
        <div
          style={{
            background: style.header,
            color: "white",
            padding: "10px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
          }}
        >
          <strong>{title}</strong>
          <span
            style={{
              background: style.badge,
              color: "white",
              borderRadius: 20,
              padding: "2px 10px",
              fontSize: 12,
            }}
          >
            {data.length}
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "grid", gap: 10 }}>
          {data.map((t) => {
            const targets: Level[] =
              level === "frio" ? ["morno", "quente"] : level === "morno" ? ["frio", "quente"] : ["frio", "morno"]; // quente

            return (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => onDragStart(e, t)}
                style={{
                  border: "1px dashed var(--border)",
                  borderRadius: 8,
                  background: "var(--panel)",
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  height: CARD_HEIGHT,
                  boxSizing: "border-box",
                  overflow: "hidden",
                }}
              >
                {/* Título + Score */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <strong
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "var(--text)",
                    }}
                    title={name(t)}
                  >
                    {name(t)}
                  </strong>
                  {scoreBadge(t._score)}
                </div>

                {/* Meta */}
                <div
                  className="small"
                  style={{
                    color: "var(--muted)",
                    minHeight: 18,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={`${
                    t.origin ? `Origem: ${t.origin.replace(/_/g, " ")}` : "Origem: —"
                  }${t._lastAt ? ` • Último: ${new Date(t._lastAt).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}`}
                >
                  {t.origin ? `Origem: ${t.origin.replace(/_/g, " ")}` : "Origem: —"}
                  {t._lastAt && (
                    <> • Último: {new Date(t._lastAt).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</>
                  )}
                </div>

                {/* Espaçador */}
                <div style={{ flex: 1, minHeight: 0 }} />

                {/* Botões padronizados */}
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                    {targets.map((dest) => (
                      <button key={dest} onClick={() => move(t, dest)} style={btnBase} title={`Mover para ${dest}`}>
                        {dest.charAt(0).toUpperCase() + dest.slice(1)}
                      </button>
                    ))}
                  </div>

                  <a
                    href={`/#/chat?thread=${t.id}`}
                    style={{
                      ...btnBase,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textDecoration: "none",
                      background: "#2563eb",
                      color: "white",
                      border: "1px solid #2563eb",
                    }}
                  >
                    Abrir chat
                  </a>
                </div>

                {/* Snippet (clamp 3 linhas) */}
                {t._lastText && (
                  <div
                    className="small"
                    style={{
                      color: "var(--muted)",
                      borderTop: "1px dashed var(--border)",
                      paddingTop: 4,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                    title={t._lastText}
                  >
                    “{t._lastText}”
                  </div>
                )}
              </div>
            );
          })}
          {data.length === 0 && (
            <div className="small" style={{ color: "var(--muted)", textAlign: "center", marginTop: 10 }}>
              Sem itens.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "calc(100vh - 56px)", display: "grid", gridTemplateRows: "auto 1fr" }}>
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
          placeholder="Buscar lead (nome, número, mensagem)..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <div className="small" style={{ marginLeft: "auto", color: "var(--muted)" }}>{filtered.length} lead(s)</div>
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, height: "100%" }}>
          <Column level="frio" title="Frio" />
          <Column level="morno" title="Morno" />
          <Column level="quente" title="Quente" />
        </div>
      </div>
      {loading && <div className="small" style={{ padding: 8, color: "var(--muted)" }}>Carregando…</div>}
    </div>
  );
}
