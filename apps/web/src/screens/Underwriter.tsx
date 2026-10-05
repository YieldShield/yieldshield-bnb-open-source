import { parseTokenAmount } from "@/lib/token-amount";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fromBaseUnits, minReceived, type TxIntent } from "@yieldshield/core";
import { AmountInput } from "@/components/AmountInput";
import { Row } from "@/components/Expander";
import { ArrowLeft } from "@/components/icons";
import { TransactionError, PendingOverlay } from "@/components/TxFeedback";
import { Bar, Button, Card, ChainBadge } from "@/components/ui";
import { formatDuration, formatToken } from "@/lib/format";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { useRefreshAll } from "@/data/refresh";
import { usePositions, type ProtectorVM } from "@/data/positions";
import { observationBlocker } from "@/lib/action-availability";
import { useNow } from "@/lib/use-now";

export function Underwriter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const refresh = useRefreshAll();
  const { loading, error: loadError, protector } = usePositions();
  const position = protector.find((p) => p.id === id);

  if (loading) return <div className="h-72 animate-pulse rounded-card bg-subtle" />;
  if (loadError)
    return (
      <Card>
        <p role="alert">Position data is unavailable. Refresh before continuing.</p>
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
      <UnderwriterPosition p={position} refresh={refresh} />
    </div>
  );
}

