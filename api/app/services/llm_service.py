# api/app/services/llm_service.py
import os
import asyncio
import math
from pathlib import Path
from typing import List, Dict, Optional, Any

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

# Robustez
REQUEST_TIMEOUT = float(os.getenv("OPENAI_REQUEST_TIMEOUT", "30"))  # segundos
MAX_RETRIES = int(os.getenv("OPENAI_MAX_RETRIES", "3"))
RETRY_BASE = float(os.getenv("OPENAI_RETRY_BASE", "0.6"))  # backoff exponencial
MAX_HISTORY = int(os.getenv("OPENAI_MAX_HISTORY", "20"))   # msgs (user/assistant/system)

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
def _coerce_history(thread_history: Optional[List[Dict[str, str]]],
                    max_history: int = MAX_HISTORY) -> List[Dict[str, str]]:
    """
    Garante formato esperado e limita a N mensagens mais recentes
    para não estourar a janela de contexto.
    """
    if not thread_history:
        return []

    norm: List[Dict[str, str]] = []
    for m in thread_history:
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        if not role or not content:
            continue
        # Apenas "user", "assistant" e "system" são relevantes para histórico
        if role not in ("user", "assistant", "system"):
            continue
        norm.append({"role": role, "content": content})

    if max_history and len(norm) > max_history:
        norm = norm[-max_history:]
    return norm


async def _call_openai_with_retries(messages: List[Dict[str, str]]) -> str:
    """
    Chamada ao OpenAI com retries e backoff exponencial.
    Executa a chamada síncrona em thread separada para não bloquear o loop.
    """
    last_err: Optional[BaseException] = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            def _sync_call() -> Any:
                # Em SDKs recentes, o timeout pode ser passado por request
                # Se sua versão não aceitar 'timeout', remova o argumento.
                return client.chat.completions.create(
                    model=MODEL,
                    messages=messages,
                    timeout=REQUEST_TIMEOUT,
                )

            resp = await asyncio.to_thread(_sync_call)
            content = (resp.choices[0].message.content or "").strip()
            return content
        except Exception as e:
            last_err = e
            if attempt >= MAX_RETRIES:
                break
            # Backoff exponencial com jitter leve
            delay = (RETRY_BASE ** attempt) + (attempt * 0.05)
            await asyncio.sleep(delay)

    # Fallback amigável
    return "Desculpe, tive um problema para gerar a resposta agora. Pode tentar novamente?"


# -----------------------------
# LLM
# -----------------------------
async def run_llm(
    message: str,
    thread_history: Optional[List[Dict[str, str]]] = None,
    takeover: bool = False,
) -> Optional[str]:
    """
    Gera uma resposta da LLM usando:
      - system prompt carregado do .env/arquivo
      - histórico (limite configurável)
      - mensagem do usuário

    Se `takeover=True`, não gera resposta (modo humano assumiu) e retorna None.
    """
    # 🔒 Bloqueio de takeover: nunca responder se humano assumiu
    if takeover:
        return None

    # Monta a lista de mensagens no formato da API
    messages: List[Dict[str, str]] = []
    if AGENT_INSTRUCTIONS:
        messages.append({"role": "system", "content": AGENT_INSTRUCTIONS})

    history = _coerce_history(thread_history, max_history=MAX_HISTORY)
    messages.extend(history)

    user_msg = (message or "").strip()
    messages.append({"role": "user", "content": user_msg})

    # Chamar OpenAI com robustez (timeout + retries)
    content = await _call_openai_with_retries(messages)
    return content
