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
  withCredentials: false,
});

// ---- Auth header (Bearer) ----
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      // Se quiser, limpe o token aqui.
      // localStorage.removeItem("token");
    }
    return Promise.reject(err);
  }
);

// ==================== Tipos ====================
export type Thread = {
  id: number | string;
  title?: string;
  origin?: string | null;
  lead_score?: number | null;
  lead_level?: "frio" | "morno" | "quente" | null;
  metadata?: any;
  contact_name?: string | null;  // Nome do contato associado à thread
  last_message?: string | null;  // Preview da última mensagem
  last_message_at?: string | null;  // Data da última mensagem
  created_at?: string | null;  // Data de criação da thread
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

export type TaskStatus = "open" | "done";
export type Task = {
  id: number | string;
  title: string;
  status: TaskStatus;
  due_date?: string | null;
  notes?: string | null;
};

// ==================== Auth ====================
export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/login", { email, password });
  localStorage.setItem("token", data.token);
  return data;
}

export function logout() {
  localStorage.removeItem("token");
}

// ==================== Threads ====================
export async function createThread(title: string = "Nova conversa"): Promise<Thread> {
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

export async function updateThread(
  threadId: number | string,
  body: Partial<{ origin: string; lead_score: number; lead_level: "frio" | "morno" | "quente" }>
): Promise<Thread> {
  const { data } = await api.patch<Thread>(`/threads/${threadId}`, body);
  return data;
}

// ==================== Messages ====================
export async function postMessage(threadId: number, content: string): Promise<Message> {
  const { data } = await api.post<Message>(`/threads/${threadId}/messages`, { content });
  return data;
}

export async function getMessages(threadId: number): Promise<Message[]> {
  const { data } = await api.get<Message[]>(`/threads/${threadId}/messages`);
  return data;
}

// ==================== Stats/Profile ====================
export async function getStats(): Promise<StatsResponse> {
  const { data } = await api.get<StatsResponse>("/stats");
  return data;
}

export async function getMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>("/me");
  return data;
}

export async function getProfile(): Promise<ProfileDTO> {
  try {
    const { data } = await api.get<any>("/me");
    return {
      id: data.id,
      email: data.email ?? "dev@local.com",
      name: data.name ?? "Usuário",
      plan: data.plan ?? "Trial",
      created_at: data.created_at ?? null,
      last_activity_at: data.last_activity_at ?? null,
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
    return { threads_total: 0, messages_total: 0, user_sent: 0, assistant_sent: 0 };
  }
}

// ==================== Takeover/Human Reply ====================
export async function setTakeover(
  threadId: number,
  active: boolean
): Promise<{ ok: boolean; human_takeover: boolean }> {
  // Backend espera { active: boolean }
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
  // Backend usa human-reply (com hífen)
  const { data } = await api.post<{ ok: boolean; message_id: number }>(
    `/threads/${threadId}/human-reply`,
    { content }
  );
  return data;
}

// ==================== Tasks (CRUD) ====================
export async function listTasks(): Promise<Task[]> {
  const { data } = await api.get<Task[]>("/tasks");
  return data;
}

export async function createTask(task: Partial<Task>): Promise<Task> {
  const { data } = await api.post<Task>("/tasks", task);
  return data;
}

export async function updateTask(id: number | string, patch: Partial<Task>): Promise<Task> {
  const { data } = await api.patch<Task>(`/tasks/${id}`, patch);
  return data;
}

export async function deleteTask(id: number | string): Promise<void> {
  await api.delete(`/tasks/${id}`);
}

// ==================== SSE Helper ====================
export function sseUrlForThread(threadId: number | string) {
  const token = localStorage.getItem("token") || "";
  return `${API_BASE}/threads/${threadId}/stream?token=${encodeURIComponent(token)}`;
}

// ==================== CRM / Contacts ====================
export type Contact = {
  id: number;
  thread_id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  total_orders: number;
  total_spent: number; // em centavos
  average_ticket?: number | null; // em centavos
  most_bought_products?: any;
  last_interaction_at?: string | null;
  created_at: string;
  updated_at: string;
  tags: ContactTag[];
  notes: ContactNote[];
  reminders: ContactReminder[];
};

export type ContactTag = {
  id: number;
  tag: string;
  created_at: string;
};

export type ContactNote = {
  id: number;
  content: string;
  created_at: string;
  user_id: number;
};

export type ContactReminder = {
  id: number;
  message: string;
  due_date: string;
  completed: boolean;
  created_at: string;
};

export async function getContactByThread(threadId: number): Promise<Contact> {
  const { data } = await api.get<Contact>(`/contacts/thread/${threadId}`);
  return data;
}

export async function getContact(contactId: number): Promise<Contact> {
  const { data } = await api.get<Contact>(`/contacts/${contactId}`);
  return data;
}

export async function listContacts(): Promise<Contact[]> {
  const { data } = await api.get<Contact[]>("/contacts");
  return data;
}

export async function updateContact(contactId: number, patch: Partial<Contact>): Promise<Contact> {
  const { data } = await api.patch<Contact>(`/contacts/${contactId}`, patch);
  return data;
}

export async function addContactTag(contactId: number, tag: string): Promise<ContactTag> {
  const { data } = await api.post<ContactTag>(`/contacts/${contactId}/tags`, { tag });
  return data;
}

export async function removeContactTag(contactId: number, tagId: number): Promise<void> {
  await api.delete(`/contacts/${contactId}/tags/${tagId}`);
}

export async function addContactNote(contactId: number, content: string): Promise<ContactNote> {
  const { data } = await api.post<ContactNote>(`/contacts/${contactId}/notes`, { content });
  return data;
}

export async function deleteContactNote(contactId: number, noteId: number): Promise<void> {
  await api.delete(`/contacts/${contactId}/notes/${noteId}`);
}

export async function createContactReminder(
  contactId: number,
  message: string,
  dueDate: string
): Promise<ContactReminder> {
  const { data } = await api.post<ContactReminder>(`/contacts/${contactId}/reminders`, {
    message,
    due_date: dueDate,
  });
  return data;
}

export async function updateContactReminder(
  contactId: number,
  reminderId: number,
  completed: boolean
): Promise<ContactReminder> {
  const { data } = await api.patch<ContactReminder>(
    `/contacts/${contactId}/reminders/${reminderId}?completed=${completed}`,
    {}
  );
  return data;
}

export default api;
