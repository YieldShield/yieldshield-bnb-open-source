import { Link, useLocation, useSearchParams } from "react-router-dom";
import { TestFaucet } from "@/components/TestFaucet";
import { Card, buttonStyles } from "@/components/ui";
import { useWalletConnection } from "@/chain/wallet";
import { safeNextPath, setupLink } from "@/lib/navigation";

export function TestTokens() {
  const [params] = useSearchParams();
  const { pathname, search, hash } = useLocation();
  const next = safeNextPath(params.get("next"));
  const { connected } = useWalletConnection();
  return (
    <div className="animate-fade-up">
      <Link to={next} className="text-[13px] font-bold text-body hover:text-ink">← Back</Link>
      <div className="mt-6 max-w-[660px]">
        <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em] text-brand-deep">BSC Testnet · free tokens</p>
        <h1 className="text-[34px] font-extrabold leading-tight tracking-hero md:text-[44px]">Set up your test wallet.</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-body">
          Use test BNB for network fees, then claim tWBNB and TestUSDC for trading and protection. These tokens have no redeemable value.
        </p>
      </div>
      <div className="mt-7 grid gap-5 md:grid-cols-2">
        <Card>
          <span className="text-[12px] font-bold text-brand-deep">01 / NETWORK FEES</span>
          <h2 className="mt-3 text-[20px] font-extrabold">Get test BNB.</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-body">Add BSC Testnet (chain 97) to your wallet and request test BNB from the official faucet. Every approval and trade needs some test BNB for gas.</p>
          <a href="https://www.bnbchain.org/en/testnet-faucet" target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", className: "mt-5" })}>Official test BNB faucet ↗</a>
        </Card>
        <Card>
          <span className="text-[12px] font-bold text-brand-deep">02 / DEMO ASSETS</span>
          <h2 className="mt-3 text-[20px] font-extrabold">Claim test tokens.</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-body">The YieldShield faucet supplies 5 tWBNB and 10,000 TestUSDC per wallet every 24 hours, when inventory is available.</p>
          <p className="mt-3 text-[12px] font-semibold text-brand-deep">tWBNB is a synthetic test token. It is not wrapped BNB.</p>
        </Card>
      </div>
      <div className="mt-6">
        {connected ? (
          <TestFaucet />
        ) : (
          <Card className="border-brand/30 bg-brand-tint">
            <h2 className="text-[18px] font-bold">Connect to check your eligibility.</h2>
            <p className="mt-2 text-[13px] text-body">Connecting does not claim tokens or sign a transaction.</p>
            <Link to={setupLink("/connect", pathname, search, hash)} className={buttonStyles({ variant: "primary", className: "mt-5" })}>Connect wallet</Link>
          </Card>
        )}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={next} className={buttonStyles({ variant: "primary" })}>Continue to {next.startsWith("/markets") ? "protection" : "Trade"} →</Link>
        <Link to="/how-it-works" className={buttonStyles({ variant: "secondary" })}>How it works</Link>
      </div>
    </div>
  );
}
