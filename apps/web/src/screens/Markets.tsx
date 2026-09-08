import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import { Wordmark } from "@/components/Logo";
import { Card, Pill } from "@/components/ui";
import { calculateScenario, fetchMarkets, referenceIsFresh } from "@/lib/markets";

const usd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const glyphs: Record<string, string> = { WBNB: "◆", BTCB: "₿", ETH: "Ξ", CAKE: "◉" };
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
function age(timestamp: number, now: number) {
  const elapsed = Math.max(0, Math.floor(now - timestamp));
  return elapsed < 60
    ? `${elapsed}s ago`
    : elapsed < 3600
      ? `${Math.floor(elapsed / 60)}m ago`
      : `${Math.floor(elapsed / 3600)}h ago`;
}
const examples = [
  { label: "10% price drop", change: -10, backing: 100 },
  { label: "50% price drop", change: -50, backing: 100 },
  { label: "Collateral shortfall", change: -25, backing: 60 },
];

export function Markets() {
  const { data, error, isLoading, isValidating, mutate } = useSWR("bnb-mainnet-markets", fetchMarkets, {
    refreshInterval: 30000,
    shouldRetryOnError: false,
  });
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  const [symbol, setSymbol] = useState("WBNB");
  const [unitsInput, setUnitsInput] = useState("1");
  const [change, setChange] = useState(-25);
  const [collateral, setCollateral] = useState(100);
  const units = Number(unitsInput);
  const unitsValid = unitsInput.trim() !== "" && Number.isFinite(units) && units >= 0.000001 && units <= 10000;
  const current = !!data && !error && now <= data.validUntil && data.observedAt <= now + 15;
  const tokens = current ? data.tokens : [];
  const selected = tokens.find((token) => token.symbol === symbol);
  const usable = !!selected && referenceIsFresh(selected, now);
  const scenario =
    usable && unitsValid && selected.priceUsd !== null
      ? calculateScenario(selected.priceUsd, units, change, collateral)
      : null;
  function reset() {
    setUnitsInput("1");
    setChange(-25);
    setCollateral(100);
  }

  return (
    <div className="mx-auto max-w-[1160px] px-5 py-7 md:px-10">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-5">
        <Link to="/welcome" aria-label="YieldShield home">
          <Wordmark size={32} />
        </Link>
        <Link to="/connect" className="rounded-input bg-ink px-4 py-3 text-[13px] font-bold text-white">
          Testnet status ↗
        </Link>
      </header>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-deep">
            <span className="h-2 w-2 rotate-45 bg-brand" /> BNB Smart Chain · Read only
          </div>
          <h1 className="text-[36px] font-extrabold leading-tight tracking-hero md:text-[48px]">Explore token risk.</h1>
          <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-body">
            Pick a token. Move the market. See what collateral changes.
          </p>
        </div>
        <button
          type="button"
          disabled={isValidating}
          onClick={() => void mutate()}
          className="min-h-11 rounded-input border border-hairline bg-surface px-4 py-2.5 text-[13px] font-bold hover:bg-brand-tint disabled:opacity-50"
        >
          {isValidating ? "Refreshing…" : "Refresh prices ↻"}
        </button>
      </div>
      {isLoading ? (
        <Card role="status" className="py-16 text-center text-body">
          Reading BNB Chain prices…
        </Card>
      ) : !current ? (
        <Card role="alert" className="border-amber-border bg-amber-tint">
          <h2 className="font-bold">Live prices are unavailable</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-body">
            {error?.message ?? "The last observation has expired."} Scenarios pause until fresh references return.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-[12px] text-body">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green" /> Chainlink references
            </span>
            <span aria-hidden>·</span>
            <span>Checked {age(data.observedAt, now)}</span>
            <a
              className="underline underline-offset-2"
              href={`https://bscscan.com/block/${data.blockNumber}`}
              target="_blank"
              rel="noreferrer"
            >
              View source block ↗
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tokens.map((token) => {
              const fresh = referenceIsFresh(token, now);
              return (
                <button
                  key={token.symbol}
                  type="button"
                  onClick={() => setSymbol(token.symbol)}
                  aria-pressed={symbol === token.symbol}
                  className={`min-w-0 rounded-card border p-4 text-left transition-all hover:shadow-card md:p-5 ${symbol === token.symbol ? "border-brand bg-brand-tint ring-1 ring-brand" : "border-hairline bg-surface"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-[23px] font-bold ${symbol === token.symbol ? "bg-brand text-ink" : "bg-subtle-2 text-ink"}`}
                      aria-hidden
                    >
                      {glyphs[token.symbol]}
                    </span>
                    <span className="text-[12px] font-bold text-body">{token.symbol}</span>
                  </div>
                  <h2 className="mt-4 min-h-10 text-[13px] font-bold md:text-[14px]">{token.name}</h2>
                  <div className="mt-1 text-[23px] font-extrabold tracking-tight2 tnum md:text-[27px]">
                    {fresh && token.priceUsd !== null ? usd(token.priceUsd) : "—"}
                  </div>
                  <div className={`mt-2 text-[11px] ${fresh ? "text-body" : "font-bold text-amber-deep"}`}>
                    {fresh
                      ? `${token.referenceSymbol}/USD reference`
                      : token.status === "unavailable"
                        ? "Source unavailable"
                        : "Price expired"}
                  </div>
                </button>
              );
            })}
          </div>
          {selected && !usable && (
            <Card role="status" className="mt-6 bg-amber-tint">
              This token's price is unavailable or over five minutes old. Choose another token or refresh to retry.
            </Card>
          )}
          {selected && usable && selected.priceUsd !== null && (
            <div id="scenario" className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-[23px] font-extrabold tracking-tight2">{selected.symbol} scenario</h2>
                  <Pill tone="neutral">Illustrative</Pill>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-body">
                  Compare holding your tokens with exchanging the entire position for available collateral.
                </p>
                <div role="group" aria-label="Scenario examples" className="mt-5 flex flex-wrap gap-2">
                  {examples.map((example) => (
                    <button
                      key={example.label}
                      type="button"
                      aria-pressed={change === example.change && collateral === example.backing}
                      onClick={() => {
                        setChange(example.change);
                        setCollateral(example.backing);
                      }}
                      className="min-h-11 rounded-input border border-hairline px-3 py-2 text-[12px] font-bold hover:bg-brand-tint aria-pressed:border-brand aria-pressed:bg-brand-tint"
                    >
                      {example.label}
                    </button>
                  ))}
                </div>
                <div className="mt-6 space-y-6">
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <label htmlFor="scenario-tokens" className="text-[13px] font-bold">
                        Number of tokens
                      </label>
                      <button
                        type="button"
                        onClick={reset}
                        className="min-h-7 text-[12px] text-body underline underline-offset-2"
                      >
                        Reset
                      </button>
                    </div>
                    <div className="relative mt-2">
                      <input
                        id="scenario-tokens"
                        name="tokens"
                        aria-invalid={!unitsValid}
                        aria-describedby={unitsValid ? "token-help" : "token-help token-error"}
                        inputMode="decimal"
                        autoComplete="off"
                        type="number"
                        min="0.000001"
                        max="10000"
                        step="any"
                        value={unitsInput}
                        onChange={(e) => setUnitsInput(e.target.value)}
                        className="block w-full rounded-input border border-hairline bg-subtle px-4 py-3 pr-20 text-[20px] font-bold tnum"
                      />
                      <span className="pointer-events-none absolute right-4 top-4 text-[12px] font-bold text-body">
                        {selected.symbol}
                      </span>
                    </div>
                    <p id="token-help" className="mt-2 text-[12px] text-body">
                      Starting reference: {usd(selected.priceUsd)} per token.
                    </p>
                    {!unitsValid && (
                      <p id="token-error" role="alert" className="mt-2 text-[12px] text-amber-deep">
                        Enter between 0.000001 and 10,000 tokens.
                      </p>
                    )}
                  </div>
                  <label className="block text-[13px] font-bold">
                    <span className="flex justify-between gap-3">
                      Price change{" "}
                      <span className="tnum">
                        {change > 0 ? "+" : ""}
                        {change}%
                      </span>
                    </span>
                    <input
                      aria-label="Price change"
                      aria-valuetext={`${change}%`}
                      className="mt-3 h-6 w-full accent-brand"
                      type="range"
                      min="-100"
                      max="50"
                      value={change}
                      onChange={(e) => setChange(Number(e.target.value))}
                    />
                    <span className="mt-1 block text-[12px] font-normal text-body">
                      Scenario price: {usd(selected.priceUsd * (1 + change / 100))} per token.
                    </span>
                  </label>
                  <label className="block text-[13px] font-bold">
                    <span className="flex justify-between gap-3">
                      Available collateral <span className="tnum">{collateral}%</span>
                    </span>
                    <input
                      aria-label="Available collateral"
                      aria-describedby="collateral-help"
                      aria-valuetext={`${collateral}% of entry value`}
                      className="mt-3 h-6 w-full accent-brand"
                      type="range"
                      min="0"
                      max="150"
                      value={collateral}
                      onChange={(e) => setCollateral(Number(e.target.value))}
                    />
                    <span id="collateral-help" className="mt-1 block text-[12px] font-normal text-body">
                      100% equals the entry value. This is a scenario assumption.
                    </span>
                  </label>
                </div>
                {scenario ? (
                  <div className="mt-7 space-y-4 border-t border-hairline pt-6" aria-label="Scenario comparison">
                    <ScenarioBar
                      label="Entry value"
                      value={scenario.entry}
                      total={scenario.entry * 1.5}
                      color="#B9B6AC"
                    />
                    <ScenarioBar
                      label="Hold tokens"
                      value={scenario.hold}
                      total={scenario.entry * 1.5}
                      color="#171A1E"
                    />
                    <ScenarioBar
                      label="Exit to collateral"
                      value={scenario.collateralExit}
                      total={scenario.entry * 1.5}
                      color="#F0B90B"
                    />
                  </div>
                ) : (
                  <p className="mt-7 text-[13px] text-body">Enter a token amount to compare outcomes.</p>
                )}
                <p className="mt-5 rounded-input bg-subtle p-3.5 text-[12px] leading-relaxed text-body">
                  {collateral < 100
                    ? "Collateral falls short of entry value. "
                    : "Full collateral does not guarantee an exit. "}
                  The model excludes fees, execution changes, competing claims and outages.
                </p>
              </Card>
              <div className="space-y-5">
                <Card className="border-transparent bg-ink text-white">
                  <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
                    What the numbers mean
                  </div>
                  <h2 className="text-[22px] font-extrabold tracking-tight2">Backing matters.</h2>
                  <p className="mt-3 text-[14px] leading-relaxed text-white/75">
                    Protectors supply collateral and take risk. A shielded position can exchange its tokens for backing,
                    subject to the pool's rules and limits.
                  </p>
                  <p className="mt-4 border-t border-white/15 pt-4 text-[13px] leading-relaxed text-white/75">
                    The two outcomes are alternatives. You do not keep your tokens and receive the full collateral exit
                    as well.
                  </p>
                  <Link
                    to="/risks"
                    className="mt-5 inline-flex min-h-10 items-center text-[13px] font-bold text-brand underline underline-offset-4"
                  >
                    How protection can fail ↗
                  </Link>
                </Card>
                <Card>
                  <h2 className="text-[18px] font-extrabold">Know your price source.</h2>
                  <p className="mt-3 text-[13px] leading-relaxed text-body">{selected.note}</p>
                  <div className="mt-4 flex items-center gap-2 text-[12px] text-body">
                    <span className="h-1.5 w-1.5 rounded-full bg-green" /> Price updated{" "}
                    {age(selected.sourceUpdatedAt!, now)}
                  </div>
                  <details className="mt-5 border-t border-hairline pt-4">
                    <summary className="cursor-pointer text-[13px] font-bold">View source details</summary>
                    <dl className="mt-5 space-y-4 text-[12px]">
                      <Detail label="Network">BSC mainnet · 56</Detail>
                      <Detail label="Token">
                        <a
                          className="underline"
                          href={`https://bscscan.com/token/${selected.token}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {short(selected.token)} ↗
                        </a>
                      </Detail>
                      <Detail label="Chainlink feed">
                        <a
                          className="underline"
                          href={`https://bscscan.com/address/${selected.feed}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {short(selected.feed)} ↗
                        </a>
                      </Detail>
                      <Detail label="Reference">{selected.description}</Detail>
                      <Detail label="Price timestamp">
                        {new Date(selected.sourceUpdatedAt! * 1000).toLocaleString()}
                      </Detail>
                    </dl>
                    <a
                      className="mt-5 inline-block text-[12px] font-bold underline underline-offset-2"
                      href={`https://data.chain.link/feeds/bsc/mainnet/${selected.feedPath}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Chainlink source page ↗
                    </a>
                  </details>
                </Card>
                <p className="px-1 text-[12px] leading-relaxed text-body">
                  No wallet or deposit is needed.{" "}
                  <Link to="/connect" className="font-semibold underline underline-offset-2">
                    BSC testnet status ↗
                  </Link>
                </p>
              </div>
            </div>
          )}
        </>
      )}
      <p className="mt-9 text-[11px] leading-relaxed text-body">
        Hawig Ventures UG (haftungsbeschränkt). Independent software; no endorsement by BNB Chain, Binance, Chainlink or
        token issuers. References are not executable trading quotes.
      </p>
    </div>
  );
}
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-body">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
function ScenarioBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <div>
      <div className="mb-2 flex justify-between gap-4 text-[12px]">
        <span className="text-body">{label}</span>
        <strong className="tnum">{usd(value)}</strong>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-subtle-2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(0, Math.min(100, (value / total) * 100))}%`, background: color }}
        />
      </div>
    </div>
  );
}
