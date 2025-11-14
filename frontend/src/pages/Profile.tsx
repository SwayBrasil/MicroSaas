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

type TopContact = {
  id: string;
  name?: string | null;
  last_at?: string | null;
  total_msgs?: number;
};

type StatsResponse = {
  // básicos (já existiam)
  threads?: number;
  total_messages?: number;
  user_messages?: number;
  assistant_messages?: number;
  last_activity?: string | null;
  messages_by_day?: MessagesByDay[];
  avg_assistant_response_ms?: number | null;

  // novos (opcionais; render condicional)
  first_response_time_ms_avg?: number | null; // FRT
  resolution_time_ms_avg?: number | null;     // TMR
  assistant_latency_p50?: number | null;
  assistant_latency_p95?: number | null;
  takeover_rate?: number | null;              // 0..1 (fração)
  lead_levels?: { frio?: number; morno?: number; quente?: number } | null;
  active_days_30d?: number | null;            // 0..30
  messages_by_hour?: number[] | null;         // 24 posições
  messages_heatmap?: number[][] | null;       // 7x24 (0=Dom, 6=Sáb) opcional
  top_contacts?: TopContact[] | null;
  wa_templates_month?: number | null;
  wa_sessions_month?: number | null;
  tokens_month?: { prompt?: number; completion?: number } | null;

  // onboarding
  onboarding_total_steps?: number | null;
  onboarding_current_step?: number | null;
  is_onboarded?: boolean | null;
};

/** =========================
 * Utils
 * ========================= */
function formatDate(dt?: string | number | Date | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}
function initials(name?: string, email?: string) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase()).join("");
  }
  const user = email?.split("@")[0] || "U";
  return (user[0] || "U").toUpperCase();
}
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));

/** =========================
 * Componentes Visuais
 * ========================= */
function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  return (
    <div style={{ width: "100%", height: 10, background: "var(--soft)", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: "var(--primary)" }} />
    </div>
  );
}

function MiniBar({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const tot = Math.max(0, a + b);
  const pa = tot ? (a / tot) * 100 : 0;
  const pb = tot ? (b / tot) * 100 : 0;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="small">{labelA}: <strong>{a}</strong></span>
        <span className="small">{labelB}: <strong>{b}</strong></span>
        <span className="small" style={{ marginLeft: "auto", opacity: 0.8 }}>Total: {tot}</span>
      </div>
      <div style={{ height: 12, borderRadius: 999, overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${pa}%`, background: "#6366f1" }} />
        <div style={{ width: `${pb}%`, background: "#10b981" }} />
      </div>
    </div>
  );
}

function LeadDistribution({ frio = 0, morno = 0, quente = 0 }: { frio?: number; morno?: number; quente?: number }) {
  const tot = Math.max(0, frio + morno + quente);
  const pct = (x: number) => (tot ? Math.round((x / tot) * 100) : 0);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span className="chip" style={{ background: "#0f172a", color: "#93c5fd", border: "1px solid #1d4ed8" }}>
          ❄️ Frio: <strong style={{ marginLeft: 6 }}>{frio}</strong> ({pct(frio)}%)
        </span>
        <span className="chip" style={{ background: "#1f2937", color: "#fde68a", border: "1px solid #f59e0b" }}>
          🌤️ Morno: <strong style={{ marginLeft: 6 }}>{morno}</strong> ({pct(morno)}%)
        </span>
        <span className="chip" style={{ background: "#2d0f12", color: "#fecaca", border: "1px solid #dc2626" }}>
          🔥 Quente: <strong style={{ marginLeft: 6 }}>{quente}</strong> ({pct(quente)}%)
        </span>
      </div>
      <div style={{ height: 12, borderRadius: 999, overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${pct(frio)}%`, background: "#1d4ed8" }} />
        <div style={{ width: `${pct(morno)}%`, background: "#f59e0b" }} />
        <div style={{ width: `${pct(quente)}%`, background: "#dc2626" }} />
      </div>
    </div>
  );
}

