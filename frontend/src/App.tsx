import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

import Login from "./pages/Login";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";

// Páginas novas do CRM
import Contacts from "./pages/Contacts";
import Kanban from "./pages/Kanban";
import Calendar from "./pages/Calendar";

// ⚠️ NÃO importe CSS aqui; o CSS global já é importado no main.tsx
// import "./styles.css";

export default function App() {
  return (
    <div className="layout">
      {/* Sem Header aqui — o Chat já tem o header embutido */}
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
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

        <Route
          path="/contacts"
          element={
            <ProtectedRoute>
              <Contacts />
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
          path="/calendar"
          element={
            <ProtectedRoute>
              <Calendar />
            </ProtectedRoute>
          }
        />

        {/* default */}
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </div>
  );
}
