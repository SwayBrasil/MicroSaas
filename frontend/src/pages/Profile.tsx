// frontend/src/pages/Profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { getProfile, getUsage, getStats } from "../api";

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
function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn soft"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        } catch {}
      }}
      title={`Copiar ${label || "valor"}`}
      style={{ padding: "6px 10px" }}
    >
      {ok ? "Copiado ✓" : "Copiar"}
    </button>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastActivity, setLastActivity] = useState<string | null>(null);

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

        const [pRes, uRes, sRes] = await Promise.allSettled([
          getProfile?.(),
          getUsage?.(),
          getStats?.(),
        ]);

        if (pRes.status === "fulfilled" && pRes.value) setProfile(pRes.value);
        if (uRes.status === "fulfilled" && uRes.value) setUsage(uRes.value);
        if (sRes.status === "fulfilled" && sRes.value) {
          setLastActivity(sRes.value.last_activity);
        }
      } catch (e: any) {
        setErr(e?.message || "Falha ao carregar sua conta.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const data = profile || fallback;
  const planLabel = data.plan || "Trial";

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button className="btn soft" onClick={() => navigate(-1)} title="Voltar" style={{ padding: "6px 10px" }}>
          ← Voltar
        </button>
        <h2 className="profile-title" style={{ margin: 0 }}>Minha conta</h2>
      </div>

      {/* Header card */}
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

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CopyBtn text={String(data.id)} label="ID" />
            <CopyBtn text={data.email} label="e-mail" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          <div className="kv"><span className="kv-k">ID</span><span className="kv-v">{String(data.id)}</span></div>
          <div className="kv"><span className="kv-k">Plano</span><span className="kv-v">{planLabel}</span></div>
          <div className="kv"><span className="kv-k">Criado em</span><span className="kv-v">{formatDate(data.created_at)}</span></div>
          <div className="kv"><span className="kv-k">Última atividade</span><span className="kv-v">{formatDate(lastActivity || data.last_activity_at)}</span></div>
        </div>
      </div>

      {/* Métricas */}
      <div style={{ marginTop: 14 }} className="profile-card">
        <div className="profile-title" style={{ marginBottom: 12 }}>Seus números</div>
        <div className="stats-grid">
          <StatCard title="Conversas (total)" value={usage?.threads_total ?? 0} />
          <StatCard title="Mensagens (total)" value={usage?.messages_total ?? 0} />
          <StatCard title="Enviadas (você)" value={usage?.user_sent ?? 0} />
          <StatCard title="Recebidas (assistente)" value={usage?.assistant_sent ?? 0} />
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
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="stat-cardx" style={{ textAlign: "center" }}>
      <div className="stat-kpi">{value}</div>
      <div className="stat-label" style={{ marginTop: 6 }}>{title}</div>
    </div>
  );
}
