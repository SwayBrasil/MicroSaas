// frontend/src/pages/ContactDetail.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  getContactByThread,
  getContact,
  updateContact,
  addContactTag,
  removeContactTag,
  addContactNote,
  deleteContactNote,
  createContactReminder,
  updateContactReminder,
  type Contact,
  type ContactTag,
  type ContactNote,
  type ContactReminder,
} from "../api";

export default function ContactDetail() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newReminder, setNewReminder] = useState({ message: "", dueDate: "" });

  useEffect(() => {
    if (!threadId) return;
    loadContact();
  }, [threadId]);

  async function loadContact() {
    if (!threadId) return;
    try {
      setLoading(true);
      const c = await getContactByThread(Number(threadId));
      setContact(c);
    } catch (error: any) {
      console.error("Erro ao carregar contato:", error);
      // Tenta criar se não existir
      if (error?.response?.status === 404) {
        // O backend cria automaticamente, tenta novamente
        setTimeout(loadContact, 500);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(field: string, value: any) {
    if (!contact) return;
    try {
      const updated = await updateContact(contact.id, { [field]: value });
      setContact(updated);
      setEditing(false);
    } catch (error) {
      console.error("Erro ao atualizar:", error);
    }
  }

  async function handleAddTag() {
    if (!contact || !newTag.trim()) return;
    try {
      await addContactTag(contact.id, newTag.trim());
      await loadContact();
      setNewTag("");
    } catch (error) {
      console.error("Erro ao adicionar tag:", error);
    }
  }

  async function handleRemoveTag(tagId: number) {
    if (!contact) return;
    try {
      await removeContactTag(contact.id, tagId);
      await loadContact();
    } catch (error) {
      console.error("Erro ao remover tag:", error);
    }
  }

  async function handleAddNote() {
    if (!contact || !newNote.trim()) return;
    try {
      await addContactNote(contact.id, newNote.trim());
      await loadContact();
      setNewNote("");
    } catch (error) {
      console.error("Erro ao adicionar nota:", error);
    }
  }

  async function handleDeleteNote(noteId: number) {
    if (!contact) return;
    try {
      await deleteContactNote(contact.id, noteId);
      await loadContact();
    } catch (error) {
      console.error("Erro ao deletar nota:", error);
    }
  }

  async function handleCreateReminder() {
    if (!contact || !newReminder.message.trim() || !newReminder.dueDate) return;
    try {
      await createContactReminder(contact.id, newReminder.message, newReminder.dueDate);
      await loadContact();
      setNewReminder({ message: "", dueDate: "" });
    } catch (error) {
      console.error("Erro ao criar lembrete:", error);
    }
  }

  async function handleToggleReminder(reminderId: number, completed: boolean) {
    if (!contact) return;
    try {
      await updateContactReminder(contact.id, reminderId, completed);
      await loadContact();
    } catch (error) {
      console.error("Erro ao atualizar lembrete:", error);
    }
  }

  function formatCurrency(cents: number) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("pt-BR");
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div>Carregando...</div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div style={{ padding: 24 }}>
        <div>Contato não encontrado</div>
        <Link to="/contacts">Voltar para contatos</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link to="/contacts" style={{ color: "var(--muted)", textDecoration: "none" }}>
            ← Voltar para contatos
          </Link>
          <h1 style={{ margin: "8px 0 0 0" }}>{contact.name || "Sem nome"}</h1>
        </div>
        <Link to={`/chat?thread=${contact.thread_id}`} className="btn">
          Ver conversa
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Coluna Esquerda */}
        <div style={{ display: "grid", gap: 16 }}>
          {/* Dados Básicos */}
          <div className="profile-card">
            <h3 style={{ margin: "0 0 16px 0" }}>Dados Básicos</h3>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Nome
                </label>
                {editing ? (
                  <input
                    type="text"
                    value={contact.name || ""}
                    onChange={(e) => setContact({ ...contact, name: e.target.value })}
                    onBlur={() => handleUpdate("name", contact.name)}
                    className="input"
                    style={{ width: "100%" }}
                  />
                ) : (
                  <div onClick={() => setEditing(true)} style={{ cursor: "pointer", padding: 8 }}>
                    {contact.name || "—"}
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Email
                </label>
                {editing ? (
                  <input
                    type="email"
                    value={contact.email || ""}
                    onChange={(e) => setContact({ ...contact, email: e.target.value })}
                    onBlur={() => handleUpdate("email", contact.email)}
                    className="input"
                    style={{ width: "100%" }}
                  />
                ) : (
                  <div onClick={() => setEditing(true)} style={{ cursor: "pointer", padding: 8 }}>
                    {contact.email || "—"}
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Telefone
                </label>
                {editing ? (
                  <input
                    type="tel"
                    value={contact.phone || ""}
                    onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                    onBlur={() => handleUpdate("phone", contact.phone)}
                    className="input"
                    style={{ width: "100%" }}
                  />
                ) : (
                  <div onClick={() => setEditing(true)} style={{ cursor: "pointer", padding: 8 }}>
                    {contact.phone || "—"}
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Empresa
                </label>
                {editing ? (
                  <input
                    type="text"
                    value={contact.company || ""}
                    onChange={(e) => setContact({ ...contact, company: e.target.value })}
                    onBlur={() => handleUpdate("company", contact.company)}
                    className="input"
                    style={{ width: "100%" }}
                  />
                ) : (
                  <div onClick={() => setEditing(true)} style={{ cursor: "pointer", padding: 8 }}>
                    {contact.company || "—"}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Métricas */}
          <div className="profile-card">
            <h3 style={{ margin: "0 0 16px 0" }}>Métricas</h3>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Total de pedidos:</span>
                <strong>{contact.total_orders}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Total gasto:</span>
                <strong>{formatCurrency(contact.total_spent)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Ticket médio:</span>
                <strong>
                  {contact.average_ticket ? formatCurrency(contact.average_ticket) : "—"}
                </strong>
              </div>
              {contact.last_interaction_at && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)" }}>Última interação:</span>
                  <span>{formatDate(contact.last_interaction_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="profile-card">
            <h3 style={{ margin: "0 0 16px 0" }}>Tags</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {contact.tags.map((tag) => (
                <span
                  key={tag.id}
                  style={{
                    background: "var(--primary)",
                    color: "white",
                    padding: "4px 12px",
                    borderRadius: 16,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {tag.tag}
                  <button
                    onClick={() => handleRemoveTag(tag.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 16,
                      padding: 0,
                      width: 16,
                      height: 16,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                placeholder="Nova tag..."
                className="input"
                style={{ flex: 1 }}
              />
              <button onClick={handleAddTag} className="btn" disabled={!newTag.trim()}>
                Adicionar
              </button>
            </div>
          </div>
        </div>

        {/* Coluna Direita */}
        <div style={{ display: "grid", gap: 16 }}>
          {/* Notas */}
          <div className="profile-card">
            <h3 style={{ margin: "0 0 16px 0" }}>Notas Internas</h3>
            <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
              {contact.notes.map((note) => (
                <div
                  key={note.id}
                  style={{
                    padding: 12,
                    background: "var(--soft)",
                    borderRadius: 8,
                    fontSize: 14,
                    position: "relative",
                  }}
                >
                  <div style={{ marginBottom: 4 }}>{note.content}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {formatDate(note.created_at)}
                  </div>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: 18,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Adicionar nota..."
                className="input"
                rows={3}
              />
              <button onClick={handleAddNote} className="btn" disabled={!newNote.trim()}>
                Adicionar Nota
              </button>
            </div>
          </div>

          {/* Lembretes */}
          <div className="profile-card">
            <h3 style={{ margin: "0 0 16px 0" }}>Lembretes</h3>
            <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
              {contact.reminders
                .filter((r) => !r.completed)
                .map((reminder) => (
                  <div
                    key={reminder.id}
                    style={{
                      padding: 12,
                      background: "var(--soft)",
                      borderRadius: 8,
                      fontSize: 14,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <div style={{ marginBottom: 4 }}>{reminder.message}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {formatDate(reminder.due_date)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleReminder(reminder.id, true)}
                      className="btn soft"
                      style={{ padding: "4px 12px" }}
                    >
                      Concluir
                    </button>
                  </div>
                ))}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <textarea
                value={newReminder.message}
                onChange={(e) => setNewReminder({ ...newReminder, message: e.target.value })}
                placeholder="Mensagem do lembrete..."
                className="input"
                rows={2}
              />
              <input
                type="datetime-local"
                value={newReminder.dueDate}
                onChange={(e) => setNewReminder({ ...newReminder, dueDate: e.target.value })}
                className="input"
              />
              <button
                onClick={handleCreateReminder}
                className="btn"
                disabled={!newReminder.message.trim() || !newReminder.dueDate}
              >
                Criar Lembrete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

