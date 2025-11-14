// src/components/AppHeader.tsx
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { useDarkMode } from "../hooks/useDarkMode";

/** Botão de navegação compacto (pill, sem borda/linha) */
function NavBtn({
  to,
  children,
  title,
}: { to: string; children: React.ReactNode; title?: string }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const active = loc.pathname === to || loc.pathname.startsWith(to + "/");

  const baseStyle: React.CSSProperties = {
    padding: "4px 9px",
    borderRadius: 999,
    fontSize: 13,
    lineHeight: 1.1,
    fontWeight: 600,
    border: "none",                       // ✅ sem linhas
    background: "transparent",
    color: "var(--text)",
    textDecoration: "none",               // ✅ sem sublinhado
    boxShadow: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "background .15s ease, color .15s ease, transform .06s ease",
    transform: "translateY(0)",
    cursor: "pointer",
  };

  const activeStyle: React.CSSProperties = active
    ? {
        background: "var(--primary-soft, rgba(37,99,235,.12))",
        color: "var(--primary-color)",
        fontWeight: 700,
      }
    : {};

  return (
    <button
      className="btn soft"
      aria-current={active ? "page" : undefined}
      title={title}
      onClick={() => navigate(to)}
      style={{ ...baseStyle, ...activeStyle }}
      onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(1px)"; }}
      onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "var(--panel)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
      }}
    >
      {children}
    </button>
  );
}

export default function AppHeader() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();

  return (
    <header
      style={{
        height: 50,                                // um pouco mais baixo
        borderBottom: "1px solid var(--border)",   // só a linha do header
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--bg)",
        backdropFilter: "saturate(120%) blur(4px)",
      }}
      aria-label="Barra superior"
    >
      {/* Logo */}
      <div
        className="logo"
        style={{ cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}
        onClick={() => navigate("/")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <defs>
            <linearGradient id="g2" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="var(--brand)" />
              <stop offset="1" stopColor="var(--brand-2)" />
            </linearGradient>
          </defs>
        <circle cx="12" cy="12" r="10" fill="url(#g2)" />
        <path d="M7 12h10M12 7v10" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.2, userSelect: "none" }}>Sway</span>
      </div>

      {/* Navegação */}
      <nav aria-label="Principal" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <NavBtn to="/" title="Chat"><span>Chat</span></NavBtn>
        <NavBtn to="/contacts" title="Contatos"><span>Contatos</span></NavBtn>
        <NavBtn to="/kanban" title="Kanban"><span>Kanban</span></NavBtn>
        <NavBtn to="/tasks" title="Tarefas"><span>Tarefas</span></NavBtn>
        <NavBtn to="/profile" title="Minha conta"><span>Minha conta</span></NavBtn>

        {/* separador sutil */}
        <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />

        {/* Botão Modo Escuro */}
        <button
          className="btn soft"
          onClick={toggle}
          aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
          title={isDark ? "Modo claro" : "Modo escuro"}
          style={{
            padding: "4px 9px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            background: "transparent",
            color: "var(--text)",
            border: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            transition: "background .15s ease, color .15s ease",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--panel)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
        >
          {isDark ? "☀️" : "🌙"}
        </button>

        {/* separador sutil */}
        <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />

        {/* Logout danger-soft (sem borda) */}
        <button
          className="btn soft"
          onClick={logout}
          aria-label="Sair"
          title="Sair"
          style={{
            padding: "4px 9px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            background: "var(--danger-soft)",
            color: "var(--danger)",
            border: "none",                       // ✅ sem linha
            textDecoration: "none",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "brightness(0.98)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "none")}
        >
          Sair
        </button>
      </nav>
    </header>
  );
}
