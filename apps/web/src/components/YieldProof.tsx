import { AssetGlyph, Card } from "@/components/ui";
import { yieldAssetFor } from "@/config/yield-assets";

type Receipt = { id: string; hash: string; blockNumber: string };
export type YieldProofData = {
  verifiedAt: string;
  contracts: { name: string; address: string; codeHash: string }[];
  assets: {
    id: string;
    symbol: string;
    name: string;
    decimals: number;
    address: string;
    pool: string;
    demoYieldBpsPerCycle: string;
    downsideBps: string;
  }[];
  transactions: Receipt[];
  walkthrough?: { status: string; scope: string; transactions: Receipt[] };
};
const explorer = "https://testnet.bscscan.com";

export function YieldProof({ proof }: { proof: YieldProofData }) {
  const walkthrough = proof.walkthrough?.status === "complete" ? proof.walkthrough : null;
  return (
    <section className="my-10">
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-brand-deep">Yield-asset extension</p>
      <h2 className="text-2xl font-bold">Four assets. Four protection pools.</h2>
      <p className="mt-4 text-sm leading-relaxed text-body">
        {proof.transactions.length} confirmed deployment and funding transactions created the new synthetic tokens,
        exchange, six-token dispenser and four seeded protection pools. The original timelock owns the new factory and
        dispenser. Published proof was checked on {new Date(proof.verifiedAt).toLocaleDateString()}.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {proof.assets.map((asset) => (
          <Card key={asset.id} className="min-w-0">
            <div className="flex items-center gap-3">
              <AssetGlyph glyph="generic" label={asset.name} symbol={asset.symbol} />
              <div>
                <h3 className="font-bold">{yieldAssetFor(asset.symbol)?.name ?? asset.symbol}</h3>
                <p className="mt-1 text-xs text-body">
                  {asset.symbol} · {asset.decimals} decimals
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-body">
              Illustrative growth: {Number(asset.demoYieldBpsPerCycle) / 100}% per four-minute cycle, followed by a{" "}
              {Number(asset.downsideBps) / 100}% baseline price shock. Growth resets; these figures are not real yields.
            </p>
            <a
              href={`${explorer}/token/${asset.address}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block break-all text-xs font-semibold text-brand-deep underline"
            >
              Test token: {asset.address} ↗
            </a>
            <a
              href={`${explorer}/address/${asset.pool}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block break-all text-xs font-semibold text-brand-deep underline"
            >
              Protection pool: {asset.pool} ↗
            </a>
          </Card>
        ))}
      </div>
      <details className="mt-5 rounded-card border border-hairline bg-white px-5">
        <summary className="min-h-12 cursor-pointer py-4 text-sm font-bold">Yield demo contract addresses</summary>
        <div className="divide-y divide-hairline">
          {proof.contracts.map((contract) => (
            <div key={contract.name} className="py-3">
              <p className="text-sm font-bold">{contract.name}</p>
              <a
                href={`${explorer}/address/${contract.address}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all font-mono text-xs text-brand-deep underline"
              >
                {contract.address} ↗
              </a>
            </div>
          ))}
        </div>
      </details>
      {walkthrough && (
        <div className="mt-7">
          <h3 className="text-xl font-bold">All four operator walkthroughs completed</h3>
          <p className="mt-3 text-sm leading-relaxed text-body">
            The dedicated operator bought, protected and sold each new token, completed a token withdrawal and requested
            a TestUSDC protected exit during the downside phase. These {walkthrough.transactions.length} transactions
            exercise the contracts directly and wait for real testnet timestamps. They are internal integration
            evidence.
          </p>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold">View walkthrough receipts</summary>
            <ol className="grid gap-3 pb-4 text-xs sm:grid-cols-2">
              {walkthrough.transactions.map((receipt) => (
                <li key={receipt.hash}>
                  <a
                    href={`${explorer}/tx/${receipt.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="break-words font-semibold text-brand-deep underline"
                  >
                    {receipt.id.replaceAll(":", " · ").replaceAll("-", " ")} ↗
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}
      <a
        href="/bsc-yield-testnet-proof.json"
        className="mt-4 inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4"
      >
        Download yield deployment and walkthrough evidence ↗
      </a>
    </section>
  );
}