function MiniHeatmap24x7({
  heatmap, // 7x24 [dia][hora]
  width = 360,
  height = 140,
  dayLabels = ["D", "S", "T", "Q", "Q", "S", "S"],
}: {
  heatmap: number[][];
  width?: number;
  height?: number;
  dayLabels?: string[];
}) {
  const rows = heatmap.length;
  const cols = heatmap[0]?.length || 0;
  const cellW = width / Math.max(1, cols);
  const cellH = height / Math.max(1, rows);
  const flat = heatmap.flat();
  const max = Math.max(1, ...flat);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: `auto ${width}px`, alignItems: "center", gap: 8 }}>
        <div />
        <div className="small" style={{ display: "flex", justifyContent: "space-between", opacity: 0.8 }}>
          {Array.from({ length: cols }, (_, i) => <span key={i} style={{ width: cellW, textAlign: "center" }}>{i}</span>)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `auto ${width}px`, gap: 8 }}>
        <div style={{ display: "grid", gap: 4 }}>
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="small" style={{ opacity: 0.8 }}>{dayLabels[r] ?? r}</div>
          ))}
        </div>
        <svg width={width} height={height}>
          {heatmap.map((row, r) =>
            row.map((v, c) => {
              const intensity = v / max; // 0..1
              const bg = `rgba(99,102,241,${0.08 + 0.85 * intensity})`;
              return (
                <rect
                  key={`${r}-${c}`}
                  x={c * cellW}
                  y={r * cellH}
                  width={cellW - 1}
                  height={cellH - 1}
                  fill={bg}
                  stroke="transparent"
                />
              );
            })
          )}
        </svg>
      </div>
    </div>
  );
}

/** =========================
 * Gráficos exist.
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
  const total = Math.max(0, data.reduce((acc, d) => acc + (Number.isFinite(d.value) ? d.value : 0), 0));
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  let cumulative = 0;

  return (
    <div style={{ display: "grid", placeItems: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
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
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight={700} fill="var(--text)">
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
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const w = width;
  const h = height;
  const plotW = w - padding * 2;
  const plotH = h - padding * 2;

  const ys = series.map((d) => d.y);
  const yMax = Math.max(1, ...ys);
  const n = Math.max(1, series.length);

  const points = series.map((d, i) => {
    const x = padding + (plotW * (i / Math.max(1, n - 1)));
    const y = padding + plotH * (1 - d.y / yMax);
    return { x, y, xy: `${x},${y}` };
  });

  return (
    <div style={{ display: "grid", gap: 6, position: "relative" }}>
      <svg
        width={w}
        height={h}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.target as SVGElement).closest("svg")!.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          let best = 0, bestDist = Infinity;
          points.forEach((p, i) => {
            const d = Math.abs(mx - p.x);
            if (d < bestDist) { bestDist = d; best = i; }
          });
          setHover({ i: best, x: points[best].x, y: points[best].y });
        }}
        style={{ color: "var(--primary)" }}
      >
        <line x1={padding} y1={padding} x2={padding} y2={h - padding} stroke="var(--border)" strokeWidth={1} />
        <line x1={padding} y1={h - padding} x2={w - padding} y2={h - padding} stroke="var(--border)" strokeWidth={1} />
        {[0, 0.5, 1].map((t, i) => {
          const yy = padding + plotH * (1 - t);
          return <line key={i} x1={padding} y1={yy} x2={w - padding} y2={yy} stroke="var(--soft)" strokeWidth={1} />;
        })}

        {points.length >= 2 && <polyline points={points.map((p) => p.xy).join(" ")} fill="none" stroke="currentColor" strokeWidth={2} />}
        {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="currentColor" />)}

        {hover && (
          <>
            <line x1={hover.x} y1={padding} x2={hover.x} y2={h - padding} stroke="var(--soft)" />
            <circle cx={points[hover.i].x} cy={points[hover.i].y} r={5} fill="var(--primary)" />
          </>
        )}
      </svg>

      {label && <div className="small" style={{ textAlign: "center", opacity: 0.8 }}>{label}</div>}

      {hover && (
        <div
          style={{
            position: "absolute",
            left: hover.x + 8,
            top: Math.max(0, points[hover.i].y - 36),
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "6px 8px",
            fontSize: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,.15)",
            pointerEvents: "none",
          }}
        >
          <div><strong>{series[hover.i].x}</strong></div>
          <div>{series[hover.i].y} msgs</div>
        </div>
      )}
    </div>
  );
}

/** =========================
 * Página Profile
 * ========================= */
