# api/app/providers/twilio.py
import os
from twilio.rest import Client

SID   = os.getenv("TWILIO_ACCOUNT_SID")
TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
FROM  = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

_client = Client(SID, TOKEN)

def _normalize_to(to: str) -> str:
    to = str(to).strip()
    return to if to.startswith("whatsapp:") else f"whatsapp:{to}"

async def send_text(to: str, body: str):
    _client.messages.create(
        to=_normalize_to(to),   # ex.: "whatsapp:+55XXXXXXXXXXX"
        from_=FROM,             # sandbox Twilio
        body=body,
    )
