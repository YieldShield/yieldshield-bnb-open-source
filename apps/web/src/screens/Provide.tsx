import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fromBaseUnits, minReceived, toBaseUnits, type PositionId } from "@yieldshield/core";
import { AmountInput } from "@/components/AmountInput";
import { Row } from "@/components/Expander";
import { ArrowLeft, ShieldIcon } from "@/components/icons";
import { TransactionError, PendingOverlay, SuccessCard } from "@/components/TxFeedback";
import { AssetGlyph, Bar, Button, Card, ChainBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBps, formatDuration, formatToken } from "@/lib/format";
import { chain } from "@/chain/adapter";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { useTokenBalance } from "@/data/balance";
import { usePools, type PoolView } from "@/data/pools";
import { VOCAB } from "@/vocab";

type Step = "pick" | "amount" | "review" | "success";

export function Provide() {
  const navigate = useNavigate();
  const tx = useSubmitTx();
  const { data, loading, error: loadError } = usePools();
  const open = data.filter((p) => !p.paused);

  const [step, setStep] = useState<Step>("pick");
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const selected = data.find((p) => p.address === selectedAddress) ?? null;
  const [value, setValue] = useState("");
  const [createdPosition, setCreatedPosition] = useState<PositionId | null>(null);

  const backing = selected?.backing;
  const { balance, loading: balanceLoading } = useTokenBalance(backing?.token);
  const amountBase = useMemo(() => {
    try {
      return value && backing ? toBaseUnits(value, backing.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [value, backing]);

  const balError = selected?.paused
    ? "This pool is currently unavailable."
    : balanceLoading
      ? "Checking wallet balance…"
      : balance === null
        ? "Wallet balance is unavailable. Refresh before continuing."
        : amountBase > balance
          ? "More than your balance."
          : selected && amountBase > 0n && amountBase < selected.stats.backingMinDeposit
            ? `Minimum ${formatToken(selected.stats.backingMinDeposit, backing!.decimals, backing!.symbol)}.`
            : selected && selected.stats.backingMaxDeposit > 0n && amountBase > selected.stats.backingMaxDeposit
              ? `Maximum ${formatToken(selected.stats.backingMaxDeposit, backing!.decimals, backing!.symbol)}.`
              : null;
  const canContinue = !!selected && !loadError && amountBase > 0n && minReceived(amountBase) > 0n && !balError;

  async function confirm() {
    if (!selected || !backing || !canContinue || tx.pending) return;
    const res = await tx.submit({
      kind: "depositBacking",
      pool: selected.address,
      backingToken: backing.token,
      amount: amountBase,
      minReceived: minReceived(amountBase),
    });
    if (res) {
      setCreatedPosition(res.positionId ?? null);
      setStep("success");
    }
  }

  if (step === "success") {
    return (
      <div className="animate-fade-up">
        <SuccessCard accent="indigo" title="Test backing deposit confirmed.">
          Your test-token backing deposit has been confirmed. Premiums depend on realized gains and can be zero. Backing
          collateral can be lost.
        </SuccessCard>
        <div className="mx-auto mt-8 flex max-w-[360px] flex-col gap-3">
          {createdPosition && (
            <Button variant="indigo" full onClick={() => navigate(`/underwriter/${createdPosition}`)}>
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
      {tx.pending && <PendingOverlay step={tx.step} txId={tx.txId} phase={tx.phase} label="Confirming…" />}
      {loadError && (
        <Card>
          <p role="alert">Pool data is unavailable. Refresh before continuing.</p>
        </Card>
      )}

      {step !== "pick" && (
        <button
          onClick={() => setStep(step === "review" ? "amount" : "pick")}
          className="mb-4 flex items-center gap-1.5 text-[14px] text-body"
        >
          <ArrowLeft className="h-4.5 w-4.5" /> Back
        </button>
      )}

      {step === "pick" && (
        <>
          <div className="mb-4 rounded-hero bg-gradient-to-br from-indigo to-indigo-accent p-6 text-white">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-pill bg-white/15">
              <ShieldIcon className="h-6 w-6" />
            </div>
            <h1 className="text-[24px] font-extrabold tracking-tight2">{VOCAB.provide}</h1>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-white/85">
              Try backing test-token positions. Your collateral absorbs protected exits and can be fully lost. Premium
              income is variable and can be zero.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <InfoTile title={VOCAB.paidLast} sub="You absorb losses first" />
              <InfoTile title="Pool-specific notice" sub="Check before depositing" />
            </div>
          </div>

          <div className="section-label mb-2.5">Pick a pool to back</div>
          {loading ? (
            <div className="h-40 animate-pulse rounded-card bg-subtle" />
          ) : (
            <div className="flex flex-col gap-3">
              {!loadError && open.length === 0 && <Card>No pools are currently available for backing deposits.</Card>}
              {open.map((p) => (
                <BackPoolRow
                  key={p.address}
                  pool={p}
                  selected={selected?.address === p.address}
                  onClick={() => {
                    setSelectedAddress(p.address);
                    setStep("amount");
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {step === "amount" && selected && backing && (
        <>
          <h1 className="mb-1 text-[22px] font-extrabold tracking-tight2">Back {selected.preset.asset}</h1>
          <p className="mb-5 text-[14px] text-body">Test-token collateral · full loss possible</p>
          <AmountInput
            value={value}
            onChange={setValue}
            symbol={backing.symbol}
            accent="indigo"
            presets={[500, 1000, 5000]}
            balanceLabel={
              balance !== null ? `Balance ${formatToken(balance, backing.decimals, backing.symbol)}` : undefined
            }
            onMax={balance !== null ? () => setValue(fromBaseUnits(balance, backing.decimals)) : undefined}
            error={balError}
          />
          <p className="mt-3 px-1 text-[13px] text-body">
            No fixed or verified annual return. Test tokens have no redeemable value.
          </p>
          <div className="mt-6">
            <Button variant="indigo" full disabled={!canContinue} onClick={() => setStep("review")}>
              Review
            </Button>
          </div>
        </>
      )}

      {step === "review" && selected && backing && (
        <>
          <h1 className="mb-4 text-[22px] font-extrabold tracking-tight2">Review</h1>
          <Card>
            <Row label="Backing collateral" value={formatToken(amountBase, backing.decimals, backing.symbol)} />
            <Row label="Pool" value={`${selected.preset.asset} · ${chain.label}`} />
            <Row label="Backers’ share of gains" value={formatBps(selected.stats.premiumRateBp)} tone="indigo" />
            <Row label="Loss order" value="Paid last" tone="muted" />
            <Row label="Notice period" value={formatDuration(selected.stats.unlockDuration)} tone="muted" />
            <Row
              label="Minimum received"
              value={formatToken(minReceived(amountBase), backing.decimals, backing.symbol)}
            />
          </Card>
          <div className="mt-3.5 rounded-card bg-indigo-tint-3 p-4 text-[13.5px] leading-relaxed text-indigo">
            Backers share premium fees when shielded positions realize gains. Collateral withdrawals need{" "}
            {formatDuration(selected.stats.unlockDuration)} notice and sufficient unlocked liquidity. The alpha
            contracts and pricing can fail.
          </div>
          <TransactionError error={tx.error} txId={tx.txId} />
          <div className="mt-5">
            <Button variant="indigo" full onClick={confirm} disabled={tx.pending || !canContinue}>
              Confirm
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function InfoTile({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="rounded-input bg-white/12 px-3.5 py-3">
      <div className="text-[13px] font-bold">{title}</div>
      <div className="text-[11.5px] text-white/75">{sub}</div>
    </div>
  );
}

function BackPoolRow({ pool, selected, onClick }: { pool: PoolView; selected: boolean; onClick: () => void }) {
  const coverage = pool.stats.coverageBps === null ? null : Number(pool.stats.coverageBps) / 100;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-card border bg-surface p-4 text-left transition-shadow hover:shadow-card",
        selected ? "border-indigo ring-1 ring-indigo" : "border-hairline",
      )}
    >
      <AssetGlyph glyph={pool.preset.glyph} label={pool.preset.asset} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold text-ink">{pool.preset.asset}</div>
        <div className="truncate text-[12.5px] text-muted">
          {pool.preset.source} ·{" "}
          {coverage === null ? "No active shield collateral" : `collateral coverage ${Math.round(coverage)}%`}
        </div>
        <div className="mt-1.5 max-w-[140px]">
          {coverage !== null && <Bar pct={Math.min(100, coverage)} tone="green" />}
        </div>
      </div>
      <div className="text-right">
        <div className="hero-num text-[22px] text-indigo">{formatBps(pool.stats.premiumRateBp)}</div>
        <div className="text-[11px] font-semibold text-muted">share of gains</div>
      </div>
      <ChainBadge />
    </button>
  );
}
