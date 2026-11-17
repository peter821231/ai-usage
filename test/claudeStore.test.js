'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { refreshClaude, GAP_MS, LEASE_MS } = require('../src/claudeUsageStore');
const { spawn } = require('node:child_process');

test('concurrent windows share one query; failures retain the last observed snapshot and back off', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-store-'));
    let clock = Date.now();
    let calls = 0;
    const data = { fetchedAt: clock, windows: [], spend: { used: 1 } };
    const opts = {
        storageDir: dir,
        now: () => clock,
        query: async () => {
            calls++;
            await new Promise((r) => setTimeout(r, 30));
            return data;
        }
    };
    try {
        await Promise.all(Array.from({ length: 5 }, () => refreshClaude(opts)));
        assert.equal(calls, 1);
        assert.deepEqual((await refreshClaude(opts)).data, data);
        clock += GAP_MS + 1;
        const bad = {
            ...opts,
            query: async () => {
                calls++;
                throw new Error('SECRET token');
            }
        };
        const result = await refreshClaude(bad);
        assert.equal(result.error, 'query-failed');
        assert.deepEqual(result.data, data);
        await refreshClaude({ ...bad, force: true });
        assert.equal(calls, 2);
        assert.equal(
            (await fs.readdir(dir)).some((n) => n.includes('lock')),
            false
        );
        assert.doesNotMatch(await fs.readFile(path.join(dir, 'claude-usage-v1.json'), 'utf8'), /SECRET/);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('expired locks recover and fresh lock returns pending instead of issuing another query', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-lock-'));
    const lock = path.join(dir, 'claude-usage.lock');
    try {
        await fs.mkdir(lock);
        await fs.writeFile(path.join(lock, 'owner'), 'dead');
        const opts = { storageDir: dir, query: async () => ({ fetchedAt: Date.now(), windows: [] }) };
        assert.equal((await refreshClaude(opts)).pending, true);
        const past = new Date(Date.now() - LEASE_MS - 1000);
        await fs.utimes(lock, past, past);
        assert.ok((await refreshClaude(opts)).data.fetchedAt);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

for (const expired of [false, true])
    test(`independent hosts share one query${expired ? ' while recovering an expired lease' : ''}`, async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-processes-'));
        try {
            if (expired) {
                const lock = path.join(dir, 'claude-usage.lock');
                await fs.mkdir(lock);
                await fs.writeFile(path.join(lock, 'dead-owner'), 'dead');
                const past = new Date(Date.now() - LEASE_MS - 1000);
                await fs.utimes(lock, past, past);
            }
            const worker = () =>
                new Promise((resolve, reject) => {
                    const child = spawn(process.execPath, [path.join(__dirname, 'fixtures/store-worker.cjs'), dir], {
                        stdio: 'ignore'
                    });
                    child.on('error', reject);
                    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('worker-failed'))));
                });
            await Promise.all(Array.from({ length: 6 }, worker));
            assert.equal(await fs.readFile(path.join(dir, 'queries'), 'utf8'), 'query\n');
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });
