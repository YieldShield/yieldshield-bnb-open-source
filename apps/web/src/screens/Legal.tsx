import { Link, useLocation } from "react-router-dom";
import { Wordmark } from "@/components/Logo";
const email = (
  <a className="text-brand-deep underline" href="mailto:david@yieldshield.ai">
    david@yieldshield.ai
  </a>
);
const pages: Record<string, { title: string; sections: { heading: string; body: React.ReactNode }[] }> = {
  legal: {
    title: "Imprint / Impressum",
    sections: [
      {
        heading: "Service provider",
        body: (
          <>
            Hawig Ventures UG (haftungsbeschränkt)
            <br />
            Herzogin-Juliana-Straße 7<br />
            55469 Simmern
            <br />
            Germany
          </>
        ),
      },
      { heading: "Represented by", body: "Managing Director: David Hawig" },
      { heading: "Commercial register", body: "HRB 24975, Amtsgericht Bad Kreuznach" },
      { heading: "Contact", body: email },
      {
        heading: "About this service",
        body: "YieldShield on BNB Chain is an experimental software preview. It provides read-only token price references from BSC mainnet and illustrative protection scenarios. Protection deposits and wallet transactions are not enabled in this release. It does not offer trading, custody, insurance, guaranteed returns, or individual investment advice.",
      },
    ],
  },
  risks: {
    title: "Early alpha. Significant risks.",
    sections: [
      {
        heading: "No deposits in this preview",
        body: "BSC testnet (chain 97) is the intended network for a future protection pilot. This release has no verified BSC pool deployment and does not enable deposits, approvals, withdrawals or faucet transactions. Do not send assets to addresses shown as token or oracle references.",
      },
      {
        heading: "Protection can fail",
        body: "The word “protection” describes conditional contract mechanics, not a guarantee or insurance. Collateral can be insufficient, unavailable, or lose value. Other positions, fees, liquidity constraints, administrative actions, or a sharp price move can reduce a payout. You may lose the entire deposited balance. Providing collateral means taking the first losses.",
      },
      {
        heading: "Unaudited contracts",
        body: "Automated tests and internal agent reviews do not constitute an independent security audit. Bugs in contracts, modules, integrations, wallets or infrastructure can cause loss, lock funds, or produce incorrect displays. A modular deployment can preserve known behavior while still introducing undiscovered risks.",
      },
      {
        heading: "Oracle and market risks",
        body: "Mainnet references use Chainlink feeds on BSC. BNB/USD represents the reference for WBNB; BTC/USD and ETH/USD do not separately price BTCB or Binance-Peg ETH peg and redemption risks. Prices are not swap quotes. Oracles, RPC providers and network observations can fail. Scenarios pause when source observations expire or the selected price exceeds five minutes.",
      },
      {
        heading: "Source trust and freshness",
        body: "The market API reads public BSC contracts at one block and retains original oracle timestamps. The website trusts the configured RPC and the API; this is not a cryptographically verified state proof. A ten-block buffer reduces exposure to recent chain changes but is not a claim of finality. No recurring transaction-signing relay is deployed.",
      },
      {
        heading: "Governance, withdrawal and availability",
        body: "Pool terms can include notice periods, fees and changes through governance. Emergency pauses and infrastructure failures can prevent actions. Read each pool’s actual terms and every wallet request. An approval lets a contract spend tokens up to its allowance. A timelock or disabled upgrade path does not remove all administrative or contract risks.",
      },
      {
        heading: "Illustrations are not forecasts",
        body: "Scenario calculations simplify the mechanics and exclude fees, transaction costs, competing claims and execution changes unless expressly stated. They do not show an executable quote, promised yield, expected return, insurance entitlement or investment recommendation.",
      },
      {
        heading: "Report a concern",
        body: (
          <>
            Stop interacting if the app displays unexpected networks, assets or transaction requests. Contact {email}{" "}
            with the public transaction hash and a description. Never send a seed phrase or private key.
          </>
        ),
      },
    ],
  },
  terms: {
    title: "Alpha terms of use",
    sections: [
      {
        heading: "Provider and scope",
        body: "The provider is Hawig Ventures UG (haftungsbeschränkt), at the address in the imprint. This free, experimental alpha is provided for evaluation and testing. Use is limited to adults who can lawfully access it. Trading and real-asset deposits are not offered.",
      },
      {
        heading: "Current release scope",
        body: "Market information is read from BSC mainnet (56). Scenarios are calculated in the browser. A future valueless protection pilot would use BSC testnet (97); it is not deployed or enabled by this preview.",
      },
      {
        heading: "Your wallet and instructions",
        body: "You control your wallet and authorize its transactions. Check the destination, chain, token, amount, allowance and minimum output before signing. Contract transactions may be irreversible. The operator does not ask for or need your seed phrase or private key.",
      },
      {
        heading: "No guaranteed outcome",
        body: (
          <>
            The software is unaudited and may fail, become unavailable, or change. There is no guaranteed protection,
            payout, yield or data accuracy. Read the{" "}
            <Link to="/risks" className="underline">
              risk disclosure
            </Link>
            . Nothing here is individual financial, legal or tax advice, an offer to buy securities, or an insurance
            contract.
          </>
        ),
      },
      {
        heading: "Acceptable use",
        body: "Do not misuse the service, overload its infrastructure, misrepresent test results as real returns, interfere with others’ access, or use it unlawfully. Report security issues privately using the contact address.",
      },
      {
        heading: "Mandatory rights",
        body: "These alpha terms do not exclude liability for intent, gross negligence, injury to life, body or health, or other liability that cannot lawfully be excluded. Mandatory consumer protections and statutory rights remain applicable.",
      },
      {
        heading: "Contact and version",
        body: (
          <>
            Questions: {email}. Version: 8 September 2026. Material changes to the alpha may require updated
            disclosures.
          </>
        ),
      },
    ],
  },
  privacy: {
    title: "Privacy notice",
    sections: [
      {
        heading: "Controller",
        body: (
          <>
            Hawig Ventures UG (haftungsbeschränkt), Herzogin-Juliana-Straße 7, 55469 Simmern, Germany. Managing
            Director: David Hawig. Privacy contact: {email}.
          </>
        ),
      },
      {
        heading: "Website delivery and security",
        body: "When you visit, hosting and network providers process connection information such as IP address, request time, browser information, requested path and technical errors. We use Vercel for the website and market API. Processing supports delivery, reliability and abuse prevention under Article 6(1)(f) GDPR. Technical records are retained only as required for these purposes and applicable provider retention settings; the application does not maintain a user account database.",
      },
      {
        heading: "Wallet and public blockchain data",
        body: "The current explorer does not require a wallet, and its market API does not take wallet addresses. Public contract queries are sent server-side to BSC RPC infrastructure. The inherited wallet integration may discover installed wallets or restore a prior connection locally; transaction screens remain unavailable. Your wallet controls any permissions you previously granted. Clear site data or revoke the connection through your wallet to remove stored connection state.",
      },
      {
        heading: "Public transactions cannot be deleted",
        body: "This preview does not submit transactions. Any future signed BSC testnet transaction can publicly record wallet addresses and interactions. Blockchain records are outside our control and cannot be erased by deleting browser data or contacting the operator.",
      },
      {
        heading: "Other recipients and transfers",
        body: "The site loads Hanken Grotesk from Google Fonts, which receives the connection data needed to serve font files. Vercel, RPC providers, font providers and your selected wallet may process data outside the EEA under their applicable transfer arrangements. Their privacy notices describe their processing: vercel.com/legal/privacy-policy, policies.google.com/privacy and bnbchain.org/en/privacy-policy. These third-party services have their own retention periods and responsibilities.",
      },
      {
        heading: "No advertising analytics in this alpha",
        body: "This application does not add advertising trackers, behavioural analytics, a mailing-list form or a profiling system. Essential wallet connection storage and hosting/security technologies may still apply. External links contact the destination service when opened.",
      },
      {
        heading: "Contact messages",
        body: "If you email us, we process your address and message to respond, under Article 6(1)(b) or (f) GDPR as applicable. We retain correspondence as needed to resolve the request and fulfil legal retention duties. Do not include private keys or seed phrases.",
      },
      {
        heading: "Your rights",
        body: (
          <>
            Where applicable, you may request access, correction, erasure, restriction and portability; object to
            processing based on legitimate interests; and withdraw any consent you gave without affecting prior lawful
            processing. Contact {email}. You may complain to a supervisory authority, including the Landesbeauftragte
            für den Datenschutz und die Informationsfreiheit Rheinland-Pfalz. Public blockchain records cannot be
            removed by this operator.
          </>
        ),
      },
      {
        heading: "Version",
        body: "8 September 2026. This notice describes the current alpha and will be updated if its data processing changes.",
      },
    ],
  },
};
export function Legal() {
  const location = useLocation();
  const page = pages[location.pathname.slice(1)] ?? pages.legal!;
  return (
    <div className="mx-auto max-w-[800px] px-6 py-8 md:px-10">
      <Link to="/welcome">
        <Wordmark />
      </Link>
      <h1 className="mb-8 mt-12 text-[34px] font-extrabold tracking-hero">{page.title}</h1>
      <div className="space-y-7">
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-2 text-[17px] font-bold">{section.heading}</h2>
            <p className="text-[15px] leading-relaxed text-body">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
