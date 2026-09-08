/** Map raw EVM transaction/wallet errors to calm, plain-language copy (never a raw revert/stack). */
export function friendlyError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (msg.includes("connect a wallet")) return "Connect a wallet to continue.";
  if (msg.includes("wallet account changed")) return "Your wallet account changed. Review the action and start again.";
  if (msg.includes("cancelled or replaced"))
    return "This transaction was cancelled or replaced. Check your wallet activity before trying again.";
  if (msg.includes("minimum output"))
    return "A fresh withdrawal quote is required. Refresh the position and try again.";
  if (msg.includes("data unavailable") || msg.includes("discovery limit") || msg.includes("position discovery"))
    return "On-chain data is unavailable. Refresh before continuing.";
  if (msg.includes("user rejected") || msg.includes("user denied") || msg.includes("rejected the request"))
    return "You cancelled the signature.";
  if (msg.includes("insufficient funds")) return "Not enough ETH to cover the network fee.";
  if (msg.includes("exceeds balance") || msg.includes("insufficient allowance") || msg.includes("insufficient balance"))
    return "Not enough balance for this amount.";
  if (msg.includes("stocktokenoraclepaused") || msg.includes("oraclepaused"))
    return "This market’s price feed is paused. Try again when pricing is available.";
  if (
    msg.includes("staleprice") ||
    msg.includes("pricestale") ||
    msg.includes("priceunavailable") ||
    msg.includes("oraclechallenge") ||
    msg.includes("price feed")
  )
    return "A current, verified price is unavailable. Try again when pricing is restored.";
  if (msg.includes("unlock") || msg.includes("pooltimeminimumnotreached"))
    return "This withdrawal is not available yet. Check the position’s notice period.";
  if (msg.includes("slippage") || msg.includes("minamountout") || msg.includes("minreceived"))
    return "Price moved more than your slippage limit — try again.";
  if (msg.includes("chain mismatch") || msg.includes("wrong network") || msg.includes("switch"))
    return "Your wallet is on a different network — switch and try again.";
  if (msg.includes("timed out") || msg.includes("timeout")) return "The network was busy — please try again.";
  if (msg.includes("reverted") || msg.includes("execution failed"))
    return "Couldn't complete this right now — please try again.";
  return "Something went wrong — please try again.";
}
