// frontend/src/pages/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listThreads,
  createThread,
  deleteThread,
  getStats,
  type Thread,
  type StatsResponse,
} from "../api";

export default function Dashboard() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function refreshThreads() {
    try {
      setError(null);
      setLoadingThreads(true);
      const data = await listThreads();
      setThreads(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar conversas");
    } finally {
      setLoadingThreads(false);
    }
  }

  async function refreshStats() {
    try {
      setLoadingStats(true);
      const s = await getStats();
      setStats(s);
    } catch {
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    refreshThreads();
    refreshStats();
  }, []);

  async function handleCreate() {
    try {
      setCreating(true);
      const t = await createThread("Nova conversa");
      // navegar para o chat; o Chat já seleciona a primeira thread.
      // Se quiser passar o id explicitamente, mantemos o query param:
      navigate(`/chat?thread=${t?.id ?? ""}`);
    } catch (e: any) {
      setError(e?.message || "Não foi possível criar a conversa");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(threadId: number | string) {
    if (!confirm("Excluir esta conversa? Essa ação não pode ser desfeita.")) return;
    try {
      await deleteThread(Number(threadId));
      await refreshThreads();
      await refreshStats();
    } catch (e: any) {
      setError(e?.message || "Não foi possível excluir");
    }
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h1 className="profile-title" style={{ fontSize: 22, margin: 0 }}>
        Dashboard
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* COLUNA ESQUERDA — conversas */}
        <aside className="profile-card" style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div className="profile-title" style={{ margin: 0, fontSize: 16 }}>
              Conversas
            </div>
            <button className="btn" onClick={handleCreate} disabled={creating}>
              {creating ? "Criando…" : "+ Nova"}
            </button>
          </div>

          {loadingThreads ? (
            <div className="small" style={{ color: "var(--muted)" }}>Carregando…</div>
          ) : error ? (
            <div
              role="alert"
              style={{
                border: "1px solid #7f1d1d",
                background: "#1b0f10",
                color: "#fecaca",
                padding: "10px 12px",
                borderRadius: 10,
                fontSize: 14,
              }}
            >
              {error}
            </div>
          ) : threads.length === 0 ? (
            <div className="small" style={{ color: "var(--muted)" }}>
              Você ainda não tem conversas.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 8,
                maxHeight: 520,
                overflowY: "auto",
              }}
            >
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/chat?thread=${t.id}`)}
                  className="item"
                  style={{
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ overflow: "hidden" }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "var(--text)",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        maxWidth: 220,
                      }}
                      title={t.title || `Thread #${t.id}`}
                    >
                      {t.title || `Thread #${t.id}`}
                    </div>
                    <div className="small" style={{ color: "var(--muted)" }}>
                      ID #{t.id}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(t.id!);
                    }}
                    title="Excluir"
                    className="btn soft"
                    style={{ padding: "4px 10px" }}
                  >
                    Excluir
                  </button>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* COLUNA DIREITA — stats + dica */}
        <div style={{ display: "grid", gap: 16 }}>
          {/* Stats */}
          <div className="profile-card">
            <div
              className="profile-title"
              style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}
            >
              <span>Seus números</span>
              <button
                className="btn soft"
                onClick={() => {
                  refreshStats();
                  refreshThreads();
                }}
                style={{ padding: "6px 10px" }}
              >
                Atualizar
              </button>
            </div>

            {loadingStats ? (
              <div className="small" style={{ color: "var(--muted)" }}>Carregando…</div>
            ) : (
              <div className="stats-grid">
                <StatCard title="Conversas" value={stats?.threads ?? 0} />
                <StatCard title="Msgs (você)" value={stats?.user_messages ?? 0} />
                <StatCard title="Msgs (assistente)" value={stats?.assistant_messages ?? 0} />
                <StatCard title="Total de mensagens" value={stats?.total_messages ?? 0} />
              </div>
            )}

            <div className="small" style={{ color: "var(--muted)", marginTop: 8 }}>
              Última atividade:{" "}
              {stats?.last_activity
                ? new Date(stats.last_activity as any).toLocaleString()
                : "—"}
            </div>
          </div>

          {/* Card de orientação */}
          <div className="profile-card" style={{ display: "grid", gap: 8 }}>
            <div className="profile-title" style={{ fontSize: 16, margin: 0 }}>
              Como começar
            </div>
            <p className="small" style={{ color: "var(--muted)", margin: 0 }}>
              Selecione uma conversa à esquerda para abrir no chat, ou crie uma
              <strong> nova</strong> para começar do zero. Você também pode ir
              em <strong>Minha conta</strong> para ver token e métricas.
            </p>
            <div>
              <button className="btn" onClick={handleCreate} disabled={creating}>
                {creating ? "Criando…" : "➕ Nova conversa"}
              </button>
              <button
                className="btn soft"
                onClick={() => navigate("/profile")}
                style={{ marginLeft: 8 }}
              >
                Minha conta
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="stat-cardx" style={{ textAlign: "center" }}>
      <div className="stat-kpi">{value}</div>
      <div className="stat-label" style={{ marginTop: 6 }}>
        {title}
      </div>
    </div>
  );
}
