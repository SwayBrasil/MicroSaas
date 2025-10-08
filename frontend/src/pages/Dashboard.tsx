// frontend/src/pages/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listThreads,
  createThread,
  deleteThread,
  type Thread,
} from "../lib/api";

export default function Dashboard() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function refresh() {
    try {
      setError(null);
      setLoading(true);
      const data = await listThreads();
      setThreads(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar conversas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate() {
    try {
      setCreating(true);
      const t = await createThread("Nova conversa");
      // navega direto pro chat da nova thread
      navigate(`/chat?thread=${t?.id ?? t?.thread_id ?? ""}`);
    } catch (e: any) {
      setError(e?.message || "Não foi possível criar a conversa");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(threadId: number | string) {
    if (!confirm("Excluir esta conversa? Essa ação não pode ser desfeita.")) return;
    try {
      await deleteThread(threadId);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Não foi possível excluir");
    }
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>
        Suas conversas
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* COLUNA ESQUERDA — lista de threads */}
        <aside
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a" }}>Conversas</div>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                height: 32,
                padding: "0 10px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                background: "#f9fafb",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {creating ? "Criando…" : "+ Nova"}
            </button>
          </div>

          {loading ? (
            <div style={{ color: "#475569", fontSize: 14 }}>Carregando…</div>
          ) : error ? (
            <div style={{ color: "#b91c1c", fontSize: 14 }}>{error}</div>
          ) : threads.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 14 }}>
              Você ainda não tem conversas.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 6,
                maxHeight: 520,
                overflowY: "auto",
              }}
            >
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/chat?thread=${t.id}`)}
                  style={{
                    textAlign: "left",
                    padding: 10,
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    background: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div style={{ overflow: "hidden" }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "#0f172a",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                          maxWidth: 200,
                        }}
                        title={t.title || `Thread #${t.id}`}
                      >
                        {t.title || `Thread #${t.id}`}
                      </div>
                      <div style={{ color: "#64748b", fontSize: 12 }}>
                        {t.updated_at
                          ? new Date(t.updated_at).toLocaleString()
                          : t.created_at
                          ? new Date(t.created_at).toLocaleString()
                          : "—"}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(t.id!);
                      }}
                      title="Excluir"
                      style={{
                        height: 28,
                        padding: "0 8px",
                        border: "1px solid #fecaca",
                        borderRadius: 8,
                        background: "#fff1f2",
                        color: "#b91c1c",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* COLUNA DIREITA — estado vazio / instruções */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 24,
            minHeight: 300,
            display: "grid",
            placeItems: "center",
            color: "#334155",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 520 }}>
            <h2 style={{ marginTop: 0, color: "#0f172a" }}>
              Selecione uma conversa
            </h2>
            <p style={{ marginBottom: 16 }}>
              Clique em uma conversa à esquerda para abrir no chat,
              ou crie uma <strong>Nova</strong> para começar do zero.
            </p>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                height: 40,
                padding: "0 16px",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background:
                  "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.12))",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {creating ? "Criando…" : "➕ Nova conversa"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
