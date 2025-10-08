// frontend/src/api.ts
import axios from "axios";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 20000,
});

// --- Injeta o Bearer token salvo no localStorage (se houver) ---
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

// (Opcional) trata 401 para evitar loop silencioso
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      // token inválido/expirado → deixe a tela atual lidar (login, etc.)
      // localStorage.removeItem("token");
    }
    return Promise.reject(err);
  }
);

// ----- Tipos -----
export type Thread = {
  id: number;
  title: string;
  human_takeover?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type Message = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  is_human?: boolean;
};

export type LoginResponse = { token: string };
export type MeResponse = { id: number; email: string };

export type StatsResponse = {
  threads: number;
  user_messages: number;
  assistant_messages: number;
  total_messages: number;
  last_activity: string | null;
};

// Tipos específicos do Profile (front)
export type ProfileDTO = {
  id: string | number;
  email: string;
  name?: string;
  plan?: string;
  created_at?: string | null;
  last_activity_at?: string | null;
};

export type UsageDTO = {
  threads_total: number;
  messages_total: number;
  user_sent: number;
  assistant_sent: number;
};

// ----- Auth -----
export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/login", {
    email,
    password,
  });
  localStorage.setItem("token", data.token);
  return data;
}

export function logout() {
  localStorage.removeItem("token");
}

// ----- Threads -----
export async function createThread(
  title: string = "Nova conversa"
): Promise<Thread> {
  const { data } = await api.post<Thread>("/threads", { title });
  return data;
}

export async function listThreads(): Promise<Thread[]> {
  const { data } = await api.get<Thread[]>("/threads");
  return data;
}

export async function deleteThread(threadId: number | string): Promise<void> {
  await api.delete(`/threads/${threadId}`);
}

// ----- Messages -----
export async function postMessage(
  threadId: number,
  content: string
): Promise<Message> {
  const { data } = await api.post<Message>(`/threads/${threadId}/messages`, {
    content,
  });
  return data;
}

export async function getMessages(threadId: number): Promise<Message[]> {
  const { data } = await api.get<Message[]>(`/threads/${threadId}/messages`);
  return data;
}

// ----- Stats -----
export async function getStats(): Promise<StatsResponse> {
  const { data } = await api.get<StatsResponse>("/stats");
  return data;
}

// ----- Profile Básico -----
export async function getMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>("/me");
  return data;
}

// ======================================================================
// 🔽 Adições para a nova tela de Profile (com fallbacks seguros)
// ======================================================================

// 🔹 Perfil “enriquecido” (a API entrega /me simples; completamos se faltar algo)
export async function getProfile(): Promise<ProfileDTO> {
  try {
    const { data } = await api.get<ProfileDTO>("/me");
    return {
      id: (data as any).id,
      email: (data as any).email ?? "dev@local.com",
      name: (data as any).name ?? "Usuário",
      plan: (data as any).plan ?? "Trial",
      created_at: (data as any).created_at ?? null,
      last_activity_at: (data as any).last_activity_at ?? null,
    };
  } catch {
    return {
      id: "-",
      email: "dev@local.com",
      name: "Usuário",
      plan: "Trial",
      created_at: null,
      last_activity_at: null,
    };
  }
}

// 🔹 Uso agregado — mapeado a partir de /stats (backend existente)
export async function getUsage(): Promise<UsageDTO> {
  try {
    const s = await getStats();
    return {
      threads_total: s.threads ?? 0,
      messages_total: s.total_messages ?? 0,
      user_sent: s.user_messages ?? 0,
      assistant_sent: s.assistant_messages ?? 0,
    };
  } catch {
    return {
      threads_total: 0,
      messages_total: 0,
      user_sent: 0,
      assistant_sent: 0,
    };
  }
}

// --- Takeover (novo) ---
export async function setTakeover(
  threadId: number,
  active: boolean
): Promise<{ ok: boolean; human_takeover: boolean }> {
  const { data } = await api.post<{ ok: boolean; human_takeover: boolean }>(
    `/threads/${threadId}/takeover`,
    { active }
  );
  return data;
}

export async function postHumanReply(
  threadId: number,
  content: string
): Promise<{ ok: boolean; message_id: number }> {
  const { data } = await api.post<{ ok: boolean; message_id: number }>(
    `/threads/${threadId}/human-reply`,
    { content }
  );
  return data;
}

// --- Helper opcional: URL do SSE (se quiser usar fora do Chat.tsx) ---
export function sseUrlForThread(threadId: number | string) {
  const token = localStorage.getItem("token") || "";
  return `${API_BASE}/threads/${threadId}/stream?token=${encodeURIComponent(
    token
  )}`;
}

export default api;
