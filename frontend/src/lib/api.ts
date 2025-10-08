// src/lib/api.ts
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function http<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** ✅ Login */
export async function loginRequest(email: string, password: string) {
  return http<{ token: string; user?: any }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/** ✅ /me */
export async function getMe() {
  return http<any>("/me", {
    headers: { ...authHeaders() },
  });
}

/** (já existiam) threads/mensagens — mantém como estavam */
export async function listThreads() {
  return http<any[]>("/threads", { headers: { ...authHeaders() } });
}
export async function createThread(title?: string) {
  return http<any>("/threads", {
    method: "POST",
    headers: { ...authHeaders() },
    body: JSON.stringify({ title }),
  });
}
export async function getMessages(threadId: string | number) {
  return http<any[]>(`/threads/${threadId}/messages`, {
    headers: { ...authHeaders() },
  });
}
export async function postMessage(threadId: string | number, content: string) {
  return http<any>(`/threads/${threadId}/messages`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: JSON.stringify({ content }),
  });
}
export async function deleteThread(threadId: string | number) {
  return http<void>(`/threads/${threadId}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
}

/** (opcional) stats globais do usuário, usados na /account */
export async function getStats() {
  return http<any>("/stats", { headers: { ...authHeaders() } });
}
