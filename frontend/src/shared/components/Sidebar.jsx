
import { useState, useEffect } from "react";
import { Activity, BarChart3, Bot, Layers, Search, Server, SlidersHorizontal, Terminal, Network, Settings, Power, Copy, Home } from "lucide-react";
import PropTypes from "prop-types";
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, UPDATER_CONFIG } from "@/shared/constants/config";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Button from "./Button";
import { ConfirmModal } from "./Modal";

const NAV_ICONS = {
  home: Home, api: Activity, dns: Server, manage_search: Search,
  layers: Layers, bar_chart: BarChart3, tune: SlidersHorizontal,
  terminal: Terminal, lan: Network, smart_toy: Bot, settings: Settings,
};
function NavIcon({ name, active = false }) {
  const Icon = NAV_ICONS[name] || Activity;
  return (
    <span className="mr-comic-icon-tile" data-icon={name} data-active={active ? "true" : "false"}>
      <Icon aria-hidden="true" size={17} strokeWidth={active ? 2.8 : 2.4} />
    </span>
  );
}

const navItems = [
  { href: "/dashboard", label: "Beranda", icon: "home" },
  { href: "/dashboard/endpoint", label: "Endpoint", icon: "api" },
  { href: "/dashboard/providers", label: "Penyedia", icon: "dns" },
  { href: "/dashboard/model-detection", label: "Deteksi Model", icon: "manage_search" },
  { href: "/dashboard/combos", label: "Gabungan", icon: "layers" },
  { href: "/dashboard/usage", label: "Penggunaan", icon: "bar_chart" },
  { href: "/dashboard/parameters", label: "Parameter", icon: "tune" },
];

const debugItems = [
  { href: "/dashboard/console-log", label: "Log Konsol", icon: "terminal" },
];

const systemItems = [
  { href: "/dashboard/automation", label: "Otomatisasi", icon: "smart_toy" },
];

