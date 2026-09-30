import type { Address, Hash } from "viem";
import type { EvmDeployment } from "./deployments.js";

export type EvmFaucetDeployment = {
  address: Address;
  label: string;
  codehash?: Hash;
  tokens?: readonly Address[];
};
export type PublishedYieldDeployment = EvmDeployment & { faucetProof: EvmFaucetDeployment };

/** Separate protection/faucet sources are enabled only after the published deployment is verified. */
export const ADDITIONAL_DEPLOYMENTS: Readonly<Partial<Record<number, readonly PublishedYieldDeployment[]>>> = {
  97: [
    {
      factory: "0xE451957815949CE33c5C3aa1873138F38F20eC2C",
      compositeOracle: "0x6590434b94b0b36CE6929b60020b5d15F5f0E03C",
      deploymentBlock: 134055692n,
      faucet: "0x7C2f42466CA67cf5eB652952979b799532c8531C",
      faucetProof: {
        address: "0x7C2f42466CA67cf5eB652952979b799532c8531C",
        label: "Yield asset test tokens",
        codehash: "0x2c77324429e4ef6f633b304ea5ba01b831bc047833e15ab8fa83c194c118a5c5",
        tokens: [
          "0x05c674Bbc8930a580fCc5924060807C6153FeA6C",
          "0x7Fc086DA704fC345f99817Afe0CBd3C649E3266C",
          "0x1ee984B017e80214A314BFf1042c43456325Ce8A",
          "0xB07598F9ACCE93C46B9BbB138d108D626621e4B9",
          "0x28e37F207671B98Bdf5AfFA3d8cACB1F93721962",
          "0x40B73bA38F51C100d9dC6D33632B6aCa4E2989E1",
        ],
      },
    },
  ],
};
