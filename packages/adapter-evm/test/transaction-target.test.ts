import { beforeEach, expect, it, vi } from "vitest";
import { planIntent } from "../src/intents";
import { assertCreatedPools } from "../src/pool-registry";
import { CREATION_DEPLOYMENTS } from "../src/creation-deployments";
import { encodePositionId } from "../src/positionId";
import type { PublicClient, Address } from "viem";

vi.mock("../src/pool-registry", () => ({ assertCreatedPools: vi.fn(async () => undefined) }));
const factory = CREATION_DEPLOYMENTS[0]!.factory;
const pool = "0x1111111111111111111111111111111111111111" as Address;
const owner = "0x2222222222222222222222222222222222222222" as Address;
const token = CREATION_DEPLOYMENTS[0]!.demo.assets[0]!.token;
const client = {
  getBlock: vi.fn(async () => ({
    number: 10n,
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    hash: `0x${"a".repeat(64)}`,
  })),
  readContract: vi.fn(async () => ({ shieldedToken: token, backingToken: CREATION_DEPLOYMENTS[0]!.demo.quoteToken })),
} as unknown as PublicClient;
beforeEach(() =>
  vi
    .mocked(assertCreatedPools)
    .mockReset()
    .mockResolvedValue(undefined as never),
);

it("authenticates a withdrawal target during planning and repeats the check before signing", async () => {
  const plan = await planIntent(
    client,
    owner,
    { factory },
    {
      kind: "withdrawShielded",
      pool,
      shieldedToken: token,
      position: encodePositionId(pool, "shield", 1n),
      minOut: 1n,
    },
  );
  expect(assertCreatedPools).toHaveBeenCalledWith(client, factory, [pool], 10n);
  expect(plan.beforeStep).toBeDefined();
  vi.mocked(assertCreatedPools).mockRejectedValueOnce(new Error("Pool implementation changed"));
  await expect(plan.beforeStep!()).rejects.toThrow("implementation changed");
  expect(assertCreatedPools).toHaveBeenCalledTimes(2);
});

it("rejects a changed deployment before preparing any token spending approval", async () => {
  vi.mocked(assertCreatedPools).mockRejectedValueOnce(new Error("Pool could not be authenticated"));
  await expect(
    planIntent(
      client,
      owner,
      { factory },
      {
        kind: "depositShielded",
        pool,
        shieldedToken: token,
        backingToken: CREATION_DEPLOYMENTS[0]!.demo.quoteToken,
        amount: 100n,
        minReceived: 99n,
      },
    ),
  ).rejects.toThrow("could not be authenticated");
});

it("also rechecks notice and premium actions against the reviewed pool", async () => {
  for (const kind of ["startUnlock", "cancelUnlock", "claimCommission"] as const) {
    const plan = await planIntent(
      client,
      owner,
      { factory },
      { kind, position: encodePositionId(pool, "protector", 1n) },
    );
    await plan.beforeStep!();
  }
  expect(assertCreatedPools).toHaveBeenCalledTimes(6);
});
