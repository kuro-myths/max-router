import PropTypes from "prop-types";
import { Badge } from "@/shared/components";

const STATUS = {
  ok: { variant: "success", label: "Sehat" },
  limited: { variant: "warning", label: "Kena limit" },
  invalid: { variant: "error", label: "Tidak valid" },
  unknown: { variant: "default", label: "Tidak diketahui" },
};

function formatCount(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("id-ID") : "—";
}

function pair(remaining, limit) {
  if ((remaining === null || remaining === undefined) && (limit === null || limit === undefined)) return "—";
  if (limit === null || limit === undefined) return formatCount(remaining);
  return `${formatCount(remaining)} / ${formatCount(limit)}`;
}

export default function ApiKeyInsightCard({ insight, compact = false }) {
  if (!insight) return null;
  const status = STATUS[insight.status] || STATUS.unknown;
  const requests = insight.rateLimit?.requests;
  const tokens = insight.rateLimit?.tokens;
  const quota = insight.quota;

  return (
    <div className="w-full rounded-md border border-border/70 bg-bg/40 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={status.variant} size="sm" dot>{status.label}</Badge>
        <span className="text-[11px] text-text-main">
          {insight.modelCount == null ? "Jumlah model tidak diketahui" : `${formatCount(insight.modelCount)} model`}
        </span>
        {requests && (
          <span className="text-[11px] text-text-muted">Request {pair(requests.remaining, requests.limit)}</span>
        )}
        {quota && (quota.remaining != null || quota.used != null) && (
          <span className="text-[11px] text-text-muted">
            Kuota {pair(quota.remaining, quota.limit)}{quota.used != null ? ` · terpakai ${formatCount(quota.used)}` : ""}
          </span>
        )}
        {insight.latencyMs != null && (
          <span className="text-[10px] text-text-muted">{formatCount(insight.latencyMs)} ms</span>
        )}
      </div>
      {!compact && (
        <div className="mt-2 flex flex-col gap-1.5">
          {tokens && (
            <p className="text-[11px] text-text-muted">Token {pair(tokens.remaining, tokens.limit)}{tokens.reset ? ` · reset ${tokens.reset}` : ""}</p>
          )}
          {requests?.reset && <p className="text-[11px] text-text-muted">Reset request: {requests.reset}</p>}
          {insight.rateLimit?.retryAfter && <p className="text-[11px] text-text-muted">Coba lagi: {insight.rateLimit.retryAfter}</p>}
          {quota?.plan && <p className="text-[11px] text-text-muted">Paket: {quota.plan}{quota.label ? ` · ${quota.label}` : ""}</p>}
          {Array.isArray(insight.owners) && insight.owners.length > 0 && (
            <p className="text-[11px] text-text-muted">
              Pemilik model: {insight.owners.map((owner) => `${owner.name} ${formatCount(owner.count)}`).join(" · ")}
            </p>
          )}
          {Array.isArray(insight.modelSample) && insight.modelSample.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {insight.modelSample.map((model) => (
                <span key={model} className="max-w-full truncate rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] text-text-main dark:bg-white/5" title={model}>{model}</span>
              ))}
            </div>
          )}
          {insight.note && <p className="text-[11px] text-text-muted">{insight.note}</p>}
          {insight.error && insight.status !== "ok" && <p className="text-[11px] text-red-500 break-words">{insight.error}</p>}
        </div>
      )}
    </div>
  );
}

ApiKeyInsightCard.propTypes = {
  insight: PropTypes.shape({
    status: PropTypes.string,
    modelCount: PropTypes.number,
    modelSample: PropTypes.arrayOf(PropTypes.string),
    owners: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string, count: PropTypes.number })),
    rateLimit: PropTypes.object,
    quota: PropTypes.object,
    latencyMs: PropTypes.number,
    note: PropTypes.string,
    error: PropTypes.string,
  }),
  compact: PropTypes.bool,
};
