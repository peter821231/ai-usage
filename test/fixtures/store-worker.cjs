'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { refreshClaude } = require('../../src/claudeUsageStore');
refreshClaude({
    storageDir: process.argv[2],
    query: async () => {
        await fs.appendFile(path.join(process.argv[2], 'queries'), 'query\n');
        await new Promise((r) => setTimeout(r, 100));
        return { fetchedAt: Date.now(), windows: [] };
    }
}).catch(() => {
    process.exitCode = 1;
});
