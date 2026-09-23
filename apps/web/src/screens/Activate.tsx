import { useEffect, useState } from "react";
import useSWR from "swr";
import { reader } from "@/chain/adapter";
import { useNavigate, useParams } from "react-router-dom";
import { minReceived } from "@yieldshield/core";
import { Row } from "@/components/Expander";
import { ShieldIcon } from "@/components/icons";
import { TransactionError, PendingOverlay, SuccessCard } from "@/components/TxFeedback";
import { Button, Card } from "@/components/ui";
import { formatDate, formatToken } from "@/lib/format";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { usePositions, type ShieldVM } from "@/data/positions";
import { VOCAB } from "@/vocab";

export function Activate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(false);
  const { loading, error: loadError, shield } = usePositions();
  const position = shield.find((p) => p.id === id);

  if (completed)
    return (
      <>
        <SuccessCard title="Test-token exit confirmed.">
          Check the confirmed receipt and your wallet for the exact amount received.
        </SuccessCard>
        <Button variant="ink" full className="mt-5" onClick={() => navigate("/")}>
          Done
        </Button>
      </>
    );
  if (loading) return <div className="h-72 animate-pulse rounded-card bg-subtle" />;
  if (loadError)
    return (
      <Card>
        <p role="alert">Position data or pricing is unavailable. Refresh before continuing.</p>
      </Card>
    );
  if (!position || !position.view)
    return (
      <Card>
        <p className="text-body">This position isn't available.</p>
      </Card>
    );
  return <ActivatePanel p={position} onClose={() => navigate(-1)} onDone={() => setCompleted(true)} />;
}

function ActivatePanel({ p, onClose, onDone }: { p: ShieldVM; onClose: () => void; onDone: () => void }) {
  const tx = useSubmitTx();

  const backing = p.view!.backing;
  const shielded = p.view!.shielded;

  const {
    data: quote,
    error: quoteError,
    isLoading: quoting,
    mutate,
  } = useSWR(
    ["protected-exit-quote", p.id, tx.owner],
    async () => {
      if (!reader.getProtectedExitQuote) throw new Error("A verified exit quote is unavailable on this deployment.");
      return reader.getProtectedExitQuote(p.id);
    },
    { refreshInterval: 10000, revalidateOnFocus: true },
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const fresh =
    quote &&
    !quoteError &&
    quote.token.toLowerCase() === backing.token.toLowerCase() &&
    now - Number(quote.quotedAt) * 1000 < 30000 &&
    now >= Number(quote.quotedAt) * 1000;
  const estReceive = quote?.amount ?? 0n;
  const minOut = minReceived(estReceive);
  const canConfirm = !!fresh && minOut > 0n && p.protectedExitUnlocked && !p.view!.paused && !tx.pending;

  async function confirm() {
    if (!canConfirm || !quote || Date.now() - Number(quote.quotedAt) * 1000 >= 30000) return;
    const res = await tx.submit({
      kind: "activateShielded",
      pool: p.pool,
      shieldedToken: shielded.token,
      backingToken: backing.token,
      position: p.id,
      minOut,
    });
    if (res) onDone();
  }

  return (
    <div className="md:fixed md:inset-0 md:z-40 md:flex md:items-center md:justify-center md:bg-green/15 md:p-4 md:backdrop-blur-sm">
      <div className="animate-fade-up rounded-hero bg-green-tint-2 p-6 md:w-full md:max-w-[440px] md:p-8 md:shadow-modal">
        {tx.pending && (
          <PendingOverlay step={tx.step} txId={tx.txId} phase={tx.phase} label="Confirming backing-token exit…" />
        )}

        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-pill bg-green-tint text-green-dark">
          <ShieldIcon className="h-7 w-7" />
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight2">Exit into the backing token.</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-green-dark/90">
          Close this test position for {backing.symbol}, using its verified oracle price and the position’s collateral
          cap. The token may depeg. Payouts depend on collateral, pricing and contract checks.
        </p>

        <Card className="mt-5 border-none">
          <Row label="Position tokens" value={formatToken(p.deposited, shielded.decimals, shielded.symbol)} />
          <Row
            label="Quoted payout"
            value={fresh ? `≈ ${formatToken(estReceive, backing.decimals, backing.symbol)}` : "Unavailable"}
            tone="green"
          />
          <Row
            label="Minimum received"
            value={fresh ? formatToken(minOut, backing.decimals, backing.symbol) : "Unavailable"}
            tone="muted"
          />
          <Row
            label="Availability"
            value={
              p.protectedExitUnlocked
                ? "Time gate passed · other checks apply"
                : `From ${formatDate(p.protectedExitUnlockTime)}`
            }
            tone="muted"
          />
        </Card>

        <p className="mt-3 text-[13px] leading-relaxed text-green-dark">
          Early alpha. Test tokens have no redeemable value. This is not insurance; contract and oracle failures can
          cause a full loss.
        </p>
        {(!fresh || quoting) && (
          <p role="status" className="mt-3 text-[13px] text-amber-deep">
            {quoting ? "Checking the on-chain quote…" : "A fresh verified quote is unavailable. The exit is disabled."}
          </p>
        )}
        <button className="mt-2 text-[13px] font-semibold underline" onClick={() => void mutate()}>
          Refresh quote
        </button>
        <TransactionError error={tx.error} txId={tx.txId} />

        <div className="mt-5 flex flex-col gap-3">
          <Button variant="green" full onClick={confirm} disabled={!canConfirm}>
            {p.protectedExitUnlocked ? VOCAB.activate : `Unlocks ${formatDate(p.protectedExitUnlockTime)}`}
          </Button>
          <Button variant="ghost" full onClick={onClose}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
