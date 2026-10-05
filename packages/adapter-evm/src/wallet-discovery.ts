/** A configured injected connector is not evidence that a wallet is installed. */
export async function installedWallets<T extends { getProvider: () => Promise<unknown> }>(
  connectors: readonly T[],
): Promise<T[]> {
  const providers = await Promise.allSettled(connectors.map((connector) => connector.getProvider()));
  return connectors.filter((_, index) => {
    const result = providers[index];
    if (result?.status !== "fulfilled" || !result.value) return false;
    return typeof (result.value as { request?: unknown }).request === "function";
  });
}
