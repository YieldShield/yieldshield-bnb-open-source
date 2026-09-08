import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { chain } from "@/chain/adapter";
import type { PoolGlyph } from "@/config/pools";

// --- Card -------------------------------------------------------------------
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-hairline bg-surface p-[18px] md:p-6", className)} {...props} />;
}

// --- Buttons ----------------------------------------------------------------
type Variant = "ink" | "green" | "indigo" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  ink: "bg-ink text-white hover:bg-ink/90",
  green: "bg-green text-white hover:bg-green-bright",
  indigo: "bg-indigo text-white hover:bg-indigo-accent",
  secondary: "bg-subtle-2 text-ink hover:bg-hairline",
  ghost: "bg-transparent text-body hover:bg-subtle-2",
};

export function Button({
  variant = "ink",
  className,
  full,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; full?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-[52px] items-center justify-center gap-2 rounded-input px-5 text-[15px] font-bold transition-colors",
        "disabled:cursor-not-allowed disabled:bg-disabled disabled:text-white/80 disabled:hover:bg-disabled",
        full && "w-full",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

// --- Pill / Badge -----------------------------------------------------------
export function Pill({
  tone = "green",
  className,
  children,
}: {
  tone?: "green" | "indigo" | "amber" | "neutral";
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    green: "bg-green-tint text-green-dark",
    indigo: "bg-indigo-tint text-indigo",
    amber: "bg-amber-tint text-amber-deep",
    neutral: "bg-subtle-2 text-body",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[13px] font-semibold tnum",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: "green" | "indigo" | "amber" | "solana" }) {
  const c = { green: "bg-green", indigo: "bg-indigo", amber: "bg-amber", solana: "bg-solana" }[tone];
  return <span className={cn("inline-block h-2 w-2 rounded-full", c)} />;
}

export function ChainBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted", className)}>
      <span className="h-2.5 w-2.5 rounded-[3px] bg-brand" />
      {chain.label}
    </span>
  );
}

// --- Stat tile --------------------------------------------------------------
export function StatTile({
  label,
  value,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: "green" | "indigo" | "neutral";
  sub?: string;
}) {
  const tones = {
    green: "bg-green-tint-2 text-green-dark",
    indigo: "bg-indigo-tint-3 text-indigo",
    neutral: "bg-subtle text-ink",
  } as const;
  return (
    <div className={cn("rounded-input p-3.5", tones[tone])}>
      <div className="text-[11px] font-bold uppercase tracking-[0.3px] opacity-70">{label}</div>
      <div className="mt-1 text-[18px] font-extrabold tnum">{value}</div>
      {sub && <div className="text-[12px] font-medium opacity-70">{sub}</div>}
    </div>
  );
}

// --- Thin bars --------------------------------------------------------------
export function Bar({ pct, tone = "green" }: { pct: number; tone?: "green" | "ink" | "indigo" }) {
  const fill = { green: "bg-gradient-to-r from-green to-green-bright", ink: "bg-ink", indigo: "bg-indigo" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-subtle-2">
      <div className={cn("h-full rounded-pill", fill)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

// --- Asset glyph ------------------------------------------------------------
export function AssetGlyph({ glyph, label, size = 40 }: { glyph: PoolGlyph; label: string; size?: number }) {
  const styles = {
    usdc: "bg-usdc-bg text-usdc-fg",
    jitosol: "bg-jitosol-bg text-jitosol-fg",
    generic: "bg-subtle-2 text-body",
  } as const;
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-chip font-extrabold", styles[glyph])}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {label.slice(0, 1).toUpperCase()}
    </div>
  );
}

// --- Spinner ----------------------------------------------------------------
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5 animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// --- Section label ----------------------------------------------------------
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("section-label", className)}>{children}</div>;
}
