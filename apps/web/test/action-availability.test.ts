import { expect, it } from "vitest";
import { actionBlocker } from "@/lib/action-availability";

const snapshot = { evaluatedAt: 100n, validUntil: 120n };
const available = { state: "available" as const, blockers: [] };

it("expires a previously available action even when the next refresh fails", () => {
  expect(actionBlocker(snapshot, available, 119n)).toBeNull();
  expect(actionBlocker(snapshot, available, 120n)).toContain("fresh");
  expect(actionBlocker(snapshot, available, 99n)).toContain("fresh");
  expect(actionBlocker(undefined, available, 110n)).toContain("fresh");
});

it("uses each action's actual eligibility instead of the pool's aggregate oracle label", () => {
  expect(actionBlocker(snapshot, available, 110n)).toBeNull();
  expect(
    actionBlocker(
      snapshot,
      { state: "blocked", blockers: [{ code: "oracle", message: "Backing price unavailable." }] },
      110n,
    ),
  ).toBe("Backing price unavailable.");
  expect(actionBlocker(snapshot, { state: "unknown", blockers: [] }, 110n)).toContain("unavailable");
  expect(actionBlocker(snapshot, undefined, 110n)).toContain("unavailable");
});
