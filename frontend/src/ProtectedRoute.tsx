// src/ProtectedRoute.tsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // pode trocar por um spinner
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;

  return <>{children}</>;
}
