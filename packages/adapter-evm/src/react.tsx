/**
 * React surface of the EVM adapter: wagmi-backed provider plus hooks matching the port's
 * `WalletConnectionApi` / `IntentSenderApi` shapes. The web app imports these through its
 * `src/chain/` seam — never from wagmi/viem directly.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getAccount, switchChain, waitForTransactionReceipt, writeContract, type Config } from "@wagmi/core";
import type { Abi, Address } from "viem";
import { WagmiProvider, createConfig, http, injected, useAccount, useConnect, useDisconnect, useConfig } from "wagmi";
import type {
  AccountId,
  IntentSenderApi,
  SendOptions,
  TxIntent,
  TxResult,
  WalletConnectionApi,
} from "@yieldshield/core";
import type { EvmAdapter } from "./adapter.js";
import { planIntent } from "./intents.js";

const AdapterContext = createContext<EvmAdapter | null>(null);

/** Mounts wagmi + react-query and exposes the adapter to the hooks below. */
export function EvmChainProvider({ adapter, children }: { adapter: EvmAdapter; children: ReactNode }) {
  const wagmiConfig = useMemo(
    () =>
      createConfig({
        chains: [adapter.chain],
        connectors: [injected({ shimDisconnect: true })],
        transports: { [adapter.chain.id]: http(adapter.rpcUrl) },
      }),
    [adapter],
  );
  const queryClient = useMemo(() => new QueryClient(), []);
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AdapterContext.Provider value={adapter}>{children}</AdapterContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function useAdapter(): EvmAdapter {
  const adapter = useContext(AdapterContext);
  if (!adapter) throw new Error("EvmChainProvider is not mounted");
  return adapter;
}

/** The connected wallet's address, or null when disconnected. */
export function useWalletAddress(): AccountId | null {
  const { address } = useAccount();
  return address ?? null;
}

/** Wallet connection state/actions in the port's chain-neutral shape. */
export function useWalletConnection(): WalletConnectionApi {
  const adapter = useAdapter();
  const config = useConfig();
  const { address, status, connector } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnectAsync } = useDisconnect();
  return {
    // Until wagmi's reconnect settles, report not-ready so guards don't flash the welcome screen.
    isReady: status !== "reconnecting",
    connected: status === "connected",
    connecting: isPending || status === "connecting",
    address: address ?? null,
    walletName: connector?.name ?? null,
    connectors: connectors.map((c) => ({ id: c.id, name: c.name })),
    connect: async (connectorId: string) => {
      const target = connectors.find((c) => c.id === connectorId);
      if (!target) throw new Error(`unknown wallet connector: ${connectorId}`);
      try {
        await connectAsync({ connector: target, chainId: adapter.chain.id });
        if (getAccount(config).chainId !== adapter.chain.id) await switchChain(config, { chainId: adapter.chain.id });
      } catch (e) {
        // wagmi restores persisted sessions asynchronously on mount; if the user clicks
        // Connect while (or after) that happens, the connector is already connected —
        // that's success, not an error.
        if (
          e instanceof Error &&
          (e.name === "ConnectorAlreadyConnectedError" || /already connected/i.test(e.message))
        ) {
          if (getAccount(config).chainId !== adapter.chain.id) await switchChain(config, { chainId: adapter.chain.id });
          return;
        }
        throw e;
      }
    },
    disconnect: () => disconnectAsync().then(() => undefined),
  };
}

/** Recheck the live connector before every signature, including after an approval confirms. */
export async function assertWalletSession(
  config: Config,
  owner: Address,
  chainId: number,
  connectorUid: string,
): Promise<void> {
  const current = getAccount(config);
  if (
    current.status !== "connected" ||
    !current.connector ||
    current.connector.uid !== connectorUid ||
    current.address?.toLowerCase() !== owner.toLowerCase()
  )
    throw new Error("Wallet account changed. Review the action and start again.");
  const [accounts, walletChain] = await Promise.all([current.connector.getAccounts(), current.connector.getChainId()]);
  if (accounts[0]?.toLowerCase() !== owner.toLowerCase())
    throw new Error("Wallet account changed. Review the action and start again.");
  if (walletChain !== chainId || getAccount(config).chainId !== chainId)
    throw new Error("Wrong network. Switch your wallet to the application network and try again.");
  const latest = getAccount(config);
  if (latest.connector?.uid !== connectorUid || latest.address?.toLowerCase() !== owner.toLowerCase())
    throw new Error("Wallet account changed. Review the action and start again.");
}

/** Plan once for the selected account; stop if it changes while any signature is pending. */
export async function sendEvmIntent(
  adapter: EvmAdapter,
  config: Config,
  owner: Address,
  intent: TxIntent,
  opts?: SendOptions,
): Promise<TxResult> {
  const connector = getAccount(config).connector;
  if (!connector) throw new Error("Connect a wallet to continue.");
  await assertWalletSession(config, owner, adapter.chain.id, connector.uid);
  if ((await adapter.publicClient.getChainId()) !== adapter.chain.id)
    throw new Error("Wrong network configured for application reads.");
  opts?.onPhase?.("building");
  const plan = await planIntent(
    adapter.publicClient,
    owner,
    { factory: adapter.addresses.factory, faucet: adapter.addresses.faucet },
    intent,
  );
  let lastReceipt: Awaited<ReturnType<typeof waitForTransactionReceipt>> | null = null;
  for (const step of plan.steps) {
    await assertWalletSession(config, owner, adapter.chain.id, connector.uid);
    // Simulate each step against current chain state before prompting for its signature.
    // Deposits are simulated after approvals mine, so allowance requirements are satisfied.
    await adapter.publicClient.simulateContract({
      address: step.address,
      abi: step.abi as Abi,
      functionName: step.functionName,
      args: step.args as unknown[],
      account: owner,
    });
    await assertWalletSession(config, owner, adapter.chain.id, connector.uid);
    const hash = await writeContract(config, {
      address: step.address,
      abi: step.abi as Abi,
      functionName: step.functionName,
      args: step.args as unknown[],
      account: owner,
      chainId: adapter.chain.id,
      connector,
    });
    opts?.onPhase?.("submitted");
    opts?.onPhase?.("confirming");
    let cancelled = false;
    lastReceipt = await waitForTransactionReceipt(config, {
      hash,
      chainId: adapter.chain.id,
      onReplaced: (replacement) => {
        if (replacement.reason !== "repriced") cancelled = true;
      },
    });
    if (cancelled)
      throw new Error("Transaction was cancelled or replaced. Review your wallet activity before retrying.");
    if (lastReceipt.status !== "success") throw new Error(`transaction reverted: ${lastReceipt.transactionHash}`);
  }
  if (!lastReceipt) throw new Error("Nothing to submit.");
  return { txId: lastReceipt.transactionHash, ...(plan.extract?.(lastReceipt) ?? {}) };
}

export function useIntentSender(): IntentSenderApi {
  const adapter = useAdapter();
  const config = useConfig();
  const { address } = useAccount();
  const send = useCallback(
    async (intent: TxIntent, opts?: SendOptions): Promise<TxResult> => {
      if (!address) throw new Error("Connect a wallet to continue.");
      return sendEvmIntent(adapter, config, address, intent, opts);
    },
    [adapter, config, address],
  );
  return { owner: address ?? null, send };
}
