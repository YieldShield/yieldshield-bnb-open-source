import { chain } from "@/chain/adapter";
import type { TxPhase } from "@yieldshield/core";
import type { ReactNode } from "react";
import { CheckIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";

/** Full-bleed pending state shown while a transaction is submitted/confirming. */
export function PendingOverlay({
  label = "Confirming…",
  step,
  txId,
  phase,
}: {
  label?: string;
  step?: { index: number; total: number; label: string };
  txId?: string | null;
  phase?: TxPhase;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-canvas/95 px-6 text-center backdrop-blur-sm"
    >
      <Spinner className="h-9 w-9 text-[#0052FF]" />
      {step && (
        <p className="text-[12px] font-bold uppercase tracking-wider text-[#0052FF]">
          Step {step.index} of {step.total}
        </p>
      )}
      <p className="text-[20px] font-bold text-ink">{step?.label ?? label}</p>
      <p className="max-w-[42ch] text-[14px] leading-relaxed text-body">
        {phase === "building"
          ? "We’re checking the action. Review the request when it appears in your wallet."
          : "Waiting for the transaction to be confirmed on Base Sepolia. Don’t submit it again."}
      </p>
      {txId && (
        <a
          href={chain.explorerTxUrl(txId)}
          target="_blank"
          rel="noreferrer"
          className="text-[14px] font-bold text-[#0052FF] underline"
        >
          View transaction progress ↗
        </a>
      )}
    </div>
  );
}

export function TransactionError({ error, txId }: { error: string | null; txId?: string | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="mt-4 rounded-input border border-amber-border bg-amber-tint p-4 text-[13px] leading-relaxed text-amber-deep"
    >
      <p>{error}</p>
      {txId && (
        <a
          href={chain.explorerTxUrl(txId)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block font-bold underline"
        >
          Check the last transaction before retrying ↗
        </a>
      )}
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
