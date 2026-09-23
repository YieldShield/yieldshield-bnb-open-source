import { protocolDeployed } from "@/chain/adapter";
import { Link } from "react-router-dom";
export function AlphaNotice() {
  return (
    <div className="border-b border-brand/20 bg-brand-tint px-4 py-2.5 text-center text-[12px] leading-relaxed text-brand-deep">
      <strong>BNB Chain testnet prototype.</strong> Free demo tokens · Synthetic protection prices · No real deposits.{" "}
      <Link to="/risks" className="font-bold underline underline-offset-2">
        About the risks
      </Link>
    </div>
  );
}
export function LegalLinks() {
  return (
    <nav
      aria-label="Legal and product information"
      className="flex flex-wrap justify-center gap-x-5 gap-y-3 text-[12px] text-body"
    >
      <Link to="/welcome">Home</Link>
      <Link to="/markets">Tokens</Link>
      <Link to="/testnet">Testnet demo</Link>
      <Link to="/legal">Imprint</Link>
      <Link to="/terms">Terms</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/risks">Risks</Link>
    </nav>
  );
}
export function DeploymentStatus() {
  if (protocolDeployed) return null;
  return (
    <p
      role="status"
      className="my-4 rounded-input border border-brand/20 bg-brand-tint p-3.5 text-[13px] leading-relaxed text-brand-deep"
    >
      BSC testnet protection is not live yet. Explore token prices and scenarios in{" "}
      <Link to="/markets" className="font-bold underline">
        Markets
      </Link>
      .
    </p>
  );
}
