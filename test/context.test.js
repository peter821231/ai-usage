'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const u = require('../src/util');
const { ClaudeContextReader, findLastUsage, encodeProjectDir } = require('../src/claudeCode');
const NOW = Date.parse('2026-10-14T10:00:00Z');

test('util formatting', () => {
    assert.strictEqual(u.formatCountdown('2026-10-16T13:30:00Z', NOW), '2d 3h');
    assert.strictEqual(u.formatCountdown('2026-10-14T10:20:00Z', NOW), '20m');
    assert.strictEqual(u.formatCountdown('2026-10-14T09:00:00Z', NOW), 'now');
    assert.strictEqual(u.formatCountdown('', NOW), '');
    assert.strictEqual(u.maskEmail('alice.dev@x.com'), 'ali****@x.com');
    assert.strictEqual(u.maskEmail('ab@x.com'), 'a****@x.com');
    assert.strictEqual(u.maskEmail('ab@x.com', false), 'ab@x.com');
    assert.strictEqual(u.formatTokens(1500000), '1.5M');
    assert.strictEqual(u.textBar(50, 4), '\u2588\u2588\u2591\u2591');
    assert.strictEqual(u.escapeMarkdown('[x](command:evil)'), '\\[x\\]\\(command:evil\\)');
    assert.ok(u.pathsOverlap('file:///c%3A/repo/sub', 'C:\\repo'));
    assert.ok(!u.pathsOverlap('file:///c%3A/repo2', 'C:\\repo'));
    assert.strictEqual(u.contextWindowFor('Claude Sonnet 4.6 (Thinking)'), 1000000);
    assert.strictEqual(u.contextWindowFor('claude-3-5-haiku'), 200000);
});

test('findLastUsage skips sidechain and synthetic entries', () => {
    const lines = [
        JSON.stringify({
            message: { model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 90 } },
            timestamp: '2026-10-14T09:00:00Z'
        }),
        JSON.stringify({ isSidechain: true, message: { model: 'claude-haiku', usage: { input_tokens: 5 } } }),
        JSON.stringify({ message: { model: '<synthetic>', usage: { input_tokens: 0 } } }),
        'not json "usage"'
    ];
    const f = findLastUsage(lines);
    assert.strictEqual(f.model, 'claude-opus-5-5');
    assert.strictEqual(encodeProjectDir('c:\\work\\my-app'), 'c--work-my-app');
});

test('ClaudeContextReader reads the workspace project tail', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-'));
    const ws = path.join(home, 'my repo');
    const dir = path.join(home, '.claude', 'projects', encodeProjectDir(ws));
    fs.mkdirSync(dir, { recursive: true });
    const filler = JSON.stringify({ type: 'user', text: 'x'.repeat(2000) });
    const usageLine = JSON.stringify({
        message: {
            model: 'claude-sonnet-4-5',
            usage: { input_tokens: 1000, cache_read_input_tokens: 19000, cache_creation_input_tokens: 0 }
        }
    });
    fs.writeFileSync(path.join(dir, 's.jsonl'), [usageLine, ...Array(100).fill(filler)].join('\n'));
    const r = new ClaudeContextReader(home);
    const c = await r.read([ws]);
    assert.strictEqual(c.usedTokens, 20000);
    assert.strictEqual(c.windowTokens, 200000);
    assert.strictEqual(c.pct, 10);
    assert.strictEqual(await r.read([ws]), c);
    fs.rmSync(home, { recursive: true, force: true });
});

test('Claude context missing or invalid token components stay Unknown, while complete zero is valid', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-context-'));
    try {
        const ws = path.join(home, 'project');
        const dir = path.join(home, '.claude', 'projects', encodeProjectDir(ws));
        fs.mkdirSync(dir, { recursive: true });
        const complete = { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
        for (const usage of [
            {},
            { input_tokens: 0 },
            { ...complete, input_tokens: 'bad' },
            { ...complete, input_tokens: Infinity },
            complete
        ]) {
            fs.writeFileSync(
                path.join(dir, 'context.jsonl'),
                JSON.stringify({ message: { model: 'fixture-claude', usage } })
            );
            const c = await new ClaudeContextReader(home).read([ws]);
            const known = usage === complete;
            assert.equal(c.usedTokens, known ? 0 : null);
            assert.equal(c.pct, known ? 0 : null);
            if (!known) assert.equal(c.left, 'Unknown');
        }
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});
