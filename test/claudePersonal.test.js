'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUsage } = require('../src/claudeUsage');
const { claudeView } = require('../src/usageState');
const { personalUsage, extraUsage, sessionReset, weeklyReset } = require('./fixtures/personal-claude.cjs');
const now = Date.parse('2026-11-16T02:00:00Z');
const render = (raw, policy = 'monthlyUtc', error = '') =>
    claudeView({ data: parseUsage(raw, now), error }, now, policy);

for (const plan of ['pro', 'max']) {
    for (const format of ['legacy', 'limits']) {
        test(`${plan} ${format}: subscription quotas and source resets survive Enterprise policy settings`, () => {
            const v = render(personalUsage(plan, format));
            assert.equal(v.title, 'Claude Code');
            assert.equal(v.plan, plan);
            assert.equal(v.primaryMetric, 'quota');
            assert.equal(v.spend, null, 'Do not invent an Enterprise budget for a personal subscription');
            const rows = v.groups[0].rows;
            assert.deepEqual(
                rows.slice(0, 4).map((r) => [r.label, r.usedPct]),
                [
                    ['5-hour', 0],
                    ['Weekly', 42],
                    ['Weekly · Opus', 18],
                    ['Weekly · Sonnet', 7]
                ]
            );
            assert.equal(rows[0].remainingPct, 100);
            assert.equal(rows[0].resetAt, new Date(sessionReset).toISOString());
            assert.equal(rows[1].resetAt, new Date(weeklyReset).toISOString());
            assert.deepEqual(render(personalUsage(plan, format), 'unknown').groups, v.groups);
            assert.ok(rows.every((r) => r.resetBasis !== 'official-monthly-rule'));
            if (format === 'legacy') assert.equal(rows[4].usedPct, null);
        });
    }
    test(`${plan}: extra spending stays separate and never receives Enterprise monthly reset`, () => {
        const v = render(personalUsage(plan, 'limits', extraUsage));
        assert.equal(v.primaryMetric, 'quota');
        assert.equal(v.spend.title, 'Extra usage budget');
        assert.equal(v.spend.used, 3.21);
        assert.equal(v.spend.limit, 50);
        assert.equal(v.spend.remaining, 46.79);
        assert.equal(v.spend.resetAt, null);
        assert.equal(v.spend.resetBasis, null);
        const raw = personalUsage(plan, 'legacy', {
            ...extraUsage,
            resets_at: weeklyReset
        });
        assert.equal(render(raw).spend.resetAt, new Date(weeklyReset).toISOString());
        assert.equal(render(raw).spend.resetBasis, 'provider');
    });
}

test('personal quotas survive unsupported extra money, errors and expired source resets without zeroing', () => {
    const raw = personalUsage('pro', 'legacy', {
        used_credits: 321,
        monthly_limit: 5000,
        is_enabled: false
    });
    raw.rate_limits.five_hour = {
        utilization: 67,
        resets_at: '2026-11-16T01:59:00Z'
    };
    const v = render(raw, 'monthlyUtc', 'timeout');
    assert.equal(v.spend.status, 'unsupported');
    assert.equal(v.spend.used, null);
    assert.equal(v.primaryMetric, 'quota');
    assert.equal(v.groups[0].rows[0].usedPct, 67);
    assert.equal(v.groups[0].rows[0].resetPending, true);
    assert.equal(v.groups[0].rows[1].usedPct, 42);
    assert.ok(v.groups[0].rows.every((r) => r.stale));
});

test('partial personal responses keep core windows Unknown without inventing model limits or an Enterprise window', () => {
    for (const plan of ['pro', 'max']) {
        const raw = personalUsage(plan, 'legacy', extraUsage);
        raw.rate_limits = { five_hour: raw.rate_limits.five_hour, extra_usage: extraUsage };
        const v = render(raw);
        assert.deepEqual(
            v.groups[0].rows.map((r) => [r.label, r.usedPct]),
            [
                ['5-hour', 0],
                ['Weekly', null]
            ]
        );
        assert.equal(v.groups[0].rows[1].resetAt, null);
        raw.rate_limits = { seven_day: { utilization: 15, resets_at: weeklyReset } };
        assert.deepEqual(
            render(raw).groups[0].rows.map((r) => [r.label, r.usedPct]),
            [
                ['Weekly', 15],
                ['5-hour', null]
            ]
        );
    }
    const enterprise = render({ subscription_type: 'enterprise', rate_limits: { extra_usage: extraUsage } });
    assert.equal(enterprise.groups[0].rows.length, 0);
    const unavailable = render({ subscription_type: 'pro', rate_limits_available: false });
    assert.equal(unavailable.groups[0].rows.length, 0);
});

test('Team displays source-provided session, all-model and Fable limits in either CLI format', () => {
    const projected = {
        five_hour: { utilization: 13, resets_at: sessionReset },
        seven_day: { utilization: 3, resets_at: weeklyReset },
        model_scoped: [{ display_name: 'Fable', utilization: 5, resets_at: weeklyReset }]
    };
    const limits = [
        { kind: 'session', percent: 13, resets_at: sessionReset },
        { kind: 'weekly_all', percent: 3, resets_at: weeklyReset },
        { kind: 'weekly_scoped', percent: 5, resets_at: weeklyReset, scope: { model: { display_name: 'Fable' } } }
    ];
    for (const rate_limits of [projected, { ...projected, limits }, { limits }, { ...projected, limits: [limits[2]] }]) {
        const view = render({ subscription_type: 'team', rate_limits });
        assert.equal(view.primaryMetric, 'quota');
        assert.equal(view.spend, null);
        assert.deepEqual(view.groups[0].rows.map((row) => [row.label, row.usedPct, row.resetAt]), [
            ['5-hour', 13, new Date(sessionReset).toISOString()],
            ['Weekly', 3, new Date(weeklyReset).toISOString()]
        ]);
        assert.equal(view.groups[1].label, 'Fable');
        assert.deepEqual(view.groups[1].rows.map((row) => [row.label, row.usedPct, row.resetAt]), [
            ['Weekly', 5, new Date(weeklyReset).toISOString()]
        ]);
    }
    const partial = render({ subscription_type: 'team', rate_limits: { model_scoped: projected.model_scoped } });
    assert.deepEqual(partial.groups[0].rows.map((row) => [row.label, row.usedPct]), [
        ['5-hour', null],
        ['Weekly', null]
    ]);
    assert.equal(partial.groups[1].rows[0].usedPct, 5);

    const versioned = render({ rate_limits: { model_scoped: [
        { display_name: 'Claude Fable 5.2', utilization: 0 },
        { display_name: 'Sonnet', utilization: 3 }
    ] } });
    assert.equal(versioned.groups[0].rows[0].label, 'Weekly · Sonnet');
    assert.equal(versioned.groups[1].rows[0].label, 'Weekly · 5.2');
    assert.equal(versioned.groups[1].rows[0].usedPct, 0);
    assert.equal(render(personalUsage('pro', 'legacy')).groups.length, 1);
    assert.equal(render({ subscription_type: 'enterprise', rate_limits: { extra_usage: extraUsage } }).groups.length, 1);
});
