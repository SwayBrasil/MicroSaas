import React, { useEffect, useMemo, useState } from "react";
import {
  listContacts,
  type Contact,
  updateContact,
  createContact,
  deleteContact,
} from "../lib/crm";

type Option<T extends string> = { label: string; value: T | "" };

const stageOpts: Option<Contact["stage"]>[] = [
  { label: "Todos", value: "" },
  { label: "Lead", value: "lead" },
  { label: "Cliente", value: "client" },
];
const heatOpts: Option<Contact["heat"]>[] = [
  { label: "Todos", value: "" },
  { label: "Quente", value: "hot" },
  { label: "Morno", value: "warm" },
  { label: "Frio", value: "cold" },
];
const awaitOpts: Option<Contact["await_status"]>[] = [
  { label: "Todos", value: "" },
  { label: "Nada pendente", value: "none" },
  { label: "Aguardando cliente", value: "awaiting_client" },
  { label: "Aguardando nós", value: "awaiting_us" },
  { label: "Aguardando pagamento", value: "awaiting_payment" },
];

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default"|"ok"|"warn"|"danger" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export default function Contacts() {
  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<Option<Contact["stage"]>["value"]>("");
  const [heat, setHeat] = useState<Option<Contact["heat"]>["value"]>("");
  const [awaiting, setAwaiting] = useState<Option<Contact["await_status"]>["value"]>("");
  const [onlyReal, setOnlyReal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      const data = await listContacts();
      setRows(data);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar contatos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (s) {
        const hay = `${c.name} ${c.email || ""} ${c.phone || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (stage && c.stage !== stage) return false;
      if (heat && c.heat !== heat) return false;
      if (awaiting && c.await_status !== awaiting) return false;
      if (onlyReal && !c.is_real) return false;
      return true;
    });
  }, [rows, q, stage, heat, awaiting, onlyReal]);

  async function toggleReal(id: number, current: boolean) {
    const previous = rows.slice();
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, is_real: !current } : r)));
    try {
      await updateContact(id, { is_real: !current });
    } catch (e) {
      setRows(previous);
    }
  }

  async function quickAdd() {
    const name = prompt("Nome do contato:");
    if (!name) return;
    const newC = await createContact({
      name,
      stage: "lead",
      heat: "warm",
      await_status: "none",
      is_real: true,
    });
    setRows((r) => [newC, ...r]);
  }

  async function remove(id: number) {
    if (!confirm("Excluir este contato?")) return;
    const prev = rows.slice();
    setRows((r) => r.filter((x) => x.id !== id));
    try { await deleteContact(id); } catch { setRows(prev); }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", padding: 14 }}>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Buscar por nome, e-mail ou telefone..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input" value={stage} onChange={(e) => setStage(e.target.value as any)}>
          {stageOpts.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
        </select>
        <select className="input" value={heat} onChange={(e) => setHeat(e.target.value as any)}>
          {heatOpts.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
        </select>
        <select className="input" value={awaiting} onChange={(e) => setAwaiting(e.target.value as any)}>
          {awaitOpts.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
        </select>
        <label className="chk">
          <input type="checkbox" checked={onlyReal} onChange={(e) => setOnlyReal(e.target.checked)} /> Só reais
        </label>
        <button className="btn" onClick={quickAdd}>+ Novo</button>
        <button className="btn soft" onClick={refresh}>Atualizar</button>
      </div>

      {error && <div className="alert danger">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Quente/Frio</th>
              <th>Aguardando</th>
              <th>Telefone</th>
              <th>E-mail</th>
              <th>Real?</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="muted">Carregando...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="muted">Nenhum contato encontrado.</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.stage === "client" ? <Badge tone="ok">Cliente</Badge> : <Badge>Lead</Badge>}</td>
                <td>
                  {c.heat === "hot" && <Badge tone="danger">Quente</Badge>}
                  {c.heat === "warm" && <Badge tone="warn">Morno</Badge>}
                  {c.heat === "cold" && <Badge>Frio</Badge>}
                </td>
                <td>
                  {c.await_status === "none" && <span className="muted">—</span>}
                  {c.await_status === "awaiting_client" && <Badge>Cliente</Badge>}
                  {c.await_status === "awaiting_us" && <Badge>Equipe</Badge>}
                  {c.await_status === "awaiting_payment" && <Badge tone="warn">Pagamento</Badge>}
                </td>
                <td>{c.phone || <span className="muted">—</span>}</td>
                <td>{c.email || <span className="muted">—</span>}</td>
                <td>
                  <label className="chk">
                    <input type="checkbox" checked={c.is_real} onChange={() => toggleReal(c.id, c.is_real)} />
                    {c.is_real ? "Sim" : "Não"}
                  </label>
                </td>
                <td>
                  <button className="btn soft" onClick={() => remove(c.id)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
