// src/auth.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getMe, loginRequest } from "./lib/api";
import { useNavigate } from "react-router-dom";

type User = { id: number; email: string; name?: string; created_at?: string; plan?: string };

type AuthContext = {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthContext>({} as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ hooks aqui dentro do componente
  const navigate = useNavigate();

  // lê token do localStorage a cada render (seguro em SPA)
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const isAuthenticated = !!token;

  useEffect(() => {
    (async () => {
      try {
        if (token) {
          const me = await getMe();
          setUser(me);
        } else {
          setUser(null);
        }
      } catch {
        localStorage.removeItem("token");
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const login = async (email: string, password: string) => {
    // espera { token, user? } de /auth/login
    const res = await loginRequest(email, password);
    const accessToken = (res as any).token;
    const maybeUser = (res as any).user;

    if (!accessToken) throw new Error("Falha ao autenticar: token ausente.");

    localStorage.setItem("token", accessToken);
    setUser(maybeUser ?? null);

    // ✅ redireciona após login
    navigate("/chat", { replace: true });
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    navigate("/login", { replace: true });
  };

  const value = useMemo(
    () => ({ user, isAuthenticated, loading, login, logout }),
    [user, isAuthenticated, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
