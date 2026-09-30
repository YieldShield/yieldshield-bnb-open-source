import { Link } from "react-router-dom";
import { Wordmark } from "@/components/Logo";
import { Card } from "@/components/ui";
import { chain, protocolDeployed } from "@/chain/adapter";
import { useWalletConnection } from "@/chain/wallet";
import { usePools } from "@/data/pools";

const steps = [
  [
    "01",
    "Get free test tokens",
    "Connect your wallet to BSC Testnet. Add a little test BNB for network fees, then claim staking tokens, stablecoin receipts and TestUSDC from the token dispenser. Each wallet can claim once a day.",
  ],
  [
    "02",
    "Choose a yield asset",
    "Buy or sell a supported synthetic yield token with TestUSDC. Review the synthetic quote, your chosen price tolerance, and the exact payment or proceeds limit.",
  ],
  [
    "03",
    "Protect and manage",
    "Deposit your test token into its protection pool. Withdraw in that token, or wait at least one minute and choose a TestUSDC payout when the demo price is below entry and collateral is available.",
  ],
  [
    "04",
    "Explore the other side",
    "Provide TestUSDC backing to earn a share of demo gains. To withdraw, request an unlock and wait two minutes. Outstanding protected positions can limit withdrawals.",
  ],
];

export function Testnet() {
  return (
    <div className="mx-auto max-w-[1160px] px-6 py-7 md:px-10">
      <header className="flex items-center justify-between gap-5">
        <Link to="/welcome" aria-label="YieldShield home">
          <Wordmark size={30} />
        </Link>
        <Link to="/trade" className="text-[13px] font-bold underline underline-offset-4">
          Trade test tokens ↗
        </Link>
      </header>
      <div className="mb-10 mt-14 grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-end">
        <div>
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-deep">
            BSC Testnet · Chain 97
          </p>
          <h1 className="max-w-[13ch] text-[44px] font-extrabold leading-[1.05] tracking-hero md:text-[60px]">
            Try protection.
            <br />
            <span className="brand-underline">Keep it testnet.</span>
          </h1>
          <p className="mt-6 max-w-[48ch] text-[17px] leading-relaxed text-body">
            Five token markets. Free demo assets. Explore staking and stablecoin yield, protect a position, and follow
            it to withdrawal.
          </p>
        </div>
        <Card className="border-brand/30 bg-brand-tint">
          <p className="text-[12px] font-bold uppercase tracking-widest text-brand-deep">
            Staking · stablecoin yield · lending
          </p>
          <h2 className="mt-3 text-[22px] font-extrabold">Yield growth. Downside shocks.</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-body">
            tSlisBNB, tWBETH, tsUSDe and tvUSDT illustrate accelerated yield growth and temporary downside shocks in
            repeating four-minute cycles. The original tWBNB market keeps its BNB price cycle. No formula tracks real
            returns or prices.
          </p>
          <p className="mt-4 text-[12px] font-semibold text-brand-deep">
            All six demo tokens are synthetic and have no redeemable value.
          </p>
        </Card>
      </div>
      {protocolDeployed ? (
        <LiveDemo />
      ) : (
        <Card role="status" className="mb-8">
          <h2 className="text-[18px] font-bold">Public deployment is being prepared</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-body">
            The testnet contracts and local protection flow are implemented. Wallet transactions will open here after
            the public deployment and its verification are complete.
          </p>
          <Link
            to="/learn/scenarios"
            className="mt-4 inline-flex font-bold text-brand-deep underline underline-offset-4"
          >
            Explore prices and scenarios now ↗
          </Link>
        </Card>
      )}
      <Link
        to="/testnet/technical"
        className="mb-6 inline-flex text-sm font-bold text-brand-deep underline underline-offset-4"
      >
        Contract reference and test evidence ↗
      </Link>
      <div className="grid gap-4 md:grid-cols-2">
        {steps.map(([number, title, body]) => (
          <Card key={number} className="flex gap-5">
            <span className="pt-1 text-[13px] font-bold text-brand-deep">{number}</span>
            <div>
              <h2 className="text-[18px] font-bold">{title}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-body">{body}</p>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-8 grid gap-6 border-t border-hairline pt-7 text-[13px] leading-relaxed text-body md:grid-cols-2">
        <p>
          Need gas? Use the{" "}
          <a
            href="https://www.bnbchain.org/en/testnet-faucet"
            target="_blank"
            rel="noreferrer"
            className="font-bold underline"
          >
            official test BNB faucet
          </a>
          . Test BNB pays network fees; our faucet supplies tokens for the trading and protection markets. Do not send
          real assets.
        </p>
        <p>
          This is an unaudited testnet prototype with internal testing. Operator administration uses a two-day timelock.
          The seeded collateral is free test liquidity, not customer deposits or real TVL.{" "}
          <Link to="/risks" className="font-bold underline">
            Read the risks.
          </Link>
        </p>
      </div>
    </div>
  );
}

function LiveDemo() {
  const { data, loading, error } = usePools();
  const { connected } = useWalletConnection();
  const pools = data.filter((p) => p.backing.symbol === "TestUSDC");
  const available = pools.filter((p) => !p.paused && p.availability?.openPosition.state === "available");
  const ready = available.length > 0 && !error;
  return (
    <Card className="mb-8" role="status">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h2 className="text-[19px] font-bold">
            {loading
              ? "Checking the testnet pool…"
              : ready
                ? `The testnet demo is live · ${available.length} pools available`
                : "The testnet pool is currently unavailable"}
          </h2>
          <p className="mt-2 text-[14px] text-body">
            {ready
              ? "Connect, claim free tokens, and try the complete flow."
              : "Pool reads must be available before starting a deposit. You can still inspect the published contracts."}
          </p>
          <a
            href={`https://testnet.bscscan.com/address/${chain.protocolId}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex text-[12px] font-bold underline"
          >
            View the deployed factory ↗
          </a>
        </div>
        {ready && (
          <Link
            to={connected ? "/trade" : "/connect?next=%2Ftrade"}
            className="inline-flex min-h-12 items-center rounded-input bg-brand px-6 text-[14px] font-bold text-ink hover:bg-brand-hover"
          >
            {connected ? "Trade test tokens" : "Connect & try it"} ↗
          </Link>
        )}
      </div>
    </Card>
  );
}
