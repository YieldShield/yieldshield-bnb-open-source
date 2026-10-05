const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { initializeEnv } = require("../initializeEnv.cjs");

test("creates the example environment once and preserves an existing local configuration", () => {
    const directory = mkdtempSync(join(tmpdir(), "yieldshield-env-test-"));
    try {
        writeFileSync(join(directory, ".env.example"), "EXAMPLE=yes\n");
        initializeEnv(directory);
        assert.equal(readFileSync(join(directory, ".env"), "utf8"), "EXAMPLE=yes\n");
        writeFileSync(join(directory, ".env"), "LOCAL=preserve\n");
        initializeEnv(directory);
        assert.equal(readFileSync(join(directory, ".env"), "utf8"), "LOCAL=preserve\n");
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
