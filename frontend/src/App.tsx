// src/App.tsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import HeaderApp from "./components/AppHeader";
import { ProtectedRoute } from "./ProtectedRoute";
import Chat from "./pages/Chat";
import Contacts from "./pages/Contacts";
import Kanban from "./pages/Kanban";
import Tasks from "./pages/Tasks";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import { useDarkMode } from "./hooks/useDarkMode";
import "./styles.css"; // ✅ garante que o CSS global está carregado

// Componente wrapper para inicializar o tema
function ThemeInitializer({ children }: { children: React.ReactNode }) {
  useDarkMode(); // Inicializa o tema (aplica no mount)
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeInitializer>
      <div className="layout" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* ✅ Header global com navegação */}
        <HeaderApp />

      {/* ✅ Conteúdo centralizado */}
      <div style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: 14 }}>
        <Routes>
          {/* Login público */}
          <Route path="/login" element={<Login />} />

          {/* Dashboard padrão */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />

          {/* Conversas */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />

          {/* Contatos */}
          <Route
            path="/contacts"
            element={
              <ProtectedRoute>
                <Contacts />
              </ProtectedRoute>
            }
          />

          {/* Kanban */}
          <Route
            path="/kanban"
            element={
              <ProtectedRoute>
                <Kanban />
              </ProtectedRoute>
            }
          />

          {/* Tarefas */}
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <Tasks />
              </ProtectedRoute>
            }
          />

          {/* Perfil / Minha conta */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
    </ThemeInitializer>
  );
}
