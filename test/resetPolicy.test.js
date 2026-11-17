'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { nextMonthlyUtc, spendReset } = require('../src/resetPolicy');
const { claudeView, buildUsageState } = require('../src/usageState');

const fetchedAt = Date.parse('2026-11-16T06:12:00Z');
const snapshot = {
    data: {
        plan: 'enterprise',
        available: true,
        fetchedAt,
        windows: [],
        spend: { status: 'available', used: 53.84, limit: 200, remaining: 146.16, resetAt: null }
    }
};

test('monthly reset matches official page: December 1 00 UTC is 08 Asia/Taipei', () => {
    const view = claudeView(snapshot, fetchedAt);
    assert.equal(view.spend.resetAt, '2026-12-01T00:00:00.000Z');
    assert.equal(view.spend.resetBasis, 'official-monthly-rule');
    assert.match(
        new Date(view.spend.resetAt).toLocaleString('en-GB', { timeZone: 'Asia/Taipei' }),
        /01\/12\/2026, 08:00:00/
    );
    assert.equal(snapshot.data.spend.resetAt, null, 'Do not mutate or relabel the CLI response');
});

test('UTC month edges, leap years and year rollover ignore the host timezone', () => {
    for (const [at, next] of [
        ['2026-11-30T23:59:59.999Z', '2026-12-01T00:00:00.000Z'],
        ['2026-12-01T00:00:00Z', '2027-01-01T00:00:00.000Z'],
        ['2026-12-31T23:59:59Z', '2027-01-01T00:00:00.000Z'],
        ['2028-02-29T23:59:59Z', '2028-03-01T00:00:00.000Z']
    ])
        assert.equal(nextMonthlyUtc(Date.parse(at)), next);
    for (const invalid of [null, undefined, NaN, Infinity, 0, '2026-11-16'])
        assert.equal(nextMonthlyUtc(invalid), null);
});

test('a cached reading does not roll its reset forward or zero spend after the month changes', () => {
    const recent = structuredClone(snapshot);
    recent.data.fetchedAt = Date.parse('2026-11-30T23:59:00Z');
    assert.equal(claudeView(recent, recent.data.fetchedAt).spend.stale, false);
    const view = claudeView(recent, Date.parse('2026-12-01T00:01:00Z'));
    assert.equal(view.spend.resetAt, '2026-12-01T00:00:00.000Z');
    assert.equal(view.spend.stale, true);
    assert.equal(view.spend.resetPending, true);
    assert.equal(view.spend.used, 53.84);
    assert.equal(view.spend.remaining, 146.16);
});

test('provider reset wins; other plans, non-monthly periods and source-only mode do not use the rule', () => {
    const data = structuredClone(snapshot.data);
    data.spend.resetAt = '2026-11-29T15:00:00Z';
    assert.deepEqual(spendReset(data), { resetAt: '2026-11-29T15:00:00.000Z', resetBasis: 'provider' });
    data.spend.resetAt = null;
    data.spend.period = 'weekly';
    assert.equal(spendReset(data).resetAt, null);
    data.spend.period = 'monthly';
    data.plan = 'max';
    assert.equal(spendReset(data).resetAt, null);
    assert.equal(spendReset(snapshot.data, 'unknown').resetAt, null);
    assert.equal(
        buildUsageState({ claude: snapshot, enterpriseResetSchedule: 'unknown' }, fetchedAt).providers[1].spend.resetAt,
        null
    );
    assert.equal(spendReset({ ...snapshot.data, fetchedAt: null }).resetAt, null);
    assert.equal(spendReset({ ...snapshot.data, available: false }).resetAt, null);
});
