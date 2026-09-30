import type { Address, Hash } from "viem";
import { DEMO_DEPLOYMENTS, YIELD_DEMO_DEPLOYMENTS, type DemoDeployment } from "./demo-deployments.js";

export type CreationDeployment = {
  factory: Address;
  factoryCodehash: Hash;
  factoryImplementation: Address;
  factoryImplementationCodehash: Hash;
  poolImplementation: Address;
  poolImplementationCodehash: Hash;
  compositeOracle: Address;
  compositeOracleCodehash: Hash;
  demo: DemoDeployment;
};

export const BSC_TESTNET_GENESIS = "0x6d3c66c5357ec91d5c43af47e234a939b22557cbb552dc45bebbceeed90fbe34";

/** Pins from the published alpha/yield manifests. New pools use these same immutable routers. */
export const CREATION_DEPLOYMENTS: readonly CreationDeployment[] = [
  {
    factory: "0xCFCe35b3Ea72AA7C48Fe743Be3DC38b7720d95ce",
    factoryCodehash: "0x322850f0f79b33b56c8ad74c9673c97fad0dcb722fb136b3ef2b8a91e5a9686b",
    factoryImplementation: "0xa0fB2663E2eeEC621a03ebe6d2442880236595FB",
    factoryImplementationCodehash: "0xe89bb71d4dbd20b6356625bbfc77adabdbeb494d9c480c15597ef0e1f69fdab1",
    poolImplementation: "0xc9D72f328Beeab8806e3bb10Fbee8D8D1965e30d",
    poolImplementationCodehash: "0xf0140a83c8a4b8288f7b4cb5798b19e6f9ac39092e4e08408fc38e89eee85bfa",
    compositeOracle: "0x81Cc4822F5872770D2a493FA1DA87E919644F0E0",
    compositeOracleCodehash: "0x5b8f4e1f84c0e9de90908af0af4975c0729c0f87a54b158655dcebc4bafaad9f",
    demo: DEMO_DEPLOYMENTS[97]!,
  },
  {
    factory: "0xE451957815949CE33c5C3aa1873138F38F20eC2C",
    factoryCodehash: "0x322850f0f79b33b56c8ad74c9673c97fad0dcb722fb136b3ef2b8a91e5a9686b",
    factoryImplementation: "0xa0fB2663E2eeEC621a03ebe6d2442880236595FB",
    factoryImplementationCodehash: "0xe89bb71d4dbd20b6356625bbfc77adabdbeb494d9c480c15597ef0e1f69fdab1",
    poolImplementation: "0x9cDF155426575D7C8318CbFefE7Fe94c6b17fa8C",
    poolImplementationCodehash: "0x2004447027370e023e859d6b670659c148aca7d8ac7273c230f08cda84aaa33d",
    compositeOracle: "0x6590434b94b0b36CE6929b60020b5d15F5f0E03C",
    compositeOracleCodehash: "0x5b8f4e1f84c0e9de90908af0af4975c0729c0f87a54b158655dcebc4bafaad9f",
    demo: YIELD_DEMO_DEPLOYMENTS[97]!,
  },
];

export const creationDeploymentFor = (factory: string) =>
  CREATION_DEPLOYMENTS.find((d) => d.factory.toLowerCase() === factory.toLowerCase());
