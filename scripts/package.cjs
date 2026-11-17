'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const pkg = require('../package.json');
fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
const vsce = require.resolve('@vscode/vsce/vsce');
const result = spawnSync(
    process.execPath,
    [
        vsce,
        'package',
        '--no-dependencies',
        '--no-rewrite-relative-links',
        '--allow-missing-repository',
        '--out',
        `artifacts/${pkg.name}-${pkg.version}.vsix`
    ],
    { cwd: path.join(__dirname, '..'), stdio: 'inherit' }
);
process.exitCode = result.status || (result.error ? 1 : 0);
