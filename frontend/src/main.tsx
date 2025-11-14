import React from "react";
import ReactDOM from "react-dom/client";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { AuthProvider } from "./auth";
import { ProtectedRoute } from "./ProtectedRoute";
import Chat from "./pages/Chat";
import Contacts from "./pages/Contacts";
import ContactDetail from "./pages/ContactDetail";
import Kanban from "./pages/Kanban";
import Tasks from "./pages/Tasks";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import AppHeader from "./components/AppHeader";
import { useDarkMode } from "./hooks/useDarkMode";
import "./styles.css";

// Componente wrapper para inicializar o tema
function ThemeInitializer({ children }: { children: React.ReactNode }) {
  useDarkMode(); // Inicializa o tema (aplica no mount)
  return <>{children}</>;
}

/* ===========================
   Shell principal da aplicação
   =========================== */
function AppShell() {
  return (
    <ThemeInitializer>
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          gridTemplateRows: "56px 1fr",
        }}
      >
        <AppHeader />
      <Routes>
        {/* Rota de login (pública) */}
        <Route path="/login" element={<Login />} />
        
        {/* Rotas protegidas */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Navigate to="/chat" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts"
          element={
            <ProtectedRoute>
              <Contacts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts/:threadId"
          element={
            <ProtectedRoute>
              <ContactDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kanban"
          element={
            <ProtectedRoute>
              <Kanban />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <Tasks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
    </ThemeInitializer>
  );
}

/* ===========================
   Render principal
   =========================== */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </Router>
  </React.StrictMode>
);
