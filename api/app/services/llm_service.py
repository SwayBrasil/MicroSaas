# api/app/services/llm_service.py
import os
import asyncio
from pathlib import Path
from typing import List, Dict, Optional

from openai import OpenAI

# -----------------------------
# Config
# -----------------------------
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
API_KEY = os.getenv("OPENAI_API_KEY")

# Onde ler o prompt:
# 1) AGENT_INSTRUCTIONS (string no .env, usando \n)
# 2) AGENT_INSTRUCTIONS_FILE (caminho para arquivo com o prompt multiline)
#    default aponta para o caminho dentro do container
DEFAULT_PROMPT_FILE = "/app/app/agent_instructions.txt"


def _load_agent_instructions() -> str:
    s = os.getenv("AGENT_INSTRUCTIONS", "") or ""
    path = os.getenv("AGENT_INSTRUCTIONS_FILE") or DEFAULT_PROMPT_FILE

    # Se não veio pelo .env, tenta o arquivo
    if not s and path and Path(path).exists():
        try:
            s = Path(path).read_text(encoding="utf-8")
        except Exception:
            s = ""

    # Permite usar \n no .env (opção B)
    s = s.replace("\\n", "\n").strip()

    # Fallback seguro
    if not s:
        s = "Você é uma assistente útil, cordial e objetiva. Responda em português do Brasil."
    return s


AGENT_INSTRUCTIONS = _load_agent_instructions()

# Cliente OpenAI
client = OpenAI(api_key=API_KEY)


# -----------------------------
# Utilidades
# -----------------------------
def _coerce_history(thread_history: Optional[List[Dict[str, str]]]) -> List[Dict[str, str]]:
    """
    Garante formato esperado e limita a ~20 mensagens mais recentes
    para não estourar a janela de contexto.
    """
    if not thread_history:
        return []

    # Normaliza campos e filtra vazios
    norm: List[Dict[str, str]] = []
    for m in thread_history:
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        if not role or not content:
            continue
        # Apenas "user" e "assistant" são relevantes para histórico
        if role not in ("user", "assistant", "system"):
            # se vier "tool"/"function" etc., ignora
            continue
        norm.append({"role": role, "content": content})

    # Mantém só as últimas 20 mensagens
    if len(norm) > 20:
        norm = norm[-20:]
    return norm


# -----------------------------
# LLM
# -----------------------------
async def run_llm(message: str, thread_history: Optional[List[Dict[str, str]]] = None) -> str:
    """
    Gera uma resposta da LLM usando:
      - system prompt carregado do .env/arquivo
      - histórico (últimas 20 mensagens)
      - mensagem do usuário
    Executa a chamada síncrona da OpenAI em thread para não bloquear o loop.
    """
    # Monta a lista de mensagens no formato da API
    messages: List[Dict[str, str]] = []
    if AGENT_INSTRUCTIONS:
        messages.append({"role": "system", "content": AGENT_INSTRUCTIONS})

    history = _coerce_history(thread_history)
    messages.extend(history)

    user_msg = (message or "").strip()
    messages.append({"role": "user", "content": user_msg})

    # Chamada síncrona em thread separada (não bloqueia o event loop)
    def _call_openai():
        return client.chat.completions.create(model=MODEL, messages=messages)

    try:
        resp = await asyncio.to_thread(_call_openai)
        content = (resp.choices[0].message.content or "").strip()
        return content
    except Exception as e:
        # Log mínimo (se tiver logger, use-o aqui)
        # print(f"[LLM ERROR] {e}")  # evite logar conteúdo sensível em prod
        # Fallback genérico
        return "Desculpe, tive um problema para gerar a resposta agora. Pode tentar novamente?"
