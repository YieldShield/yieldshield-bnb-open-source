import { CATEGORY_LABELS, type YieldAsset } from "@/config/yield-assets";
import { AssetGlyph } from "@/components/ui";

export function AssetReference({ asset }: { asset: YieldAsset }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <AssetGlyph glyph="generic" label={asset.name} symbol={asset.demoSymbol} size={44} />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-deep">
            {CATEGORY_LABELS[asset.category]}
          </p>
          <h2 className="mt-1 text-[19px] font-extrabold">About {asset.referenceSymbol}</h2>
        </div>
      </div>
      <p className="mt-4 text-[14px] leading-relaxed text-body">{asset.yieldMechanism}</p>
      <p className="mt-3 rounded-input bg-brand-tint p-3 text-[12px] leading-relaxed text-brand-deep">
        {asset.demoSymbol} is a free synthetic test token. Its accelerated yield and price shocks are illustrative; it
        does not earn or redeem the real asset’s yield.
      </p>
      <details className="mt-4 text-[12px] leading-relaxed text-body">
        <summary className="min-h-11 cursor-pointer py-3 font-bold text-ink">
          Real asset risks &amp; reference address
        </summary>
        <ul className="ml-4 list-disc space-y-1">
          {asset.risks.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
        <a
          href={`https://bscscan.com/token/${asset.mainnetToken}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block break-all underline underline-offset-2"
        >
          BNB mainnet reference: {asset.mainnetToken} ↗
        </a>
        <p className="mt-2">Protocol marks identify the reference assets; no partnership or endorsement is implied.</p>
      </details>
      <a
        href={asset.docsUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex min-h-11 items-center text-[13px] font-bold text-ink underline underline-offset-4"
      >
        Read the protocol’s explanation ↗
      </a>
    </div>
  );
}
