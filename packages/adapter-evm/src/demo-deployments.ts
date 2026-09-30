import type { Address, Hash } from "viem";

/** BSC Testnet deployment verified from canonical receipts and on-chain runtime code. */
export type DemoDeployment = {
  chainId: 97;
  exchange: Address;
  exchangeCodehash: Hash;
  oracle: Address;
  oracleCodehash: Hash;
  quoteToken: Address;
  quoteTokenCodehash: Hash;
  /** All assets in oracle enumeration order; independently verified after deployment. */
  assets: readonly DemoAssetDeployment[];
  model?: "price-cycle" | "accelerated-yield";
  cycleSeconds?: bigint;
  epoch?: bigint;
  feeBps?: bigint;
  maxStockAmount?: bigint;
};

export type DemoAssetDeployment = {
  token: Address;
  codehash: Hash;
  symbol: string;
  name: string;
  decimals: number;
  basePriceUsd8?: bigint;
  maxAmount?: bigint;
  /** Accelerated synthetic yield per cycle; never a live protocol APY. */
  demoYieldBpsPerCycle?: bigint;
  downsideBps?: bigint;
};

export const DEMO_DEPLOYMENTS: Readonly<Partial<Record<97, DemoDeployment>>> = {
  97: {
    chainId: 97,
    exchange: "0x2DdF03a89A861028fA00A1282365A68A284f9386",
    exchangeCodehash: "0x351cf4fb3ab8b54fff57a05c734f1de2e6a711d8a785bba8c0d6cea6632b2b8d",
    oracle: "0x798667C8161Fb8a8cd0b8a8eb48Eacc82974bd4B",
    oracleCodehash: "0x4b05263c6c497842b1820b8992f43e63a930db980ca19c0738fa2bb771cc799f",
    quoteToken: "0x7Fc086DA704fC345f99817Afe0CBd3C649E3266C",
    quoteTokenCodehash: "0x8523822ba9a59b8179dc4eee1a59ac8eca4846176d41712e0cc175f1a4f1b17e",
    assets: [
      {
        token: "0x05c674Bbc8930a580fCc5924060807C6153FeA6C",
        codehash: "0x8523822ba9a59b8179dc4eee1a59ac8eca4846176d41712e0cc175f1a4f1b17e",
        symbol: "tWBNB",
        name: "YieldShield test WBNB - no value",
        decimals: 18,
      },
    ],
  },
};

/** Populated only after sealed receipt/runtime verification of the separate yield demo deployment. */
export const YIELD_DEMO_DEPLOYMENTS: Readonly<Partial<Record<97, DemoDeployment>>> = {
  97: {
    chainId: 97,
    exchange: "0x9861556d2c0Ad28BE45113Eea93799aA7D0147A0",
    exchangeCodehash: "0x80648c2ab96651250e8bf8a04166b6c6399417fd55fa788b8374080743b934ce",
    oracle: "0x6d8049BAE53B5f43d9024ff79c2cE7a38AB8aC1D",
    oracleCodehash: "0x4e7432db4a06ecdc92de411ad4fdefbe85ad2b8d3adc7e4d0a269002602c2155",
    quoteToken: "0x7Fc086DA704fC345f99817Afe0CBd3C649E3266C",
    quoteTokenCodehash: "0x8523822ba9a59b8179dc4eee1a59ac8eca4846176d41712e0cc175f1a4f1b17e",
    model: "accelerated-yield",
    epoch: 1790771980n,
    cycleSeconds: 240n,
    feeBps: 30n,
    maxStockAmount: 25000000000000000000n,
    assets: [
      {
        token: "0x1ee984B017e80214A314BFf1042c43456325Ce8A",
        codehash: "0x63e0872cf6940ecbfaaf828cb2429c86839a96fae580569f2d5aa2f07f4ef56d",
        symbol: "tSlisBNB",
        name: "YieldShield test slisBNB - no value",
        decimals: 18,
        basePriceUsd8: 60000000000n,
        maxAmount: 25000000000000000000n,
        demoYieldBpsPerCycle: 20n,
        downsideBps: 1500n,
      },
      {
        token: "0xB07598F9ACCE93C46B9BbB138d108D626621e4B9",
        codehash: "0x63e0872cf6940ecbfaaf828cb2429c86839a96fae580569f2d5aa2f07f4ef56d",
        symbol: "tWBETH",
        name: "YieldShield test wBETH - no value",
        decimals: 18,
        basePriceUsd8: 200000000000n,
        maxAmount: 10000000000000000000n,
        demoYieldBpsPerCycle: 15n,
        downsideBps: 1500n,
      },
      {
        token: "0x28e37F207671B98Bdf5AfFA3d8cACB1F93721962",
        codehash: "0x63e0872cf6940ecbfaaf828cb2429c86839a96fae580569f2d5aa2f07f4ef56d",
        symbol: "tsUSDe",
        name: "YieldShield test sUSDe - no value",
        decimals: 18,
        basePriceUsd8: 110000000n,
        maxAmount: 25000000000000000000000n,
        demoYieldBpsPerCycle: 10n,
        downsideBps: 1000n,
      },
      {
        token: "0x40B73bA38F51C100d9dC6D33632B6aCa4E2989E1",
        codehash: "0x63e0872cf6940ecbfaaf828cb2429c86839a96fae580569f2d5aa2f07f4ef56d",
        symbol: "tvUSDT",
        name: "YieldShield test Venus vUSDT - no value",
        decimals: 8,
        basePriceUsd8: 2000000n,
        maxAmount: 5000000000000n,
        demoYieldBpsPerCycle: 10n,
        downsideBps: 1000n,
      },
    ],
  },
};

export function demoDeploymentsFor(chainId: number): readonly DemoDeployment[] {
  if (chainId !== 97) return [];
  return [DEMO_DEPLOYMENTS[97], YIELD_DEMO_DEPLOYMENTS[97]].filter((item): item is DemoDeployment => !!item);
}
