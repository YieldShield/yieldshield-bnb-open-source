import { protocolDeployed } from "@/chain/adapter";
import { DeploymentStatus } from "@/components/AlphaNotice";
import { Link, useNavigate } from "react-router-dom";
import { Wordmark } from "@/components/Logo";
import { Button } from "@/components/ui";
export function Welcome() {
  const navigate = useNavigate();
  return (
    <div className="bg-gradient-to-b from-[#fbfbfc] to-[#f1f3f6]">
      <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-[1100px] flex-col px-6 py-7 md:px-10">
        <header className="flex flex-wrap items-center justify-between gap-5">
          <Wordmark size={30} />
          <Link to="/markets" className="text-[14px] font-bold text-[#0052FF]">
            Explore stocks ↗
          </Link>
        </header>
        <div className="flex flex-1 flex-col justify-center gap-10 py-12 md:grid md:grid-cols-2 md:items-center md:gap-16">
          <div className="animate-fade-up">
            <div className="mb-5 text-[12px] font-bold uppercase tracking-[0.14em] text-[#0052FF]">
              Tokenized stocks · On Base
            </div>
            <h1 className="max-w-[12ch] text-[46px] font-extrabold leading-[1.04] tracking-hero md:text-[64px]">
              Stock risk,
              <br />
              <span className="text-[#0052FF]">made visible.</span>
            </h1>
            <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-body">
              Explore Coinbase stock tokens on Base. Model how price changes and shared collateral affect a position.
            </p>
            <p className="mt-6 max-w-[44ch] text-[13px] leading-relaxed text-body">
              Protection can fail. No guaranteed yield, insurance or capital protection.
            </p>
          </div>
          <div className="rounded-hero bg-surface p-6 shadow-welcome md:p-8">
            <div className="mb-8 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-input bg-[#0052FF] text-2xl font-bold text-white">
                ↗
              </span>
              <div>
                <h2 className="text-[22px] font-extrabold tracking-tight2">Try a scenario</h2>
              </div>
            </div>
            <div className="space-y-5">
              {[
                ["01", "Choose a stock", "Apple, NVIDIA, Meta or Alphabet."],
                ["02", "Model the downside", "Adjust the price and available collateral."],
                ...(protocolDeployed ? [["03", "Try protection", "Use free test stocks on Base Sepolia."]] : []),
              ].map(([n, title, sub]) => (
                <div key={n} className="flex gap-4">
                  <span className="mt-1 text-[12px] font-bold text-[#0052FF]">{n}</span>
                  <div>
                    <div className="text-[15px] font-bold">{title}</div>
                    <p className="mt-0.5 text-[13px] text-body">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
            <DeploymentStatus />
            <div className="mt-8 flex flex-col gap-3">
              <Button full onClick={() => navigate("/markets")} className="bg-[#0052FF] hover:bg-blue-700">
                Explore stocks & scenarios
              </Button>
              <Button variant="secondary" full onClick={() => navigate("/connect")}>
                {protocolDeployed ? "Connect test wallet" : "Test alpha status"}
              </Button>
            </div>
            <p className="mt-5 text-center text-[12px] text-body">No wallet needed to explore.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
