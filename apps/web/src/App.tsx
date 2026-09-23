import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AlphaNotice, LegalLinks } from "@/components/AlphaNotice";
import { Shell } from "@/layout/Shell";
import { Spinner } from "@/components/ui";
import { protocolDeployed } from "@/chain/adapter";
import { useWalletConnection } from "@/chain/wallet";

// Route-level code splitting: each screen is its own chunk (keeps the initial bundle small;
// recharts/etc. only load when a screen that needs them is visited).
const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[key] as React.ComponentType })));

const TestnetTechnical = named(() => import("@/screens/TestnetTechnical"), "TestnetTechnical");
const Testnet = named(() => import("@/screens/Testnet"), "Testnet");
const Trade = named(() => import("@/screens/Trade"), "Trade");
const TestTokens = named(() => import("@/screens/TestTokens"), "TestTokens");
const HowItWorks = named(() => import("@/screens/HowItWorks"), "HowItWorks");
const Scenarios = named(() => import("@/screens/Scenarios"), "Scenarios");
const Markets = named(() => import("@/screens/Markets"), "Markets");
const Legal = named(() => import("@/screens/Legal"), "Legal");
const Welcome = named(() => import("@/screens/Welcome"), "Welcome");
const Connect = named(() => import("@/screens/Connect"), "Connect");
const Home = named(() => import("@/screens/Home"), "Home");
const PoolDetail = named(() => import("@/screens/PoolDetail"), "PoolDetail");
const Deposit = named(() => import("@/screens/Deposit"), "Deposit");
const PositionDetail = named(() => import("@/screens/PositionDetail"), "PositionDetail");
const Activate = named(() => import("@/screens/Activate"), "Activate");
const Provide = named(() => import("@/screens/Provide"), "Provide");
const Underwriter = named(() => import("@/screens/Underwriter"), "Underwriter");
const Activity = named(() => import("@/screens/Activity"), "Activity");
const Account = named(() => import("@/screens/Account"), "Account");

/** Public trading and pool terms remain visible; personal positions and deposits require a wallet. */
export default function App() {
  return (
    <>
      <AlphaNotice />
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/testnet/technical" element={<TestnetTechnical />} />
          <Route path="/testnet" element={<Testnet />} />
          <Route path="/learn/scenarios" element={<Scenarios />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          <Route element={<Shell />}>
            <Route path="/markets" element={<Markets />} />
            <Route path="/trade" element={<Trade />} />
            <Route path="/test-tokens" element={<TestTokens />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/explore" element={<Navigate to="/markets" replace />} />
            {["legal", "privacy", "terms", "risks"].map((path) => (
              <Route key={path} path={`/${path}`} element={<Legal />} />
            ))}
            <Route path="/pool/:poolId" element={<PoolDetail />} />
            <Route element={<RequireWallet />}>
              <Route path="/positions" element={<Home />} />
              <Route path="/deposit" element={<Deposit />} />
              <Route path="/protection/new" element={<Deposit />} />
              <Route path="/position/:id" element={<PositionDetail />} />
              <Route path="/activate/:id" element={<Activate />} />
              <Route path="/provide" element={<Provide />} />
              <Route path="/protect" element={<Navigate to="/provide" replace />} />
              <Route path="/create-pool" element={<Navigate to="/testnet" replace />} />
              <Route path="/underwriter/:id" element={<Underwriter />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/account" element={<Account />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <div className="px-6 py-5 pb-28 md:pb-5">
        <LegalLinks />
      </div>
    </>
  );
}

function RequireWallet() {
  const location = useLocation();
  const { connected, connecting, isReady } = useWalletConnection();
  // Persisted sessions restore ASYNCHRONOUSLY after mount (wagmi reconnectOnMount /
  // framework-kit walletPersistence). Bouncing to Welcome the instant we see "disconnected"
  // logs the user out on every refresh — so give restoration a short settle window first.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Restored wallets must not enter transaction screens before contracts exist.
  if (!protocolDeployed) return <Navigate to="/testnet" replace />;
  if (connected) return <Outlet />;
  if (!isReady || connecting || !settled) return <Splash />;
  return <Navigate to={`/connect?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`} replace />;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-7 w-7 text-ink" />
    </div>
  );
}
