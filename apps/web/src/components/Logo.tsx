/** YieldShield's paired mark: the position and its backing, in BNB yellow. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="6" fill="#171A1E" />
      <rect x="11" y="11" width="18" height="18" rx="6" fill="#F0B90B" />
      <rect x="11" y="11" width="10" height="10" rx="4" fill="#171A1E" fillOpacity="0.4" />
    </svg>
  );
}
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={size} />
      <span className="text-[18px] font-extrabold tracking-tight2 text-ink">YieldShield</span>
      <span className="rounded bg-brand-tint px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-deep">
        BNB
      </span>
    </div>
  );
}
