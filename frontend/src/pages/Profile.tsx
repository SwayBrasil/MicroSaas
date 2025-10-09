// frontend/src/pages/Profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { getProfile, getUsage, getStats } from "../api";

/** =========================
 * Tipos
 * ========================= */
type ProfileData = {
  id: string | number;
  email: string;
  name?: string;
  plan?: string;
  created_at?: string | null;
  last_activity_at?: string | null;
};
type UsageData = {
  threads_total: number;
  messages_total: number;
  user_sent: number;
  assistant_sent: number;
};
type MessagesByDay = { date: string; user: number; assistant: number };
type StatsResponse = {
  last_activity?: string | null;
  messages_by_day?: MessagesByDay[];
  avg_assistant_response_ms?: number;
};

/** =========================
 * Utils
 * ========================= */
function formatDate(dt?: string | number | Date | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleString();
}
function initials(name?: string, email?: string) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase()).join("");
  }
  const user = email?.split("@")[0] || "U";
  return (user[0] || "U").toUpperCase();
}

/** =========================
 * SVG PieChart
 * ========================= */
type PieDatum = { label: string; value: number; color: string };
function PieChart({
  data,
  size = 200,
  strokeWidth = 26,
  centerLabel,
}: {
  data: PieDatum[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
}) {
  const total = Math.max(
    0,
    data.reduce((acc, d) => acc + (Number.isFinite(d.value) ? d.value : 0), 0)
  );
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  let cumulative = 0;

  return (
    <div style={{ display: "grid", placeItems: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {total === 0 ? (
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
          />
        ) : (
          data.map((d, idx) => {
            const value = Math.max(0, d.value);
            const portion = total ? value / total : 0;
            const dash = 2 * Math.PI * radius * portion;
            const gap = 2 * Math.PI * radius - dash;
            const rotation = total ? (cumulative / total) * 360 : 0;
            cumulative += value;
            return (
              <circle
                key={idx}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${gap}`}
                transform={`rotate(-90 ${cx} ${cy}) rotate(${rotation} ${cx} ${cy})`}
              />
            );
          })
        )}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={14}
          fontWeight={600}
          fill="var(--text)"
        >
          {centerLabel ?? total}
        </text>
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, display: "inline-block" }} />
            <span className="small">
              {d.label}: <strong>{d.value}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** =========================
 * SVG LineChart simples
 * ========================= */
function LineChart({
  series,
  width = 520,
  height = 220,
  padding = 28,
  label,
}: {
  series: { x: string; y: number }[];
  width?: number;
  height?: number;
  padding?: number;
  label?: string;
}) {
  const w = width;
  const h = height;
  const plotW = w - padding * 2;
  const plotH = h - padding * 2;

  const xs = series.map((d) => d.x);
  const ys = series.map((d) => d.y);
  const yMax = Math.max(1, ...ys);
  const xCount = Math.max(1, xs.length);

  const points = series.map((d, i) => {
    const x = padding + (plotW * (i / Math.max(1, xCount - 1)));
    const y = padding + plotH * (1 - d.y / yMax);
    return `${x},${y}`;
  });

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <svg width={w} height={h}>
        <line x1={padding} y1={padding} x2={padding} y2={h - padding} stroke="var(--border)" strokeWidth={1} />
        <line x1={padding} y1={h - padding} x2={w - padding} y2={h - padding} stroke="var(--border)" strokeWidth={1} />
        {[0, 0.5, 1].map((t, i) => {
          const yy = padding + plotH * (1 - t);
          return <line key={i} x1={padding} y1={yy} x2={w - padding} y2={yy} stroke="var(--soft)" strokeWidth={1} />;
        })}
        {points.length >= 2 && <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth={2} />}
        {series.map((_, i) => {
          const x = padding + (plotW * (i / Math.max(1, xCount - 1)));
          const y = padding + plotH * (1 - series[i].y / yMax);
          return <circle key={i} cx={x} cy={y} r={3} fill="currentColor" />;
        })}
      </svg>
      {label && <div className="small" style={{ textAlign: "center", opacity: 0.8 }}>{label}</div>}
    </div>
  );
}

/** =========================
 * Profile Page
 * ========================= */
export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fallback: ProfileData = useMemo(
    () => ({
      id: (user as any)?.id ?? "-",
      email: (user as any)?.email ?? "dev@local.com",
      name: (user as any)?.name ?? "Usuário",
      plan: (user as any)?.plan ?? "Trial",
      created_at: (user as any)?.created_at ?? null,
      last_activity_at: null,
    }),
    [user]
  );

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const [pRes, uRes, sRes] = await Promise.allSettled([getProfile?.(), getUsage?.(), getStats?.()]);
        if (pRes.status === "fulfilled" && pRes.value) setProfile(pRes.value);
        if (uRes.status === "fulfilled" && uRes.value) setUsage(uRes.value);
        if (sRes.status === "fulfilled" && sRes.value) setStats(sRes.value as StatsResponse);
      } catch (e: any) {
        setErr(e?.message || "Falha ao carregar sua conta.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const data = profile || fallback;
  const planLabel = data.plan || "Trial";
  const totalUser = usage?.user_sent ?? 0;
  const totalAssistant = usage?.assistant_sent ?? 0;

  // Pie
  const pieData: PieDatum[] = [
    { label: "Usuário", value: totalUser, color: "#4f46e5" },
    { label: "Assistente", value: totalAssistant, color: "#22c55e" },
  ];

  // Linha por dia
  const messagesByDay: MessagesByDay[] = useMemo(() => {
    if (stats?.messages_by_day?.length) {
      return stats.messages_by_day.slice().sort((a, b) => a.date.localeCompare(b.date));
    }
    const days = 7;
    const uPer = Math.floor((totalUser || 0) / days);
    const aPer = Math.floor((totalAssistant || 0) / days);
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return Array.from({ length: days }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (days - 1 - i));
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      return { date, user: uPer, assistant: aPer };
    });
  }, [stats?.messages_by_day, totalUser, totalAssistant]);

  const lineSeries = messagesByDay.map((d) => ({ x: d.date, y: Math.max(0, (d.user || 0) + (d.assistant || 0)) }));

  // Tempo ganho
  const [humanSecondsPerMsg, setHumanSecondsPerMsg] = useState<number>(45);
  const assistantSecondsPerMsg =
    (stats?.avg_assistant_response_ms && stats.avg_assistant_response_ms / 1000) || 3;

  const assistantMsgs = totalAssistant;
  const timeHuman = assistantMsgs * humanSecondsPerMsg;
  const timeAssistant = assistantMsgs * assistantSecondsPerMsg;
  const timeSavedSeconds = Math.max(0, timeHuman - timeAssistant);
  const hhmm = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const parts = [h ? `${h}h` : null, m ? `${m}m` : null, s || (!h && !m) ? `${s}s` : null].filter(Boolean);
    return parts.join(" ");
  };

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button className="btn soft" onClick={() => navigate(-1)} title="Voltar" style={{ padding: "6px 10px" }}>
          ← Voltar
        </button>
        <h2 className="profile-title" style={{ margin: 0 }}>Minha conta</h2>
      </div>

      {/* Header card (SEM botões de copiar) */}
      <div className="profile-card" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 999,
              background: "var(--soft)", border: "1px solid var(--border)",
              display: "grid", placeItems: "center", fontWeight: 700, fontSize: 18,
            }}
            aria-label="Avatar"
          >
            {initials(data.name, data.email)}
          </div>

          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 18 }}>{data.name || "Usuário"}</strong>
              <span className="badge">{planLabel}</span>
            </div>
            <div className="small">{data.email}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          <div className="kv"><span className="kv-k">ID</span><span className="kv-v">{String(data.id)}</span></div>
          <div className="kv"><span className="kv-k">Plano</span><span className="kv-v">{planLabel}</span></div>
          <div className="kv"><span className="kv-k">Criado em</span><span className="kv-v">{formatDate(data.created_at)}</span></div>
          <div className="kv"><span className="kv-k">Última atividade</span><span className="kv-v">{formatDate(stats?.last_activity ?? data.last_activity_at)}</span></div>
        </div>
      </div>

      {/* Métricas principais */}
      <div style={{ marginTop: 14 }} className="profile-card">
        <div className="profile-title" style={{ marginBottom: 12 }}>Seus números</div>
        <div className="stats-grid">
          <StatCard title="Conversas (total)" value={usage?.threads_total ?? 0} />
          <StatCard title="Mensagens (total)" value={usage?.messages_total ?? (totalUser + totalAssistant)} />
          <StatCard title="Enviadas (você)" value={totalUser} />
          <StatCard title="Recebidas (assistente)" value={totalAssistant} />
        </div>
        {err && (
          <div role="alert" style={{
            border: "1px solid #7f1d1d", background: "#1b0f10", color: "#fecaca",
            padding: "10px 12px", borderRadius: 10, fontSize: 14, marginTop: 10
          }}>
            {err}
          </div>
        )}
      </div>

      {/* GRÁFICOS LADO A LADO */}
      <div className="profile-card" style={{ marginTop: 14 }}>
        <div className="profile-title" style={{ marginBottom: 12 }}>Visualizações</div>

        {/* grid responsivo 2 colunas */}
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            alignItems: "start",
          }}
        >
          {/* Pizza */}
          <div style={{ display: "grid", gap: 12 }}>
            <div className="small" style={{ fontWeight: 600 }}>Distribuição de mensagens</div>
            <PieChart
              data={[
                { label: "Usuario", value: totalUser, color: "#4f46e5" },
                { label: "Assistente", value: totalAssistant, color: "#22c55e" },
              ]}
              size={220}
              strokeWidth={28}
              centerLabel={`${(usage?.messages_total ?? (totalUser + totalAssistant))} msgs`}
            />
          </div>

          {/* Linha */}
          <div style={{ display: "grid", gap: 12 }}>
            <div className="small" style={{ fontWeight: 600 }}>Mensagens por dia</div>
            <div style={{ overflowX: "auto" }}>
              <LineChart
                series={messagesByDay.map((d) => ({ x: d.date, y: (d.user || 0) + (d.assistant || 0) }))}
                width={Math.max(520, 64 * messagesByDay.length)}
                height={240}
                label="Total por dia (usuário + assistente)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Relação por dia + Tempo ganho */}
      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        {/* Tabela relação por dia */}
        <div className="profile-card" style={{ display: "grid", gap: 12 }}>
          <div className="profile-title">Relação de mensagens por dia</div>
          <div style={{ overflowX: "auto" }}>
            <table className="small" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Usuário</Th>
                  <Th>Assistente</Th>
                  <Th>Total</Th>
                </tr>
              </thead>
              <tbody>
                {messagesByDay.map((d) => {
                  const tot = (d.user || 0) + (d.assistant || 0);
                  return (
                    <tr key={d.date}>
                      <Td>{d.date}</Td>
                      <Td align="right">{d.user || 0}</Td>
                      <Td align="right">{d.assistant || 0}</Td>
                      <Td align="right"><strong>{tot}</strong></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tempo ganho */}
        <div className="profile-card" style={{ display: "grid", gap: 16 }}>
          <div className="profile-title">Tempo ganho (assistente vs. humano)</div>

          <div className="small" style={{ lineHeight: 1.6 }}>
            Baseado em <strong>{totalAssistant}</strong> respostas da assistente:
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            <div className="stat-cardx" style={{ flex: "1 1 180px", minWidth: 180, textAlign: "center" }}>
              <div className="stat-kpi">{hhmm(totalAssistant * (humanSecondsPerMsg))}</div>
              <div className="stat-label" style={{ marginTop: 6 }}>Se fosse humano</div>
            </div>
            <div className="stat-cardx" style={{ flex: "1 1 180px", minWidth: 180, textAlign: "center" }}>
              <div className="stat-kpi">
                {hhmm(totalAssistant * ((stats?.avg_assistant_response_ms || 3000) / 1000))}
              </div>
              <div className="stat-label" style={{ marginTop: 6 }}>Com a assistente</div>
            </div>
            <div className="stat-cardx" style={{ flex: "1 1 180px", minWidth: 180, textAlign: "center" }}>
              <div className="stat-kpi" title={`${timeSavedSeconds} segundos`}>{hhmm(timeSavedSeconds)}</div>
              <div className="stat-label" style={{ marginTop: 6 }}>Tempo ganho</div>
            </div>
          </div>

          <div className="small" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label htmlFor="human-seconds">Tempo humano por mensagem:</label>
            <input
              id="human-seconds"
              type="number"
              min={1}
              max={600}
              step={1}
              value={humanSecondsPerMsg}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value) || 1);
                setHumanSecondsPerMsg(v);
              }}
              style={{
                width: 100,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
              }}
            />
            <span style={{ opacity: 0.8 }}>(padrão: 45s)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** =========================
 * Helpers visuais
 * ========================= */
function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="stat-cardx" style={{ textAlign: "center" }}>
      <div className="stat-kpi">{value}</div>
      <div className="stat-label" style={{ marginTop: 6 }}>{title}</div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        fontWeight: 600,
        padding: "8px 10px",
        borderBottom: "1px solid var(--border)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}
function Td({ children, align }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <td
      style={{
        textAlign: align || "left",
        padding: "8px 10px",
        borderBottom: "1px solid var(--soft)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}
