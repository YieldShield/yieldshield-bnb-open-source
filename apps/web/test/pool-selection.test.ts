import { describe, expect, it } from "vitest";
import { requestedPool } from "../src/lib/pool-selection";

const first = { address: "0x1111111111111111111111111111111111111111" };
const second = { address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" };
describe("funding a requested pool", () => {
  it("selects the exact authenticated pool, including checksummed addresses", () => {
    expect(requestedPool([first, second], second.address.toUpperCase().replace("0X", "0x"))).toBe(second);
  });
  it("never falls back to another pool for missing, stale or malformed links", () => {
    for (const address of [null, "", "0x123", "0x2222222222222222222222222222222222222222"])
      expect(requestedPool([first, second], address)).toBeNull();
    expect(requestedPool([], second.address)).toBeNull();
  });
});
