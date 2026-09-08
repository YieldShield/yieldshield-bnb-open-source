import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toBaseUnits, type PoolId, type TokenId } from "@yieldshield/core";
import { Expander, Row } from "@/components/Expander";
import { ArrowLeft } from "@/components/icons";
import { PendingOverlay, SuccessCard, TransactionError } from "@/components/TxFeedback";
import { AssetGlyph, Button, Card, Pill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPct } from "@/lib/format";
import { chain } from "@/chain/adapter";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { useWhitelistedTokens, type SeedToken } from "@/data/tokens";
import { presetFor } from "@/config/pools";

type Step = "pick" | "config" | "review" | "success";

const USD_ONE = 100_000_000n; // USD, 8 decimals
const DAY = 86_400;

// Program parameter bounds (crates/yieldshield-common/src/constants.rs) — mirror them so the form
// rejects out-of-range values up front instead of failing on-chain.
const BOUNDS = {
  collateralMinPct: 100, // MIN_COLLATERAL_RATIO 10_000 bp
  collateralMaxPct: 500, // MAX_COLLATERAL_RATIO 50_000 bp
  commissionMaxPct: 50, // MAX_COMMISSION_RATE 5_000 bp
  poolFeeMaxPct: 20, // MAX_POOL_FEE 2_000 bp
  protocolFeeMaxPct: 10, // MAX_PROTOCOL_FEE 1_000 bp
  unlockMinDays: 1, // MIN_UNLOCK_DURATION
  unlockMaxDays: 365, // MAX_UNLOCK_DURATION
  minPoolMaxDays: 90, // MAX_MINIMUM_POOL_TIME
  transferLockMaxHours: 720, // MAX_TRANSFER_LOCK 30 days
};

/** Human-unit form state (converted to chain units on submit). */
const DEFAULTS = {
  commissionPct: "10",
  poolFeePct: "5",
  protocolFeePct: "1",
  maxTvlUsd: "1000000",
  minPoolDays: "1",
  unlockDays: "28",
  shieldLockHours: "1",
  protectorLockHours: "0",
  bond: "0",
};

