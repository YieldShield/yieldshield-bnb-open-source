import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import { Wordmark } from "@/components/Logo";
import { protocolDeployed } from "@/chain/adapter";
import { Card, Pill } from "@/components/ui";

type Stock = {
  symbol: string;
  name: string;
  token: string;
  feed: string;
  priceUsd: number;
  multiplier: number;
  openingPriceFresh: boolean;
  sourceUpdatedAt: number;
  sourceRoundId: string;
  oraclePaused: boolean;
  status: string;
};
type Snapshot = {
  chainId: number;
  blockNumber: string;
  observedAt: number;
  validUntil: number;
  sequencerUp: boolean;
  stocks: Stock[];
};
async function fetchMarkets(): Promise<Snapshot> {
  const response = await fetch("/api/markets", { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Live Base references are temporarily unavailable.");
  const data = (await response.json()) as Snapshot;
  const now = Date.now() / 1000;
  if (
    !Number.isFinite(data.validUntil) ||
    now > data.validUntil ||
    data.observedAt > now + 15 ||
    now - data.observedAt > 180 ||
    !/^\d+$/.test(data.blockNumber) ||
    data.stocks?.some(
      (s) =>
        ["symbol", "name", "status", "token", "feed", "sourceRoundId"].some(
          (k) => typeof s[k as keyof Stock] !== "string",
        ) ||
        !/^0x[0-9a-fA-F]{40}$/.test(s.token) ||
        !/^0x[0-9a-fA-F]{40}$/.test(s.feed) ||
        s.sourceUpdatedAt > data.observedAt,
    )
  )
    throw new Error("The market observation could not be verified.");
  if (
    data.chainId !== 8453 ||
    !Array.isArray(data.stocks) ||
    !Number.isFinite(data.observedAt) ||
    data.stocks.some(
      (s) =>
        !Number.isFinite(s.priceUsd) ||
        s.priceUsd <= 0 ||
        !Number.isFinite(s.multiplier) ||
        s.multiplier <= 0 ||
        !Number.isFinite(s.sourceUpdatedAt),
    )
  )
    throw new Error("The market response could not be verified.");
  return data;
}
const usd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
function age(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() / 1000 - timestamp) / 60));
  return minutes < 1
    ? "less than a minute ago"
    : minutes < 60
      ? `${minutes}m ago`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export function Markets() {
  const { data, error, isLoading, mutate } = useSWR("base-mainnet-markets", fetchMarkets, {
    refreshInterval: 30000,
    shouldRetryOnError: false,
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const [symbol, setSymbol] = useState("AAPLc");
  const [unitsInput, setUnitsInput] = useState("10");
  const units = Number(unitsInput);
  const unitsValid = unitsInput.trim() !== "" && Number.isFinite(units) && units >= 0.01 && units <= 10000;
  const [shock, setShock] = useState(-25);
  const [collateral, setCollateral] = useState(100);
  const current =
    !!data &&
    !error &&
    now / 1000 <= data.validUntil &&
    now / 1000 - data.observedAt <= 120 &&
    data.observedAt <= now / 1000 + 15;
  const stocks = current ? data.stocks.filter((s) => s.symbol !== "USDC") : [];
  const selected = stocks.find((s) => s.symbol === symbol);
  const entry = unitsValid ? (selected?.priceUsd ?? 0) * units : 0,
    marketValue = entry * (1 + shock / 100),
    exitValue = Math.min(entry, (entry * collateral) / 100);
  return (
    <div className="mx-auto max-w-[1120px] px-5 py-7 md:px-10">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-5">
        <Link to="/welcome" aria-label="YieldShield home">
          <Wordmark size={30} />
        </Link>
        <Link to="/connect" className="rounded-input bg-ink px-5 py-3 text-[14px] font-bold text-white">
          {protocolDeployed ? "Open test alpha" : "Test alpha status"}
        </Link>
      </header>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-[#0052FF]">
            Base mainnet · Read only
          </div>
          <h1 className="text-[34px] font-extrabold leading-tight tracking-hero md:text-[44px]">Explore stock risk.</h1>
          <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-body">
            Choose a stock to model a price change. Oracle prices include corporate actions; they are not trading
            quotes.
          </p>
        </div>
        <button
          onClick={() => void mutate()}
          className="rounded-input border border-hairline bg-surface px-4 py-2.5 text-[13px] font-bold"
        >
          Refresh ↻
        </button>
      </div>
      {isLoading ? (
        <Card role="status" className="py-12 text-center text-body">
          Reading Base prices…
        </Card>
      ) : !current ? (
        <Card role="alert" className="border-amber-border bg-amber-tint">
          <h2 className="font-bold">Market data unavailable</h2>
          <p className="mt-2 text-[14px] text-body">
            {error?.message ?? "The last source check has expired."} Refresh to retry. Scenarios require verified
            prices.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-[12px] text-body">
            <Pill tone={data.sequencerUp ? "neutral" : "amber"}>
              {data.sequencerUp ? "Base source checked" : "Source sequencer unavailable"}
            </Pill>
            <span>Checked {age(data.observedAt)}</span>
            <a
              className="underline underline-offset-2"
              href={`https://basescan.org/block/${data.blockNumber}`}
              target="_blank"
              rel="noreferrer"
            >
              Block {data.blockNumber} ↗
            </a>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {stocks.map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => setSymbol(stock.symbol)}
                aria-pressed={symbol === stock.symbol}
                className={`rounded-card border bg-surface p-5 text-left transition-shadow hover:shadow-card ${symbol === stock.symbol ? "border-[#0052FF] ring-1 ring-[#0052FF]" : "border-hairline"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-chip bg-blue-50 text-[17px] font-extrabold text-[#0052FF]">
                    {stock.name[0]}
                  </span>
                  <span className="text-[12px] font-bold text-body">{stock.symbol}</span>
                </div>
                <h2 className="mt-4 text-[15px] font-bold">{stock.name}</h2>
                <div className="mt-1 text-[28px] font-extrabold tracking-tight2 tnum">{usd(stock.priceUsd)}</div>
                <div className="text-[11px] text-body">per token</div>
                <div className="mt-2 text-[12px] text-body">Price from {age(stock.sourceUpdatedAt)}</div>
                <div
                  className={`mt-3 text-[11px] font-bold ${stock.status === "reference-available" ? "text-[#0052FF]" : "text-amber-deep"}`}
                >
                  {stock.status === "reference-available" ? "Reference available" : stock.status.replaceAll("-", " ")}
                </div>
              </button>
            ))}
          </div>
          {selected && (selected.status !== "reference-available" || !data.sequencerUp) && (
            <Card className="mt-7 bg-amber-tint">
              Source unavailable. Scenario paused; prices show the last known values.
            </Card>
          )}
          {selected && selected.status === "reference-available" && data.sequencerUp && (
            <div className="mt-7 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-[22px] font-extrabold tracking-tight2">{selected.name} scenario</h2>
                  <Pill tone="neutral">Illustrative</Pill>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-body">
                  Compare holding stock with exchanging the entire position for collateral. Not a quote or forecast.
                </p>
                <div role="group" aria-label="Scenario examples" className="mt-5 flex flex-wrap gap-2">
                  {[
                    { label: "10% price drop", price: -10, backing: 100 },
                    { label: "50% price drop", price: -50, backing: 100 },
                    { label: "Collateral shortfall", price: -25, backing: 60 },
                  ].map((example) => (
                    <button
                      key={example.label}
                      type="button"
                      aria-pressed={shock === example.price && collateral === example.backing}
                      onClick={() => {
                        setShock(example.price);
                        setCollateral(example.backing);
                      }}
                      className="min-h-11 rounded-input border border-hairline px-3 py-2 text-[12px] font-bold hover:bg-blue-50 aria-pressed:border-[#0052FF] aria-pressed:bg-blue-50 aria-pressed:text-[#0052FF]"
                    >
                      {example.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setUnitsInput("10");
                      setShock(-25);
                      setCollateral(100);
                    }}
                    className="min-h-11 rounded-input px-3 py-2 text-[12px] font-bold text-body underline underline-offset-2 hover:text-ink"
                  >
                    Reset scenario
                  </button>
                </div>
                <div className="mt-6 grid gap-6">
                  <div className="text-[13px] font-bold">
                    <label htmlFor="scenario-tokens">Number of tokens</label>
                    <input
                      id="scenario-tokens"
                      name="tokens"
                      aria-describedby={unitsValid ? "token-help" : "token-help token-error"}
                      aria-invalid={!unitsValid}
                      inputMode="decimal"
                      autoComplete="off"
                      type="number"
                      min="0.01"
                      max="10000"
                      step="any"
                      value={unitsInput}
                      onChange={(e) => setUnitsInput(e.target.value)}
                      className="mt-2 block w-full rounded-input border border-hairline bg-subtle px-4 py-3 text-[18px] tnum"
                    />
                    <span id="token-help" className="mt-2 block text-[12px] font-normal text-body">
                      Each token represents {selected.multiplier} {selected.multiplier === 1 ? "share" : "shares"}.
                    </span>
                    {!unitsValid && (
                      <span id="token-error" role="alert" className="mt-2 block text-[12px] text-amber-deep">
                        Enter between 0.01 and 10,000 tokens.
                      </span>
                    )}
                  </div>
                  <label className="text-[13px] font-bold">
                    <span className="flex justify-between">
                      Price change{" "}
                      <span className="tnum">
                        {shock > 0 ? "+" : ""}
                        {shock}%
                      </span>
                    </span>
                    <input
                      aria-label="Price change"
                      aria-valuetext={`${Math.abs(shock)}% ${shock < 0 ? "decrease" : shock > 0 ? "increase" : "change"}`}
                      name="priceChange"
                      className="mt-3 h-6 w-full accent-[#0052FF]"
                      type="range"
                      min="-100"
                      max="50"
                      value={shock}
                      onChange={(e) => setShock(Number(e.target.value))}
                    />
                    <span className="mt-1 block text-[12px] font-normal text-body">
                      Scenario price: {usd(selected.priceUsd * (1 + shock / 100))} per token.
                    </span>
                  </label>
                  <label className="text-[13px] font-bold">
                    <span className="flex justify-between">
                      Available collateral <span className="tnum">{collateral}%</span>
                    </span>
                    <input
                      aria-label="Available collateral"
                      aria-describedby="collateral-help"
                      aria-valuetext={`${collateral}% of entry value`}
                      name="collateral"
                      className="mt-3 h-6 w-full accent-[#0052FF]"
                      type="range"
                      min="0"
                      max="150"
                      value={collateral}
                      onChange={(e) => setCollateral(Number(e.target.value))}
                    />
                    <span id="collateral-help" className="mt-1 block text-[12px] font-normal text-body">
                      Funds available for this exit. 100% equals the entry value.
                    </span>
                  </label>
                </div>
                {unitsValid ? (
                  <div className="mt-7 space-y-4" aria-label="Scenario comparison">
                    <ScenarioBar label="Entry value" value={entry} total={entry * 1.5} color="#8A929E" />
                    <ScenarioBar label="Hold stock" value={marketValue} total={entry * 1.5} color="#0E1114" />
                    <ScenarioBar label="Exit to collateral" value={exitValue} total={entry * 1.5} color="#0052FF" />
                  </div>
                ) : (
                  <p className="mt-7 text-[13px] text-body">Enter a token amount to compare outcomes.</p>
                )}
                <p className="mt-5 rounded-input bg-amber-tint p-3.5 text-[12px] leading-relaxed text-amber-deep">
                  {collateral < 100
                    ? "Collateral falls short of entry value."
                    : "Full collateral does not guarantee a withdrawal."}{" "}
                  Excludes fees, execution price changes, competing claims and outages. Collateral is valued in USD at
                  withdrawal.
                </p>
              </Card>
              <div className="space-y-5">
                <Card>
                  <h2 className="text-[18px] font-extrabold">Price source</h2>
                  <dl className="mt-5 space-y-4 text-[13px]">
                    <Detail label="Network">Base mainnet · 8453</Detail>
                    <Detail label="Token">
                      <a
                        href={`https://basescan.org/token/${selected.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#0052FF] underline"
                      >
                        {short(selected.token)} ↗
                      </a>
                    </Detail>
                    <Detail label="Chainlink feed">
                      <a
                        href={`https://basescan.org/address/${selected.feed}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#0052FF] underline"
                      >
                        {short(selected.feed)} ↗
                      </a>
                    </Detail>
                    <Detail label="Shares per raw token">{selected.multiplier}</Detail>
                    <Detail label="Oracle pause">{selected.oraclePaused ? "Paused" : "Not paused"}</Detail>
                    <Detail label="Price timestamp">
                      {new Date(selected.sourceUpdatedAt * 1000).toLocaleString()}
                    </Detail>
                  </dl>
                  {!selected.openingPriceFresh && (
                    <p className="mt-4 rounded-input bg-amber-tint p-3 text-[12px] text-amber-deep">
                      Price too old to open a position. Openings require a price from the past hour and an approved
                      market session.
                    </p>
                  )}
                  <p className="mt-5 border-t border-hairline pt-4 text-[12px] leading-relaxed text-body">
                    Prices include the share multiplier. They can stop updating outside market hours or during issuer
                    pauses, even if source checks continue.
                  </p>
                </Card>
                <Card className="bg-ink text-white">
                  <h2 className="text-[20px] font-extrabold">
                    {protocolDeployed ? "Test on Sepolia" : "Test alpha not live yet"}
                  </h2>
                  <p className="mt-3 text-[14px] leading-relaxed text-white/70">
                    {protocolDeployed
                      ? "Mock stocks have no value, represent no shares and are not issued by Coinbase."
                      : "Contract testing is not available yet. Explore scenarios without a wallet."}
                  </p>
                  <Link
                    to="/connect"
                    className="mt-5 inline-block rounded-input bg-white px-5 py-3 text-[14px] font-bold text-ink"
                  >
                    {protocolDeployed ? "Open test alpha →" : "View test alpha status →"}
                  </Link>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
      <p className="mt-8 text-[12px] leading-relaxed text-body">
        Hawig Ventures UG (haftungsbeschränkt). No affiliation with or endorsement by Base, Coinbase, Chainlink or stock
        issuers. No mainnet trading.{" "}
        <a
          className="underline"
          href="https://docs.base.org/specifications/b20/tokenized-stocks-on-base"
          target="_blank"
          rel="noreferrer"
        >
          Base token specification
        </a>{" "}
        ·{" "}
        <a
          className="underline"
          href="https://docs.chain.link/data-feeds/tokenized-equity-feeds/coinbase"
          target="_blank"
          rel="noreferrer"
        >
          Chainlink feeds
        </a>
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
      <div className="h-3 overflow-hidden rounded-full bg-subtle-2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0}%`, background: color }}
        />
      </div>
    </div>
  );
}
