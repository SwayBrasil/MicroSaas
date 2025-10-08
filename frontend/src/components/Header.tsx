import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function AppHeader() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="header">
      {/* COLUNA ESQUERDA: LOGO */}
      <Link to="/" className="logo">
        {/* se tiver um arquivo, troque pela sua logo: <img src="/logo.svg" alt="SWAY" /> */}
        <img src="data:image/svg+xml;utf8,\
<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='%237c5cff' stroke-width='2'><path d='M3 12l5-9 4 7 4-7 5 9-9 9z'/></svg>" alt="SWAY"/>
        <span>SWAY</span>
      </Link>

      {/* COLUNA CENTRAL fica vazia por causa do grid 3 colunas */}

      {/* COLUNA DIREITA: AÇÕES */}
      <div style={{ justifySelf: "end", display: "flex", gap: 8 }}>
        {!isAuthenticated ? (
          <button
            onClick={() => navigate("/login", { state: { from: location } })}
            className="btn"
          >
            Entrar
          </button>
        ) : (
          <>
            <button onClick={() => navigate("/account")} className="userbtn">
              Minha conta
            </button>
            <button onClick={logout} className="userbtn" title="Sair">
              Sair
            </button>
          </>
        )}
      </div>
    </header>
  );
}
