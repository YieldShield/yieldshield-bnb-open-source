import { Link, useNavigate } from "react-router-dom";
import { AssetGlyph, Card, Pill, buttonStyles } from "@/components/ui";
import { Row } from "@/components/Expander";
import { TestFaucet } from "@/components/TestFaucet";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { presetFor } from "@/config/pools";
import { chain } from "@/chain/adapter";
import { shortAddress, useWalletConnection } from "@/chain/wallet";
import { useWhitelistedBalances, type TokenBalance } from "@/data/balances";

export function Account() {
  const navigate = useNavigate();
  const { walletName, address, disconnect } = useWalletConnection();

  const { balances, loading, error: balanceError } = useWhitelistedBalances();
  // Held tokens first (by amount), then the rest alphabetically — the full opted-in set stays visible.
  const sorted = [...balances].sort((a, b) => {
    if (a.amount > 0n !== b.amount > 0n) return a.amount > 0n ? -1 : 1;
    if (a.amount !== b.amount) return a.amount > b.amount ? -1 : 1;
    return a.token.symbol.localeCompare(b.token.symbol);
  });

  return (
    <div className="animate-fade-up">
      <h1 className="mb-5 text-[26px] font-extrabold tracking-tight2 md:text-[30px]">Account</h1>

      <div className="section-label mb-2.5">Connected wallets</div>
      <Card>
        <div className="flex items-center gap-3">
          <span className="h-9 w-9 rounded-pill bg-wallet-phantom" />
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-bold text-ink">{walletName ?? "Wallet"}</div>
            {address && <div className="truncate text-[12.5px] text-muted tnum">{shortAddress(address)}</div>}
          </div>
          <span className="rounded-pill bg-green-tint px-3 py-1 text-[12px] font-bold text-green-dark">Connected</span>
        </div>
      </Card>
      <button
        onClick={() => navigate("/connect")}
        className="mt-3 w-full rounded-card border border-dashed border-hairline-2 p-4 text-[13.5px] font-semibold text-body hover:bg-subtle-2"
      >
        + Connect another wallet
      </button>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/trade" className={buttonStyles({ variant: "primary" })}>Trade</Link>
        <Link to="/markets" className={buttonStyles({ variant: "secondary" })}>Get protection</Link>
        <Link to="/positions" className={buttonStyles({ variant: "secondary" })}>My positions</Link>
      </div>

      {/* Your YieldShield tokens ------------------------------------------------ */}
      <div className="section-label mb-2.5 mt-7">Your tokens</div>

      <TestFaucet />

      {balanceError && (
        <Card>
          <p role="alert">Token balances are unavailable. Refresh before continuing.</p>
        </Card>
      )}
      {loading ? (
        <div className="h-56 animate-pulse rounded-card bg-subtle" />
      ) : (
        <div className="overflow-hidden rounded-card border border-hairline bg-surface">
          {sorted.map((b) => (
            <BalanceRow key={b.token.token} b={b} />
          ))}
        </div>
      )}
      <p className="mt-2 px-1 text-[12px] text-muted">
        Balances of the tokens whitelisted on YieldShield. Others in your wallet aren't shown here.
      </p>

      <div className="section-label mb-2.5 mt-7">Trust &amp; safety</div>
      <Card>
        <Row label="Audit status" value="Unaudited early alpha" />
        <Row label="Custody" value="Assets held by smart contracts" />
        <Row label="Oracles" value={chain.oracleLabel} />
        <Row label="Administration" value="Operator actions behind a two-day timelock" />
      </Card>
      <p className="mt-3 px-1 text-[13px] leading-relaxed text-muted">
        Contracts, pricing and the interface can fail. Protection and returns are not guaranteed. Contact
        david@yieldshield.ai.
      </p>

      {address && (
        <button onClick={() => disconnect()} className="mt-7 text-[13.5px] font-semibold text-amber-deep">
          Disconnect wallet
        </button>
      )}
    </div>
  );
}

function BalanceRow({ b }: { b: TokenBalance }) {
  const preset = presetFor(b.token.symbol);
  const has = b.amount > 0n;
  return (
    <div className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-0">
      <AssetGlyph glyph={preset.glyph} label={b.token.symbol} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-ink">{b.token.symbol}</span>
          <Pill tone="amber">Test token</Pill>
        </div>
        <div className="truncate text-[12px] text-muted">{b.token.name}</div>
      </div>
      <div className={cn("text-[15px] font-bold tnum", has ? "text-ink" : "text-disabled")}>
        {formatAmount(b.amount, b.token.decimals)}
      </div>
    </div>
  );
}
