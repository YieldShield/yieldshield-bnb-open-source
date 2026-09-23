import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fromBaseUnits, minReceived, toBaseUnits } from "@yieldshield/core";
import { AmountInput } from "@/components/AmountInput";
import { ArrowLeft } from "@/components/icons";
import { Row } from "@/components/Expander";
import { TransactionError, PendingOverlay, SuccessCard } from "@/components/TxFeedback";
import { Bar, Button, Card, ChainBadge, Pill } from "@/components/ui";
import { formatDate, formatToken, formatUsd8 } from "@/lib/format";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { usePositions, type ShieldVM } from "@/data/positions";
import { VOCAB } from "@/vocab";

export function PositionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(false);
  const { loading, error: loadError, shield } = usePositions();
  const position = shield.find((p) => p.id === id);

  if (completed)
    return (
      <>
        <SuccessCard title="Test withdrawal confirmed.">
          Check the transaction receipt and wallet for the exact amount received.
        </SuccessCard>
        <Button variant="ink" full className="mt-5" onClick={() => navigate("/positions")}>
          Done
        </Button>
      </>
    );
  if (loading) return <div className="h-72 animate-pulse rounded-card bg-subtle" />;
  if (loadError)
    return (
      <Card>
        <p role="alert">Position data or a verified withdrawal quote is unavailable. Refresh before continuing.</p>
      </Card>
    );
  if (!position || !position.view)
    return (
      <Card>
        <p className="text-body">This position isn't available.</p>
      </Card>
    );

  return (
    <div className="animate-fade-up">
      <button onClick={() => navigate("/positions")} className="mb-5 flex items-center gap-1.5 text-[14px] text-body">
        <ArrowLeft className="h-4.5 w-4.5" /> Home
      </button>
      <SaverPosition p={position} onDone={() => setCompleted(true)} />
    </div>
  );
}

function SaverPosition({ p, onDone }: { p: ShieldVM; onDone: () => void }) {
  const navigate = useNavigate();
  const tx = useSubmitTx();
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawValue, setWithdrawValue] = useState("");

  const dec = p.view!.shielded.decimals;
  const sym = p.view?.shielded.symbol ?? "";
  const preset = p.view?.preset;
  const valueLabel = p.currentValueUsd === null ? "Unavailable" : formatUsd8(p.currentValueUsd);
  const coverage = p.view!.stats.coverageBps === null ? null : Number(p.view!.stats.coverageBps) / 100;
  const protectors = p.view ? Number(p.view.stats.protectorPositionCount) : 0;

  const withdrawAmount = useMemo(() => {
    try {
      return withdrawValue ? toBaseUnits(withdrawValue, dec) : 0n;
    } catch {
      return 0n;
    }
  }, [withdrawValue, dec]);
  const withdrawError = withdrawAmount > p.withdrawableNet ? "More than your withdrawable balance." : null;
  const canWithdraw = withdrawAmount > 0n && minReceived(withdrawAmount) > 0n && !withdrawError && !p.view!.paused;
  const isFullExit = withdrawAmount >= p.withdrawableNet;

  async function confirmWithdraw() {
    if (!canWithdraw || tx.pending) return;
    const shieldedToken = p.view!.shielded.token;
    const res = await tx.submit(
      isFullExit
        ? {
            kind: "withdrawShielded",
            pool: p.pool,
            shieldedToken,
            position: p.id,
            minOut: minReceived(withdrawAmount),
          }
        : {
            kind: "partialWithdrawShielded",
            pool: p.pool,
            shieldedToken,
            position: p.id,
            amount: withdrawAmount,
            minOut: minReceived(withdrawAmount),
          },
    );
    if (res) onDone();
  }

  return (
    <>
      {tx.pending && <PendingOverlay step={tx.step} txId={tx.txId} phase={tx.phase} label="Confirming withdrawal…" />}

      <div className="flex items-center justify-between">
        <span className="text-[15px] font-bold text-body">{preset?.asset ?? sym} savings</span>
        <ChainBadge />
      </div>
      <div className="mt-1 hero-num text-[44px]">{valueLabel}</div>
      <div className="mt-2">
        <Pill tone="amber">Early alpha · protection can fail</Pill>
      </div>

      <Card className="mt-5">
        <Row label="Deposited" value={formatToken(p.deposited, dec, sym)} />
        <Row label="Test-token oracle value" value={valueLabel} />
        <Row
          label="Price appreciation before fees"
          value={p.earnedUsd === null ? "Unavailable" : formatUsd8(p.earnedUsd)}
        />
        <Row label="Estimated net withdrawal" value={formatToken(p.withdrawableNet, dec, sym)} />
      </Card>

      <Card className="mt-3.5 bg-green-tint-2">
        <div className="mb-2 text-[13px] font-bold text-green-dark tnum">
          {coverage === null ? "Collateral coverage unavailable" : `Collateral coverage ${Math.round(coverage)}%`}
        </div>
        {coverage !== null && <Bar pct={Math.min(100, coverage)} tone="green" />}
        <p className="mt-3 text-[13.5px] leading-relaxed text-green-dark/90">
          A {p.view!.backing.symbol} exit{" "}
          {p.protectedExitUnlocked
            ? "has passed its time gate"
            : `unlocks after ${formatDate(p.protectedExitUnlockTime)}`}
          . Payouts depend on verified prices and collateral from {protectors.toLocaleString()} open backing positions.
          Test tokens have no redeemable value.
        </p>
      </Card>

      <TransactionError error={tx.error} txId={tx.txId} />

      {withdrawing ? (
        <Card className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[15px] font-bold text-ink">Withdraw {sym}</span>
            <button onClick={() => setWithdrawing(false)} className="text-[13px] font-semibold text-muted">
              Cancel
            </button>
          </div>
          <AmountInput
            value={withdrawValue}
            onChange={setWithdrawValue}
            symbol={sym}
            balanceLabel={`Withdrawable ${formatToken(p.withdrawableNet, dec, sym)}`}
            onMax={() => setWithdrawValue(fromBaseUnits(p.withdrawableNet, dec))}
            error={withdrawError}
          />
          <Row label="Minimum received" value={formatToken(minReceived(withdrawAmount), dec, sym)} />
          <div className="mt-4">
            <Button variant="ink" full disabled={!canWithdraw || tx.pending} onClick={confirmWithdraw}>
              {isFullExit ? "Withdraw all & close" : "Withdraw"}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          <Button
            variant="green"
            full
            disabled={p.view!.paused || !p.protectedExitUnlocked}
            onClick={() => navigate(`/activate/${p.id}`)}
            className="border border-green bg-transparent text-green-dark hover:bg-green-tint"
          >
            🛡 {VOCAB.activate}
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" disabled={p.view!.paused} onClick={() => navigate(`/deposit?pool=${p.pool}`)}>
              {VOCAB.addMoney}
            </Button>
            <Button
              variant="secondary"
              disabled={p.view!.paused || p.withdrawableNet === 0n}
              onClick={() => setWithdrawing(true)}
            >
              {VOCAB.withdraw}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
