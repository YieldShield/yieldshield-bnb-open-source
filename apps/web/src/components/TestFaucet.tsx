import { useEffect, useState } from "react";
import useSWR from "swr";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui";
import { PendingOverlay, TransactionError } from "@/components/TxFeedback";
import { useFaucet } from "@/chain/faucet";
import { useWalletConnection } from "@/chain/wallet";
import { useSubmitTx } from "@/chain/useSubmitTx";

export function TestFaucet() {
  const faucet = useFaucet();
  const { address } = useWalletConnection();
  const tx = useSubmitTx();
  const { data, error, isLoading, mutate } = useSWR(
    faucet.enabled && faucet.status && address ? ["bsc-faucet", faucet.address, address] : null,
    () => faucet.status!(address!),
    { refreshInterval: 10000, shouldRetryOnError: false },
  );
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!faucet.enabled) return null;
  const fresh = !!data && !error && data.validUntil > now;
  const canClaim = fresh && data.ready && data.nativeBalance > 0n && !tx.pending;
  const cooldown = data?.tokens.filter((t) => t.nextDripTime > now).map((t) => t.nextDripTime) ?? [];
  const next = cooldown.length ? Math.min(...cooldown) : null;
  async function claim() {
    if (!canClaim || !address) return;
    await tx.submit({ kind: "faucetDrip", recipient: address });
    await mutate();
  }
  return (
    <div className="mb-4 rounded-hero border border-brand/25 bg-brand-tint p-5">
      {tx.pending && <PendingOverlay step={tx.step} txId={tx.txId} phase={tx.phase} label="Claiming test tokens…" />}
      <h2 className="text-[18px] font-extrabold">Free tokens for the demo</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-body">
        Claim 5 tWBNB and 10,000 TestUSDC. These synthetic tokens have no monetary value. One claim per token per wallet
        every 24 hours.
      </p>
      <p className="mt-3 text-[13px] text-body" role="status">
        {isLoading
          ? "Checking faucet inventory and your wallet…"
          : !fresh
            ? "Faucet status is unavailable. Refresh before claiming."
            : data.nativeBalance === 0n
              ? "Add test BNB to your wallet for network fees first."
              : data.ready
                ? "Test tokens are available for your wallet."
                : next
                  ? `Next claim: ${new Date(next * 1000).toLocaleString()}.`
                  : "The faucet needs more test tokens. Please try again later."}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="ink" disabled={!canClaim} onClick={() => void claim()}>
          Claim test tokens
        </Button>
        <Button variant="ghost" disabled={isLoading || tx.pending} onClick={() => void mutate()}>
          Refresh status
        </Button>
      </div>
      <TransactionError error={tx.error} txId={tx.txId} />
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px] font-bold">
        <a href="https://www.bnbchain.org/en/testnet-faucet" target="_blank" rel="noreferrer" className="underline">
          Get test BNB for fees ↗
        </a>
        <Link to="/testnet" className="underline">
          Read the demo guide
        </Link>
      </div>
    </div>
  );
}
