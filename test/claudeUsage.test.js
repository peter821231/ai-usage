'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUsage, resetTime } = require('../src/claudeUsage');
const { fetchUsage, bundledCliPath } = require('../src/claudeUsageCli');
const path = require('node:path');

const m = (amount_minor, extra = {}) => ({
    amount_minor,
    exponent: 2,
    currency: 'USD',
    ...extra
});
const snapshot = (spend) => parseUsage({ subscription_type: 'enterprise', rate_limits: { spend } });

test('Enterprise spend-only response converts cents and derives remaining budget', () => {
    const s = snapshot({ used: m(3514), limit: m(20000), enabled: true });
    assert.equal(s.windows.length, 0);
    assert.equal(s.spend.used, 35.14);
    assert.equal(s.spend.limit, 200);
    assert.equal(s.spend.remaining, 164.86);
    assert.equal(s.spend.resetAt, null);
    assert.equal(s.spend.status, 'available');
    assert.equal(snapshot({ used: m(0), limit: m(20000) }).spend.used, 0);
    assert.equal(snapshot({ used: m(25000), limit: m(20000) }).spend.remaining, -50);
});

test('money fields, mismatched currencies and unknown exponent never become zero or USD guesses', () => {
    const s = snapshot({
        used: m(1, { exponent: undefined }),
        limit: m(20000)
    }).spend;
    assert.equal(s.used, null);
    assert.equal(s.remaining, null);
    assert.equal(s.status, 'unsupported');
    assert.equal(snapshot({ used: m(1), limit: m(20000, { currency: 'EUR' }) }).spend.limit, null);
    assert.equal(snapshot({ used: m(Number.MAX_SAFE_INTEGER + 1) }).spend.used, null);
    assert.equal(snapshot({ used: m(1), limit: m(0), enabled: false }).spend.usedPct, null);
    assert.equal(snapshot({ used: m(1), limit: m(0), enabled: false }).spend.enabled, false);
    assert.equal(snapshot({ used: m(1), limit: m(20000), period: 'weekly' }).spend.period, 'weekly');
});

test('legacy extra usage requires known currency and scale; percentage-only subscription works', () => {
    const s = parseUsage({
        rate_limits: {
            extra_usage: {
                used_credits: 3514,
                monthly_limit: 20000,
                currency: 'USD',
                decimal_places: 2
            }
        }
    });
    assert.equal(s.spend.remaining, 164.86);
    assert.equal(
        parseUsage({
            rate_limits: {
                extra_usage: { used_credits: 3514, monthly_limit: 20000 }
            }
        }).spend.used,
        null
    );
    assert.equal(parseUsage({ rate_limits: { five_hour: { utilization: 0 } } }).windows[0].usedPct, 0);
    assert.throws(() => parseUsage({ rate_limits: {} }), /unsupported-payload/);
    assert.throws(() => parseUsage({}), /unsupported-payload/);
    assert.equal(parseUsage({ rate_limits_available: false, rate_limits: null }).available, false);
});

test('reset parsing accepts ISO, epoch seconds and milliseconds without estimating a calendar reset', () => {
    const iso = '2026-11-18T12:00:00.000Z';
    assert.equal(resetTime(iso), iso);
    assert.equal(resetTime(Date.parse(iso) / 1000), iso);
    assert.equal(resetTime(Date.parse(iso)), iso);
    assert.equal(resetTime(null), null);
    assert.equal(resetTime(Infinity), null);
    assert.equal(resetTime('bad'), null);
});

test('new limit list preserves model scope; invalid percentages remain explicitly unknown', () => {
    const s = parseUsage({
        rate_limits: {
            limits: [
                { kind: 'session', percent: 0 },
                {
                    kind: 'weekly_scoped',
                    percent: 22,
                    scope: { model: { id: 'opus', display_name: 'Opus' } }
                },
                { kind: 'weekly', percent: null }
            ]
        }
    });
    assert.deepEqual(
        s.windows.map((w) => [w.name, w.usedPct]),
        [
            ['5-hour', 0],
            ['Weekly · Opus', 22],
            ['Weekly', null]
        ]
    );
});

const fake = (mode, more = {}) =>
    fetchUsage({
        command: process.execPath,
        argsPrefix: [path.join(__dirname, 'fixtures/fake-claude.cjs')],
        env: { ...process.env, NEXUS_FAKE_CLI: mode },
        timeoutMs: 1500,
        killGraceMs: 30,
        ...more
    });
test('CLI initializes before querying usage and handles segmented output', async () => {
    assert.equal((await fake('ok')).rate_limits.five_hour.utilization, 0);
    assert.equal((await fake('chunks')).rate_limits.five_hour.utilization, 0);
    assert.match(bundledCliPath('/extension', 'win32'), /claude.exe$/);
});
test('CLI cleans up timeout, exit, cancellation and oversized output with sanitized errors', async () => {
    await assert.rejects(fake('hang', { timeoutMs: 100 }), { code: 'timeout' });
    await assert.rejects(fake('wrong-id', { timeoutMs: 100 }), {
        code: 'timeout'
    });
    await assert.rejects(fake('exit'), { code: 'cli-exited' });
    await assert.rejects(fake('large', { maxBytes: 1000 }), {
        code: 'output-too-large'
    });
    await assert.rejects(
        fake('refuse'),
        (error) => error.code === 'request-refused' && !error.message.includes('SECRET')
    );
    const c = new AbortController();
    const query = fake('hang', { signal: c.signal });
    c.abort();
    await assert.rejects(query, { code: 'cancelled' });
    await assert.rejects(fetchUsage({ command: '/nonexistent-nexus-cli' }), {
        code: 'cli-unavailable'
    });
});
