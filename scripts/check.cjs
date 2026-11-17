'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
for (const dir of ['src', 'media', 'test', 'scripts', 'test/fixtures']) {
    for (const file of fs.readdirSync(dir).filter((f) => /\.(c?js)$/.test(f))) {
        const result = spawnSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'inherit' });
        if (result.status !== 0) process.exit(result.status || 1);
    }
}
console.log('JavaScript syntax checks passed');
