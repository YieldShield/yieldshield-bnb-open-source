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
  assets: readonly [{ token: Address; codehash: Hash; symbol: "tWBNB"; name: string; decimals: 18 }];
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
