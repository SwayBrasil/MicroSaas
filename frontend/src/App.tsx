import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppHeader from "./components/AppHeader";
import { ProtectedRoute } from "./ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import "./style.css"; // ✅ garante que o CSS global está carregado

export default function App() {
  return (
    <div className="layout">
      <AppHeader />
      {/* wrapper centralizado para as páginas */}
      <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", padding: 14 }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
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
            path="/account"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
