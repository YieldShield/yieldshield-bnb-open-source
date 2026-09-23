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

const Testnet = named(() => import("@/screens/Testnet"), "Testnet");
const Markets = named(() => import("@/screens/Markets"), "Markets");
const Legal = named(() => import("@/screens/Legal"), "Legal");
const Welcome = named(() => import("@/screens/Welcome"), "Welcome");
const Connect = named(() => import("@/screens/Connect"), "Connect");
const Home = named(() => import("@/screens/Home"), "Home");
const Explore = named(() => import("@/screens/Explore"), "Explore");
const PoolDetail = named(() => import("@/screens/PoolDetail"), "PoolDetail");
const Deposit = named(() => import("@/screens/Deposit"), "Deposit");
const PositionDetail = named(() => import("@/screens/PositionDetail"), "PositionDetail");
const Activate = named(() => import("@/screens/Activate"), "Activate");
const Provide = named(() => import("@/screens/Provide"), "Provide");
const Underwriter = named(() => import("@/screens/Underwriter"), "Underwriter");
const Activity = named(() => import("@/screens/Activity"), "Activity");
const Account = named(() => import("@/screens/Account"), "Account");

/**
 * Routes. Welcome + Connect are full-bleed (no app chrome). Everything else renders inside the
 * responsive Shell and requires a connected wallet (redirect to Welcome otherwise).
 */
export default function App() {
  return (
    <>
      <AlphaNotice />
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/testnet" element={<Testnet />} />
          <Route path="/markets" element={<Markets />} />
          {["legal", "privacy", "terms", "risks"].map((path) => (
            <Route key={path} path={`/${path}`} element={<Legal />} />
          ))}
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/connect" element={<Connect />} />

          <Route element={<RequireWallet />}>
            <Route element={<Shell />}>
              <Route path="/" element={<Home />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/pool/:poolId" element={<PoolDetail />} />
              <Route path="/deposit" element={<Deposit />} />
              <Route path="/position/:id" element={<PositionDetail />} />
              <Route path="/activate/:id" element={<Activate />} />
              <Route path="/protect" element={<Provide />} />
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
  if (!protocolDeployed) return <Navigate to={location.pathname === "/" ? "/welcome" : "/connect"} replace />;
  if (connected) return <Outlet />;
  if (!isReady || connecting || !settled) return <Splash />;
  return <Navigate to="/welcome" replace />;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-7 w-7 text-ink" />
    </div>
  );
}
