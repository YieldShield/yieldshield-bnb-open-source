import { useNavigate, useParams } from "react-router-dom";
import { Expander, Row } from "@/components/Expander";
import { ArrowLeft, ChevronRight } from "@/components/icons";
import { Bar, Button, Card, ChainBadge, Dot, Pill, StatTile } from "@/components/ui";
import { formatBps, formatDate, formatDuration, formatToken, formatUsd8 } from "@/lib/format";
import { shortAddress } from "@/chain/wallet";
import { chain } from "@/chain/adapter";
import { usePool, type PoolView } from "@/data/pools";
import { VOCAB } from "@/vocab";

export function PoolDetail() {
  const { poolId } = useParams();
  const navigate = useNavigate();
  const { loading, error: loadError, pool } = usePool(poolId);

  if (loading) return <div className="h-72 animate-pulse rounded-card bg-subtle" />;
  if (loadError)
    return (
      <Card>
        <p role="alert">Pool data is unavailable. Refresh before continuing.</p>
      </Card>
    );
  if (!pool)
    return (
      <Card>
        <p className="text-body">This pool isn't available.</p>
      </Card>
    );

  return (
    <div className="animate-fade-up">
      <button onClick={() => navigate("/markets")} className="mb-5 flex items-center gap-1.5 text-[14px] text-body">
        <ArrowLeft className="h-4.5 w-4.5" /> Get protection
      </button>

      {pool.paused ? (
        <PausedHero pool={pool} />
      ) : (
        <ActiveDetail pool={pool} onSave={() => navigate(`/deposit?pool=${pool.address}`)} />
      )}
    </div>
  );
}

function ActiveDetail({ pool, onSave }: { pool: PoolView; onSave: () => void }) {
  const navigate = useNavigate();
  const { preset, stats, shielded } = pool;
  const coverage = stats.coverageBps === null ? null : Number(stats.coverageBps) / 100;
  const capacity = stats.capacityBps === null ? null : Number(stats.capacityBps) / 100;
  const protectors = Number(stats.protectorPositionCount);
  const minDeposit =
    stats.shieldedMinDeposit > 0n
      ? formatToken(stats.shieldedMinDeposit, shielded.decimals, shielded.symbol)
      : "No minimum";
  const unlockDate = formatDate(BigInt(Math.floor(Date.now() / 1000)) + stats.minimumPoolTime);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <div className="section-label mb-1">Get protection</div>
          <h1 className="text-[24px] font-extrabold tracking-tight2">{preset.asset} test-token pool</h1>
        </div>
        <ChainBadge />
      </div>

      <button
        onClick={() => navigate("/provide")}
        className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-indigo"
      >
        Try backing this pool <ChevronRight className="h-4 w-4" />
      </button>

      <Card className="mt-4">
        <div className="section-label">Early alpha</div>
        <div className="mt-1 hero-num text-[36px] text-green-dark">Test tokens only</div>
        <p className="mt-1 text-[14px] text-body">
          No verified annual return. Token price gains and protection are not guaranteed.
        </p>
      </Card>

      {/* Coverage panel */}
      <Card className="mt-3.5 bg-green-tint-2">
        <div className="flex items-center justify-between">
          <Pill tone="green">
            <Dot tone="green" /> Oracle checks available
          </Pill>
          <span className="text-[14px] font-bold text-green-dark tnum">
            {coverage === null ? "No shield collateral allocated" : `Collateral coverage ${Math.round(coverage)}%`}
          </span>
        </div>
        <div className="mt-3">{coverage !== null && <Bar pct={Math.min(100, coverage)} tone="green" />}</div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-green-dark/90">
          A backing-token exit uses {pool.backing.symbol} collateral from {protectors.toLocaleString()} open backing
          positions. Price, liquidity, contract and depeg risks apply. Test tokens have no redeemable value.
        </p>
      </Card>

      <div className="mt-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-3">
        <StatTile label="Capacity" value={capacity === null ? "Uncapped" : `${Math.round(capacity)}% full`} />
        <StatTile label="Min deposit" value={minDeposit} />
        <StatTile label="Backing notice" value={formatDuration(stats.unlockDuration)} />
      </div>

      <div className="mt-3.5">
        <Expander title="Advanced & on-chain details">
          <Row
            label="Live pricing"
            value={`${chain.oracleLabel} · ${pool.oracle.status}`}
            tone={pool.paused ? "muted" : "green"}
          />
          <Row label="Backers’ fee share of gains" value={formatBps(stats.premiumRateBp)} />
          <Row label="Pool fee on gains" value={formatBps(stats.poolFeeBp)} />
          <Row label="Protocol fee on gains" value={formatBps(stats.protocolFeeBp)} />
          <Row label="Required collateral ratio" value={formatBps(stats.collateralRatioBp)} />
          <Row label="Protected exit unlocks" value={unlockDate} />
          <Row
            label="Shield entry value / limit"
            value={
              stats.maxTvlUsd > 0n ? `${formatUsd8(stats.shieldTvlUsd)} / ${formatUsd8(stats.maxTvlUsd)}` : "Uncapped"
            }
          />
          <Row label="Position receipt" value="On-chain NFT" tone="muted" />
          <Row label="Program" value={shortAddress(chain.protocolId)} tone="muted" />
        </Expander>
      </div>

      <div className="sticky bottom-24 mt-5 md:static">
        <Button variant="ink" full onClick={onSave}>
          {VOCAB.startSaving}
        </Button>
      </div>
    </>
  );
}

function PausedHero({ pool }: { pool: PoolView }) {
  return (
    <>
      <h1 className="text-[24px] font-extrabold tracking-tight2">{pool.preset.asset} test-token pool</h1>
      <Card className="mt-4 border-amber-border bg-amber-tint">
        <div className="flex items-center gap-2">
          <Dot tone="amber" />
          <span className="text-[14px] font-bold text-amber-deep">{VOCAB.pausedShort}</span>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-amber-deep">{VOCAB.pausedForSafety}</p>
      </Card>
    </>
  );
}
