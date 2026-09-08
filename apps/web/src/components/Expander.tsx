import { useState, type ReactNode } from "react";
import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/cn";

/** Collapsible "Advanced & on-chain details" panel — progressive disclosure of chain machinery. */
export function Expander({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-card border border-hairline bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-[14px] font-bold text-ink"
      >
        {title}
        <ChevronDown className={cn("h-5 w-5 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-hairline px-4 py-3.5">{children}</div>}
    </div>
  );
}

/** A label/value row used inside expanders and review panels. */
export function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: "green" | "indigo" | "muted" }) {
  const valueClass =
    tone === "green"
      ? "text-green-dark"
      : tone === "indigo"
        ? "text-indigo"
        : tone === "muted"
          ? "text-muted"
          : "text-ink";
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[14px]">
      <span className="text-body">{label}</span>
      <span className={cn("text-right font-semibold tnum", valueClass)}>{value}</span>
    </div>
  );
}
