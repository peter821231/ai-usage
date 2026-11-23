'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { fetchCodexLimits, findCodexCommand } = require('../src/codexAppServer');

function runWithFixture(reply, options = {}) {
    const server = `
        const readline = require('node:readline');
        const input = readline.createInterface({ input: process.stdin });
        let phase = 0;
        input.on('line', (line) => {
            const request = JSON.parse(line);
            if (phase === 0 && request.method === 'initialize' && request.params.clientInfo.name === 'nexus-ai-usage') {
                console.log(JSON.stringify({ id: request.id, result: {} }));
            } else if (phase === 1 && request.method === 'initialized' && request.id === undefined) {
                // Acknowledge nothing for JSON-RPC notifications.
            } else if (phase === 2 && request.method === 'account/rateLimits/read') {
                console.log(JSON.stringify({ method: 'account/rateLimits/updated', params: {} }));
                console.log(JSON.stringify({ id: request.id, ...${JSON.stringify(reply)} }));
            } else {
                process.exit(1);
            }
            phase++;
        });
    `;
    return fetchCodexLimits({
        command: process.execPath,
        spawnProcess(command, args, settings) {
            assert.deepEqual(args, ['app-server']);
            return spawn(command, ['-e', server], settings);
        },
        ...options
    });
}

test('finds the macOS binary bundled with the official extension', (t) => {
    const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-codex-bundle-'));
    t.after(() => fs.rmSync(extension, { recursive: true, force: true }));
    const directory = path.join(extension, 'bin', 'macos-aarch64');
    fs.mkdirSync(directory, { recursive: true });
    const command = path.join(directory, 'codex');
    fs.writeFileSync(command, '', { mode: 0o755 });
    assert.equal(findCodexCommand(extension, '', 'darwin', 'arm64'), command);
});

test('App Server reads fresh quota without starting a turn and retains an actual zero', async () => {
    const before = Date.now();
    const limits = await runWithFixture({
        result: {
            accountId: 'fixture-account',
            rateLimits: { limitId: 'other', primary: { usedPercent: 99 } },
            rateLimitsByLimitId: {
                codex: {
                    limitId: 'codex',
                    planType: 'plus',
                    primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1800000000 },
                    secondary: null
                }
            }
        }
    });
    assert.ok(limits.at >= before);
    assert.deepEqual(limits, {
        source: 'app-server',
        at: limits.at,
        plan: 'plus',
        windows: [{
            name: '5-hour',
            minutes: 300,
            pct: 0,
            resetsAt: new Date(1800000000000).toISOString(),
            resetBasis: 'provider'
        }]
    });
});

test('App Server accepts the legacy snapshot and rejects unsupported or refused results', async () => {
    const limits = await runWithFixture({
        result: { rateLimits: { secondary: { usedPercent: 66, windowDurationMins: 10080 } } }
    });
    assert.equal(limits.windows[0].name, 'Weekly');
    assert.equal(limits.windows[0].pct, 66);
    await assert.rejects(runWithFixture({ result: { rateLimits: { primary: { usedPercent: '0' } } } }),
        { message: 'codex-query-failed' });
    await assert.rejects(runWithFixture({ error: { message: 'private diagnostic' } }),
        { message: 'codex-query-failed' });
});

test('a missing CLI, cancellation, and a stalled App Server settle safely', async () => {
    assert.equal(findCodexCommand(undefined, '.:bin'), null);
    assert.equal(await fetchCodexLimits({ command: null }), null);
    const abort = new AbortController();
    let child;
    const pending = runWithFixture({}, {
        signal: abort.signal,
        spawnProcess(command, _args, settings) {
            child = spawn(command, ['-e', 'process.stdin.resume()'], settings);
            return child;
        }
    });
    abort.abort();
    assert.equal(await pending, null);
    assert.equal(child.stdout.destroyed, true);
    await assert.rejects(runWithFixture({}, {
        timeoutMs: 100,
        spawnProcess: (command, _args, settings) => spawn(command, ['-e', 'process.stdin.resume()'], settings)
    }), { message: 'codex-query-failed' });
});
