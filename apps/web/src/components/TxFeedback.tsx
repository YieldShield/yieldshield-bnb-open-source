import type { ReactNode } from "react";
import { CheckIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";

/** Full-bleed pending state shown while a transaction is submitted/confirming. */
export function PendingOverlay({ label = "Confirming…" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-canvas/90 backdrop-blur-sm">
      <Spinner className="h-9 w-9 text-ink" />
      <p className="text-[15px] font-semibold text-body">{label}</p>
    </div>
  );
}

/** Success state with a check pop. `accent` tints the badge (green saver / indigo protector). */
export function SuccessCard({
  accent = "green",
  title,
  children,
}: {
  accent?: "green" | "indigo";
  title: string;
  children: ReactNode;
}) {
  const tint = accent === "indigo" ? "bg-indigo-tint text-indigo" : "bg-green-tint text-green-dark";
  return (
    <div className="animate-fade-up flex flex-col items-center pt-6 text-center">
      <div className={`mb-5 flex h-16 w-16 animate-pop items-center justify-center rounded-pill ${tint}`}>
        <CheckIcon className="h-8 w-8" />
      </div>
      <h1 className="text-[26px] font-extrabold tracking-tight2">{title}</h1>
      <div className="mt-2 max-w-[36ch] text-[15px] leading-relaxed text-body">{children}</div>
    </div>
  );
}