export function CreatePool() {
  const navigate = useNavigate();
  const tx = useSubmitTx();
  const { data: tokens, loading } = useWhitelistedTokens();

  const [step, setStep] = useState<Step>("pick");
  const [shieldedToken, setShieldedToken] = useState<TokenId | null>(null);
  const [backingToken, setBackingToken] = useState<TokenId | null>(null);
  const [collateralPct, setCollateralPct] = useState("");
  const [cfg, setCfg] = useState(DEFAULTS);
  const [createdPool, setCreatedPool] = useState<PoolId | null>(null);

  const shielded = useMemo(() => tokens.find((t) => t.token === shieldedToken) ?? null, [tokens, shieldedToken]);
  const backing = useMemo(() => tokens.find((t) => t.token === backingToken) ?? null, [tokens, backingToken]);

  // `create_pool` enforces the ratio against the BACKING token's whitelist floor (create_pool.rs),
  // and the global MIN_COLLATERAL_RATIO. The effective floor is the greater of the two.
  const floorBp = useMemo(() => {
    const b = backing ? Number(backing.minCollateralRatioBp) : 0;
    return Math.max(BOUNDS.collateralMinPct * 100, b);
  }, [backing]);
  const floorPct = floorBp / 100;

  const set = (k: keyof typeof DEFAULTS) => (v: string) => setCfg((c) => ({ ...c, [k]: v }));
  const num = (s: string) => Number(s || 0);

  function toConfig() {
    if (!shielded || !backing) return;
    setCollateralPct(String(floorPct)); // prefill with the required minimum; user can raise it
    setStep("config");
  }

  const configError = useMemo<string | null>(() => {
    const col = num(collateralPct);
    if (col * 100 < floorBp) return `Collateral ratio must be at least ${formatPct(floorPct)}.`;
    if (col > BOUNDS.collateralMaxPct) return `Collateral ratio can be at most ${BOUNDS.collateralMaxPct}%.`;
    const feeChecks: Array<[string, string, number]> = [
      ["Commission", cfg.commissionPct, BOUNDS.commissionMaxPct],
      ["Pool fee", cfg.poolFeePct, BOUNDS.poolFeeMaxPct],
      ["Protocol fee", cfg.protocolFeePct, BOUNDS.protocolFeeMaxPct],
    ];
    for (const [label, val, max] of feeChecks) {
      const v = num(val);
      if (v < 0 || v > max) return `${label} must be between 0% and ${max}%.`;
    }
    if (num(cfg.maxTvlUsd) <= 0) return "Max pool size must be greater than 0.";
    const unlock = num(cfg.unlockDays);
    if (unlock < BOUNDS.unlockMinDays || unlock > BOUNDS.unlockMaxDays)
      return `Unlock notice must be between ${BOUNDS.unlockMinDays} and ${BOUNDS.unlockMaxDays} days.`;
    if (num(cfg.minPoolDays) < 0 || num(cfg.minPoolDays) > BOUNDS.minPoolMaxDays)
      return `Minimum pool time must be between 0 and ${BOUNDS.minPoolMaxDays} days.`;
    for (const [label, val] of [
      ["Shield transfer lock", cfg.shieldLockHours],
      ["Protector transfer lock", cfg.protectorLockHours],
    ] as const) {
      const v = num(val);
      if (v < 0 || v > BOUNDS.transferLockMaxHours)
        return `${label} must be between 0 and ${BOUNDS.transferLockMaxHours} hours.`;
    }
    return null;
  }, [collateralPct, floorBp, floorPct, cfg]);

  async function confirm() {
    if (!shielded || !backing) return;
    const bp = (pct: string) => Math.round(num(pct) * 100);
    const res = await tx.submit({
      kind: "createPool",
      params: {
        shieldedToken: shielded.token,
        backingToken: backing.token,
        collateralRatioBp: bp(collateralPct),
        commissionRateBp: bp(cfg.commissionPct),
        poolFeeBp: bp(cfg.poolFeePct),
        protocolFeeBp: bp(cfg.protocolFeePct),
        maxTvlUsd: BigInt(Math.round(num(cfg.maxTvlUsd))) * USD_ONE,
        minimumPoolTime: Math.round(num(cfg.minPoolDays) * DAY),
        unlockDuration: Math.round(num(cfg.unlockDays) * DAY),
        shieldTransferLock: Math.round(num(cfg.shieldLockHours) * 3600),
        protectorTransferLock: Math.round(num(cfg.protectorLockHours) * 3600),
        creationBondAmount: cfg.bond ? toBaseUnits(cfg.bond, backing.decimals) : 0n,
      },
    });
    if (res) {
      setCreatedPool(res.poolId ?? null);
      setStep("success");
    }
  }

  // -- success ----------------------------------------------------------------
  if (step === "success" && shielded && backing) {
    return (
      <div className="animate-fade-up">
        <SuccessCard accent="indigo" title="Pool created.">
          {shielded.symbol} / {backing.symbol} is live on {chain.label}. Protectors can now back it and savers can
          deposit.
        </SuccessCard>
        <div className="mx-auto mt-8 flex max-w-[360px] flex-col gap-3">
          {createdPool && (
            <Button variant="indigo" full onClick={() => navigate(`/pool/${createdPool}`)}>
              View pool
            </Button>
          )}
          <Button variant="secondary" full onClick={() => navigate("/protect")}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  // -- pick / config / review -------------------------------------------------
  return (
    <div className="animate-fade-up">
      {tx.pending && <PendingOverlay label="Creating pool…" phase={tx.phase} step={tx.step} txId={tx.txId} />}

      <button
        onClick={() => (step === "pick" ? navigate("/protect") : setStep(step === "review" ? "config" : "pick"))}
        className="mb-4 flex items-center gap-1.5 text-[14px] text-body"
      >
        <ArrowLeft className="h-4.5 w-4.5" /> Back
      </button>

      {step === "pick" && (
        <>
          <h1 className="mb-1 text-[22px] font-extrabold tracking-tight2">Create a pool</h1>
          <p className="mb-5 text-[14px] text-body">
            Pick a protected asset and a backing asset from the whitelisted set. You'll configure terms next.
          </p>

          {loading ? (
            <div className="h-56 animate-pulse rounded-card bg-subtle" />
          ) : (
            <div className="flex flex-col gap-6">
              <TokenPicker
                label="Protected asset"
                hint="What savers deposit and get downside protection on."
                tokens={tokens}
                selected={shieldedToken}
                exclude={backingToken}
                onSelect={setShieldedToken}
              />
              <TokenPicker
                label="Backing asset"
                hint="What protectors underwrite with. The pool prices its collateral off this token's feed."
                tokens={tokens}
                selected={backingToken}
                exclude={shieldedToken}
                onSelect={setBackingToken}
              />
            </div>
          )}

          <div className="mt-6">
            <Button variant="indigo" full disabled={!shielded || !backing} onClick={toConfig}>
              Configure terms
            </Button>
          </div>
        </>
      )}

      {step === "config" && shielded && backing && (
        <>
          <h1 className="mb-1 text-[22px] font-extrabold tracking-tight2">
            {shielded.symbol} / {backing.symbol}
          </h1>
          <p className="mb-5 text-[14px] text-body">Set the pool's economics. Sensible defaults are prefilled.</p>

          <div className="flex flex-col gap-3">
            <Field
              label="Collateral ratio"
              suffix="%"
              value={collateralPct}
              onChange={setCollateralPct}
              hint={`Backing coverage required. Minimum ${formatPct(floorPct)} for this pair.`}
            />
            <Field
              label="Commission to protectors"
              suffix="%"
              value={cfg.commissionPct}
              onChange={set("commissionPct")}
              hint="Share of shield yield paid to backers."
            />
            <Field label="Pool fee" suffix="%" value={cfg.poolFeePct} onChange={set("poolFeePct")} />
            <Field label="Max pool size" suffix="USD" value={cfg.maxTvlUsd} onChange={set("maxTvlUsd")} />
          </div>

          <div className="mt-4">
            <Expander title="Advanced">
              <div className="flex flex-col gap-3">
                <Field label="Protocol fee" suffix="%" value={cfg.protocolFeePct} onChange={set("protocolFeePct")} />
                <Field label="Minimum pool time" suffix="days" value={cfg.minPoolDays} onChange={set("minPoolDays")} />
                <Field
                  label="Protector unlock notice"
                  suffix="days"
                  value={cfg.unlockDays}
                  onChange={set("unlockDays")}
                />
                <Field
                  label="Shield transfer lock"
                  suffix="hours"
                  value={cfg.shieldLockHours}
                  onChange={set("shieldLockHours")}
                />
                <Field
                  label="Protector transfer lock"
                  suffix="hours"
                  value={cfg.protectorLockHours}
                  onChange={set("protectorLockHours")}
                />
                <Field
                  label="Creation bond"
                  suffix={backing.symbol}
                  value={cfg.bond}
                  onChange={set("bond")}
                  hint="Backing tokens you lock to create the pool (0 allowed on this deployment)."
                />
              </div>
            </Expander>
          </div>

          {configError && <p className="mt-4 px-1 text-[13px] font-medium text-amber-deep">{configError}</p>}
          <div className="mt-6">
            <Button variant="indigo" full disabled={!!configError} onClick={() => setStep("review")}>
              Review
            </Button>
          </div>
        </>
      )}

      {step === "review" && shielded && backing && (
        <>
          <h1 className="mb-4 text-[22px] font-extrabold tracking-tight2">Review</h1>
          <Card>
            <Row label="Protected asset" value={`${shielded.symbol}`} />
            <Row label="Backing asset" value={`${backing.symbol}`} />
            <Row label="Collateral ratio" value={formatPct(num(collateralPct))} tone="indigo" />
            <Row label="Commission to protectors" value={formatPct(num(cfg.commissionPct))} />
            <Row label="Pool fee" value={formatPct(num(cfg.poolFeePct))} />
            <Row label="Protocol fee" value={formatPct(num(cfg.protocolFeePct))} tone="muted" />
            <Row label="Max pool size" value={`$${Number(num(cfg.maxTvlUsd)).toLocaleString("en-US")}`} />
            <Row label="Unlock notice" value={`${num(cfg.unlockDays)} days`} tone="muted" />
            <Row label="Creation bond" value={`${num(cfg.bond)} ${backing.symbol}`} tone="muted" />
          </Card>
          <div className="mt-3.5 rounded-card bg-indigo-tint-3 p-4 text-[13.5px] leading-relaxed text-indigo">
            You'll be the pool creator. Fee recipients default to your wallet. This creates the pool on-chain; you can
            back it or deposit right after.
          </div>
          <TransactionError error={tx.error} txId={tx.txId} />
          <div className="mt-5">
            <Button variant="indigo" full onClick={confirm} disabled={tx.pending}>
              Create pool
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// --- token picker -----------------------------------------------------------
function TokenPicker({
  label,
  hint,
  tokens,
  selected,
  exclude,
  onSelect,
}: {
  label: string;
  hint: string;
  tokens: SeedToken[];
  selected: TokenId | null;
  exclude: TokenId | null;
  onSelect: (token: TokenId) => void;
}) {
  const options = tokens.filter((t) => t.token !== exclude);
  return (
    <div>
      <div className="section-label mb-1">{label}</div>
      <p className="mb-2.5 text-[12.5px] text-muted">{hint}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((t) => {
          const isSel = t.token === selected;
          return (
            <button
              key={t.token}
              onClick={() => onSelect(t.token)}
              className={cn(
                "flex items-center gap-2.5 rounded-card border bg-surface p-3 text-left transition-shadow hover:shadow-card",
                isSel ? "border-indigo ring-1 ring-indigo" : "border-hairline",
              )}
            >
              <AssetGlyph glyph={presetFor(t.symbol).glyph} label={t.symbol} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-ink">{t.symbol}</div>
                <div className="truncate text-[11.5px] text-muted">{t.name}</div>
              </div>
              {t.tranche === "volatile" && <Pill tone="amber">150%</Pill>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- labelled numeric field -------------------------------------------------
function Field({
  label,
  suffix,
  value,
  onChange,
  hint,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const sanitize = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, "");
    const parts = cleaned.split(".");
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
  };
  return (
    <div>
      <div className="flex items-center gap-2 rounded-input border border-hairline bg-surface px-4 py-3">
        <span className="flex-1 text-[14px] font-semibold text-body">{label}</span>
        <input
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(sanitize(e.target.value))}
          className="w-24 bg-transparent text-right text-[16px] font-bold text-ink outline-none tnum placeholder:text-disabled"
        />
        <span className="w-12 text-right text-[13px] font-semibold text-muted">{suffix}</span>
      </div>
      {hint && <p className="mt-1 px-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}
