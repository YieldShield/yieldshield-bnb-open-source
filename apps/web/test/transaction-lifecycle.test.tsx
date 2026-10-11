import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  phase: "confirming",
  pending: true,
  loading: false,
  readError: "RPC read failed" as string | null,
}));
vi.mock("react-router-dom", () => ({ useParams: () => ({ id: "position" }), useNavigate: () => vi.fn() }));
vi.mock("@/chain/adapter", () => ({
  chain: { explorerTxUrl: (tx: string) => `https://testnet.bscscan.com/tx/${tx}` },
  reader: {},
}));
vi.mock("@/chain/useSubmitTx", () => ({
  useSubmitTx: () => ({
    ...state,
    txId: "0xconfirmed-pending-hash",
    error: null,
    step: { index: 2, total: 2, label: "Confirm action" },
  }),
}));
vi.mock("@/data/refresh", () => ({ useRefreshAll: () => vi.fn() }));
vi.mock("@/data/positions", () => ({
  usePositions: () => ({ loading: state.loading, error: state.readError, shield: [], protector: [] }),
}));

import { PositionDetail } from "@/screens/PositionDetail";
import { Activate } from "@/screens/Activate";
import { Underwriter } from "@/screens/Underwriter";

describe.each([PositionDetail, Activate, Underwriter])("pending wallet lifecycle on %s", (Screen) => {
  beforeEach(() =>
    Object.assign(state, { phase: "confirming", pending: true, loading: false, readError: "RPC read failed" }),
  );

  it("keeps the submitted hash and confirmation guidance visible when background reads fail", () => {
    const html = renderToStaticMarkup(<Screen />);
    expect(html).toContain("Don’t submit it again.");
    expect(html).toContain("https://testnet.bscscan.com/tx/0xconfirmed-pending-hash");
    expect(html).not.toContain("Position data is unavailable");
    expect(html).not.toContain("This position isn&#x27;t available");
  });

  it("keeps the wallet request visible even when position loading restarts", () => {
    Object.assign(state, { phase: "building", loading: true });
    const html = renderToStaticMarkup(<Screen />);
    expect(html).toContain("Review the request when it appears in your wallet.");
    expect(html).toContain("Step 2 of 2");
  });

  it("blocks fresh actions when no verified position data is available", () => {
    Object.assign(state, { phase: "idle", pending: false });
    const html = renderToStaticMarkup(<Screen />);
    expect(html).toContain("unavailable");
    expect(html).not.toContain("View transaction progress");
    expect(html).not.toContain("Start withdrawal notice");
    expect(html).not.toContain("Confirm withdrawal");
  });

  it.each([
    { loading: false, readError: "RPC read failed" },
    { loading: true, readError: null },
    { loading: false, readError: null },
  ])("retains the receipt for a submitted action after unavailable confirmation: %s", (readState) => {
    Object.assign(state, { phase: "failed", pending: false, ...readState });
    const html = renderToStaticMarkup(<Screen />);
    expect(html).toContain("Review your submitted transaction.");
    expect(html).toContain("https://testnet.bscscan.com/tx/0xconfirmed-pending-hash");
    expect(html).toContain("Check the last transaction before retrying");
    expect(html).not.toContain("This position isn&#x27;t available");
    expect(html).not.toContain("Start withdrawal notice");
    expect(html).not.toContain("Activate protection");
  });
});
