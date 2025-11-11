import React, { useEffect, useMemo, useState } from "react";
import { listDeals, type Deal, updateDeal, createDeal, deleteDeal } from "../lib/crm";

const COLUMNS: Deal["column"][] = ["novo", "qualificacao", "proposta", "fechamento", "ganho", "perdido"];
const LABEL: Record<Deal["column"], string> = {
  novo: "Novo",
  qualificacao: "Qualificação",
  proposta: "Proposta",
  fechamento: "Fechamento",
  ganho: "Ganho",
  perdido: "Perdido",
};

function currency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Kanban() {
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      const ds = await listDeals();
      setItems(ds);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar pipeline");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const filteredByCol = useMemo(() => {
    const s = q.trim().toLowerCase();
    const map: Record<Deal["column"], Deal[]> = {
      novo: [], qualificacao: [], proposta: [], fechamento: [], ganho: [], perdido: [],
    };
    for (const d of items) {
      if (s) {
        const hay = `${d.title} ${d.tags?.join(" ") || ""}`.toLowerCase();
        if (!hay.includes(s)) continue;
      }
      map[d.column].push(d);
    }
    return map;
  }, [items, q]);

  async function move(d: Deal, to: Deal["column"]) {
    if (d.column === to) return;
    const prev = items.slice();
    setItems((arr) => arr.map((x) => (x.id === d.id ? { ...x, column: to } : x)));
    try { await updateDeal(d.id, { column: to }); } catch { setItems(prev); }
  }

  async function quickAdd() {
    const title = prompt("Título do negócio:");
    if (!title) return;
    const valueStr = prompt("Valor (apenas número):", "0") || "0";
    const value = Number(valueStr) || 0;
    const novo = await createDeal({
      contact_id: 0, // se tiver ID real, substitua
      title,
      value,
      column: "novo",
      priority: "normal",
      tags: [],
    });
    setItems((it) => [novo, ...it]);
  }

  async function remove(id: number) {
    if (!confirm("Excluir este negócio?")) return;
    const prev = items.slice();
    setItems((arr) => arr.filter((x) => x.id !== id));
    try { await deleteDeal(id); } catch { setItems(prev); }
  }

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: 14 }}>
      <div className="toolbar">
        <input className="input" placeholder="Buscar por título ou tags..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={quickAdd}>+ Novo</button>
        <button className="btn soft" onClick={refresh}>Atualizar</button>
      </div>

      {error && <div className="alert danger">{error}</div>}

      {loading ? (
        <div className="muted">Carregando pipeline...</div>
      ) : (
        <div className="kanban">
          {COLUMNS.map((col) => (
            <section className="kanban-col" key={col} aria-label={`Coluna ${LABEL[col]}`}>
              <div className="kanban-col-title">{LABEL[col]}</div>
              {filteredByCol[col].length === 0 && (
                <div className="muted small">Sem cartões</div>
              )}
              {filteredByCol[col].map((d) => (
                <article className="card" key={d.id}>
                  <div className="card-title">{d.title}</div>
                  <div className="muted small">{currency(d.value)} • prioridade: {d.priority}</div>
                  {d.tags?.length ? (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {d.tags.map((t) => <span key={t} className="card-pill">{t}</span>)}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <select
                      className="input"
                      value={d.column}
                      onChange={(e) => move(d, e.target.value as Deal["column"])}
                      aria-label="Mover coluna"
                    >
                      {COLUMNS.map((c) => (
                        <option key={c} value={c}>{LABEL[c]}</option>
                      ))}
                    </select>
                    <button className="btn soft" onClick={() => remove(d.id)}>Excluir</button>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
