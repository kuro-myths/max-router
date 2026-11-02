import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SignInPage } from "@/components/ui/sign-in";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [initialPasswordConfigured, setInitialPasswordConfigured] = useState(false);
  const [passwordConfigured, setPasswordConfigured] = useState(true);
  const [authMode, setAuthMode] = useState("password");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Masuk dengan OIDC");
  const navigate = useNavigate();

  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => setRetryAfter((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch("/api/auth/status", {
          credentials: "same-origin",
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          const params = new URLSearchParams(window.location.search);
          const isForced = params.get("force") === "true" || params.get("force") === "1";
          if (data.requireLogin === false && !isForced) {
            localStorage.setItem("9r_authed", "1");
            navigate("/dashboard");
            return;
          }
          setHasPassword(!!data.hasPassword);
          setInitialPasswordConfigured(data.initialPasswordConfigured === true);
          setPasswordConfigured(data.passwordConfigured !== false);
          setAuthMode(data.authMode || "password");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Masuk dengan Google");
        } else {
          setHasPassword(true);
        }
      } catch {
        clearTimeout(timeoutId);
        setHasPassword(true);
      }
    }
    checkAuth();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResetHint("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Kata sandi tidak valid");
        if (data.resetHint) setResetHint(data.resetHint);
        if (data.retryAfter) setRetryAfter(Number(data.retryAfter));
        return;
      }
      localStorage.setItem("9r_authed", "1");
      const statusRes = await fetch("/api/auth/status", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const status = await statusRes.json().catch(() => ({}));
      if (!status.isLoggedIn) {
        setError("Login berhasil, tetapi sesi browser tidak tersimpan. Silakan coba lagi.");
        return;
      }
      navigate("/dashboard", { replace: true });
    } catch {
      setError("Terjadi kesalahan saat membuat sesi. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = "/api/auth/google/start";
  };

  const oidcAvailable = oidcConfigured && ["oidc", "both"].includes(authMode);
  const passwordAvailable = authMode !== "oidc" || !oidcConfigured;
  const showOidcInfoMessage = (authMode === "oidc" || authMode === "both") && !oidcConfigured;
  const showBothInfoMessage = authMode === "both" && oidcConfigured;

  if (hasPassword === null) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4"><div className="text-center"><div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 dark:border-zinc-50" /><p className="text-zinc-500 dark:text-zinc-400 mt-4">Memuat...</p></div></div>;
  }

  return <SignInPage
    title={<span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">9Router <span className="font-light text-zinc-400">V3</span></span>}
    description={authMode === "oidc" && oidcConfigured ? "Masuk dengan penyedia OIDC untuk mengakses panel." : !passwordConfigured ? "Masuk dengan kata sandi belum dikonfigurasi pada layanan ini." : "Masukkan kata sandi panel untuk melanjutkan."}
    password={password}
    setPassword={setPassword}
    onSignIn={handleLogin}
    onOidcSignIn={handleOidcLogin}
    oidcAvailable={oidcAvailable}
    passwordAvailable={passwordAvailable}
    oidcLoginLabel={oidcLoginLabel}
    showOidcInfoMessage={showOidcInfoMessage}
    showBothInfoMessage={showBothInfoMessage}
    error={error}
    resetHint={resetHint}
    retryAfter={retryAfter}
    loading={loading}
    hasPassword={hasPassword}
    initialPasswordConfigured={initialPasswordConfigured}
    passwordConfigured={passwordConfigured}
  />;
}