export default function Sidebar({ onClose, collapsed = false, onToggleCollapse }) {
  const { pathname } = useLocation();
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [shutdownCountdown, setShutdownCountdown] = useState(0);
  const { copied, copy } = useCopyToClipboard(2000);

  const INSTALL_CMD = UPDATER_CONFIG.installCmdLatest;

  // Lazy check for new npm version on mount
  useEffect(() => {
    fetch("/api/version")
      .then(res => res.json())
      .then(data => { if (data.hasUpdate) setUpdateInfo(data); })
      .catch(() => {});
  }, []);

  const isActive = (href) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  // Open manual update panel (no countdown yet — user must click Copy to trigger shutdown)
  const handleUpdate = () => {
    setShowUpdateModal(false);
    setIsUpdating(true);
  };

  // Triggered by Copy button inside ManualUpdatePanel: copy + countdown + shutdown
  const handleCopyAndShutdown = async () => {
    try { await navigator.clipboard.writeText(INSTALL_CMD); } catch { /* clipboard blocked */ }
    copy(INSTALL_CMD);
    let remaining = UPDATER_CONFIG.shutdownCountdownSec;
    setShutdownCountdown(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      setShutdownCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        fetch("/api/version/shutdown", { method: "POST" }).catch(() => {});
        setIsDisconnected(true);
      }
    }, 1000);
  };

  const handleCancelUpdate = () => {
    setIsUpdating(false);
    setShutdownCountdown(0);
  };

  // Note: legacy updater poll removed. New flow: copy install cmd + shutdown server,
  // user runs the command manually in another terminal.


  return (
    <>
      <aside className={cn("mr-comic-sidebar flex shrink-0 flex-col border-r border-border-subtle bg-vibrancy backdrop-blur-xl transition-[width] duration-200 min-h-full", collapsed ? "mr-comic-sidebar-collapsed w-[64px]" : "w-[232px]")}>
        {/* Sidebar controls */}
        <div className={cn("flex items-center pt-4 pb-2", collapsed ? "flex-col gap-3 px-3" : "justify-between px-5")}>
          <div className="flex items-center gap-2" aria-label="Status Max Router">
            <span className="mr-comic-status-dot bg-[#ff6b6b]" />
            <span className="mr-comic-status-dot bg-[#ffd166]" />
            <span className="mr-comic-status-dot bg-[#06d6a0]" />
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="mr-comic-sidebar-toggle"
            title={collapsed ? "Buka sidebar" : "Ciutkan sidebar"}
            aria-label={collapsed ? "Buka sidebar" : "Ciutkan sidebar"}
          >
            <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
            
          </button>
        </div>

        {/* Logo */}
        <div className={cn("py-4 flex flex-col gap-2", collapsed ? "px-2 items-center" : "px-4")}>
          <Link to="/dashboard" className={cn("flex items-center", collapsed ? "justify-center" : "gap-3") } title={collapsed ? "9Router V3" : undefined}>
            <img src="/branding/9router-v3-logo.png" alt="9Router V3" className="size-9 rounded-[10px] object-contain" />
            <div className={cn("flex flex-col", collapsed ? "hidden" : "")}>
              <h1 className="text-lg font-semibold tracking-tight text-text-main leading-tight">
                9Router V3
              </h1>
              <span className="text-[10px] text-text-muted mt-0.5 leading-none">by codestorm</span>
              <span className="text-[10px] text-text-muted opacity-75 mt-0.5 leading-none">v{APP_CONFIG.version}</span>
            </div>
          </Link>
          {updateInfo && !collapsed && (
            <div className="flex flex-col gap-1.5 rounded p-1 -m-1">
              <span className="text-xs font-semibold text-green-600 dark:text-amber-500">
                ↑ Versi baru tersedia: v{updateInfo.latestVersion}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowUpdateModal(true)}
                  className="px-2 py-1 rounded bg-green-600 hover:bg-green-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Perbarui sekarang
                </button>
                <button
                  onClick={() => copy(INSTALL_CMD)}
                  title="Salin perintah instalasi"
                  className="flex-1 text-left hover:opacity-80 transition-opacity cursor-pointer min-w-0"
                >
                  <code className="block text-[10px] text-green-600/80 dark:text-amber-400/70 font-mono truncate">
                    {copied ? "✓ tersalin!" : INSTALL_CMD}
                  </code>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigasi */}
        <nav className={cn("flex-1 py-2 space-y-1 overflow-y-auto custom-scrollbar", collapsed ? "px-2" : "px-3")}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={onClose}
              className={cn(
                "mr-comic-nav-item flex items-center rounded-xl transition-all group",
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                isActive(item.href) ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
              aria-current={isActive(item.href) ? "page" : undefined}
              title={collapsed ? item.label : undefined}
            >
              <NavIcon name={item.icon} active={isActive(item.href)} />
              <span className={cn("text-[13px] font-medium", collapsed ? "hidden" : "")}>{item.label}</span>
            </Link>
          ))}

          <div className="pt-3 mt-2 space-y-1">
            <p className={cn("px-4 text-xs font-semibold text-text-muted/60 uppercase tracking-wider mb-2", collapsed ? "hidden" : "")}>Sistem</p>
            {systemItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={onClose}
                className={cn(
                  "mr-comic-nav-item flex items-center rounded-xl transition-all group",
                  collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                  isActive(item.href) ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                )}
                aria-current={isActive(item.href) ? "page" : undefined}
                title={collapsed ? item.label : undefined}
              >
                <NavIcon name={item.icon} active={isActive(item.href)} />
                <span className={cn("text-[13px] font-medium", collapsed ? "hidden" : "")}>{item.label}</span>
              </Link>
            ))}
            {debugItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={onClose}
                className={cn(
                  "mr-comic-nav-item flex items-center rounded-xl transition-all group",
                  collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                  isActive(item.href) ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                )}
                aria-current={isActive(item.href) ? "page" : undefined}
                title={collapsed ? item.label : undefined}
              >
                <NavIcon name={item.icon} active={isActive(item.href)} />
                <span className={cn("text-[13px] font-medium", collapsed ? "hidden" : "")}>{item.label}</span>
              </Link>
            ))}
            <Link
              to="/dashboard/profile"
              onClick={onClose}
              className={cn(
                "mr-comic-nav-item flex items-center rounded-xl transition-all group",
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                isActive("/dashboard/profile") ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
              aria-current={isActive("/dashboard/profile") ? "page" : undefined}
              title={collapsed ? "Pengaturan" : undefined}
            >
              <NavIcon name="settings" active={isActive("/dashboard/profile")} />
              <span className={cn("text-[13px] font-medium", collapsed ? "hidden" : "")}>Pengaturan</span>
            </Link>
          </div>
        </nav>

      </aside>

      {/* Update Confirmation Modal */}
      <ConfirmModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        onConfirm={handleUpdate}
        title="Perbarui 9Router V3"
        message={`Tampilkan perintah instalasi untuk v${updateInfo?.latestVersion || ""}? Perintah dapat disalin, lalu server akan dimatikan untuk instalasi manual.`}
        confirmText="Tampilkan Perintah"
        cancelText="Batal"
        variant="primary"
      />

      {/* Disconnected / Updating Overlay */}
      {(isDisconnected || isUpdating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          {isUpdating ? (
            <ManualUpdatePanel
              latestVersion={updateInfo?.latestVersion}
              installCmd={INSTALL_CMD}
              copied={copied}
              onCopyAndShutdown={handleCopyAndShutdown}
              onCancel={handleCancelUpdate}
              countdown={shutdownCountdown}
              isDisconnected={isDisconnected}
            />
          ) : (
            <div className="text-center p-8">
              <div className="flex items-center justify-center size-16 rounded-full bg-red-500/20 text-red-500 mx-auto mb-4">
                <Power size={32} aria-hidden="true" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Server Terputus</h2>
              <p className="text-text-muted mb-6">Server proksi telah dihentikan.</p>
              <Button variant="secondary" onClick={() => globalThis.location.reload()}>
                Muat Ulang Halaman
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
  collapsed: PropTypes.bool,
  onToggleCollapse: PropTypes.func,
};

function ManualUpdatePanel({ latestVersion, installCmd, copied, onCopyAndShutdown, onCancel, countdown, isDisconnected }) {
  const isCountingDown = countdown > 0;
  return (
    <div className="w-full max-w-lg rounded-xl bg-neutral-900/95 border border-white/10 p-6 text-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center size-11 rounded-full bg-amber-500/20 text-amber-400">
          <Copy size={24} aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Perbarui 9Router V3{latestVersion ? ` ke v${latestVersion}` : ""}</h2>
          <p className="text-xs text-white/60">
            {isDisconnected
              ? "Server berhenti. Tempel perintah ke terminal untuk memasang."
              : isCountingDown
                ? `Perintah tersalin. Server akan berhenti dalam ${countdown} detik...`
                : "Klik tombol di bawah untuk menyalin perintah pemasangan dan mematikan server."}
          </p>
        </div>
      </div>

      <p className="text-sm text-white/80 mb-2">Perintah pemasangan:</p>
      <div className="w-full px-3 py-2 rounded bg-white/5 mb-4">
        <code className="text-xs font-mono text-amber-400 break-all">{installCmd}</code>
      </div>

      <ol className="text-xs text-white/70 space-y-1 list-decimal list-inside mb-4">
        <li>Klik <strong>Salin & Matikan</strong> di bawah.</li>
        <li>Tempel perintah ke terminal lalu tekan Enter.</li>
        <li>Jalankan <code className="px-1 rounded bg-white/10 text-green-400">9router</code> lagi setelah pemasangan.</li>
      </ol>

      {isDisconnected ? (
        <Button variant="secondary" fullWidth onClick={() => globalThis.location.reload()}>
          Muat Ulang Halaman
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isCountingDown}>
            Batal
          </Button>
          <Button variant="primary" fullWidth onClick={onCopyAndShutdown} disabled={isCountingDown}>
            {copied ? "✓ Tersalin — mematikan..." : isCountingDown ? `Mematikan dalam ${countdown} detik` : "Salin & Matikan"}
          </Button>
        </div>
      )}
    </div>
  );
}

ManualUpdatePanel.propTypes = {
  latestVersion: PropTypes.string,
  installCmd: PropTypes.string.isRequired,
  copied: PropTypes.bool,
  onCopyAndShutdown: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  countdown: PropTypes.number,
  isDisconnected: PropTypes.bool,
};
