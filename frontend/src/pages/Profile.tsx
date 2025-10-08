// frontend/src/pages/Profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import {
  // Ajuste os nomes conforme seu ../api
  getProfile,     // retorna { id, email, name, plan, created_at, last_activity_at }
  getUsage,       // retorna { threads_total, messages_total, user_sent, assistant_sent }
  getActivities,  // retorna Array<{ id, type, title, at }>
} from "../api";

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

type Activity = {
  id: string | number;
  type: "thread" | "message" | "login" | "plan" | string;
  title: string;
  at: string | number | Date;
};

function formatDate(dt?: string | number | Date | null) {
  if (!dt) return "-";
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
  const { user } = useAuth(); // se existir
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // fallback com dados do auth enquanto carrega
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

        // Carrega em paralelo; se não tiver essas funções na sua API,
        // você pode manter só o fallback do useAuth
        const [p, u, a] = await Promise.allSettled([
          getProfile?.(),
          getUsage?.(),
          getActivities?.({ limit: 10 }),
        ]);

        if (p.status === "fulfilled" && p.value) setProfile(p.value);
        if (u.status === "fulfilled" && u.value) setUsage(u.value);
        if (a.status === "fulfilled" && a.value) setActivities(a.value);
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
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button className="btn soft" onClick={() => navigate(-1)} title="Voltar" style={{ padding: "6px 10px" }}>
          ← Voltar
        </button>
        <h2 style={{ margin: 0 }}>Minha conta</h2>
      </div>

      {/* Header card */}
      <div className="card" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Avatar por iniciais */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              background: "var(--soft)",
              border: "1px solid var(--border)",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 18,
            }}
            aria-label="Avatar"
          >
            {initials(data.name, data.email)}
          </div>

          {/* Nome + email */}
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 18 }}>{data.name || "Usuário"}</strong>
              <span className="badge">{planLabel}</span>
            </div>
            <div className="small">{data.email}</div>
          </div>

          {/* ações rápidas */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CopyBtn text= {String(data.id)} label="ID" />
            <CopyBtn text={data.email} label="e-mail" />
          </div>
        </div>

        {/* metadados */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 12,
          }}
        >
          <div className="kv">
            <span className="kv-k">ID</span>
            <span className="kv-v">{String(data.id)}</span>
          </div>
          <div className="kv">
            <span className="kv-k">Plano</span>
            <span className="kv-v">{planLabel}</span>
          </div>
          <div className="kv">
            <span className="kv-k">Criado em</span>
            <span className="kv-v">{formatDate(data.created_at)}</span>
          </div>
          <div className="kv">
            <span className="kv-k">Última atividade</span>
            <span className="kv-v">{formatDate(data.last_activity_at)}</span>
          </div>
        </div>
      </div>

      {/* métricas */}
      <div style={{ marginTop: 14, display: "grid", gap: 12, gridTemplateColumns: "repeat(4,1fr)" }}>
        <StatCard title="Conversas (total)" value={usage?.threads_total ?? 0} />
        <StatCard title="Mensagens (total)" value={usage?.messages_total ?? 0} />
        <StatCard title="Enviadas (você)" value={usage?.user_sent ?? 0} />
        <StatCard title="Recebidas (assistente)" value={usage?.assistant_sent ?? 0} />
      </div>

      {/* atividades recentes */}
      <div style={{ marginTop: 14 }} className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Atividades recentes</h3>
          <span className="small" style={{ color: "var(--muted)" }}>
            {loading ? "Carregando..." : `Última atualização: ${formatDate(new Date())}`}
          </span>
        </div>

        {err && (
          <div
            role="alert"
            style={{
              border: "1px solid #7f1d1d",
              background: "#1b0f10",
              color: "#fecaca",
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 14,
              marginBottom: 8,
            }}
          >
            {err}
          </div>
        )}

        {(!activities || activities.length === 0) && !loading ? (
          <div className="small" style={{ color: "var(--muted)" }}>
            Sem atividades recentes.
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {activities.slice(0, 10).map((a) => (
              <li key={a.id} className="activity-row">
                <span className={`dot ${a.type}`} aria-hidden />
                <div className="activity-main">
                  <div className="title">{a.title}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>
                    {formatDate(a.at)} • {labelType(a.type)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: 16 }}>
      <div className="big">{value}</div>
      <div className="small" style={{ marginTop: 4 }}>{title}</div>
    </div>
  );
}

function labelType(t: string) {
  switch (t) {
    case "login": return "Login";
    case "message": return "Mensagem";
    case "thread": return "Conversa";
    case "plan": return "Plano";
    default: return "Atividade";
  }
}
