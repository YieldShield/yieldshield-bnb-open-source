import { Link, useLocation } from "react-router-dom";
import { useWalletAddress } from "@/chain/wallet";
import { useWhitelistedBalances } from "@/data/balances";
import { usePools } from "@/data/pools";
import { AssetGlyph, Card, buttonStyles } from "@/components/ui";
import { formatAmount, formatBps, formatDuration } from "@/lib/format";
import { setupLink } from "@/lib/navigation";

export function Markets() {
  const owner = useWalletAddress();
  const { pathname, search, hash } = useLocation();
  const { data: pools, loading, error } = usePools();
  const { balances, loading: balancesLoading, error: balancesError, refresh } = useWhitelistedBalances();
  const pool = pools.find((entry) => entry.shielded.symbol === "tWBNB" && entry.backing.symbol === "TestUSDC");
  const holding = pool && balances.find((entry) => entry.token.token.toLowerCase() === pool.shielded.token.toLowerCase());
  const accepting = !!pool && !pool.paused && pool.availability?.openPosition.state === "available";

  return (
    <div className="animate-fade-up">
      <header className="mb-8">
        <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em] text-brand-deep">Get protection · BSC Testnet</p>
        <h1 className="text-[34px] font-extrabold leading-tight tracking-hero md:text-[46px]">Protect what you hold.</h1>
        <p className="mt-4 max-w-[58ch] text-[16px] leading-relaxed text-body">
          Deposit tWBNB into the test pool and choose a TestUSDC protected exit when the pool rules allow it.
          The tokens and price are synthetic.
        </p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-[13px] font-bold">
          <Link to="/trade" className="text-ink underline underline-offset-4">Need tokens? Go to Trade ↗</Link>
          <Link to="/positions" className="text-brand-deep underline underline-offset-4">View your positions</Link>
        </div>
      </header>

      {!owner && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-brand/25 bg-brand-tint">
          <div>
            <p className="font-bold">Connect to see your wallet balance.</p>
            <p className="mt-1 text-[13px] text-body">You can review the pool terms first.</p>
          </div>
          <Link to={setupLink("/connect", pathname, search, hash)} className={buttonStyles({ variant: "primary" })}>Connect wallet</Link>
        </Card>
      )}

      {loading ? (
        <Card role="status">Reading the testnet pool…</Card>
      ) : error ? (
        <Card role="alert">Pool data could not be checked. Refresh this page before depositing.</Card>
      ) : !pool ? (
        <Card role="status">The tWBNB / TestUSDC protection pool is unavailable.</Card>
      ) : (
        <article className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="overflow-hidden border-brand/35 bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <AssetGlyph glyph="generic" label="tWBNB" size={52} />
                <div>
                  <h2 className="text-[23px] font-extrabold">Test BNB token</h2>
                  <p className="text-[13px] text-body">tWBNB → TestUSDC · synthetic price</p>
                </div>
              </div>
              <span className={`rounded-pill px-3 py-1.5 text-[12px] font-bold ${accepting ? "bg-brand-tint text-brand-deep" : "bg-amber-tint text-amber-deep"}`}>
                {accepting ? "Accepting test deposits" : "Deposits unavailable"}
              </span>
            </div>
            <dl className="my-6 grid gap-3 border-y border-hairline py-5 sm:grid-cols-3">
              <Term label="Protected exit" value="TestUSDC" />
              <Term label="Wait before protected exit" value={formatDuration(pool.stats.minimumPoolTime)} />
              <Term label="Share of positive gains" value={formatBps(pool.stats.premiumRateBp)} />
            </dl>
            <p className="text-[13px] leading-relaxed text-body">
              A protected exit depends on oracle prices, collateral and available capacity. Your tWBNB is deposited into the contract, and protection can fail.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/protection/new?asset=tWBNB" className={buttonStyles({ variant: accepting ? "primary" : "secondary" })}>
                {accepting ? "Protect tWBNB" : "Review pool"}
              </Link>
              <Link to={`/pool/${pool.address}`} className={buttonStyles({ variant: "secondary" })}>See pool terms</Link>
            </div>
          </Card>
          <div className="space-y-5">
            <Card className="bg-subtle">
              <p className="text-[12px] font-bold uppercase tracking-wider text-body">In your wallet</p>
              <p className="mt-3 break-words text-[30px] font-extrabold tnum">
                {!owner ? "Connect to check" : balancesLoading ? "Checking…" : balancesError ? "Unavailable" : holding ? formatAmount(holding.amount, holding.token.decimals, 4) : "0"}
                {owner && !balancesLoading && !balancesError && <span className="ml-2 text-[14px] font-semibold text-body">tWBNB</span>}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-body">Wallet tokens are separate from deposited positions.</p>
              {owner && <button onClick={refresh} className="mt-4 text-[13px] font-bold text-brand-deep underline underline-offset-2">Refresh balance</button>}
            </Card>
            <Card>
              <h2 className="text-[18px] font-bold">New here?</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-body">Get test BNB for network fees, then claim free tWBNB and TestUSDC.</p>
              <Link to={setupLink("/test-tokens", pathname, search, hash)} className="mt-4 inline-block text-[13px] font-bold text-brand-deep underline underline-offset-2">Set up your wallet ↗</Link>
            </Card>
          </div>
        </article>
      )}
      <p className="mt-8 text-[12px] leading-relaxed text-body">tWBNB is not wrapped real BNB. The demo tokens are not redeemable. No insured payout or return is guaranteed.</p>
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[12px] text-body">{label}</dt><dd className="mt-1 text-[15px] font-bold">{value}</dd></div>;
}
