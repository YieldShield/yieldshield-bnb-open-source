/** Publish frontend addresses only after checking the completed public deployment against Base Sepolia. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createPublicClient,http,keccak256,getAddress} from 'viem';
import {baseSepolia} from 'viem/chains';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(resolve(root,'contracts/deployments/base-sepolia-alpha.json'),'utf8'));
assert.equal(manifest.chainId,84532);assert.equal(manifest.sourceChainId,8453);assert.equal(manifest.status,'complete','Public deployment is not complete');
assert.equal(manifest.pools.length,4,'Expected four verified stock pools');
const client=createPublicClient({chain:baseSepolia,transport:http(process.env.BASE_SEPOLIA_RPC_URL||'https://sepolia.base.org')});
assert.equal(await client.getChainId(),84532,'Wrong destination RPC');
for(const name of ['Factory','CompositeOracle','Faucet']){
 const contract=manifest.contracts[name];assert(contract?.address&&contract.txHash&&contract.runtimeCodehash,`Missing ${name} evidence`);
 const [code,receipt]=await Promise.all([client.getCode({address:contract.address}),client.getTransactionReceipt({hash:contract.txHash})]);
 assert(code&&code!=='0x',`${name} has no code`);assert.equal(keccak256(code),contract.runtimeCodehash,`${name} code hash mismatch`);assert.equal(receipt.status,'success');assert.equal(getAddress(receipt.contractAddress),getAddress(contract.address));
}
const factoryReceipt=await client.getTransactionReceipt({hash:manifest.contracts.Factory.txHash});
const text=`// Generated only from a completed, onchain-verified Base Sepolia manifest.\nimport type { Address } from "viem";\nexport type EvmDeployment = { factory: Address; compositeOracle: Address; faucet?: Address; deploymentBlock?: bigint };\nexport const DEPLOYMENTS: Record<number, EvmDeployment> = {\n  84532: {\n    factory: "${getAddress(manifest.contracts.Factory.address)}",\n    compositeOracle: "${getAddress(manifest.contracts.CompositeOracle.address)}",\n    faucet: "${getAddress(manifest.contracts.Faucet.address)}",\n    deploymentBlock: ${factoryReceipt.blockNumber}n,\n  },\n};\n`;
writeFileSync(resolve(root,'packages/adapter-evm/src/deployments.ts'),text);
console.log('Published verified Base Sepolia frontend entrypoints. Rebuild and deploy the frontend to activate them.');
