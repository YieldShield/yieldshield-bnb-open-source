// Generated after public BSC Testnet receipts, runtimes, routing and ownership verification.
import type { Address } from "viem";
export type EvmDeployment = { factory: Address; compositeOracle: Address; faucet?: Address; deploymentBlock?: bigint };
export const DEPLOYMENTS: Record<number, EvmDeployment> = {
  97: {
    factory: "0xCFCe35b3Ea72AA7C48Fe743Be3DC38b7720d95ce",
    compositeOracle: "0x81Cc4822F5872770D2a493FA1DA87E919644F0E0",
    faucet: "0x6546077Fd9F92064F553a0518a9A0090aCDF74E1",
    deploymentBlock: 132663653n,
  },
};