export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [stats, setStatsState] = useState<StatsResponse | null>(null);
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
        if (sRes.status === "fulfilled" && sRes.value) setStatsState(sRes.value as StatsResponse);
      } catch (e: any) {
        setErr(e?.message || "Falha ao carregar sua conta.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const data = profile || fallback;
  const planLabel = data.plan || "Trial";

  const totalUser = stats?.user_messages ?? usage?.user_sent ?? 0;
  const totalAssistant = stats?.assistant_messages ?? usage?.assistant_sent ?? 0;
  const totalMsgs = stats?.total_messages ?? usage?.messages_total ?? (totalUser + totalAssistant);

  /** Pizza */
  const pieData: PieDatum[] = [
    { label: "Você", value: totalUser, color: "#6366f1" },
    { label: "Assistente", value: totalAssistant, color: "#10b981" },
  ];

  /** Linha por dia */
  const messagesByDay: MessagesByDay[] = useMemo(() => {
    if (stats?.messages_by_day?.length) {
      return stats.messages_by_day.slice().sort((a, b) => a.date.localeCompare(b.date));
    }
    return [];
  }, [stats?.messages_by_day]);

  const lineSeries = messagesByDay.map((d) => ({
    x: d.date,
    y: Math.max(0, (d.user || 0) + (d.assistant || 0)),
  }));

  /** Tempo ganho */
  const [humanSecondsPerMsg, setHumanSecondsPerMsg] = useState<number>(45);
  const assistantSecondsPerMsg = (stats?.avg_assistant_response_ms ?? 3000) / 1000;
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

  // Derivados
  const msgsPerThread = (totalMsgs && stats?.threads) ? (totalMsgs / (stats.threads || 1)) : 0;
  const takeoverPct = typeof stats?.takeover_rate === "number" ? Math.round(stats.takeover_rate * 100) : null;

  // Skeleton
  if (loading) {
    return (
      <div style={{ padding: 14, display: "grid", gap: 12 }}>
        <div className="profile-card" style={{ height: 120 }} />
        <div className="profile-card" style={{ height: 120 }} />
        <div className="profile-card" style={{ height: 320 }} />
      </div>
    );
  }

  return (
    <div
      style={{
        height: "calc(100vh - 56px)", // header global 56px
        minHeight: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        background: "var(--bg)",
      }}
    >
      {/* Topo fixo */}
      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn soft" onClick={() => navigate(-1)} title="Voltar" style={{ padding: "6px 10px" }}>
            ← Voltar
          </button>
          <h2 className="profile-title" style={{ margin: 0 }}>Minha conta</h2>
        </div>
      </div>

      {/* Conteúdo rolável */}
      <div
        style={{
          overflowY: "auto",
          minHeight: 0,
          padding: "0 14px 14px",
          display: "grid",
          gap: 14,
          alignContent: "start",
        }}
      >
        {/* Header */}
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <KV k="ID" v={String(data.id)} />
            <KV k="Plano" v={planLabel} />
            <KV k="Criado em" v={formatDate(data.created_at)} />
            <KV k="Última atividade" v={formatDate(stats?.last_activity ?? data.last_activity_at)} />
          </div>
        </div>

        {/* KPIs gerais */}
        <div className="profile-card" style={{ display: "grid", gap: 12 }}>
          <div className="profile-title">Seus números</div>
          <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
            <StatCard title="Conversas (total)" value={stats?.threads ?? usage?.threads_total ?? 0} />
            <StatCard title="Mensagens (total)" value={totalMsgs} />
            <StatCard title="Você enviou" value={totalUser} />
            <StatCard title="Assistente respondeu" value={totalAssistant} />
            <StatCard title="Média msgs/conv." value={Number.isFinite(msgsPerThread) ? Number(msgsPerThread.toFixed(1)) : 0} />
            {typeof stats?.active_days_30d === "number" && (
              <div className="stat-cardx" style={{ textAlign: "center" }}>
                <div className="stat-kpi">{stats.active_days_30d}/30</div>
                <div className="stat-label" style={{ marginTop: 6 }}>Dias ativos (30d)</div>
                <ProgressBar value={stats.active_days_30d} max={30} />
              </div>
            )}
          </div>
          {err && (
            <div role="alert" style={{ border: "1px solid #7f1d1d", background: "#1b0f10", color: "#fecaca", padding: "10px 12px", borderRadius: 10, fontSize: 14 }}>
              {err}
            </div>
          )}
        </div>

        {/* Visualizações principais */}
        <div className="profile-card" style={{ display: "grid", gap: 16 }}>
          <div className="profile-title">Visualizações</div>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
            {/* Pizza */}
            <div style={{ display: "grid", gap: 12 }}>
              <div className="small" style={{ fontWeight: 600 }}>Distribuição de mensagens</div>
              <PieChart
                data={pieData}
                size={220}
                strokeWidth={28}
                centerLabel={`${totalMsgs} msgs`}
              />
            </div>
            {/* Linha */}
            <div style={{ display: "grid", gap: 12 }}>
              <div className="small" style={{ fontWeight: 600 }}>Mensagens por dia</div>
              <div style={{ overflowX: "auto", maxWidth: "100%" }}>
                <LineChart
                  series={lineSeries}
                  width={Math.max(520, 64 * Math.max(1, lineSeries.length))}
                  height={240}
                  label="Total por dia (você + assistente)"
                />
              </div>
              {!lineSeries.length && (
                <div className="small" style={{ opacity: 0.7 }}>Sem histórico suficiente para exibir o gráfico.</div>
              )}
            </div>
          </div>
        </div>

        {/* Atendimento & Qualidade */}
        {(stats?.first_response_time_ms_avg != null ||
          stats?.resolution_time_ms_avg != null ||
          stats?.assistant_latency_p50 != null ||
          stats?.assistant_latency_p95 != null ||
          stats?.takeover_rate != null) && (
          <div className="profile-card" style={{ display: "grid", gap: 12 }}>
            <div className="profile-title">Atendimento & Qualidade</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              {typeof stats?.first_response_time_ms_avg === "number" && (
                <StatCard title="FRT médio" valueLabel={`${Math.round(stats.first_response_time_ms_avg / 1000)}s`} />
              )}
              {typeof stats?.resolution_time_ms_avg === "number" && (
                <StatCard title="TMR médio" valueLabel={hhmm(stats.resolution_time_ms_avg / 1000)} />
              )}
              {typeof stats?.assistant_latency_p50 === "number" && (
                <StatCard title="Latência p50" valueLabel={`${Math.round(stats.assistant_latency_p50)} ms`} />
              )}
              {typeof stats?.assistant_latency_p95 === "number" && (
                <StatCard title="Latência p95" valueLabel={`${Math.round(stats.assistant_latency_p95)} ms`} />
              )}
              {takeoverPct != null && (
                <div className="stat-cardx" style={{ textAlign: "center" }}>
                  <div className="stat-kpi">{takeoverPct}%</div>
                  <div className="stat-label" style={{ marginTop: 6 }}>Takeover humano</div>
                  <ProgressBar value={takeoverPct} max={100} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Distribuição de Leads */}
        {stats?.lead_levels && (
          <div className="profile-card" style={{ display: "grid", gap: 12 }}>
            <div className="profile-title">Temperatura dos leads</div>
            <LeadDistribution
              frio={stats.lead_levels?.frio ?? 0}
              morno={stats.lead_levels?.morno ?? 0}
              quente={stats.lead_levels?.quente ?? 0}
            />
          </div>
        )}

        {/* Heatmap horário (7x24 se vier, senão 24h simples) */}
        {(stats?.messages_heatmap?.length || stats?.messages_by_hour?.length) && (
          <div className="profile-card" style={{ display: "grid", gap: 12 }}>
            <div className="profile-title">Horários de pico</div>
            {stats?.messages_heatmap?.length ? (
              <MiniHeatmap24x7 heatmap={stats.messages_heatmap as number[][]} width={520} height={180} />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="small" style={{ opacity: 0.8 }}>Mensagens por hora (0–23)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 4 }}>
                  {(stats?.messages_by_hour || []).map((v, i) => (
                    <div key={i} title={`${i}h: ${v}`}
                      style={{ height: 36, background: "var(--soft)", border: "1px solid var(--border)", display: "grid", placeItems: "center", borderRadius: 6 }}>
                      <span className="small">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top contatos */}
        {stats?.top_contacts?.length ? (
          <div className="profile-card" style={{ display: "grid", gap: 12 }}>
            <div className="profile-title">Top contatos</div>
            <div style={{ overflowX: "auto" }}>
              <table className="small" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>Contato</Th>
                    <Th>Total msgs</Th>
                    <Th>Último contato</Th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_contacts!.map((c) => (
                    <tr key={c.id}>
                      <Td>{c.name || c.id}</Td>
                      <Td align="right">{c.total_msgs ?? 0}</Td>
                      <Td>{formatDate(c.last_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* WhatsApp & Tokens */}
        {(stats?.wa_templates_month != null || stats?.wa_sessions_month != null || stats?.tokens_month) && (
          <div className="profile-card" style={{ display: "grid", gap: 16 }}>
            <div className="profile-title">Uso de canais & custo</div>

            {(typeof stats?.wa_templates_month === "number" || typeof stats?.wa_sessions_month === "number") && (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="small" style={{ fontWeight: 600 }}>WhatsApp (mês atual)</div>
                <MiniBar
                  a={stats?.wa_templates_month ?? 0}
                  b={stats?.wa_sessions_month ?? 0}
                  labelA="Templates"
                  labelB="Sessões (24h)"
                />
              </div>
            )}

            {stats?.tokens_month && (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="small" style={{ fontWeight: 600 }}>Tokens (mês atual)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                  <StatCard title="Prompt tokens" value={stats.tokens_month.prompt ?? 0} />
                  <StatCard title="Completion tokens" value={stats.tokens_month.completion ?? 0} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabela por dia + Tempo ganho */}
        <div style={{ display: "grid", gap: 14 }}>
          <div className="profile-card" style={{ display: "grid", gap: 12 }}>
            <div className="profile-title">Relação de mensagens por dia</div>
            <div style={{ overflowX: "auto" }}>
              <table className="small" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Você</Th>
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
                  {!messagesByDay.length && (
                    <tr><Td colSpan={4} align="center">Sem dados ainda.</Td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="profile-card" style={{ display: "grid", gap: 16 }}>
            <div className="profile-title">Tempo ganho (assistente vs. humano)</div>
            <div className="small" style={{ lineHeight: 1.6 }}>
              Baseado em <strong>{totalAssistant}</strong> respostas da assistente:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <StatCard title="Se fosse humano" valueLabel={hhmm(totalAssistant * humanSecondsPerMsg)} />
              <StatCard title="Com a assistente" valueLabel={hhmm(totalAssistant * assistantSecondsPerMsg)} />
              <StatCard title="Tempo ganho" valueLabel={hhmm(timeSavedSeconds)} />
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
                style={{ width: 100, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text)" }}
              />
              <span style={{ opacity: 0.8 }}>(padrão: 45s)</span>
            </div>
          </div>
        </div>

        {/* Onboarding */}
        {(stats?.onboarding_total_steps || stats?.is_onboarded) && (
          <div className="profile-card" style={{ display: "grid", gap: 12 }}>
            <div className="profile-title">Onboarding</div>
            {stats?.is_onboarded ? (
              <div className="small">✅ Onboarding concluído.</div>
            ) : (
              <>
                <div className="small">
                  Progresso:{" "}
                  <strong>
                    {stats?.onboarding_current_step ?? 0}/{stats?.onboarding_total_steps ?? 0}
                  </strong>
                </div>
                <ProgressBar
                  value={stats?.onboarding_current_step ?? 0}
                  max={stats?.onboarding_total_steps ?? 0}
                />
                <div>
                  <button className="btn">Continuar onboarding</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** =========================
 * Helpers visuais
 * ========================= */
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv"><span className="kv-k">{k}</span><span className="kv-v">{v}</span></div>
  );
}

function StatCard({ title, value, valueLabel }: { title: string; value?: number; valueLabel?: string }) {
  return (
    <div className="stat-cardx" style={{ textAlign: "center" }}>
      <div className="stat-kpi">{typeof valueLabel === "string" ? valueLabel : value ?? 0}</div>
      <div className="stat-label" style={{ marginTop: 6 }}>{title}</div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", fontWeight: 600, padding: "8px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}
function Td({ children, align, colSpan }: { children: React.ReactNode; align?: "left" | "right" | "center"; colSpan?: number }) {
  return (
    <td style={{ textAlign: align || "left", padding: "8px 10px", borderBottom: "1px solid var(--soft)", whiteSpace: "nowrap" }} colSpan={colSpan}>
      {children}
    </td>
  );
}
