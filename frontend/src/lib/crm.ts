// frontend/src/lib/crm.ts

// ===== Helpers locais (mesmo padrão do api.ts) =====
const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function http<T = any>(
  path: string,
  init?: RequestInit,
  query?: Record<string, string | number | boolean | undefined | null>
): Promise<T> {
  // monta querystring (se houver)
  let url = `${BASE_URL}${path}`;
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    url += `?${qs.toString()}`;
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// =========================
// Types
// =========================
export type Contact = {
  id: number;
  owner_user_id: number;
  name: string;
  phone?: string;
  email?: string;
  stage: "lead" | "client";
  heat: "hot" | "warm" | "cold";
  await_status:
    | "none"
    | "awaiting_client"
    | "awaiting_us"
    | "awaiting_payment";
  is_real: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
};

export type Deal = {
  id: number;
  contact_id: number;
  title: string;
  value: number;
  column:
    | "novo"
    | "qualificacao"
    | "proposta"
    | "fechamento"
    | "ganho"
    | "perdido";
  priority: "baixa" | "normal" | "alta" | string;
  due_date?: string; // ISO (yyyy-mm-dd)
  tags?: string[];
  created_at: string;
};

export type Obligation = {
  id: number;
  owner_user_id: number;
  title: string;
  description?: string;
  due_date: string; // ISO datetime
  status: "open" | "done";
  contact_id?: number;
  created_at: string;
};

// =========================
// Contacts
// =========================
export async function listContacts(): Promise<Contact[]> {
  return http<Contact[]>("/contacts");
}

export async function getContact(id: number): Promise<Contact> {
  return http<Contact>(`/contacts/${id}`);
}

export type ContactCreate = Omit<
  Contact,
  "id" | "owner_user_id" | "created_at" | "updated_at"
>;
export async function createContact(payload: ContactCreate): Promise<Contact> {
  return http<Contact>("/contacts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type ContactUpdate = Partial<ContactCreate>;
export async function updateContact(
  id: number,
  payload: ContactUpdate
): Promise<Contact> {
  return http<Contact>(`/contacts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteContact(
  id: number
): Promise<{ ok: boolean } | any> {
  return http<{ ok: boolean } | any>(`/contacts/${id}`, { method: "DELETE" });
}

// =========================
// Deals (Kanban)
// =========================
export async function listDeals(
  column?: Deal["column"]
): Promise<Deal[]> {
  return http<Deal[]>("/deals", undefined, column ? { column } : undefined);
}

export type DealCreate = Omit<Deal, "id" | "created_at">;
export async function createDeal(payload: DealCreate): Promise<Deal> {
  return http<Deal>("/deals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type DealUpdate = Partial<DealCreate>;
export async function updateDeal(
  id: number,
  payload: DealUpdate
): Promise<Deal> {
  return http<Deal>(`/deals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteDeal(id: number): Promise<{ ok: boolean } | any> {
  return http<{ ok: boolean } | any>(`/deals/${id}`, { method: "DELETE" });
}

// =========================
// Obligations (Calendar)
// =========================
export async function listObligations(params?: {
  start?: string;
  end?: string;
}): Promise<Obligation[]> {
  return http<Obligation[]>("/obligations", undefined, params);
}

export type ObligationCreate = Omit<
  Obligation,
  "id" | "owner_user_id" | "created_at"
>;
export async function createObligation(
  payload: ObligationCreate
): Promise<Obligation> {
  return http<Obligation>("/obligations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type ObligationUpdate = Partial<ObligationCreate>;
export async function updateObligation(
  id: number,
  payload: ObligationUpdate
): Promise<Obligation> {
  return http<Obligation>(`/obligations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteObligation(
  id: number
): Promise<{ ok: boolean } | any> {
  return http<{ ok: boolean } | any>(`/obligations/${id}`, {
    method: "DELETE",
  });
}
