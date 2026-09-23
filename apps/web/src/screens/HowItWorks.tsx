import { Link } from "react-router-dom";
import { Card, buttonStyles } from "@/components/ui";

const steps = [
  ["01", "Get test tokens", "Connect on BSC Testnet, get test BNB for gas, then claim free tWBNB and TestUSDC."],
  ["02", "Trade", "Buy or sell tWBNB with TestUSDC at a synthetic price. Review a fresh quote and your exact payment or proceeds limit before signing."],
  ["03", "Protect", "Deposit tWBNB in the test pool. After the wait, you may withdraw tWBNB or request a TestUSDC exit if contract conditions are met."],
  ["04", "Provide collateral", "Deposit TestUSDC backing. It absorbs losses first and may share gains. Withdrawals require notice and available collateral."],
];

export function HowItWorks() {
  return (
    <div className="animate-fade-up">
      <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em] text-brand-deep">The testnet journey</p>
      <h1 className="max-w-[16ch] text-[36px] font-extrabold leading-tight tracking-hero md:text-[48px]">From a trade to a protected position.</h1>
      <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-body">
        Buying a token leaves it in your wallet. You choose separately whether to protect it. Every transaction uses valueless BSC Testnet assets.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {steps.map(([number, title, body]) => (
          <Card key={number} className="flex gap-4">
            <span className="text-[13px] font-extrabold text-brand-deep">{number}</span>
            <div><h2 className="text-[18px] font-bold">{title}</h2><p className="mt-2 text-[13px] leading-relaxed text-body">{body}</p></div>
          </Card>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/trade" className={buttonStyles({ variant: "primary" })}>Start trading</Link>
        <Link to="/markets" className={buttonStyles({ variant: "secondary" })}>See protection</Link>
      </div>
      <p className="mt-8 text-[12px] leading-relaxed text-body">
        The four-minute synthetic price cycle is for testing. No real BNB or customer assets back the demo tokens. Trading and protection contracts can fail; no payout is guaranteed. <Link to="/testnet/technical" className="font-bold underline">View contract evidence</Link>.
      </p>
    </div>
  );
}
