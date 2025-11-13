// src/components/SwayFakeScreens.tsx
import React from "react";
import { Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
// ⚠️ GARANTA este caminho:
import { listThreads, updateThread } from "../lib/api";

type Thread = {
  id: number;
  title?: string;
  contact_name?: string;
  metadata?: { wa_id?: string; name?: string; phone?: string };
  origin?: string;
  lead_score?: number;
  lead_level?: "frio" | "morno" | "quente";
  updated_at?: string;
  last_message?: string; // se seu backend retornar isso; se não, fica vazio
};

function clsx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function last4FromAny(input?: string | number | null) {
  const s = String(input ?? "").replace(/\D/g, "");
  return s.slice(-4) || "—";
}
function getDisplayName(t: Thread) {
  const candidates = [t.contact_name, t.metadata?.name].filter(Boolean);
  if (candidates.length && String(candidates[0]).trim()) return String(candidates[0]).trim();
  const waLast = last4FromAny(t.metadata?.wa_id || t.metadata?.phone);
  if (waLast !== "—") return `Contato • ${waLast}`;
  return t.title || "Sem nome";
}
function chipColors(level: "frio" | "morno" | "quente") {
  switch (level) {
    case "quente": return { bg: "#fee2e2", fg: "#991b1b" };
    case "morno":  return { bg: "#fde68a", fg: "#78350f" };
    default:       return { bg: "#e5e7eb", fg: "#374151" };
  }
}

/* ---------------------- Contatos ---------------------- */
function ContactsScreen() {
  const [q, setQ] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState<string>("Todos");
  const [rows, setRows] = React.useState<Thread[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const ts = await listThreads();
        setRows(ts.map((t: any) => ({ lead_level: "frio", ...t })));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sources = React.useMemo(() => {
    const s = Array.from(new Set(rows.map(r => r.origin).filter(Boolean))) as string[];
    return ["Todos", ...s];
  }, [rows]);

  const filtered = React.useMemo(() => {
    let base = rows;
    if (sourceFilter !== "Todos") base = base.filter(r => r.origin === sourceFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      base = base.filter(r => getDisplayName(r).toLowerCase().includes(s));
    }
    return base;
  }, [rows, q, sourceFilter]);

  function exportCSV() {
    const list = filtered;
    const header = ["id","nome","origem","score","nivel","ultimo_contato","ultima_msg"];
    const data = list.map(r => [
      r.id,
      getDisplayName(r),
      r.origin || "",
      r.lead_score ?? "",
      r.lead_level ?? "frio",
      r.updated_at || "",
      r.last_message || "",
    ]);
    const csv = [header, ...data]
      .map(r => r.map(String).map(x => `"${x.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contatos.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4" style={{ height: "100%", display: "grid", gridTemplateRows: "auto 1fr", gap: 12 }}>
      <div className="bg-white shadow rounded p-3" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          className="input"
          placeholder="Buscar por nome..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <select className="select" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          {sources.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn" onClick={exportCSV}>Exportar CSV</button>
        <div style={{ marginLeft: "auto", color: "var(--muted)" }}>
          {loading ? "Carregando..." : `Total: ${filtered.length}`}
        </div>
      </div>

      <div className="bg-white shadow rounded p-3 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-sm text-slate-600">
              <th className="p-2">Nome</th>
              <th className="p-2">Origem</th>
              <th className="p-2">Score</th>
              <th className="p-2">Nível</th>
              <th className="p-2">Último contato</th>
              <th className="p-2">Última msg</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const lvl = (r.lead_level ?? "frio") as "frio" | "morno" | "quente";
              const { bg, fg } = chipColors(lvl);
              return (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="p-2 font-medium">{getDisplayName(r)}</td>
                  <td className="p-2">{r.origin || "—"}</td>
                  <td className="p-2">{r.lead_score ?? "—"}</td>
                  <td className="p-2">
                    <span className="chip" style={{ background: bg, color: fg }}>{lvl}</span>
                  </td>
                  <td className="p-2">{r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}</td>
                  <td className="p-2" title={r.last_message || ""}>
                    {(r.last_message || "").slice(0, 40)}{(r.last_message || "").length > 40 ? "…" : ""}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && !loading && (
              <tr><td className="p-3 text-slate-500" colSpan={6}>Nenhum contato.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------- Kanban ---------------------- */
function KanbanCard({ t }: { t: Thread }) {
  const lvl = (t.lead_level ?? "frio") as "frio" | "morno" | "quente";
  const { bg, fg } = chipColors(lvl);
  return (
    <div className="bg-white rounded shadow p-3 mb-3">
      <div className="font-semibold">{getDisplayName(t)}</div>
      <div className="text-sm text-slate-600">{t.last_message || "—"}</div>
      <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
        <div>{t.updated_at ? new Date(t.updated_at).toLocaleDateString() : "—"}</div>
        <span className="chip" style={{ background: bg, color: fg }}>{lvl}</span>
      </div>
    </div>
  );
}
function DropZone({ onDropId }: { onDropId: (id: string) => void }) {
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) onDropId(id);
  };
  return <div onDragOver={onDragOver} onDrop={onDrop} className="mt-2 p-2 rounded border-dashed border-2 border-transparent" style={{ minHeight: 30 }} />;
}
function KanbanScreen() {
  const [items, setItems] = React.useState<Thread[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const ts = await listThreads();
        setItems(ts.map((t: any) => ({ lead_level: "frio", ...t })));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groups = React.useMemo(() => ({
    quente: items.filter(i => (i.lead_level ?? "frio") === "quente"),
    morno:  items.filter(i => (i.lead_level ?? "frio") === "morno"),
    frio:   items.filter(i => (i.lead_level ?? "frio") === "frio"),
  }), [items]);

  async function moveCard(id: string, to: "frio" | "morno" | "quente") {
    setItems(prev => prev.map(t => (String(t.id) === id ? { ...t, lead_level: to } : t)));
    try {
      await updateThread(Number(id), { lead_level: to });
    } catch {
      // rollback simples
      setItems(prev => prev.map(t => (String(t.id) === id ? { ...t, lead_level: "frio" } : t)));
      alert("Falha ao atualizar nível do lead.");
    }
  }

  const Column = ({ label, keyName }: { label: string; keyName: "quente"|"morno"|"frio" }) => (
    <div className="bg-slate-50 rounded p-3 min-h-[420px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">{label}</h3>
        <div className="text-sm text-slate-500">{groups[keyName].length}</div>
      </div>
      <div>
        {groups[keyName].map((t) => (
          <div
            key={t.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(t.id))}
            className="cursor-grab"
          >
            <KanbanCard t={t} />
          </div>
        ))}
      </div>
      <DropZone onDropId={(id) => moveCard(id, keyName)} />
    </div>
  );

  return (
    <div className="p-4" style={{ height: "100%", display: "grid", gridTemplateRows: "auto 1fr", gap: 12 }}>
      <div className="bg-white shadow rounded p-3" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="small" style={{ color: "var(--muted)" }}>
          Dica: arraste cartões entre colunas para alterar o nível (salvo no backend).
        </span>
        <span style={{ marginLeft: "auto", color: "var(--muted)" }}>
          {loading ? "Carregando..." : `Total: ${items.length}`}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Column label="Quente" keyName="quente" />
        <Column label="Morna" keyName="morno" />
        <Column label="Fria"  keyName="frio" />
      </div>
    </div>
  );
}

/* ---------------------- Shell das rotas /sway/* ---------------------- */
export default function SwayFakeScreens() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[70vh] bg-gray-50 text-slate-800" style={{ fontFamily: "Inter, ui-sans-serif, system-ui" }}>
      {/* Navbar local das telas fake */}
      <nav className="bg-white border rounded p-2 mb-3">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link to="/sway/contacts" className="text-sm">Contatos</Link>
          <Link to="/sway/kanban" className="text-sm">Kanban</Link>
          <div className="ml-auto text-sm text-slate-500">Ambiente: demo-local</div>
        </div>
      </nav>

      <Routes>
        <Route index element={<Navigate to="contacts" replace />} />
        <Route path="contacts" element={<ContactsScreen />} />
        <Route path="kanban"   element={<KanbanScreen />} />
        <Route path="*"        element={<Navigate to="contacts" replace />} />
      </Routes>
    </div>
  );
}
