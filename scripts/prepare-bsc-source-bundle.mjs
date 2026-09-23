#!/usr/bin/env node
/** Prepare the exact compiler-listed Solidity sources locally. This never uploads anything. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { ROOT, artifact, atomicJson } from "./bsc-deployment.mjs";
const manifest = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json")));
const names = [
  ...new Set([
    ...Object.values(manifest.contracts).map((c) => c.artifact),
    "ERC1967Proxy",
    "ShieldReceiptNFT",
    "ProtectorReceiptNFT",
  ]),
];
const destination = resolve(ROOT, "artifacts/bsc-source-review");
mkdirSync(destination, { recursive: true });
const files = new Map();
const contracts = [];
for (const name of names) {
  const a = artifact(name),
    metadata = a.metadata;
  const settings = structuredClone(metadata.settings);
  const [sourcePath, contractName] = Object.entries(settings.compilationTarget)[0];
  delete settings.compilationTarget;
  const sources = Object.fromEntries(
    Object.keys(metadata.sources).map((path) => {
      if (!path.endsWith(".sol")) throw new Error("Non-Solidity compiler source");
      const content = readFileSync(resolve(ROOT, "contracts", path), "utf8");
      files.set(path, {
        path,
        bytes: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex"),
      });
      return [path, { content }];
    }),
  );
  atomicJson(resolve(destination, name + ".json"), {
    compilerVersion: metadata.compiler.version,
    contractIdentifier: sourcePath + ":" + contractName,
    stdJsonInput: { language: "Solidity", sources, settings },
  });
  contracts.push({
    artifact: name,
    compilerVersion: metadata.compiler.version,
    contractIdentifier: sourcePath + ":" + contractName,
    sourceCount: Object.keys(sources).length,
  });
}
const summary = {
  preparedAt: new Date().toISOString(),
  purpose: "Review only; no external submission",
  destination: "https://sourcify.dev/server/v2/verify/97/{address}",
  license:
    "Non-exclusive, worldwide, irrevocable, royalty-free licence to reproduce, store, and publicly display submitted source for verification, archival, and public inspection.",
  contracts,
  files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
};
atomicJson(resolve(destination, "index.json"), summary);
writeFileSync(
  resolve(destination, "REVIEW.md"),
  `# BSC Testnet source publication bundle\n\nPrepared locally. Nothing has been uploaded.\n\nDestination: Sourcify, chain 97.\n\nTerms: ${summary.license}\n\n${contracts.length} compiler inputs include ${files.size} unique Solidity source files. These are contract implementations and their compiler-listed dependencies. Each JSON contains exact compiler settings and source content; index.json lists file digests.\n\n## Contracts\n\n${contracts.map((c) => "- " + c.artifact + " (" + c.sourceCount + " sources)").join("\n")}\n\n## Source files\n\n${summary.files.map((f) => "- " + f.path).join("\n")}\n`,
);
console.log(
  JSON.stringify({
    directory: destination,
    contracts: contracts.length,
    sourceFiles: files.size,
    bytes: [...files.values()].reduce((s, f) => s + f.bytes, 0),
  }),
);
