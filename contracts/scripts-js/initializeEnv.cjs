#!/usr/bin/env node
const { constants, copyFileSync } = require("node:fs");
const { resolve } = require("node:path");

function initializeEnv(directory) {
    try {
        copyFileSync(resolve(directory, ".env.example"), resolve(directory, ".env"), constants.COPYFILE_EXCL);
    } catch (error) {
        if (error.code !== "EEXIST") throw error;
    }
}

if (require.main === module) initializeEnv(resolve(__dirname, ".."));
module.exports = { initializeEnv };
