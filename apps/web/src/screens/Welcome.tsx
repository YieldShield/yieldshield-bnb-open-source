import { Link } from "react-router-dom";
import { Wordmark } from "@/components/Logo";

export function Welcome() {
  return (
    <div className="welcome-surface">
      <div className="mx-auto flex min-h-[calc(100svh-132px)] max-w-[1160px] flex-col px-6 py-7 md:px-10">
        <header className="flex flex-wrap items-center justify-between gap-5">
          <Wordmark size={32} />
          <Link to="/markets" className="text-[14px] font-bold text-ink hover:underline underline-offset-4">
            Explore tokens ↗
          </Link>
        </header>
        <div className="flex flex-1 flex-col justify-center gap-12 py-14 md:grid md:grid-cols-[1.1fr_1fr] md:items-center md:gap-16">
          <div className="animate-fade-up">
            <div className="mb-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-deep">
              <span className="h-2 w-2 rotate-45 bg-brand" /> Built for BNB Chain
            </div>
            <h1 className="max-w-[12ch] text-[48px] font-extrabold leading-[1.04] tracking-hero md:text-[70px]">
              Token risk,
              <br />
              <span className="brand-underline">made visible.</span>
            </h1>
            <p className="mt-7 max-w-[40ch] text-[18px] leading-relaxed text-body">
              Know what backs your position. Explore token prices and see how protection behaves when markets move.
            </p>
            <Link
              to="/markets"
              className="mt-8 inline-flex min-h-14 items-center justify-center gap-5 rounded-input bg-brand px-6 text-[15px] font-bold text-ink transition-colors hover:bg-brand-hover"
            >
              Explore tokens & scenarios <span aria-hidden>↗</span>
            </Link>
            <p className="mt-4 text-[12px] text-body">Live BSC references. No wallet needed.</p>
          </div>
          <div className="animate-fade-up rounded-hero border border-white bg-surface p-6 shadow-welcome md:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[21px] font-extrabold tracking-tight2">Understand the downside.</h2>
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input bg-brand-tint text-xl text-brand-deep"
                aria-hidden
              >
                ↘
              </span>
            </div>
            <div
              className="my-7 flex items-center gap-2 rounded-input bg-subtle p-3.5"
              aria-label="Supported token references"
            >
              {[
                ["WBNB", "◆"],
                ["BTCB", "₿"],
                ["ETH", "Ξ"],
                ["CAKE", "◉"],
              ].map(([symbol, glyph]) => (
                <div key={symbol} className="flex flex-1 flex-col items-center gap-2 py-1">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[22px] font-bold text-ink">
                    {glyph}
                  </span>
                  <span className="text-[10px] font-bold tracking-wide text-body">{symbol}</span>
                </div>
              ))}
            </div>
            <div className="space-y-6">
              {[
                ["01", "Pick your token", "Start with a live, traceable price reference."],
                ["02", "Move the market", "Try a price drop or a collateral shortfall."],
                ["03", "Compare your options", "See holding value beside a modeled collateral exit."],
              ].map(([n, title, sub]) => (
                <div key={n} className="flex gap-4">
                  <span className="mt-1 text-[12px] font-bold text-brand-deep">{n}</span>
                  <div>
                    <div className="text-[15px] font-bold">{title}</div>
                    <p className="mt-1 text-[13px] leading-relaxed text-body">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-7 border-t border-hairline pt-5 text-[12px] leading-relaxed text-body">
              A working risk explorer. Protection deposits are not live yet.{" "}
              <Link to="/connect" className="font-bold text-ink underline underline-offset-2">
                View testnet status
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
