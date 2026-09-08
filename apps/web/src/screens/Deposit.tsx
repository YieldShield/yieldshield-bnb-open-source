import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fromBaseUnits, minReceived, toBaseUnits, type PositionId } from "@yieldshield/core";
import { Expander, Row } from "@/components/Expander";
import { AmountInput } from "@/components/AmountInput";
import { ArrowLeft } from "@/components/icons";
import { PendingOverlay, SuccessCard } from "@/components/TxFeedback";
import { Button, Card } from "@/components/ui";
import { PoolCard } from "@/components/PoolCard";
import { formatDate, formatBps, formatToken } from "@/lib/format";
import { chain } from "@/chain/adapter";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { useTokenBalance } from "@/data/balance";
import { usePool, usePools, type PoolView } from "@/data/pools";
import { VOCAB } from "@/vocab";

export function Deposit() {
  const [params] = useSearchParams();
  const poolId = params.get("pool") ?? undefined;
  const { loading, error: loadError, pool } = usePool(poolId);

  if (!poolId) return <PickPool />;
  if (loading) return <div className="h-72 animate-pulse rounded-card bg-subtle" />;
  if (loadError)
    return (
      <Card>
        <p role="alert" className="text-body">
          Pool data is unavailable. Refresh before depositing.
        </p>
      </Card>
    );
  if (!pool)
    return (
      <Card>
        <p className="text-body">This pool isn't available.</p>
      </Card>
    );
  return <DepositFlow pool={pool} />;
}

