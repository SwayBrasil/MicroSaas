const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/** Tipos */
export type Thread = {
  id: number | string;
  title?: string;
  origin?: string | null;
  lead_score?: number | null;
  lead_level?: "frio" | "morno" | "quente" | null;
  metadata?: any;
};

export type Message = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

/** Cabeçalhos com token JWT */
function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** HTTP helper */
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

/* =========================
 * Auth
 * =======================*/
export async function loginRequest(email: string, password: string) {
  return http<{ token: string; user?: any }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe() {
  return http<any>("/me", { headers: { ...authHeaders() } });
}

/* =========================
 * Threads / Mensagens
 * =======================*/
export async function listThreads() {
  return http<Thread[]>("/threads", { headers: { ...authHeaders() } });
}

export async function createThread(title?: string) {
  return http<Thread>("/threads", {
    method: "POST",
    headers: { ...authHeaders() },
    body: JSON.stringify({ title }),
  });
}

export async function deleteThread(threadId: string | number) {
  return http<void>(`/threads/${threadId}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
}

export async function getMessages(threadId: string | number) {
  return http<Message[]>(`/threads/${threadId}/messages`, {
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

/** ✅ updateThread — usado no Chat e no Kanban (persistir lead_level/origin/score) */
export async function updateThread(
  threadId: number | string,
  body: Partial<{ origin: string; lead_score: number; lead_level: "frio" | "morno" | "quente" }>
) {
  return http<Thread>(`/threads/${threadId}`, {
    method: "PATCH",
    headers: { ...authHeaders() },
    body: JSON.stringify(body),
  });
}

/* =========================
 * Recursos extras usados no Chat
 * (se o backend não tiver, eles não serão chamados)
 * =======================*/

/** Alterna “assumir conversa (humano)” */
export async function setTakeover(threadId: number | string, active: boolean) {
  return http<any>(`/threads/${threadId}/takeover`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: JSON.stringify({ active }),
  });
}

/** Envia resposta humana explícita (fora da IA) */
export async function postHumanReply(threadId: number | string, content: string) {
  return http<any>(`/threads/${threadId}/human-reply`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: JSON.stringify({ content }),
  });
}

/* =========================
 * Stats (opcional)
 * =======================*/
export async function getStats() {
  return http<any>("/stats", { headers: { ...authHeaders() } });
}
