// frontend/src/utils/leadScore.ts
import type { UIMessage } from "../types/lead";

export function minutesBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / 60000;
}

export function median(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  const arr = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

/**
 * Heurística 0–100 para calcular lead score:
 * 1) Recência da última mensagem (qualquer lado) — até 35 pts
 * 2) Volume/engajamento (72h e dias ativos/7d) — até 35 pts
 * 3) Tempo de resposta do assistente (mediana) — até 20 pts
 * 4) Ritmo (pares user→assistant/48h) — até 10 pts
 * Penalidade por inatividade longa do usuário — até -30
 */
export function computeLeadScoreFromMessages(msgs: UIMessage[], nowTs = Date.now()): number {
  if (!Array.isArray(msgs) || msgs.length === 0) return 0;

  // Ordena por data
  const timeline = [...msgs].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  const now = new Date(nowTs);

  // 1) Recência da última mensagem (de qualquer lado)
  const last = timeline[timeline.length - 1];
  const lastAt = new Date(last.created_at || now).getTime();
  const diffH = (nowTs - lastAt) / 36e5;
  let recencyScore = 0;
  if (diffH <= 6) recencyScore = 35;
  else if (diffH <= 24) recencyScore = 25;
  else if (diffH <= 72) recencyScore = 15;
  else if (diffH <= 7 * 24) recencyScore = 5;

  // 2) Volume/engajamento recente (últimas 72h + dias ativos nos últimos 7d)
  const last72hCut = nowTs - 72 * 36e5;
  const last7dCut = nowTs - 7 * 24 * 36e5;

  const recent72 = timeline.filter(m => new Date(m.created_at || 0).getTime() >= last72hCut);
  const volumeRecent = recent72.length; // todas as msgs (user + assistant)
  // até 20 pontos por volume em 72h (4 pts por msg, cap 20)
  const volumeScore = Math.min(20, volumeRecent * 4);

  // dias ativos (qualquer mensagem naquele dia civil) em 7 dias
  const daysActiveSet = new Set<string>();
  for (const m of timeline) {
    const ts = new Date(m.created_at || 0).getTime();
    if (ts >= last7dCut) {
      const d = new Date(ts);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
      daysActiveSet.add(key);
    }
  }
  // até 15 pontos por dias ativos (5 pts por dia, cap 15)
  const daysActiveScore = Math.min(15, daysActiveSet.size * 5);

  // 3) Tempo de resposta do assistente ao usuário (mediana das janelas válidas)
  // Estratégia: para cada mensagem do usuário, pegar a PRÓXIMA mensagem do assistente depois dela (até 12h)
  const userThenAssistantGapsMin: number[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const m = timeline[i];
    if (m.role !== "user") continue;
    const tUser = new Date(m.created_at || 0);
    // próxima resposta do assistente
    for (let j = i + 1; j < timeline.length; j++) {
      const n = timeline[j];
      if (n.role === "assistant") {
        const tAssistant = new Date(n.created_at || 0);
        const gapMin = minutesBetween(tUser, tAssistant);
        if (gapMin <= 12 * 60) {
          userThenAssistantGapsMin.push(gapMin);
        }
        break;
      }
    }
  }
  const medGap = median(userThenAssistantGapsMin); // minutos
  let responseScore = 0;
  if (typeof medGap === "number") {
    if (medGap <= 5) responseScore = 20;
    else if (medGap <= 20) responseScore = 12;
    else if (medGap <= 60) responseScore = 6;
    else responseScore = 0;
  } else {
    // Se ainda não houve resposta do assistente, mas existe volume do usuário recente, não damos pontos aqui.
    responseScore = 0;
  }

  // 4) Ritmo / trocas recentes (pares user->assistant nas últimas 48h)
  const last48hCut = nowTs - 48 * 36e5;
  let pairs48h = 0;
  for (let i = 0; i < timeline.length; i++) {
    const m = timeline[i];
    if (m.role !== "user") continue;
    const tUser = new Date(m.created_at || 0).getTime();
    if (tUser < last48hCut) continue;
    // há um assistant depois?
    const reply = timeline.slice(i + 1).find(n => n.role === "assistant");
    if (reply && new Date(reply.created_at || 0).getTime() >= last48hCut) {
      pairs48h += 1;
    }
  }
  const rhythmScore = Math.min(10, pairs48h * 3 + (pairs48h >= 3 ? 1 : 0)); // até 10

  // Penalidade por inatividade longa (considerando a ÚLTIMA mensagem do USUÁRIO)
  const lastUser = [...timeline].reverse().find(m => m.role === "user");
  let inactivityPenalty = 0;
  if (lastUser) {
    const lastUserAt = new Date(lastUser.created_at || 0).getTime();
    const diffUserDays = (nowTs - lastUserAt) / (36e5 * 24);
    if (diffUserDays > 14) inactivityPenalty = -30;
    else if (diffUserDays > 7) inactivityPenalty = -15;
  }

  let score = recencyScore + volumeScore + daysActiveScore + responseScore + rhythmScore + inactivityPenalty;
  score = Math.max(0, Math.min(100, score));
  return score;
}

export function levelFromScore(score?: number): "frio" | "morno" | "quente" | "desconhecido" {
  if (typeof score !== "number") return "desconhecido";
  if (score >= 60) return "quente";
  if (score >= 30) return "morno";
  if (score >= 0) return "frio";
  return "desconhecido";
}

