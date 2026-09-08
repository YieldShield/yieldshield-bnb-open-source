import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AssetGlyph, Button, Card, Pill } from "@/components/ui";
import { Row } from "@/components/Expander";
import { GiftIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { presetFor } from "@/config/pools";
import { chain } from "@/chain/adapter";
import { shortAddress, useWalletConnection } from "@/chain/wallet";
import { useWhitelistedBalances, type TokenBalance } from "@/data/balances";
import { useFaucet } from "@/chain/faucet";

export function Account() {
  const navigate = useNavigate();
  const { walletName, address, disconnect } = useWalletConnection();

  const { balances, loading, error: balanceError, refresh } = useWhitelistedBalances();
  const { toast } = useToast();
  const faucet = useFaucet();
  const [dripping, setDripping] = useState(false);

  async function getTestTokens() {
    if (!address) return;
    setDripping(true);
    try {
      const res = await faucet.drip(address);
      if (res.ok) {
        toast({ kind: "success", message: "Test-token transaction confirmed. Refreshing your balances." });
        refresh();
        setTimeout(refresh, 2500);
      } else toast({ kind: "error", message: res.error ?? "Faucet request failed." });
    } catch {
      toast({ kind: "error", message: "The faucet request could not be completed. Please try again." });
    } finally {
      setDripping(false);
    }
  }

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

      {/* Your YieldShield tokens ------------------------------------------------ */}
      <div className="section-label mb-2.5 mt-7">Your tokens</div>

      {faucet.enabled && (
        <div className="mb-3 overflow-hidden rounded-hero bg-gradient-to-br from-green to-green-bright p-5 text-white">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-white/15">
              <GiftIcon className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-extrabold tracking-tight2">Get test tokens</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-white/85">
                BSC Testnet test tokens let you try deposits and pools. They are simulated assets with no redeemable
                monetary value.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            full
            className="mt-4 bg-white text-green-dark hover:bg-white/90"
            disabled={dripping || !address}
            onClick={getTestTokens}
          >
            {dripping ? "Sending…" : "Send me a basket"}
          </Button>
        </div>
      )}

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
        <Row label="Administration" value="Operator-controlled alpha" />
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
