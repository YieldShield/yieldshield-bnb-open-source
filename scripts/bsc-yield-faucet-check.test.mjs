import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData } from "viem";
import { tokenFaucetAbi } from "../packages/adapter-evm/dist/abis/tokenFaucet.js";
import { EXPECTED_DEPLOYER, GENESIS } from "./publish-bsc-deployment.mjs";
import { expectedFaucetTokens, verifyYieldFaucetCheck } from "./bsc-yield-faucet-check.mjs";
const address = (n) => "0x" + n.toString(16).padStart(40, "0");
const hash = "0x" + "11".repeat(32),
  blockHash = "0x" + "22".repeat(32);
const source = { address: address(10) };
const tokens = expectedFaucetTokens(
  { quoteToken: address(2), assets: [3, 4, 5, 6].map((n) => ({ address: address(n) })) },
  { contracts: { TestWBNB: { address: address(1) } } },
);

function fixture() {
  const data = encodeFunctionData({ abi: tokenFaucetAbi, functionName: "dripAll", args: [EXPECTED_DEPLOYER] });
  const request = {
    to: source.address,
    chainId: 97,
    nonce: 7,
    value: "0",
    data,
    gas: "300000",
    gasPrice: "1000000000",
  };
  const journal = {
    chainId: 97,
    genesisHash: GENESIS,
    actor: EXPECTED_DEPLOYER,
    faucet: source.address,
    transactions: {
      "faucet:claim": {
        hash,
        status: "confirmed",
        request,
        receipt: { transactionHash: hash, blockNumber: "10", blockHash },
      },
    },
  };
  const receipt = {
    transactionHash: hash,
    status: "success",
    blockNumber: 10n,
    blockHash,
    transactionIndex: 0,
    logs: tokens.map((token) => ({
      address: source.address,
      topics: encodeEventTopics({
        abi: tokenFaucetAbi,
        eventName: "TokensDripped",
        args: { token: token.address, recipient: EXPECTED_DEPLOYER },
      }),
      data: encodeAbiParameters([{ type: "uint256" }], [token.amount]),
    })),
  };
  const transaction = {
    from: EXPECTED_DEPLOYER,
    to: source.address,
    chainId: 97,
    nonce: 7,
    value: 0n,
    input: data,
    gas: 300000n,
    gasPrice: 1000000000n,
  };
  const state = { shortBalanceToken: null, head: 19n };
  const client = {
    getTransactionReceipt: async () => receipt,
    getTransaction: async () => transaction,
    getBlock: async ({ blockNumber, blockTag }) => {
      if (blockTag === "latest") return { number: state.head, hash: "0x" + "33".repeat(32) };
      return {
        number: blockNumber,
        hash: blockNumber === 10n ? blockHash : "0x" + "44".repeat(32),
        transactions: [hash],
      };
    },
    readContract: async ({ address, functionName, args, blockNumber }) => {
      assert([9n, 10n].includes(blockNumber));
      const token = tokens.find((token) => token.address === (functionName === "dripAmount" ? args[0] : address));
      assert(token);
      if (functionName === "dripAmount") return token.amount;
      assert.equal(functionName, "balanceOf");
      assert.deepEqual(args, [EXPECTED_DEPLOYER]);
      return 1_000n + (blockNumber === 10n ? token.amount - (token.address === state.shortBalanceToken ? 1n : 0n) : 0n);
    },
  };
  return {
    journal,
    receipt,
    transaction,
    state,
    client,
    verify: () => verifyYieldFaucetCheck(client, journal, source, tokens),
  };
}

test("requires one exact claim and six receipt-block balance increases, with eight-decimal vUSDT", async () => {
  const proof = await fixture().verify();
  assert.equal(proof.status, "complete");
  assert.equal(proof.tokens.length, 6);
  assert.equal(proof.beforeBlockNumber, "9");
  assert.equal(proof.receiptBlockNumber, "10");
  assert.deepEqual(proof.transactions, [{ id: "faucet:claim", hash, blockNumber: "10" }]);
  assert.equal(proof.tokens.at(-1).decimals, 8);
  for (const [index, token] of proof.tokens.entries())
    assert.equal(BigInt(token.afterBalance) - BigInt(token.beforeBalance), tokens[index].amount);
});

test("rejects a partial claim even if the journal asserts completion", async () => {
  const f = fixture();
  f.journal.status = "complete";
  f.receipt.logs.pop();
  await assert.rejects(f.verify(), /exactly six/);
});

test("rejects token substitution, wrong recipient, or a short historical balance change", async () => {
  for (const kind of ["duplicate", "recipient", "balance"]) {
    const f = fixture();
    if (kind === "duplicate") f.receipt.logs[5] = f.receipt.logs[0];
    if (kind === "recipient")
      f.receipt.logs[0].topics = encodeEventTopics({
        abi: tokenFaucetAbi,
        eventName: "TokensDripped",
        args: { token: tokens[0].address, recipient: address(99) },
      });
    if (kind === "balance") f.state.shortBalanceToken = tokens[5].address;
    await assert.rejects(f.verify());
  }
});

test("rejects altered calldata, target, nonce, native value and excessive gas budget", async () => {
  for (const kind of ["calldata", "target", "nonce", "value", "budget"]) {
    const f = fixture();
    if (kind === "calldata")
      f.transaction.input = encodeFunctionData({ abi: tokenFaucetAbi, functionName: "dripAll", args: [address(99)] });
    if (kind === "target") f.transaction.to = address(99);
    if (kind === "nonce") f.transaction.nonce += 1;
    if (kind === "value") f.transaction.value = 1n;
    if (kind === "budget") f.journal.transactions["faucet:claim"].request.gasPrice = "100000000000";
    await assert.rejects(f.verify());
  }
});

test("requires ten canonical confirmations and propagates history read failures", async () => {
  const f = fixture();
  f.state.head = 18n;
  await assert.rejects(f.verify(), /ten sealed block/);
  const unavailable = fixture();
  unavailable.client.readContract = async () => {
    throw new Error("Historical RPC unavailable");
  };
  await assert.rejects(unavailable.verify(), /Historical RPC unavailable/);
});
