import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [githubMenuOpen, setGithubMenuOpen] = useState(false);
  const githubMenuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!githubMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (githubMenuRef.current && !githubMenuRef.current.contains(event.target)) {
        setGithubMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setGithubMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [githubMenuOpen]);

  const closeMenus = () => {
    setMobileMenuOpen(false);
    setGithubMenuOpen(false);
  };

  return (
    <nav className="fixed inset-x-0 top-0 z-[100] w-full border-b border-[#3a2f27] bg-[#181411]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-3 border-none bg-transparent p-0"
          onClick={() => {
            closeMenus();
            navigate("/");
          }}
          aria-label="Kembali ke beranda"
        >
          <img src="/branding/9router-v3-logo.png" alt="9Router V3" className="size-8 object-contain" />
          <span className="text-xl font-bold tracking-tight text-white">9Router V3</span>
        </button>

        <div className="hidden items-center gap-8 md:flex">
          <a className="text-sm font-medium text-gray-300 transition-colors hover:text-white" href="#features">Fitur</a>
          <a className="text-sm font-medium text-gray-300 transition-colors hover:text-white" href="#how-it-works">Cara Kerja</a>
          <a
            className="text-sm font-medium text-gray-300 transition-colors hover:text-white"
            href="https://github.com/decolua/9router#readme"
            target="_blank"
            rel="noopener noreferrer"
          >
            Dokumentasi
          </a>

          <div className="relative" ref={githubMenuRef}>
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-medium text-gray-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97815] focus-visible:ring-offset-2 focus-visible:ring-offset-[#181411]"
              onClick={() => setGithubMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={githubMenuOpen}
            >
              GitHub
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                {githubMenuOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}
              </span>
            </button>
            {githubMenuOpen && (
              <div
                className="absolute right-0 top-full z-[110] mt-3 w-52 rounded-xl border border-[#3a2f27] bg-[#211b16] p-2 shadow-2xl"
                role="menu"
              >
                <a
                  className="block rounded-lg px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-[#33271e] hover:text-white"
                  href="https://github.com/decolua/9router"
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  onClick={closeMenus}
                >
                  <span className="flex items-center justify-between gap-3">
                    Repository <span className="material-symbols-outlined text-base" aria-hidden="true">open_in_new</span>
                  </span>
                </a>
                <a
                  className="block rounded-lg px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-[#33271e] hover:text-white"
                  href="https://github.com/decolua/9router#readme"
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  onClick={closeMenus}
                >
                  Dokumentasi
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              closeMenus();
              navigate("/dashboard");
            }}
            className="hidden h-9 items-center justify-center rounded-lg bg-[#f97815] px-4 text-sm font-bold text-[#181411] shadow-[0_0_15px_rgba(249,120,21,0.3)] transition-all hover:bg-[#e0650a] sm:flex"
          >
            Get Started
          </button>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97815] md:hidden"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-menu"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {mobileMenuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div
          id="mobile-navigation-menu"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-[#3a2f27] bg-[#181411] shadow-xl md:hidden"
        >
          <div className="flex flex-col gap-1 p-4">
            <a className="rounded-lg px-3 py-3 text-sm font-medium text-gray-200 transition-colors hover:bg-white/5 hover:text-white" href="#features" onClick={closeMenus}>Fitur</a>
            <a className="rounded-lg px-3 py-3 text-sm font-medium text-gray-200 transition-colors hover:bg-white/5 hover:text-white" href="#how-it-works" onClick={closeMenus}>Cara Kerja</a>
            <a className="rounded-lg px-3 py-3 text-sm font-medium text-gray-200 transition-colors hover:bg-white/5 hover:text-white" href="https://github.com/decolua/9router#readme" target="_blank" rel="noopener noreferrer" onClick={closeMenus}>Dokumentasi</a>
            <a className="rounded-lg px-3 py-3 text-sm font-medium text-gray-200 transition-colors hover:bg-white/5 hover:text-white" href="https://github.com/decolua/9router" target="_blank" rel="noopener noreferrer" onClick={closeMenus}>GitHub ↗</a>
            <button
              type="button"
              onClick={() => {
                closeMenus();
                navigate("/dashboard");
              }}
              className="mt-2 h-10 rounded-lg bg-[#f97815] px-4 text-sm font-bold text-[#181411] transition-colors hover:bg-[#e0650a]"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
