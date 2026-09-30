/** Resolve only an exact EVM address from the reader's authenticated pool list. */
export function requestedPool<T extends { address: string }>(pools: T[], address: string | null): T | null {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  return pools.find((pool) => pool.address.toLowerCase() === address.toLowerCase()) ?? null;
}
