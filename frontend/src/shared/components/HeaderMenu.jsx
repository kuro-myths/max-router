
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import ChangelogModal from "./ChangelogModal";
import { ConfirmModal } from "./Modal";

function MenuItem({ icon, label, onClick, trailing, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors ${
        danger
          ? "text-red-500 hover:bg-red-500/10"
          : "text-text-main hover:bg-black/5 dark:hover:bg-white/5"
      }`}
    >
      <span className={`material-symbols-outlined text-[20px] ${danger ? "" : "text-text-muted"}`}>
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {trailing && <span className="text-base">{trailing}</span>}
    </button>
  );
}

MenuItem.propTypes = {
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  trailing: PropTypes.node,
  danger: PropTypes.bool,
};

export default function HeaderMenu({ onLogout, isLoggedIn = true }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const menuRef = useRef(null);

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await fetch("/api/version/shutdown", { method: "POST" });
    } catch (e) {
      // Expected to fail as server shuts down; ignore error
    }
    setIsShuttingDown(false);
    setShutdownOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="flex size-9 sm:size-10 items-center justify-center rounded-xl border border-primary/15 bg-surface/70 text-text-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
          title="Menu cepat"
          aria-label="Buka menu cepat"
        >
          <span className="material-symbols-outlined">grid_view</span>
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-[min(88vw,280px)] bg-surface border border-primary/20 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden py-1">
            <div className="border-b border-border-subtle px-4 py-3"><p className="text-sm font-bold text-text-main">Menu cepat</p><p className="mt-0.5 text-[11px] text-text-muted">Pintasan halaman dan tindakan</p></div>
            {[{ icon: "home", label: "Beranda", path: "/dashboard" }, { icon: "dns", label: "Penyedia AI", path: "/dashboard/providers" }, { icon: "data_usage", label: "Penggunaan & Analitik", path: "/dashboard/usage" }, { icon: "tune", label: "Parameter", path: "/dashboard/parameters" }].map((item) => (
              <MenuItem key={item.path} icon={item.icon} label={item.label} onClick={() => { close(); navigate(item.path); }} />
            ))}
            <div className="my-1 border-t border-border-subtle" />
            <MenuItem
              icon="history"
              label="Catatan Perubahan"
              onClick={() => { close(); setChangelogOpen(true); }}
            />
            {isLoggedIn && (
              <MenuItem
                icon="power_settings_new"
                label="Matikan Server"
                danger
                onClick={() => { close(); setShutdownOpen(true); }}
              />
            )}
            {isLoggedIn ? (
              <MenuItem
                icon="logout"
                label="Keluar"
                danger
                onClick={() => { close(); onLogout(); }}
              />
            ) : (
              <MenuItem
                icon="login"
                label="Masuk"
                onClick={() => { close(); window.location.href = "/login?force=true"; }}
              />
            )}
          </div>
        )}
      </div>

      <ChangelogModal isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <ConfirmModal
        isOpen={shutdownOpen}
        onClose={() => setShutdownOpen(false)}
        onConfirm={handleShutdown}
        title="Matikan Proksi"
        message="Yakin ingin mematikan server proksi?"
        confirmText="Matikan"
        cancelText="Batal"
        variant="danger"
        loading={isShuttingDown}
      />
    </>
  );
}

HeaderMenu.propTypes = {
  onLogout: PropTypes.func.isRequired,
  isLoggedIn: PropTypes.bool,
};
