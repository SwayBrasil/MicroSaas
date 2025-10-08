// frontend/src/api.ts
import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const api = axios.create({ baseURL });

// --- Injeta o Bearer token salvo no localStorage (se houver) ---
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

// ----- Tipos úteis -----
export type Thread = { id: number; title: string; human_takeover?: boolean };
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

// Tipos específicos do Profile
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

export type Activity = {
  id: string | number;
  type: string;
  title: string;
  at: string | number | Date;
};

// ----- Auth -----
export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/login", { email, password });
  localStorage.setItem("token", data.token);
  return data;
}

export function logout() {
  localStorage.removeItem("token");
}

// ----- Threads -----
export async function createThread(title: string = "Nova conversa"): Promise<Thread> {
  const { data } = await api.post<Thread>("/threads", { title });
  return data;
}


export async function listThreads(): Promise<Thread[]> {
  const { data } = await api.get<Thread[]>("/threads");
  return data;
}

export async function deleteThread(threadId: number): Promise<void> {
  await api.delete(`/threads/${threadId}`);
}

// ----- Messages -----
export async function postMessage(threadId: number, content: string): Promise<Message> {
  const { data } = await api.post<Message>(`/threads/${threadId}/messages`, { content });
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
// 🔽 Adições para a nova tela de Profile
// ======================================================================

// 🔹 Perfil completo
export async function getProfile(): Promise<ProfileDTO> {
  try {
    const { data } = await api.get<ProfileDTO>("/me");
    return {
      id: data.id,
      email: (data as any).email ?? "dev@local.com",
      name: (data as any).name ?? "Usuário",
      plan: (data as any).plan ?? "Trial",
      created_at: (data as any).created_at ?? null,
      last_activity_at: (data as any).last_activity_at ?? null,
    };
  } catch {
    // fallback seguro
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

// 🔹 Uso agregado (para os cards)
export async function getUsage(): Promise<UsageDTO> {
  try {
    const { data } = await api.get<UsageDTO>("/stats/usage");
    return data;
  } catch {
    return { threads_total: 0, messages_total: 0, user_sent: 0, assistant_sent: 0 };
  }
}

// 🔹 Atividades recentes
export async function getActivities({ limit = 10 } = {}): Promise<Activity[]> {
  try {
    const { data } = await api.get<Activity[]>(`/activities?limit=${limit}`);
    return data;
  } catch {
    return [];
  }
}

export default api;

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
