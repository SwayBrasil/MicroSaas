// frontend/src/hooks/useLeadScore.ts
import { useMemo } from "react";
import type { UIMessage } from "../types/lead";
import { computeLeadScoreFromMessages, levelFromScore } from "../utils/leadScore";

export type LeadLevel = "frio" | "morno" | "quente" | "desconhecido";

export function getOverrideLevel(threadId: string | number): LeadLevel | null {
  const v = localStorage.getItem(`lead_override_${threadId}`);
  return v ? (v as LeadLevel) : null;
}

export function setOverrideLevel(threadId: string | number, level: LeadLevel) {
  localStorage.setItem(`lead_override_${threadId}`, level);
}

export function useLeadScore(
  messages: UIMessage[] | undefined,
  backendScore?: number,
  backendLevel?: LeadLevel,
  threadId?: string | number
): { score: number; level: LeadLevel } {
  return useMemo(() => {
    // Prioridade: override > backend > cálculo local
    const override = threadId ? getOverrideLevel(threadId) : null;
    if (override && override !== "desconhecido") {
      const score = backendScore ?? (messages ? computeLeadScoreFromMessages(messages) : 0);
      return { score, level: override };
    }

    if (backendLevel && backendLevel !== "desconhecido") {
      const score = backendScore ?? (messages ? computeLeadScoreFromMessages(messages) : 0);
      return { score, level: backendLevel };
    }

    if (typeof backendScore === "number") {
      return { score: backendScore, level: levelFromScore(backendScore) };
    }

    if (messages && messages.length > 0) {
      const score = computeLeadScoreFromMessages(messages);
      return { score, level: levelFromScore(score) };
    }

    return { score: 0, level: "desconhecido" };
  }, [messages, backendScore, backendLevel, threadId]);
}