function UnderwriterPosition({ p, refresh }: { p: ProtectorVM; refresh: () => Promise<unknown> }) {
  const tx = useSubmitTx();
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);
  const stale = observationBlocker(p, now);
  const busy = tx.pending || refreshing;
  const backing = p.view!.backing;
  const shielded = p.view!.shielded;
  const preset = p.view!.preset;
  const dec = backing.decimals;

  const earned = p.claimableCommission;
  const unlockDuration = p.view!.stats.unlockDuration;
  const noticeRemaining = p.isUnlocking && p.availableAt > now ? p.availableAt - now : 0n;
  const noticeProgress =
    p.isUnlocking && unlockDuration > 0n ? 1 - Number(noticeRemaining) / Number(unlockDuration) : 0;
  const ready = !stale && p.isUnlocking && now >= p.availableAt;

  const [withdrawValue, setWithdrawValue] = useState("");
  const parsed = parseTokenAmount(withdrawValue, dec);
  const withdrawAmount = parsed.amount;

  const withdrawError =
    stale ?? parsed.error ?? (withdrawAmount > p.availableToWithdraw ? "More than available to withdraw." : null);
  const isFullWithdraw = withdrawAmount === p.collateral;
  const canWithdraw = withdrawAmount > 0n && minReceived(withdrawAmount) > 0n && !withdrawError && ready && !busy;

  async function run(intent: TxIntent) {
    if (busy || observationBlocker(p, BigInt(Math.floor(Date.now() / 1000)))) return;
    setRefreshing(true);
    try {
      const res = await tx.submit(intent);
      if (res) {
        setWithdrawValue("");
        // The positions hook renders failed reads; a refresh failure cannot undo a mined transaction.
        await refresh().catch(() => undefined);
      }
    } finally {
      setRefreshing(false);
    }
  }

  function withdrawIntent(): TxIntent {
    // Bound the actual backing-token payout to the reviewed amount (0.5% slippage).
    const minOut = minReceived(withdrawAmount);
    return isFullWithdraw
      ? { kind: "withdrawProtector", pool: p.pool, backingToken: backing.token, position: p.id, minOut }
      : {
          kind: "partialWithdrawProtector",
          pool: p.pool,
          backingToken: backing.token,
          position: p.id,
          amount: withdrawAmount,
          minOut,
        };
  }

  return (
    <>
      {tx.pending && <PendingOverlay step={tx.step} txId={tx.txId} phase={tx.phase} label="Confirming…" />}

      <div className="flex items-center justify-between">
        <span className="text-[15px] font-bold text-body">Backing {preset.asset}</span>
        <ChainBadge />
      </div>
      <div className="mt-1 text-[13px] font-semibold text-indigo">Claimable test-token premium</div>
      <div className="hero-num text-[40px] text-indigo">
        {earned === undefined ? "Unavailable" : formatToken(earned, shielded.decimals, shielded.symbol)}
      </div>
      <div className="mt-1 text-[13px] font-semibold text-muted">Read from the contract. No fixed annual return.</div>

      <div className="mt-4">
        <Button
          variant="indigo"
          full
          disabled={busy || !!stale || earned === undefined || earned === 0n}
          onClick={() => run({ kind: "claimCommission", pool: p.pool, shieldedToken: shielded.token, position: p.id })}
        >
          Collect premium
        </Button>
        <p className="mt-1.5 text-center text-[12px] text-muted">
          Collection is subject to contract checks. Test tokens have no redeemable value.
        </p>
      </div>

      <Card className="mt-4">
        <Row label="Collateral supplied" value={formatToken(p.collateral, dec, backing.symbol)} />
        <Row
          label="Available to withdraw"
          value={formatToken(p.availableToWithdraw, dec, backing.symbol)}
          tone="green"
        />
        <Row label="Backing active protection" value={formatToken(p.backingActive, dec, backing.symbol)} tone="muted" />
      </Card>

      <TransactionError error={tx.error} txId={tx.txId} />
      {(stale || refreshing) && (
        <p role="status" className="mt-3 text-[13px] text-muted">
          {refreshing ? "Updating the confirmed balance and withdrawal notice…" : stale}
        </p>
      )}
      <p className="mt-3 text-[13px] text-muted">
        After a partial withdrawal, start a new notice before withdrawing the remaining collateral.
      </p>

      {/* Withdrawal: two-step with notice */}
      {!p.isUnlocking ? (
        <div className="mt-4">
          <Button
            variant="secondary"
            full
            disabled={busy || !!stale || p.collateral === 0n}
            onClick={() => run({ kind: "startUnlock", position: p.id })}
          >
            Start withdrawal notice
          </Button>
          <p className="mt-1.5 text-center text-[12px] text-muted">
            This pool requires {formatDuration(unlockDuration)} notice. Withdrawals also need sufficient unlocked
            collateral and valid prices. Withdrawal timing depends on the deployed pool configuration.
          </p>
        </div>
      ) : (
        <Card className="mt-4">
          <div className="mb-2 flex items-center justify-between text-[13px] font-bold">
            <span className="text-ink">
              {ready ? "Ready to withdraw" : `Available in ${formatDuration(noticeRemaining)}`}
            </span>
            <span className="text-muted tnum">{Math.round(noticeProgress * 100)}%</span>
          </div>
          <Bar pct={Math.max(0, Math.min(100, noticeProgress * 100))} tone="indigo" />
          {ready && (
            <div className="mt-4">
              <AmountInput
                value={withdrawValue}
                onChange={setWithdrawValue}
                symbol={backing.symbol}
                accent="indigo"
                balanceLabel={`Available ${formatToken(p.availableToWithdraw, dec, backing.symbol)}`}
                onMax={() => setWithdrawValue(fromBaseUnits(p.availableToWithdraw, dec))}
                error={withdrawError}
              />
            </div>
          )}
          {withdrawAmount > 0n && (
            <Row label="Minimum received" value={formatToken(minReceived(withdrawAmount), dec, backing.symbol)} />
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              variant="ghost"
              disabled={busy || !!stale}
              onClick={() => run({ kind: "cancelUnlock", position: p.id })}
            >
              Cancel notice
            </Button>
            <Button
              variant="indigo"
              disabled={busy || !ready || !canWithdraw}
              onClick={() => {
                if (canWithdraw && !busy) void run(withdrawIntent());
              }}
            >
              {isFullWithdraw ? "Withdraw all" : "Withdraw"}
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
