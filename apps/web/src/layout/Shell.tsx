import type { ComponentType, SVGProps } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Wordmark } from "@/components/Logo";
import { Dot } from "@/components/ui";
import { AccountIcon, ActivityIcon, ExploreIcon, HomeIcon, ShieldIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { shortAddress, useWalletConnection } from "@/chain/wallet";
import { useGlobalHealth } from "@/data/pools";
import { LegalLinks } from "@/components/AlphaNotice";
import { VOCAB } from "@/vocab";

type NavItem = { to: string; label: string; mobileLabel: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

const NAV: NavItem[] = [
  { to: "/", label: "Home", mobileLabel: "Home", Icon: HomeIcon },
  { to: "/explore", label: "Explore", mobileLabel: "Explore", Icon: ExploreIcon },
  { to: "/protect", label: "Provide protection", mobileLabel: "Protect", Icon: ShieldIcon },
  { to: "/activity", label: "Activity", mobileLabel: "Activity", Icon: ActivityIcon },
  { to: "/account", label: "Account", mobileLabel: "Account", Icon: AccountIcon },
];

export function Shell() {
  const { paused } = useGlobalHealth();
  return (
    <div className="min-h-full md:flex">
      <Sidebar />
      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-28 pt-5 md:max-w-[920px] md:px-10 md:pb-12 md:pt-10">
        {paused && (
          <div className="mb-4 flex items-center gap-2 rounded-input border border-amber-border bg-amber-tint px-4 py-3 md:hidden">
            <Dot tone="amber" />
            <span className="text-[13px] font-semibold text-amber-deep">{VOCAB.pausedForSafety}</span>
          </div>
        )}
        <Outlet />
      </main>
      <BottomTabs />
    </div>
  );
}

function Sidebar() {
  const navigate = useNavigate();
  const { walletName, address } = useWalletConnection();
  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-hairline bg-surface px-5 py-6 md:flex">
      <button onClick={() => navigate("/")} className="mb-8 text-left">
        <Wordmark />
      </button>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-input px-3.5 py-2.5 text-[14.5px] font-semibold transition-colors",
                isActive ? "bg-ink text-white" : "text-body hover:bg-subtle-2",
              )
            }
          >
            <Icon className="h-[21px] w-[21px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <Link to="/markets" className="rounded-input bg-blue-50 px-3.5 py-3 text-[13px] font-bold text-[#0052FF]">
          Live Base stocks ↗
        </Link>
        <HealthCard />
        <LegalLinks />
        <WalletChip
          onClick={() => navigate("/connect")}
          name={walletName ?? undefined}
          address={address ?? undefined}
        />
      </div>
    </aside>
  );
}

export function HealthCard() {
  const { paused, loading, unavailable } = useGlobalHealth();
  if (unavailable)
    return (
      <div className="rounded-input bg-subtle px-3.5 py-3 text-[13px] text-body">
        {loading ? "Checking oracle status…" : "Oracle status unavailable"}
      </div>
    );
  if (paused) {
    return (
      <div className="flex items-center gap-2 rounded-input bg-amber-tint px-3.5 py-3">
        <Dot tone="amber" />
        <span className="text-[13px] font-semibold text-amber-deep">{VOCAB.pausedShort}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-input bg-green-tint-2 px-3.5 py-3">
      <Dot tone="green" />
      <span className="text-[13px] font-semibold text-green-dark">{VOCAB.pricesHealthy}</span>
    </div>
  );
}

function WalletChip({ name, address, onClick }: { name?: string; address?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-input border border-hairline px-3.5 py-2.5 text-left hover:bg-subtle-2"
    >
      <span className="h-7 w-7 rounded-pill bg-wallet-phantom" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-ink">{name ?? "Connect wallet"}</span>
        {address && <span className="block truncate text-[12px] text-muted tnum">{shortAddress(address)}</span>}
      </span>
      <span className="text-muted">⇅</span>
    </button>
  );
}

function BottomTabs() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-hairline bg-white/[0.86] pb-[26px] backdrop-blur-[18px] md:hidden"
      style={{ paddingBottom: "max(26px, env(safe-area-inset-bottom))" }}
    >
      {NAV.map(({ to, mobileLabel, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center gap-1 pt-2.5 text-[11px] font-semibold",
              isActive ? "text-ink" : "text-faint",
            )
          }
        >
          <Icon className="h-[22px] w-[22px]" />
          {mobileLabel}
        </NavLink>
      ))}
    </nav>
  );
}