function PickPool() {
  const navigate = useNavigate();
  const { data, loading, error } = usePools();
  const open = data.filter((p) => !p.paused);
  if (loading) return <Card>Loading pools…</Card>;
  if (error)
    return (
      <Card>
        <p role="alert">Pool data is unavailable. Refresh before depositing.</p>
      </Card>
    );
  return (
    <div className="animate-fade-up">
      <h1 className="mb-4 text-[26px] font-extrabold tracking-tight2">Choose a pool</h1>
      {open.length === 0 && <Card>No pools are currently available for deposits.</Card>}
      <div className="grid gap-3.5 md:grid-cols-2">
        {open.map((p) => (
          <div key={p.address} onClick={() => navigate(`/deposit?pool=${p.address}`)}>
            <PoolCard pool={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DepositFlow({ pool }: { pool: PoolView }) {
  const navigate = useNavigate();
  const { shielded, preset, stats } = pool;
  const tx = useSubmitTx();

  const [step, setStep] = useState<"amount" | "review" | "success">("amount");
  const [value, setValue] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [createdPosition, setCreatedPosition] = useState<PositionId | null>(null);
  const { balance, loading: balanceLoading } = useTokenBalance(shielded.token);

  const amountBase = useMemo(() => {
    try {
      return value ? toBaseUnits(value, shielded.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [value, shielded.decimals]);

  const minDep = stats.shieldedMinDeposit;
  const maxDep = stats.shieldedMaxDeposit;
  const full = stats.capacityBps !== null && stats.capacityBps >= 10_000n;

  const error = pool.paused
    ? "Deposits are currently unavailable for this pool."
    : balanceLoading
      ? "Checking wallet balance…"
      : balance === null
        ? "Wallet balance is unavailable. Refresh before continuing."
        : full
          ? "This pool is full right now."
          : amountBase > 0n && amountBase < minDep
            ? `Minimum is ${formatToken(minDep, shielded.decimals, shielded.symbol)}.`
            : maxDep > 0n && amountBase > maxDep
              ? `Maximum is ${formatToken(maxDep, shielded.decimals, shielded.symbol)}.`
              : balance !== null && amountBase > balance
                ? "More than your balance."
                : null;

  const canContinue = amountBase > 0n && minReceived(amountBase, slippageBps) > 0n && !error;
  const unlockDate = formatDate(BigInt(Math.floor(Date.now() / 1000)) + stats.minimumPoolTime);

  async function confirm() {
    if (!canContinue || tx.pending) return;
    const res = await tx.submit({
      kind: "depositShielded",
      pool: pool.address,
      shieldedToken: shielded.token,
      backingToken: pool.backing.token,
      amount: amountBase,
      minReceived: minReceived(amountBase, slippageBps),
    });
    if (res) {
      setCreatedPosition(res.positionId ?? null);
      setStep("success");
    }
  }

  if (step === "success") {
    return (
      <div className="animate-fade-up">
        <SuccessCard title="Test deposit confirmed.">
          Your test-token deposit was confirmed on {chain.label}. View the receipt for the exact amount and unlock time.
          Alpha protection can fail and returns are not guaranteed.
        </SuccessCard>
        <div className="mx-auto mt-8 flex max-w-[360px] flex-col gap-3">
          {createdPosition && (
            <Button variant="ink" full onClick={() => navigate(`/position/${createdPosition}`)}>
              View position
            </Button>
          )}
          <Button variant="secondary" full onClick={() => navigate("/")}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {tx.pending && <PendingOverlay label="Confirming your deposit…" />}

      <button
        onClick={() => (step === "review" ? setStep("amount") : navigate(-1))}
        className="mb-5 flex items-center gap-1.5 text-[14px] text-body"
      >
        <ArrowLeft className="h-4.5 w-4.5" /> Back
      </button>

      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-[24px] font-extrabold tracking-tight2">{VOCAB.addMoney}</h1>
      </div>
      <p className="mb-5 text-[14px] text-body">{preset.asset} · Base Sepolia test-token position</p>

      {step === "amount" ? (
        <>
          <AmountInput
            value={value}
            onChange={setValue}
            symbol={shielded.symbol}
            presets={[100, 500, 1000]}
            balanceLabel={
              balance !== null ? `Balance ${formatToken(balance, shielded.decimals, shielded.symbol)}` : undefined
            }
            onMax={balance !== null ? () => setValue(fromBaseUnits(balance, shielded.decimals)) : undefined}
            error={error}
          />
          <p className="mt-3 px-1 text-[13px] text-body">
            Test tokens have no redeemable value. Stock price gains and protection are not guaranteed.
          </p>
          <div className="mt-6">
            <Button variant="ink" full disabled={!canContinue} onClick={() => setStep("review")}>
              Review
            </Button>
          </div>
        </>
      ) : (
        <>
          <Card>
            <Row label="Deposit" value={formatToken(amountBase, shielded.decimals, shielded.symbol)} />
            <Row label="Pool" value={`${preset.asset} · ${chain.label}`} />
            <Row label="Annual return" value="Not established" tone="muted" />
            <Row label="Backer share of gains" value={formatBps(stats.premiumRateBp)} />
            <Row label="Pool fee on gains" value={formatBps(stats.poolFeeBp)} />
            <Row label="Protocol fee on gains" value={formatBps(stats.protocolFeeBp)} />
            <Row label="Network fee" value="Shown in your wallet · test ETH" tone="muted" />
          </Card>

          <div className="mt-3.5 rounded-card bg-green-tint-2 p-4 text-[13.5px] leading-relaxed text-green-dark">
            Fees apply to positive gains. A backing-token exit may become available after {unlockDate}, subject to
            available collateral, oracle prices and contract checks. This unaudited alpha can lose the full deposit.
          </div>

          <div className="mt-3.5">
            <Expander title="Advanced">
              <Row label="Max slippage" value={`${(slippageBps / 100).toFixed(2)}%`} />
              <div className="flex gap-2 pt-1">
                {[10, 50, 100].map((b) => (
                  <button
                    key={b}
                    onClick={() => setSlippageBps(b)}
                    className={`rounded-pill px-3 py-1 text-[12px] font-bold ${slippageBps === b ? "bg-ink text-white" : "bg-subtle-2 text-body"}`}
                  >
                    {(b / 100).toFixed(2)}%
                  </button>
                ))}
              </div>
              <div className="pt-2">
                <Row
                  label="Minimum received"
                  value={formatToken(minReceived(amountBase, slippageBps), shielded.decimals, shielded.symbol)}
                  tone="muted"
                />
                <Row label="Position receipt" value="On-chain NFT · minted to you" tone="muted" />
              </div>
            </Expander>
          </div>

          {tx.error && <p className="mt-4 text-[13px] font-medium text-amber-deep">{tx.error}</p>}

          <div className="mt-5">
            <Button variant="ink" full onClick={confirm} disabled={tx.pending || !canContinue}>
              Confirm deposit
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
