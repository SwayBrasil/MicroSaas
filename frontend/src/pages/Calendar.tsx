import React, { useEffect, useMemo, useState } from "react";
import {
  listObligations,
  type Obligation,
  updateObligation,
  createObligation,
  deleteObligation,
} from "../lib/crm";

function toISODate(d: Date) {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function Calendar() {
  const today = toISODate(new Date());
  const weekAhead = toISODate(new Date(Date.now() + 7 * 86400000));

  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(weekAhead);
  const [rows, setRows] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      const data = await listObligations({ start, end });
      setRows(data);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar obrigações");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [start, end]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((o) => {
      if (!s) return true;
      const hay = `${o.title} ${o.description || ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q]);

  const overdue = filtered.filter((o) => o.status === "open" && new Date(o.due_date) < new Date());
  const upcoming = filtered.filter((o) => o.status === "open" && new Date(o.due_date) >= new Date());
  const done = filtered.filter((o) => o.status === "done");

  async function toggleDone(o: Obligation) {
    const prev = rows.slice();
    const nextStatus = o.status === "done" ? "open" : "done";
    setRows((rs) => rs.map((x) => (x.id === o.id ? { ...x, status: nextStatus } : x)));
    try { await updateObligation(o.id, { status: nextStatus }); } catch { setRows(prev); }
  }

  async function quickAdd() {
    const title = prompt("Título da obrigação:");
    if (!title) return;
    const when = prompt("Data/hora (YYYY-MM-DD HH:MM):", `${today} 09:00`) || `${today} 09:00`;
    const iso = when.replace(" ", "T") + ":00";
    const created = await createObligation({
      title,
      due_date: iso,
      status: "open",
    });
    setRows((r) => [created, ...r]);
  }

  async function remove(id: number) {
    if (!confirm("Excluir esta obrigação?")) return;
    const prev = rows.slice();
    setRows((r) => r.filter((x) => x.id !== id));
    try { await deleteObligation(id); } catch { setRows(prev); }
  }

  const Section = ({ title, data }: { title: string; data: Obligation[] }) => (
    <section className="calendar-group">
      <h3 style={{ margin: "8px 0" }}>{title}</h3>
      {data.length === 0 ? (
        <div className="muted small">Sem itens.</div>
      ) : (
        <ul className="calendar-list">
          {data.sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date)).map((o) => (
            <li key={o.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div className="card-title">{o.title}</div>
                  <div className="muted small">{fmtDateTime(o.due_date)}</div>
                  {o.description ? <div style={{ marginTop: 6 }}>{o.description}</div> : null}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn soft" onClick={() => toggleDone(o)}>
                    {o.status === "done" ? "Reabrir" : "Concluir"}
                  </button>
                  <button className="btn soft" onClick={() => remove(o.id)}>Excluir</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", padding: 14 }}>
      <div className="toolbar">
        <input className="input" placeholder="Buscar por título/descrição..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="lbl">De: <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="lbl">Até: <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <button className="btn" onClick={quickAdd}>+ Novo</button>
        <button className="btn soft" onClick={refresh}>Atualizar</button>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {loading ? (
        <div className="muted">Carregando...</div>
      ) : (
        <>
          <Section title="Atrasados" data={overdue} />
          <Section title="Próximos" data={upcoming} />
          <Section title="Concluídos" data={done} />
        </>
      )}
    </div>
  );
}
