# app/providers/twilio.py
import os
from twilio.rest import Client

# 🔧 Configurações de ambiente
ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
FROM = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+5561947565536")

_client = Client(ACCOUNT_SID, AUTH_TOKEN)


def _fmt_whatsapp(num: str) -> str:
    """Garante que o número esteja no formato whatsapp:+55DDDNNNNNNN"""
    n = num.strip()
    if n.startswith("whatsapp:"):
        return n
    if n.startswith("+"):
        return f"whatsapp:{n}"
    return f"whatsapp:+{n}"


def send_text(to_e164: str, body: str, sender: str = "BOT") -> str:
    """
    Envia mensagem de texto pelo WhatsApp via Twilio.
    sender: "BOT" ou "HUMANO" (apenas para log)
    """
    if not ACCOUNT_SID or not AUTH_TOKEN or not FROM:
        raise RuntimeError(
            "❌ TWILIO envs faltando (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM)"
        )

    to = _fmt_whatsapp(to_e164)
    from_ = FROM if FROM.startswith("whatsapp:") else f"whatsapp:{FROM}"

    # 🔹 Envia mensagem
    msg = _client.messages.create(to=to, from_=from_, body=body)

    # 🔹 Log detalhado no terminal
    if sender.upper() == "BOT":
        print(f"\033[94m[TWILIO][BOT] → {to} | SID={msg.sid}\033[0m")  # azul
    else:
        print(f"\033[92m[TWILIO][HUMANO] → {to} | SID={msg.sid}\033[0m")  # verde

    return msg.sid
