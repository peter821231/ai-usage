'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { orderPorts, parseUserStatus, parseGeneratorMetadata } = require('../src/parse');
const { buildCodexLimits, parseCodexLines } = require('../src/codex');
const { findLastUsage } = require('../src/claudeCode');
const { rpc, MAX_BODY_BYTES } = require('../src/agyClient');

test('orderPorts drops ports the process does not own', () => {
    assert.deepStrictEqual(orderPorts([61866, 5555], [63587, 61866]), { ports: [61866, 63587], verified: true });
    assert.deepStrictEqual(orderPorts([5555], [63587]), { ports: [63587], verified: true });
    assert.deepStrictEqual(orderPorts([61866], []), { ports: [61866], verified: false });
});

test('parseUserStatus survives hostile values', () => {
    const s = parseUserStatus({
        userStatus: {
            email: { evil: 1 },
            name: 'x'.repeat(5000),
            planStatus: { availablePromptCredits: 'lots', planInfo: { planName: 42 } },
            cascadeModelConfigData: {
                clientModelConfigs: [
                    null,
                    'junk',
                    { label: 'Gemini A', quotaInfo: { remainingFraction: 7, resetTime: 'not a date' } },
                    { label: 'Claude B', quotaInfo: { remainingFraction: -3, resetTime: '2026-10-14T10:00:00Z' } },
                    { label: { x: 1 }, quotaInfo: { remainingFraction: NaN } }
                ]
            }
        }
    });
    assert.strictEqual(s.email, '');
    assert.strictEqual(s.name.length, 200);
    assert.strictEqual(s.planName, 'Unknown');
    assert.deepStrictEqual(s.credits, {});
    assert.deepStrictEqual(
        s.pools.map((p) => [p.name, p.remainingPct, p.resetTime]),
        [
            ['Claude B', null, '2026-10-14T10:00:00Z'],
            ['Gemini A', null, null]
        ]
    );
    assert.strictEqual(
        parseUserStatus({ userStatus: { cascadeModelConfigData: { clientModelConfigs: 'x' } } }).pools.length,
        0
    );
});

test('parseGeneratorMetadata ignores non-string titles', () => {
    const data = { generatorMetadata: [{ chatModel: { usage: { inputTokens: '10' } } }] };
    assert.strictEqual(
        parseGeneratorMetadata(data, {}, { summary: { summary: { bad: 1 } }, time: 1 }).title,
        'Active conversation'
    );
    const inherited = { generatorMetadata: [{ chatModel: { model: 'toString', usage: { inputTokens: 1 } } }] };
    assert.strictEqual(parseGeneratorMetadata(inherited, {}, null).model, 'Tostring');
});

test('Codex preserves finite overage and rejects junk', () => {
    const lim = buildCodexLimits({
        limitsEvent: {
            ts: 0,
            rl: {
                primary: { used_percent: 250, window_minutes: 'x', resets_at: 1e30 },
                secondary: { used_percent: 'high' },
                credits: { has_credits: true, balance: { nested: true } },
                plan_type: 'p'.repeat(200)
            }
        }
    });
    assert.deepStrictEqual(lim.windows, [
        { name: 'Limit', minutes: 0, pct: 250, resetsAt: null, resetBasis: 'provider' }
    ]);
    assert.strictEqual(lim.credits, null);
    assert.strictEqual(lim.plan.length, 40);
    const p = parseCodexLines([
        JSON.stringify({ type: 'turn_context', payload: { model: { evil: 1 } } }),
        JSON.stringify({
            type: 'event_msg',
            payload: { type: 'token_count', info: { last_token_usage: {}, model_context_window: -5 } }
        })
    ]);
    assert.strictEqual(p.model, '');
});

test('Claude log parser ignores non-string models', () => {
    const f = findLastUsage([JSON.stringify({ message: { model: ['x'], usage: { input_tokens: 'many' } } })]);
    assert.strictEqual(f.model, '');
});

test('rpc refuses oversized responses', async () => {
    const big = Buffer.alloc(MAX_BODY_BYTES + 1024, 0x61);
    const server = http.createServer((req, res) => {
        res.writeHead(200);
        res.end(big);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    try {
        await assert.rejects(rpc(port, 'csrf', 'GetUserStatus', {}, 4000), /RESPONSE_TOO_LARGE|socket hang up|aborted/);
    } finally {
        server.closeAllConnections && server.closeAllConnections();
        await new Promise((r) => server.close(r));
    }
});

test('rpc sends the csrf header directly to 127.0.0.1, bypassing the global agent', async () => {
    let seen = null;
    const server = http.createServer((req, res) => {
        seen = { host: req.socket.localAddress, csrf: req.headers['x-codeium-csrf-token'] };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const originalAgent = http.globalAgent;
    const globalAgent = new http.Agent();
    globalAgent.createConnection = () => assert.fail('The global agent must never carry the local session token');
    http.globalAgent = globalAgent;
    try {
        assert.deepStrictEqual(await rpc(server.address().port, 'tok', 'X', {}), { ok: true });
        assert.deepStrictEqual(seen, { host: '127.0.0.1', csrf: 'tok' });
    } finally {
        http.globalAgent = originalAgent;
        globalAgent.destroy();
        await new Promise((r) => server.close(r));
    }
});

test('rpc settles when the reply stalls past its deadline or aborts during the body', async () => {
    const server = http.createServer((req, res) => {
        res.writeHead(200);
        res.write(' ');
        if (req.url.endsWith('/Abort')) {
            setImmediate(() => res.destroy());
            return;
        }
        const drip = setInterval(() => res.write(' '), 10);
        res.once('close', () => clearInterval(drip));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const port = server.address().port;
        await assert.rejects(rpc(port, 'fixture', 'Wait', {}, 100), /^Error: TIMEOUT$/);
        await assert.rejects(rpc(port, 'fixture', 'Abort', {}, 1000), /aborted|socket hang up/);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
