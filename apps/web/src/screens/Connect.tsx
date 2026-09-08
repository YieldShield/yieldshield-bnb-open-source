import { DeploymentStatus } from "@/components/AlphaNotice";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Wordmark } from "@/components/Logo";
import { ArrowLeft, ChevronRight } from "@/components/icons";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { chain, protocolDeployed } from "@/chain/adapter";
import { friendlyError } from "@/chain/useSubmitTx";
import { useWalletConnection } from "@/chain/wallet";

type Brand = { match: string; name: string; sub: string; swatch: string };

// Familiar-wallet shortlist per chain family; anything else discovered lands under "others".
const BRANDS: Brand[] =
  chain.family === "evm"
    ? [
        { match: "metamask", name: "MetaMask", sub: "Most popular wallet", swatch: "bg-wallet-phantom" },
        { match: "rabby", name: "Rabby", sub: "Power-user wallet", swatch: "bg-wallet-backpack" },
        { match: "coinbase", name: "Coinbase Wallet", sub: "Web & mobile", swatch: "bg-wallet-solflare" },
      ]
    : [
        { match: "phantom", name: "Phantom", sub: "Most popular on Solana", swatch: "bg-wallet-phantom" },
        { match: "backpack", name: "Backpack", sub: "xNFT wallet", swatch: "bg-wallet-backpack" },
        { match: "solflare", name: "Solflare", sub: "Web & mobile", swatch: "bg-wallet-solflare" },
      ];

export function Connect() {
  const navigate = useNavigate();
  const { connectors, connect, connecting } = useWalletConnection();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectorFor = (match: string) => connectors.find((c) => c.name.toLowerCase().includes(match));

  async function onConnect(connectorId: string, key: string) {
    setError(null);
    setBusy(key);
    try {
      await connect(connectorId);
      navigate("/");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  // Known brands first; then any other discovered wallet-standard wallets.
  const knownIds = new Set(BRANDS.map((b) => connectorFor(b.match)?.id).filter(Boolean));
  const others = connectors.filter((c) => !knownIds.has(c.id));

  if (!protocolDeployed) {
    return (
      <div className="mx-auto max-w-[520px] px-6 py-10">
        <Link to="/markets" aria-label="YieldShield markets" className="inline-block">
          <Wordmark size={28} />
        </Link>
        <h1 className="mt-12 text-[32px] font-extrabold tracking-tight2">Test alpha not live yet</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-body">
          Explore stock prices and model risk now. Wallet transactions will be available after contract deployment.
        </p>
        <Link
          to="/markets"
          className="mt-7 inline-flex min-h-12 items-center rounded-input bg-[#0052FF] px-5 py-3 text-[15px] font-bold text-white hover:bg-blue-700"
        >
          Explore stocks & scenarios
        </Link>
        <p className="mt-3 text-[13px] text-body">No wallet needed.</p>
        <p className="mt-8 rounded-input bg-amber-tint p-4 text-[13px] leading-relaxed text-amber-deep">
          When live, protection will use free test tokens on Base Sepolia. Never send real assets.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen max-w-[460px] flex-col px-6 py-7">
        <button onClick={() => navigate(-1)} className="mb-8 flex items-center gap-2 text-body">
          <ArrowLeft className="h-5 w-5" />
          <Wordmark size={26} />
        </button>

        <div className="animate-fade-up">
          <h1 className="text-[28px] font-extrabold tracking-tight2">Connect a wallet</h1>
          <p className="mt-2 text-[15px] text-body">
            Connect an installed EVM wallet. Transactions use Base Sepolia test tokens only.
          </p>

          <DeploymentStatus />
          <div className="mt-7 flex flex-col gap-3">
            {BRANDS.map((b) => {
              const c = connectorFor(b.match);
              const disabled = !c || connecting;
              return (
                <WalletButton
                  key={b.match}
                  swatch={b.swatch}
                  name={b.name}
                  sub={c ? b.sub : "Not detected"}
                  busy={busy === b.match}
                  disabled={disabled}
                  onClick={() => c && onConnect(c.id, b.match)}
                />
              );
            })}
            {others.map((c) => (
              <WalletButton
                key={c.id}
                swatch="bg-ink"
                name={c.name}
                sub="Detected"
                busy={busy === c.id}
                disabled={connecting}
                onClick={() => onConnect(c.id, c.id)}
              />
            ))}
          </div>

          {error && <p className="mt-4 text-[13px] font-medium text-amber-deep">{error}</p>}
          {connectors.length === 0 && (
            <p className="mt-4 text-[13px] text-muted">
              No wallet detected in this browser. Install an EVM wallet such as MetaMask, Rabby, or Coinbase Wallet to
              continue.
            </p>
          )}

          <p className="mt-8 text-center text-[13px] text-muted">
            You keep your keys. Contract approvals and deposits still carry significant risks. Never send real assets to
            this alpha.
          </p>
        </div>
      </div>
    </div>
  );
}

function WalletButton({
  swatch,
  name,
  sub,
  busy,
  disabled,
  onClick,
}: {
  swatch: string;
  name: string;
  sub: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3.5 rounded-card border border-hairline bg-surface p-4 text-left transition-colors",
        disabled ? "opacity-55" : "hover:bg-subtle-2",
      )}
    >
      <span className={cn("h-9 w-9 rounded-[10px]", swatch)} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{name}</span>
        <span className="block text-[13px] text-muted">{sub}</span>
      </span>
      {busy ? <Spinner className="text-muted" /> : <ChevronRight className="h-5 w-5 text-faint" />}
    </button>
  );
}
