import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import React, { Suspense, lazy, useEffect, useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts";

// Lazy-loaded pages (code splitting — loads each page only when needed)
const Landing         = lazy(() => import("./pages/landing/page"));
const Login           = lazy(() => import("./pages/login/page"));
const Callback        = lazy(() => import("./pages/callback/page"));
const Dashboard       = lazy(() => import("./pages/page"));
const Providers       = lazy(() => import("./pages/providers/page"));
const ProviderDetail  = lazy(() => import("./pages/providers/[id]/page"));
const ProvidersNew    = lazy(() => import("./pages/providers/new/page"));
const Usage           = lazy(() => import("./pages/usage/page"));
const ProxyPools      = lazy(() => import("./pages/proxy-pools/page"));
const Combos          = lazy(() => import("./pages/combos/page"));
const MaxBrowser      = lazy(() => import("./pages/max-browser/page"));
const Endpoint        = lazy(() => import("./pages/endpoint/page"));
const Automation      = lazy(() => import("./pages/automation/page"));
const CompatibleChat  = lazy(() => import("./pages/compatible-chat/page"));
const ModelDetection  = lazy(() => import("./pages/model-detection/page"));
const Parameters      = lazy(() => import("./pages/parameters/page"));
const Profile         = lazy(() => import("./pages/profile/page"));
const ConsoleLog      = lazy(() => import("./pages/console-log/page"));
const WeavyPool       = lazy(() => import("./pages/providers/weavy/pool/page"));
const AmmailTutorial  = lazy(() => import("./pages/automation/ammail-tutorial/page"));
const KiroDevices     = lazy(() => import("./pages/kiro-devices/page"));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    fetch("/api/auth/status", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Tidak dapat memeriksa sesi login.");
        return response.json();
      })
      .then((status) => {
        window.clearTimeout(timeout);
        if (status.requireLogin === false || status.isLoggedIn === true) {
          setAllowed(true);
        } else {
          setAllowed(false);
          navigate("/login", { replace: true });
        }
      })
      .catch(() => {
        window.clearTimeout(timeout);
        setAllowed(false);
        navigate("/login?error=session", { replace: true });
      });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [navigate]);

  if (allowed !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-muted">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p>Memeriksa sesi masuk...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Kesalahan tampilan tidak diketahui.",
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("[UI] Kesalahan render:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-bg text-text-main flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl">
          <h1 className="text-xl font-semibold mb-2">Tampilan mengalami kesalahan</h1>
          <p className="text-sm text-text-muted mb-4">Halaman gagal dirender. Data aplikasi tetap aman. Muat ulang untuk mencoba lagi.</p>
          <pre className="mb-4 max-h-32 overflow-auto rounded-lg bg-black/10 p-3 text-xs text-text-muted whitespace-pre-wrap">{this.state.message}</pre>
          <button type="button" onClick={() => globalThis.location.reload()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">Muat Ulang</button>
        </div>
      </div>
    );
  }
}

function LoadingFallback() {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>Memuat...</div>;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/callback" element={<Callback />} />

            <Route path="/dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
              <Route index element={<Dashboard />} />
              <Route path="providers" element={<Providers />} />
              <Route path="providers/new" element={<ProvidersNew />} />
              <Route path="providers/weavy/pool" element={<WeavyPool />} />
              <Route path="providers/:id" element={<ProviderDetail />} />
              <Route path="usage" element={<Usage />} />
              <Route path="parameters" element={<Parameters />} />
              <Route path="proxy-pools" element={<ProxyPools />} />
              <Route path="combos" element={<Combos />} />
              <Route path="max-browser" element={<MaxBrowser />} />
              <Route path="endpoint" element={<Endpoint />} />
              <Route path="automation" element={<Automation />} />
              <Route path="automation/ammail-tutorial" element={<AmmailTutorial />} />
              <Route path="chat" element={<CompatibleChat />} />
              <Route path="model-detection" element={<ModelDetection />} />
              <Route path="kiro-devices" element={<KiroDevices />} />
              <Route path="profile" element={<Profile />} />
              <Route path="console-log" element={<ConsoleLog />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
