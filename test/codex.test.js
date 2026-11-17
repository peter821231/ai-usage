'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CodexReader, parseCodexLines, buildCodexLimits, windowName } = require('../src/codex');

const NOW = Date.parse('2026-10-14T10:00:00Z');
const MIN = 60e3;

function tokenCount(ts, used, limits) {
    return JSON.stringify({
        timestamp: ts,
        type: 'event_msg',
        payload: {
            type: 'token_count',
            info: {
                total_token_usage: { input_tokens: 999999 },
                last_token_usage: {
                    input_tokens: used,
                    cached_input_tokens: used - 100,
                    output_tokens: 50,
                    reasoning_output_tokens: 10,
                    total_tokens: used + 50
                },
                model_context_window: 258400
            },
            rate_limits: limits
        }
    });
}

const LIMITS = {
    primary: {
        used_percent: 34,
        window_minutes: 43200,
        resets_at: Math.floor(Date.parse('2026-10-20T00:00:00Z') / 1000)
    },
    secondary: { used_percent: 12.4, window_minutes: 300, resets_in_seconds: 3600 },
    credits: { has_credits: false, unlimited: false, balance: null },
    plan_type: 'plus'
};

test('windowName labels Codex windows by length', () => {
    assert.strictEqual(windowName(300), '5-hour');
    assert.strictEqual(windowName(10080), 'Weekly');
    assert.strictEqual(windowName(43200), '30-day');
    assert.strictEqual(windowName(0), 'Limit');
    assert.strictEqual(windowName(299), '5-hour');
    assert.strictEqual(windowName(10079), 'Weekly');
    assert.strictEqual(windowName(45), '45-min');
});

test('parseCodexLines reads newest usage, limits and model', () => {
    const lines = [
        JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.6-terra', cwd: 'c:\\repo' } }),
        tokenCount('2026-10-14T09:00:00Z', 50000, LIMITS),
        tokenCount('2026-10-14T09:30:00Z', 76242, null)
    ];
    const p = parseCodexLines(lines);
    assert.strictEqual(p.model, 'gpt-5.6-terra');
    assert.strictEqual(p.tokenEvent.info.last_token_usage.input_tokens, 76242);
    const lim = buildCodexLimits(p);
    assert.deepStrictEqual(
        lim.windows.map((w) => [w.name, w.pct]),
        [
            ['30-day', 34],
            ['5-hour', 12]
        ]
    );
    assert.strictEqual(lim.windows[0].resetsAt, '2026-10-20T00:00:00.000Z');
    assert.strictEqual(lim.windows[1].resetsAt, '2026-10-14T10:00:00.000Z');
    assert.strictEqual(lim.plan, 'plus');
    assert.strictEqual(parseCodexLines(['{"type":"other"}']), null);
});

test('CodexReader prefers the open workspace for context, newest file for limits', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cx-'));
    const day = path.join(home, '.codex', 'sessions', '2026', '10', '14');
    fs.mkdirSync(day, { recursive: true });
    const meta = (cwd) =>
        JSON.stringify({ type: 'session_meta', payload: { id: 'x', cwd, base_instructions: 'y'.repeat(500) } });
    const ws = path.join(home, 'my repo');
    const a = path.join(day, 'rollout-a.jsonl');
    const b = path.join(day, 'rollout-b.jsonl');
    fs.writeFileSync(
        a,
        [
            meta(ws),
            JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-ws' } }),
            tokenCount('2026-10-14T08:00:00Z', 20000, LIMITS)
        ].join('\n')
    );
    fs.writeFileSync(
        b,
        [
            meta(path.join(home, 'other')),
            JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-other' } }),
            tokenCount('2026-10-14T09:00:00Z', 100000, {
                primary: { used_percent: 40, window_minutes: 43200, resets_at: 1791373820 }
            })
        ].join('\n')
    );
    const real = Date.now();
    fs.utimesSync(a, new Date(real - 60 * MIN), new Date(real - 60 * MIN));
    fs.utimesSync(b, new Date(real), new Date(real));

    const r = new CodexReader(home);
    const out = await r.read([ws]);
    assert.strictEqual(out.context.model, 'gpt-ws');
    assert.strictEqual(out.context.windowTokens, 258400);
    assert.strictEqual(out.context.windowExact, true);
    assert.strictEqual(out.context.usedTokens, 20040);
    assert.strictEqual(out.limits.windows[0].pct, 40);
    assert.strictEqual((await r.read([])).context.model, 'gpt-other');

    fs.utimesSync(a, new Date(real - 48 * 3600e3), new Date(real - 48 * 3600e3));
    assert.strictEqual(
        (await new CodexReader(home).read([ws])).context.model,
        'gpt-other',
        'stale workspace session must lose'
    );
    assert.strictEqual(await new CodexReader(path.join(home, 'none')).read([]), null);
    fs.rmSync(home, { recursive: true, force: true });
});

test('CodexReader expands the tail when recent context lacks an earlier rate-limit event', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cx-tail-'));
    try {
        const day = path.join(home, '.codex', 'sessions', '2026', '11', '16');
        fs.mkdirSync(day, { recursive: true });
        fs.writeFileSync(
            path.join(day, 'rollout.jsonl'),
            [
                tokenCount('2026-11-16T01:00:00Z', 100, LIMITS),
                JSON.stringify({ type: 'filler', text: 'x'.repeat(70 * 1024) }),
                JSON.stringify({ type: 'turn_context', payload: { model: 'fixture-model' } }),
                tokenCount('2026-11-16T02:00:00Z', 200, null)
            ].join('\n')
        );
        const out = await new CodexReader(home).read([]);
        assert.equal(out.context.usedTokens, 240);
        assert.equal(out.limits.at, Date.parse('2026-11-16T01:00:00Z'));
        assert.equal(out.limits.windows[0].pct, 34);
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});
