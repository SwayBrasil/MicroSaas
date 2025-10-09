// frontend/src/pages/Login.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";

export default function Login() {
  const { login } = useAuth();

  // pré-preenche com valor salvo (opcional)
  const rememberedEmail = typeof window !== "undefined" ? localStorage.getItem("remembered_email") || "" : "";

  const [email, setEmail] = useState(rememberedEmail || "dev@local.com");
  const [password, setPassword] = useState("123");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(!!rememberedEmail);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailValid = useMemo(() => /\S+@\S+\.\S+/.test(email.trim()), [email]);
  const passwordValid = useMemo(() => password.trim().length >= 3, [password]);
  const formValid = emailValid && passwordValid;

  useEffect(() => {
    // sincroniza toggle "lembrar"
    if (rememberEmail) {
      localStorage.setItem("remembered_email", email.trim());
    } else {
      localStorage.removeItem("remembered_email");
    }
  }, [rememberEmail, email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid || loading) return;

    setErr(null);
    setLoading(true);

    try {
      await login(email.trim(), password);
      // navegação pós-login é feita no auth.tsx (navigate("/chat"))
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        "Falha ao entrar. Confira suas credenciais.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <form
        onSubmit={onSubmit}
        className="card"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 20,
          borderRadius: 16,
          display: "grid",
          gap: 14,
        }}
        aria-labelledby="login-title"
      >
        {/* Logo + título */}
        <div style={{ display: "grid", gap: 6, marginBottom: 4 }}>
          <div className="logo" style={{ justifyContent: "center" }}>
            {/* pequeno SVG de marca genérica */}
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
              <defs>
                <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--brand)" />
                  <stop offset="1" stopColor="var(--brand-2)" />
                </linearGradient>
              </defs>
              <circle cx="12" cy="12" r="10" fill="url(#g)" />
              <path d="M7 12h10M12 7v10" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span style={{ color: "var(--text)" }}>Sway</span>
          </div>

          <h1 id="login-title" style={{ margin: 0, textAlign: "center" }}>
            Entrar na sua conta
          </h1>
          <p className="small" style={{ textAlign: "center", margin: 0 }}>
            Acesse o painel e continue de onde parou.
          </p>
        </div>

        {/* Erro */}
        {err && (
          <div
            role="alert"
            style={{
              border: "1px solid #7f1d1d",
              background: "#1b0f10",
              color: "#fecaca",
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 14,
            }}
          >
            {err}
          </div>
        )}

        {/* E-mail */}
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="email" style={{ fontSize: 14, color: "var(--muted)" }}>
            E-mail
          </label>
          <input
            id="email"
            className="input"
            placeholder="voce@empresa.com"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!emailValid}
            aria-describedby={!emailValid ? "email-err" : undefined}
            required
          />
          {!emailValid && (
            <span id="email-err" className="small" style={{ color: "#fca5a5" }}>
              Informe um e-mail válido.
            </span>
          )}
        </div>

        {/* Senha + toggle */}
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="password" style={{ fontSize: 14, color: "var(--muted)" }}>
            Senha
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="password"
              className="input"
              placeholder="Sua senha"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!passwordValid}
              aria-describedby={!passwordValid ? "pwd-err" : undefined}
              required
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              style={{
                position: "absolute",
                right: 8,
                top: 0,
                bottom: 0,
                margin: "auto",
                height: 32,
                padding: "0 8px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--soft)",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {!passwordValid && (
            <span id="pwd-err" className="small" style={{ color: "#fca5a5" }}>
              Sua senha precisa ter pelo menos 3 caracteres.
            </span>
          )}
        </div>

        {/* Opções */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 2,
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={rememberEmail}
              onChange={(e) => setRememberEmail(e.target.checked)}
            />
            <span className="small">Lembrar meu e-mail</span>
          </label>

          <a
            href="#/esqueci-a-senha"
            className="small"
            style={{ color: "var(--brand-2)", textDecoration: "none" }}
          >
            Esqueci minha senha
          </a>
        </div>

        {/* Botão */}
        <button
          type="submit"
          className="btn"
          disabled={!formValid || loading}
          style={{ marginTop: 4 }}
          aria-busy={loading}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
