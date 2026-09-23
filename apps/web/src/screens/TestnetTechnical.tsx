import { Link } from "react-router-dom";
import { Wordmark } from "@/components/Logo";
import { Card } from "@/components/ui";
import rawProof from "@/data/bsc-testnet-proof.json";

type Transaction = { action: string; label?: string; hash: string; blockNumber: string };
const proof = rawProof as Omit<typeof rawProof, "walkthrough" | "trading"> & {
  walkthrough: null | { scope: string; actor: string; completedAt: string; transactions: Transaction[] };
  trading: {
    exchange: string;
    pair: string;
    feeBps: number;
    initialInventory: { tWBNB: string; TestUSDC: string };
    operatorWalkthrough: null | {
      scope: string;
      actor: string;
      completedAt: string;
      positionId: string;
      transactions: Transaction[];
    };
  };
};
const explorer = "https://testnet.bscscan.com";
const keyContracts = [
  "Pool",
  "BscTestExchange",
  "Factory",
  "Faucet",
  "TestWBNB",
  "TestUSDC",
  "BscScenarioOracle",
  "Timelock",
];

export function TestnetTechnical() {
  return (
    <main className="mx-auto max-w-[1060px] px-6 py-7 md:px-10">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <Link to="/welcome" aria-label="YieldShield home">
          <Wordmark size={30} />
        </Link>
        <Link to="/trade" className="text-sm font-bold underline underline-offset-4">
          Try the demo ↗
        </Link>
      </header>
      <p className="mt-14 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-deep">
        BSC Testnet · Technical reference
      </p>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight md:text-5xl">A proof you can inspect.</h1>
      <p className="mt-5 max-w-[65ch] text-base leading-relaxed text-body">
        One synthetic trading pair and protection market on chain 97. These addresses and receipts identify the deployed
        software. The demo uses free test assets and has internal testing, with no independent company audit.
      </p>
      <div className="my-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Deployment", `${proof.deploymentTransactions.length} confirmed transactions`],
          [
            "User flow",
            proof.walkthrough && proof.trading.operatorWalkthrough
              ? `${proof.walkthrough.transactions.length + proof.trading.operatorWalkthrough.transactions.length} operator test transactions`
              : "Public walkthrough in progress",
          ],
          ["Assets", "tWBNB / TestUSDC"],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-deep">{label}</p>
            <p className="mt-3 text-lg font-bold">{value}</p>
          </Card>
        ))}
      </div>
      <section className="space-y-5 text-sm leading-relaxed text-body">
        <h2 className="text-2xl font-bold text-ink">How it works</h2>
        <p>
          A factory creates the pool and its two position receipt NFTs. Users deposit tWBNB; protectors supply TestUSDC.
          Each position records its own rights. A token withdrawal returns tWBNB under the pool’s fee and gain-sharing
          rules. A protected withdrawal pays TestUSDC when eligible, subject to the contract’s collateral and timing
          limits.
        </p>
        <p>
          The pool and factory use immutable routing to eight and five modules respectively. Solidity 0.8.35 targets
          Cancun. The BSC initializer is restricted to chain 97 and authenticated synthetic tokens. Its short demo
          delays are one minute before protected exit and two minutes after a protector requests withdrawal.
        </p>
        <p>
          The oracle computes a four-minute triangular cycle from 600 to 750, back to 600, down to 450 and back to 600
          TestUSDC per tWBNB. TestUSDC stays at the synthetic reference value. This formula does not observe a market or
          detect real depegs. The mainnet token reference page is a separate, read-only data source.
        </p>
        <p>
          The separately funded exchange buys and sells tWBNB against TestUSDC at that synthetic price, with a 0.3%
          trading fee. It started with 250 tWBNB and 250,000 TestUSDC, limits each trade to 25 tWBNB, and enforces the
          reviewed payment or proceeds bound on chain. Buying a token does not protect it; a separate pool deposit
          creates the protection receipt.
        </p>
        <p>
          Administration uses a two-day timelock controlled by one operator. The factory owns the pool and composite
          oracle; the timelock owns the factory and faucet. Test tokens have fixed supplies with no mint authority.
          Seeded backing of 100,000 TestUSDC is free test liquidity and is excluded from real TVL.
        </p>
      </section>
      <section className="mt-10">
        <h2 className="text-2xl font-bold">Contract reference</h2>
        <p className="mt-3 text-sm leading-relaxed text-body">
          Checked against canonical receipts, compiled runtimes, constructor arguments, module bindings, ownership and
          timelock roles. Source publication:{" "}
          {proof.sourceVerification === "exact_match"
            ? "exact source and runtime matches recorded on Sourcify."
            : "pending. Internal bytecode checks are complete."}
        </p>
        <div className="mt-5 divide-y divide-hairline rounded-2xl border border-hairline px-5">
          {keyContracts.map((name) => {
            const contract = proof.contracts.find((c) => c.name === name);
            return contract ? (
              <div key={name} className="py-4">
                <p className="mb-1 text-sm font-bold">{name}</p>
                <a
                  className="break-all font-mono text-xs text-brand-deep underline underline-offset-4"
                  href={`${explorer}/address/${contract.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {contract.address} ↗
                </a>
              </div>
            ) : null;
          })}
        </div>
        <a href="/bsc-testnet-proof.json" className="mt-5 inline-flex text-sm font-bold underline underline-offset-4">
          Download all addresses and receipt evidence ↗
        </a>
      </section>
      {proof.walkthrough ? (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">Public walkthrough receipts</h2>
          <p className="mt-3 text-sm leading-relaxed text-body">
            The operator used the website’s transaction planner to claim tokens, provide backing, complete both
            withdrawal paths, and unlock and withdraw backing. The public run waited for real block timestamps. These
            transactions are internal proof, not external user adoption.
          </p>
          <ol className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            {proof.walkthrough.transactions.map((t) => (
              <li key={t.hash}>
                <a
                  href={`${explorer}/tx/${t.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-brand-deep underline underline-offset-4"
                >
                  {t.label ?? t.action} ↗
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {proof.trading.operatorWalkthrough ? (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">Trade-to-protection receipts</h2>
          <p className="mt-3 text-sm leading-relaxed text-body">
            The operator bought two test tWBNB, deposited one into the protection pool, and sold half a token. The six
            transactions include spending approvals and use free test assets. This is internal integration proof, not
            external adoption or an independent audit.
          </p>
          <ol className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            {proof.trading.operatorWalkthrough.transactions.map((t) => (
              <li key={t.hash}>
                <a
                  href={`${explorer}/tx/${t.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-brand-deep underline underline-offset-4"
                >
                  {t.action.replaceAll(":", " ")} ↗
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-4 break-all text-xs text-body">
            Protection position: {proof.trading.operatorWalkthrough.positionId}
          </p>
        </section>
      ) : null}
      <section className="my-10 border-t border-hairline pt-7 text-sm leading-relaxed text-body">
        <h2 className="text-2xl font-bold text-ink">Testing and limits</h2>
        <p className="mt-4">
          Checks include the synthetic-token restrictions, both withdrawal paths, reward accounting regressions, wallet
          preflight checks, canonical transaction receipts, and module storage/size compatibility. The public
          demonstration does not establish production security, sustainable economics or compatibility with every
          wallet.
        </p>
        <p className="mt-4">
          Source matching is not a security audit. The BNB repository currently has restricted access. Code release and
          reuse licences will be finalized for any proposed open-source grant deliverables. Contact{" "}
          <a href="mailto:david@yieldshield.ai" className="font-bold underline">
            david@yieldshield.ai
          </a>{" "}
          for reviewer access.
        </p>
        <p className="mt-4">
          Operator: Hawig Ventures UG (haftungsbeschränkt), Germany.{" "}
          <Link to="/risks" className="font-bold underline">
            Risk information
          </Link>{" "}
          ·{" "}
          <Link to="/legal" className="font-bold underline">
            Company details
          </Link>
        </p>
      </section>
    </main>
  );
}
