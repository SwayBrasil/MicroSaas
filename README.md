# MicroSaaS – MVP Chat (Web + WhatsApp)

Assistente conversacional full-stack com **FastAPI**, **React (Vite)** e integração **WhatsApp (Twilio Sandbox)**. Inclui login JWT, chat com histórico, dashboard/estatísticas e perfil.

---

## ✨ Principais recursos

* Autenticação JWT (`/auth/login`) – seed: **[dev@local.com](mailto:dev@local.com) / 123**
* Threads/mensagens com histórico persistido (Postgres)
* Chat web + tela de perfil/estatísticas
* Integração WhatsApp (Twilio Sandbox) – webhooks prontos
* Prompt do agente por **.env** ou **arquivo** (`api/app/agent_instructions.txt`)
* Docker Compose para subir tudo rápido

---

## 🧱 Arquitetura

```
api/         # FastAPI + SQLAlchemy + OpenAI
frontend/    # React + Vite
infra/       # docker-compose, .env
```

---

## ✅ Requisitos

* Docker Desktop
* Ngrok (ou similar) para expor a API durante desenvolvimento
* Conta Twilio (Sandbox WhatsApp) e chave OpenAI

---

## ⚙️ Configuração

1. Copie o `.env` de exemplo:

```bash
cd infra
cp .env.example .env
```

2. Edite `infra/.env` (principais variáveis):

```
APP_NAME=...
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
AGENT_INSTRUCTIONS_FILE=/app/app/agent_instructions.txt   # ou use AGENT_INSTRUCTIONS com \n
JWT_SECRET=um_segredo_longo_aqui
WHATSAPP_PROVIDER=twilio

TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

PUBLIC_BASE_URL=https://<seu-ngrok>.ngrok-free.app
VITE_API_BASE_URL=http://localhost:8000

# Opcional: roteia todas as conversas WhatsApp para um usuário fixo do app
WA_ROUTE_TO_EMAIL=dev@local.com
```

> Prompt: coloque seu prompt em `api/app/agent_instructions.txt` (versionável) **ou** defina `AGENT_INSTRUCTIONS` numa única linha com `\n`.

---

## ▶️ Subindo o projeto

Em um terminal (API pública):

```bash
ngrok http 8000
```

Em outro terminal (na raiz do repo):

```bash
docker compose -f infra/docker-compose.yml up --build
```

* Frontend: [http://localhost:3000](http://localhost:3000)
* API (docs): [http://localhost:8000/docs](http://localhost:8000/docs)
* Health: [http://localhost:8000/health](http://localhost:8000/health)

Login seed: **[dev@local.com](mailto:dev@local.com) / 123**

---

## 💬 WhatsApp (Twilio Sandbox)

1. No **Twilio Console → Messaging → Try it out → WhatsApp → Sandbox settings**

   * **When a message comes in**: `POST https://<seu-ngrok>/webhooks/twilio`
   * **Status callback URL**: deixe vazio (opcional)
2. Do seu WhatsApp, envie `join <seu-código>` para **+1 415 523 8886** (número do Sandbox).
3. Envie mensagem para **+1 415 523 8886**.

   * Se `WA_ROUTE_TO_EMAIL` estiver definido, a conversa aparecerá como **“WhatsApp +<numero>”** no seu usuário web.

**Teste rápido (curl):**

```bash
curl -X POST "https://<seu-ngrok>/webhooks/twilio" \
  -d "From=whatsapp:+5561984081114" \
  --data-urlencode "Body=olá via curl"
```

---

## 🔌 Endpoints principais

* `POST /auth/login` → `{ email, password }` → `{ token }`
* `GET /me`
* `GET /threads` · `POST /threads` · `DELETE /threads/{id}`
* `GET /threads/{id}/messages` · `POST /threads/{id}/messages`
* `GET /stats` · `GET /stats/usage` · `GET /activities`
* `POST /webhooks/twilio` · `GET/POST /webhooks/meta`
* `GET /health`

---

## 🧰 Comandos úteis

```bash
# rebuild somente da API (forçar reinstalação de deps)
docker compose -f infra/docker-compose.yml build --no-cache api
docker compose -f infra/docker-compose.yml up

# logs
docker compose -f infra/docker-compose.yml logs -f api
docker compose -f infra/docker-compose.yml logs -f frontend
```

---

## 🛡️ Segurança

* **Nunca** comite `.env` (já ignorado em `.gitignore`).
* Rotacione chaves se já foram expostas.
* Em produção: restrinja CORS, valide assinaturas (Twilio `X-Twilio-Signature`), configure HTTPS real.

---

## 📄 Licença

Defina a licença desejada (por exemplo, MIT) em `LICENSE`.

---

## 🙋 Suporte / próximos passos

* Inbox de contatos WhatsApp (admin)
* Fila/handoff humano
* Métricas e export para planilha/CRM
* Templates de notificação transacional (WhatsApp)
