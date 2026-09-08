import { protocolDeployed } from "@/chain/adapter";
import { Link } from "react-router-dom";
export function AlphaNotice() {
  return (
    <div className="border-b border-amber-border bg-amber-tint px-4 py-2.5 text-center text-[12px] leading-relaxed text-amber-deep">
      <strong>Early alpha · Unaudited · High risk.</strong> Base mainnet data. Protection uses valueless Sepolia test
      tokens.{" "}
      <Link to="/risks" className="font-bold underline underline-offset-2">
        Risks
      </Link>
    </div>
  );
}
export function LegalLinks() {
  return (
    <nav
      aria-label="Legal and product information"
      className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[12px] text-body"
    >
      <Link to="/markets">Markets</Link>
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
      className="my-4 rounded-input border border-amber-border bg-amber-tint p-3.5 text-[13px] leading-relaxed text-amber-deep"
    >
      Sepolia contracts are not deployed. Explore prices and scenarios in{" "}
      <Link to="/markets" className="font-bold underline">
        Markets
      </Link>
      .
    </p>
  );
}
