// src/pages/Tasks.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { listTasks, createTask, updateTask, deleteTask, type Task } from "../api";

/** Utils */
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayISO = () => toISODate(new Date());
const parseISO = (s?: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`) : null);
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const TASK_ITEM_MIN_H = 96; // ajuste se quiser 88/104

function classifyDue(due?: string | null) {
  if (!due) return "none" as const;
  const d = parseISO(due)!;
  const t = parseISO(todayISO())!;
  if (d < t) return "overdue" as const;
  if (isSameDay(d, t)) return "today" as const;
  return "upcoming" as const;
}
function dueLabel(due?: string | null) {
  if (!due) return "Sem prazo";
  const cls = classifyDue(due);
  const base = due.slice(0, 10);
  if (cls === "overdue") return `Venceu: ${base}`;
  if (cls === "today") return `Vence hoje: ${base}`;
  return `Vence: ${base}`;
}
function byDueAsc(a: Task, b: Task) {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

type Filter = "open" | "today" | "all" | "done";

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("open");

  // form
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string>(todayISO());
  const [notes, setNotes] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // edição inline
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const ts = await listTasks();
        setTasks(ts);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const open = useMemo(() => tasks.filter((t) => t.status === "open"), [tasks]);
  const done = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  const filtered = useMemo(() => {
    let data = tasks;
    if (filter === "open") data = tasks.filter((t) => t.status === "open");
    if (filter === "done") data = tasks.filter((t) => t.status === "done");
    if (filter === "today") data = tasks.filter((t) => t.status === "open" && classifyDue(t.due_date) === "today");
    return [...data].sort(byDueAsc);
  }, [tasks, filter]);

  // ações
  async function add() {
    const t = title.trim();
    if (!t) return;

    const optimistic: Task = {
      id: `temp-${Date.now()}`,
      title: t,
      status: "open",
      due_date: due || null,
      notes: showNotes && notes.trim() ? notes.trim() : null,
    } as Task;

    setTasks((prev) => [optimistic, ...prev]);
    setTitle("");
    if (showNotes) setNotes("");
    setTimeout(() => inputRef.current?.focus(), 0);

    try {
      const saved = await createTask({ title: t, due_date: due || null, notes: optimistic.notes });
      setTasks((prev) => [saved, ...prev.filter((x) => x.id !== optimistic.id)]);
    } catch {
      setTasks((prev) => prev.filter((x) => x.id !== optimistic.id));
      alert("Falha ao criar tarefa.");
    }
  }

  function onFormKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "Enter" && !e.shiftKey) || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      add();
    }
  }

  async function toggleDone(t: Task) {
    const next = t.status === "done" ? "open" : "done";
    setTasks((s) => s.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      await updateTask(t.id, { status: next });
    } catch {
      setTasks((s) => s.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
      alert("Falha ao atualizar tarefa.");
    }
  }

  async function remove(t: Task) {
    const prev = tasks;
    setTasks((p) => p.filter((x) => x.id !== t.id));
    try {
      await deleteTask(t.id);
    } catch {
      setTasks(prev);
      alert("Falha ao excluir tarefa.");
    }
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditNotes(t.notes || "");
  }

  async function saveEdit(t: Task) {
    const next = { title: editTitle.trim() || t.title, notes: editNotes.trim() || null };
    const prev = t;
    setTasks((state) => state.map((x) => (x.id === t.id ? { ...x, ...next } : x)));
    setEditingId(null);
    try {
      await updateTask(t.id, next);
    } catch {
      setTasks((state) => state.map((x) => (x.id === t.id ? prev : x)));
      alert("Falha ao salvar alterações.");
    }
  }

  function cancelEdit() {
    setEditingId(null);
  }

  // UI helpers
  function FilterPill({ v, label }: { v: Filter; label: string }) {
    const active = filter === v;
    return (
      <button className={active ? "btn" : "btn soft"} onClick={() => setFilter(v)} style={{ padding: "6px 10px" }}>
        {label}
      </button>
    );
  }

  function QuickDue() {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn soft" onClick={() => setDue(todayISO())}>Hoje</button>
        <button className="btn soft" onClick={() => setDue(toISODate(new Date(Date.now() + 86400000)))}>Amanhã</button>
        <button className="btn soft" onClick={() => setDue("")}>Sem prazo</button>
      </div>
    );
  }

  function DueBadge({ due }: { due?: string | null }) {
    if (!due) return null;
    const cls = classifyDue(due);
    const text = dueLabel(due);
    const style: React.CSSProperties =
      cls === "overdue"
        ? { background: "var(--danger-soft)", color: "var(--danger)" }
        : cls === "today"
        ? { background: "var(--warn-soft)", color: "var(--warn)" }
        : { background: "var(--accent-soft)", color: "var(--accent)" };
    return (
      <span className="chip" style={style} title={text}>
        {text}
      </span>
    );
  }

  // Item
  function TaskItem({ t }: { t: Task }) {
    const isEditing = editingId === t.id;

    return (
      <div
        className="card"
        style={{
          padding: 12,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 8,
          alignItems: "center",
          minHeight: TASK_ITEM_MIN_H,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {!isEditing ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  onChange={() => toggleDone(t)}
                  title={t.status === "done" ? "Reabrir" : "Concluir"}
                />
                {/* título 1 linha */}
                <span
                  style={{
                    fontWeight: 600,
                    textDecoration: t.status === "done" ? "line-through" : "none",
                    opacity: t.status === "done" ? 0.7 : 1,
                    minWidth: 0,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 1 as unknown as number,
                    WebkitBoxOrient: "vertical" as any,
                  }}
                  title={t.title}
                >
                  {t.title}
                </span>
                <DueBadge due={t.due_date} />
              </div>
              {/* notas 2 linhas */}
              {t.notes && (
                <div
                  className="small"
                  style={{
                    color: "var(--muted)",
                    marginTop: 6,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2 as unknown as number,
                    WebkitBoxOrient: "vertical" as any,
                  }}
                  title={t.notes}
                >
                  {t.notes}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <input
                className="input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Título"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(t); }
                  if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                }}
              />
              <textarea
                className="input"
                rows={3}
                value={editNotes}
                placeholder="Notas"
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignContent: "center" }}>
          {!isEditing ? (
            <>
              <button className="btn soft" onClick={() => startEdit(t)}>Editar</button>
              <button className="btn soft danger" onClick={() => remove(t)}>Excluir</button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => saveEdit(t)}>Salvar</button>
              <button className="btn soft" onClick={cancelEdit}>Cancelar</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "calc(100vh - 56px)", display: "grid", gridTemplateRows: "auto auto 1fr" }}>
      {/* Topbar */}
      <div style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)", padding: "10px 12px", display: "flex", gap: 8, alignItems: "center" }}>
        <strong style={{ fontSize: 16 }}>Tarefas</strong>
        <span className="chip">Abertas: {open.length}</span>
        <span className="chip soft">Concluídas: {done.length}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <FilterPill v="open" label="Abertas" />
          <FilterPill v="today" label="Hoje" />
          <FilterPill v="all" label="Todas" />
          <FilterPill v="done" label="Concluídas" />
        </div>
      </div>

      {/* Composer */}
      <div style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)", padding: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <input
            ref={inputRef}
            className="input"
            placeholder="Adicionar tarefa… (Enter para salvar)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onFormKeyDown}
          />
          <button className="btn" onClick={add}>Adicionar</button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: 180 }} />
          <QuickDue />
          <button className="btn soft" onClick={() => setShowNotes((s) => !s)}>
            {showNotes ? "Esconder notas" : "Adicionar notas"}
          </button>
          {showNotes && (
            <input
              className="input"
              placeholder="Notas (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={onFormKeyDown}
              style={{ minWidth: 260, flex: 1 }}
            />
          )}
        </div>
      </div>

      {/* Lista (altura uniforme) */}
      <div
        style={{
          padding: 12,
          overflow: "auto",
          display: "grid",
          gap: 8,
          alignContent: "start",                          // não estica linhas
          gridAutoRows: `minmax(${TASK_ITEM_MIN_H}px, auto)`, // mesma altura mínima
        }}
      >
        {loading && <div className="small">Carregando…</div>}
        {!loading && filtered.length === 0 && (
          <div className="card" style={{ padding: 16, textAlign: "center", color: "var(--muted)" }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Tudo certo por aqui ✨</div>
            <div className="small">Sem tarefas para mostrar nesse filtro.</div>
          </div>
        )}
        {!loading && filtered.map((t) => <TaskItem key={t.id} t={t} />)}
      </div>
    </div>
  );
}
