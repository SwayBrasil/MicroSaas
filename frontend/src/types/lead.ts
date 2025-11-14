// frontend/src/types/lead.ts
export type LeadLevel = "frio" | "morno" | "quente" | "desconhecido";

export type UIMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  is_human?: boolean;
};

