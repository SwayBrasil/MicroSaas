#!/usr/bin/env bash
set -e

python - <<'PY'
import os, time
from urllib.parse import urlparse
import psycopg2

# Lê o DSN e remove o +psycopg2 para o urlparse
dsn = os.getenv("DB_URL", "postgresql+psycopg2://saas:saas@db:5432/saas")
u = urlparse(dsn.replace("+psycopg2",""))
host, port = u.hostname or "db", u.port or 5432
user, pwd, dbname = u.username or "saas", u.password or "saas", (u.path or "/saas").lstrip('/')

# Espera ativa pelo DB
for i in range(60):
    try:
        conn = psycopg2.connect(host=host, port=port, user=user, password=pwd, dbname=dbname)
        conn.close()
        print("✅ DB está pronto.")
        break
    except Exception as e:
        print("⏳ Aguardando DB...", e)
        time.sleep(2)
else:
    raise SystemExit("❌ DB não respondeu a tempo.")

# Cria tabelas
from app.models import Base
from app.db import engine
Base.metadata.create_all(bind=engine)
print("✅ Tabelas prontas.")
PY

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
