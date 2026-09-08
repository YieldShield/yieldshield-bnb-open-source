import { cn } from "@/lib/cn";

/** Big amount entry with preset chips + optional balance/Max. Sanitizes to a plain decimal. */
export function AmountInput({
  value,
  onChange,
  symbol,
  presets = [],
  accent = "ink",
  balanceLabel,
  onMax,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  symbol: string;
  presets?: number[];
  accent?: "ink" | "indigo";
  balanceLabel?: string;
  onMax?: () => void;
  error?: string | null;
}) {
  const sanitize = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, "");
    const parts = cleaned.split(".");
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
  };

  return (
    <div>
      <div className="flex items-baseline gap-2 rounded-card border border-hairline bg-surface px-5 py-6">
        <input
          inputMode="decimal"
          autoFocus
          placeholder="0"
          value={value}
          onChange={(e) => onChange(sanitize(e.target.value))}
          className="hero-num w-full bg-transparent text-[44px] text-ink outline-none placeholder:text-disabled"
        />
        <span className="text-[18px] font-bold text-muted">{symbol}</span>
      </div>

      <div className="mt-2 flex items-center justify-between px-1">
        {balanceLabel ? <span className="text-[13px] text-muted tnum">{balanceLabel}</span> : <span />}
        {onMax && (
          <button onClick={onMax} className="text-[13px] font-bold text-ink">
            Max
          </button>
        )}
      </div>

      {presets.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => onChange(String(p))}
              className={cn(
                "h-11 rounded-input text-[14px] font-bold tnum transition-colors",
                accent === "indigo"
                  ? "bg-indigo-tint text-indigo hover:bg-indigo-tint-2"
                  : "bg-subtle-2 text-ink hover:bg-hairline",
              )}
            >
              {p.toLocaleString()}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 px-1 text-[13px] font-medium text-amber-deep">{error}</p>}
    </div>
  );
}
