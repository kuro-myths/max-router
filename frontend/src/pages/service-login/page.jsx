import { ExternalLink, LogIn, UserPlus, ShieldCheck } from "lucide-react";

const services = [
  {
    id: "claude",
    name: "Claude",
    description: "Asisten AI dari Anthropic. Masuk ke akun yang sudah ada atau buat akun baru.",
    loginUrl: "https://claude.ai/login",
    registerUrl: "https://claude.ai/",
    accent: "border-orange-200 bg-orange-50 text-orange-700",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    description: "Masuk atau daftar untuk menggunakan ChatGPT.",
    loginUrl: "https://chatgpt.com/auth/login",
    registerUrl: "https://chatgpt.com/",
    accent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Buka Gemini dan lanjutkan menggunakan akun Google.",
    loginUrl: "https://gemini.google.com/",
    registerUrl: "https://accounts.google.com/",
    accent: "border-blue-200 bg-blue-50 text-blue-700",
  },
  {
    id: "openai-platform",
    name: "OpenAI Platform",
    description: "Kelola proyek dan API key OpenAI melalui portal pengembang resmi.",
    loginUrl: "https://platform.openai.com/",
    registerUrl: "https://platform.openai.com/signup",
    accent: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    id: "anthropic-console",
    name: "Anthropic Console",
    description: "Kelola akses API Anthropic secara terpisah dari login web Claude.",
    loginUrl: "https://console.anthropic.com/",
    registerUrl: "https://console.anthropic.com/",
    accent: "border-amber-200 bg-amber-50 text-amber-800",
  },
];

function ServiceCard({ service }) {
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl border ${service.accent}`}>
          <LogIn size={21} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-text-main">{service.name}</h2>
          <p className="mt-1 text-sm leading-5 text-text-muted">{service.description}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={service.loginUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <LogIn size={16} aria-hidden="true" />
          Masuk
          <ExternalLink size={14} aria-hidden="true" />
        </a>
        <a
          href={service.registerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-semibold text-text-main transition hover:bg-surface"
        >
          <UserPlus size={16} aria-hidden="true" />
          Daftar
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

export default function ServiceLoginPage() {
  return (
    <main className="mx-auto w-full min-w-0 space-y-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Pusat akses akun</p>
        <h1 className="text-xl font-semibold text-text-main sm:text-2xl">Layanan Masuk AI</h1>
        <p className="max-w-3xl text-sm leading-6 text-text-muted">
          Pilih layanan untuk membuka halaman masuk atau pendaftaran resminya. Max Router tidak membaca
          kata sandi, mengambil cookie, atau menyalin sesi dari situs lain.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Daftar layanan AI">
        {services.map((service) => <ServiceCard key={service.id} service={service} />)}
      </section>

      <aside className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={20} aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-text-main">Login web berbeda dari koneksi API</h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Tombol Masuk dan Daftar membuka situs resmi di tab baru. Untuk menggunakan model di dalam Max Router,
            tambahkan penyedia melalui tombol Tambah Kompatibel menggunakan API Base URL, API key, dan model,
            atau gunakan integrasi OAuth resmi bila tersedia. Login ke claude.ai tidak otomatis mengaktifkan API Anthropic.
          </p>
        </div>
      </aside>
    </main>
  );
}
