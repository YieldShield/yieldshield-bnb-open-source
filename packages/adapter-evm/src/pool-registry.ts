import { keccak256, type Address, type PublicClient } from "viem";
import { BSC_TESTNET_GENESIS, creationDeploymentFor } from "./creation-deployments.js";
import { splitRiskPoolFactoryAbi as factoryAbi } from "./abis/splitRiskPoolFactory.js";
import { splitRiskPoolAbi as poolAbi } from "./abis/splitRiskPool.js";

const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const same = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
const slotAddress = (slot: string | undefined) => slot && `0x${slot.slice(-40)}`;

/** Authenticate the current proxy, immutable routers and oracle at the same sealed block. */
export async function assertCreationFactory(client: PublicClient, factory: Address, blockNumber: bigint) {
  const d = creationDeploymentFor(factory);
  if (!d) throw new Error("Pool creation factory is not part of the verified deployment.");
  if ((await client.getChainId()) !== 97) throw new Error("Pool creation requires BSC Testnet.");
  const [genesis, codes, slot, implementation, oracle] = await Promise.all([
    client.getBlock({ blockNumber: 0n }),
    Promise.all(
      [
        [d.factory, d.factoryCodehash],
        [d.factoryImplementation, d.factoryImplementationCodehash],
        [d.poolImplementation, d.poolImplementationCodehash],
        [d.compositeOracle, d.compositeOracleCodehash],
        [d.demo.oracle, d.demo.oracleCodehash],
        [d.demo.quoteToken, d.demo.quoteTokenCodehash],
        ...d.demo.assets.map((asset) => [asset.token, asset.codehash]),
      ].map(async ([address, hash]) => {
        const code = await client.getCode({ address: address as Address, blockNumber });
        return !!code && same(keccak256(code), hash!);
      }),
    ),
    client.getStorageAt({ address: d.factory, slot: IMPLEMENTATION_SLOT, blockNumber }),
    client.readContract({
      address: d.factory,
      abi: factoryAbi,
      functionName: "splitRiskPoolImplementation",
      blockNumber,
    }),
    client.readContract({ address: d.factory, abi: factoryAbi, functionName: "compositeOracle", blockNumber }),
  ]);
  if (
    !same(genesis.hash ?? undefined, BSC_TESTNET_GENESIS) ||
    !codes.every(Boolean) ||
    !same(slotAddress(slot), d.factoryImplementation) ||
    !same(implementation, d.poolImplementation) ||
    !same(oracle, d.compositeOracle)
  )
    throw new Error("Pool creation deployment changed or could not be verified. Refresh before continuing.");
  return d;
}

/** Dynamically created pools must be genuine proxies belonging to the reviewed factory. */
export async function assertCreatedPools(
  client: PublicClient,
  factory: Address,
  pools: Address[],
  blockNumber: bigint,
) {
  const d = await assertCreationFactory(client, factory, blockNumber);
  await Promise.all(
    pools.map(async (address) => {
      const [code, slot, poolFactory] = await Promise.all([
        client.getCode({ address, blockNumber }),
        client.getStorageAt({ address, slot: IMPLEMENTATION_SLOT, blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "POOL_FACTORY", blockNumber }),
      ]);
      if (
        !code ||
        !same(keccak256(code), d.factoryCodehash) ||
        !same(slotAddress(slot), d.poolImplementation) ||
        !same(poolFactory, d.factory)
      )
        throw new Error("A discovered pool could not be authenticated. Refresh before continuing.");
    }),
  );
}
