import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useWalletAddress } from "@/chain/wallet";
import { useWhitelistedBalances } from "@/data/balances";
import { usePools } from "@/data/pools";
import { AssetGlyph, Card, buttonStyles } from "@/components/ui";
import { AssetReference } from "@/components/AssetReference";
import { CATEGORY_LABELS, YIELD_ASSETS, yieldAssetFor } from "@/config/yield-assets";
import { formatAmount, formatBps, formatDuration } from "@/lib/format";
import { setupLink } from "@/lib/navigation";
import { shortAddress } from "@/chain/wallet";

const assets = [
  { symbol: "tWBNB", name: "Test BNB token", category: "token", subtitle: "The original BNB price-cycle demo" },
  ...YIELD_ASSETS.map((asset) => ({
    symbol: asset.demoSymbol,
    name: asset.name,
    category: asset.category,
    subtitle: CATEGORY_LABELS[asset.category],
  })),
];

export function Markets() {
  const owner = useWalletAddress();
  const { pathname, search, hash } = useLocation();
  const { data: pools, loading, error } = usePools();
  const { balances, loading: balancesLoading, error: balancesError, refresh } = useWhitelistedBalances();
  const [filter, setFilter] = useState("all");
  const filtered = assets.filter(
    (asset) =>
      filter === "all" ||
      (filter === "staking"
        ? asset.category.includes("staking")
        : ["stable-yield", "lending"].includes(asset.category)),
  );

  return (
    <div className="animate-fade-up">
      <header className="mb-8">
        <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em] text-brand-deep">
          Get protection · BSC Testnet
        </p>
        <h1 className="text-[34px] font-extrabold leading-tight tracking-hero md:text-[46px]">
          Keep the yield. Explore protection.
        </h1>
        <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-body">
          Explore staking and stablecoin yield assets, then trade and protect their synthetic test tokens. Each pool
          offers a conditional TestUSDC exit. The demo does not deposit into the real protocols.
        </p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-[13px] font-bold">
          <Link to="/trade" className="text-ink underline underline-offset-4">
            Need tokens? Go to Trade ↗
          </Link>
          <Link to="/positions" className="text-brand-deep underline underline-offset-4">
            View your positions
          </Link>
          <Link to="/create-pool" className="text-brand-deep underline underline-offset-4">
            Create a pool
          </Link>
        </div>
      </header>
      {!owner && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-brand/25 bg-brand-tint">
          <div>
            <p className="font-bold">Connect to see your wallet balances.</p>
            <p className="mt-1 text-[13px] text-body">You can review the assets and pool terms first.</p>
          </div>
          <Link to={setupLink("/connect", pathname, search, hash)} className={buttonStyles({ variant: "primary" })}>
            Connect wallet
          </Link>
        </Card>
      )}
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Asset category">
        {[
          ["all", "All assets"],
          ["staking", "Staking"],
          ["stable", "Stablecoins & lending"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value!)}
            aria-pressed={filter === value}
            className={`min-h-11 rounded-pill px-5 text-[13px] font-bold ${filter === value ? "bg-ink text-white" : "border border-hairline bg-white text-body hover:bg-subtle"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {loading && (
        <Card className="mb-5" role="status">
          Reading testnet protection pools…
        </Card>
      )}
      {error && (
        <Card className="mb-5" role="alert">
          Pool data could not be checked. Refresh before depositing.
        </Card>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        {filtered.map((asset) => {
          const assetPools = pools.filter(
            (entry) => entry.shielded.symbol === asset.symbol && entry.backing.symbol === "TestUSDC",
          );
          const pool = assetPools[0];
          const reference = yieldAssetFor(asset.symbol);
          const holding =
            pool && balances.find((entry) => entry.token.token.toLowerCase() === pool.shielded.token.toLowerCase());
          const accepting = !!pool && !pool.paused && pool.availability?.openPosition.state === "available";
          return (
            <Card key={asset.symbol} className="min-w-0 border-brand/25">
              <div className="flex items-center gap-3">
                <AssetGlyph glyph="generic" label={asset.name} symbol={asset.symbol} size={54} />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-deep">{asset.subtitle}</p>
                  <h2 className="mt-1 text-[23px] font-extrabold">{asset.name}</h2>
                  <p className="mt-1 text-[13px] text-body">{asset.symbol} → TestUSDC</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-[12px]">
                <span className="rounded-pill bg-brand-tint px-3 py-1.5 font-bold text-brand-deep">
                  Synthetic test token
                </span>
                <span className="text-body">
                  {loading ? "Checking pool…" : accepting ? "Accepting test deposits" : "Deposits unavailable"}
                </span>
              </div>
              {pool && (
                <dl className="my-5 grid gap-3 border-y border-hairline py-5 sm:grid-cols-3">
                  <Term label="Protected exit" value="TestUSDC" />
                  <Term label="Wait before exit" value={formatDuration(pool.stats.minimumPoolTime)} />
                  <Term label="Share of positive gains" value={formatBps(pool.stats.premiumRateBp)} />
                </dl>
              )}
              <p className="mt-4 text-[13px] leading-relaxed text-body">
                {reference?.yieldMechanism ??
                  "A changing synthetic BNB price lets you test trading and conditional protection."}
              </p>
              {owner && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-input bg-subtle px-4 py-3 text-[12px]">
                  <span className="text-body">In your wallet</span>
                  <span className="font-bold tnum">
                    {balancesLoading
                      ? "Checking…"
                      : balancesError
                        ? "Unavailable"
                        : holding
                          ? `${formatAmount(holding.amount, holding.token.decimals, 4)} ${asset.symbol}`
                          : "Not checked"}
                  </span>
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                {pool && (
                  <Link
                    to={`/protection/new?pool=${pool.address}&asset=${encodeURIComponent(asset.symbol)}`}
                    className={buttonStyles({ variant: accepting ? "primary" : "secondary" })}
                  >
                    {accepting ? `Protect ${asset.symbol}` : "Review pool"}
                  </Link>
                )}
                <Link
                  to={`/trade?asset=${encodeURIComponent(asset.symbol)}`}
                  className={buttonStyles({ variant: "secondary" })}
                >
                  Trade
                </Link>
                {pool && (
                  <Link
                    to={`/pool/${pool.address}`}
                    className="inline-flex min-h-11 items-center px-2 text-[13px] font-bold text-body underline underline-offset-4"
                  >
                    Pool terms
                  </Link>
                )}
              </div>
              {assetPools.length > 1 && (
                <details className="mt-4 border-t border-hairline pt-2">
                  <summary className="min-h-11 cursor-pointer py-3 text-[13px] font-bold text-ink">
                    Compare all {assetPools.length} pools for {asset.symbol}
                  </summary>
                  <ul className="space-y-3 pb-3">
                    {assetPools.map((candidate) => (
                      <li key={candidate.address} className="rounded-input bg-subtle p-3 text-[12px] text-body">
                        <Link to={`/pool/${candidate.address}`} className="font-bold text-ink underline">
                          Pool {shortAddress(candidate.address)}
                        </Link>
                        <p className="mt-2">
                          Backers’ share {formatBps(candidate.stats.premiumRateBp)} · Creator fee{" "}
                          {formatBps(candidate.stats.poolFeeBp)} · Collateral{" "}
                          {formatBps(candidate.stats.collateralRatioBp)}
                        </p>
                        <p className="mt-1">
                          {candidate.availability?.openPosition.state === "available" && !candidate.paused
                            ? "Accepting test deposits"
                            : "Review availability before depositing"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {reference && (
                <details className="mt-4 border-t border-hairline pt-2">
                  <summary className="min-h-11 cursor-pointer py-3 text-[13px] font-bold text-ink">
                    How the real asset earns yield
                  </summary>
                  <div className="pb-2 pt-3">
                    <AssetReference asset={reference} />
                  </div>
                </details>
              )}
            </Card>
          );
        })}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-card bg-subtle p-5">
        <div>
          <p className="font-bold">Free tokens for every demo market.</p>
          <p className="mt-1 text-[13px] text-body">
            Get test BNB for fees, then claim synthetic tokens from the faucet.
          </p>
        </div>
        <Link to={setupLink("/test-tokens", pathname, search, hash)} className={buttonStyles({ variant: "secondary" })}>
          Get test tokens ↗
        </Link>
        {owner && (
          <button onClick={refresh} className="min-h-11 text-[13px] font-bold text-brand-deep underline">
            Refresh balances
          </button>
        )}
      </div>
      <p className="mt-6 text-[12px] leading-relaxed text-body">
        Demo growth and shocks do not track protocol yields or prices. A protected exit depends on oracle prices,
        collateral and available capacity. Tokens are not redeemable; no payout or return is guaranteed.
      </p>
    </div>
  );
}
function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-body">{label}</dt>
      <dd className="mt-1 text-[15px] font-bold">{value}</dd>
    </div>
  );
}
