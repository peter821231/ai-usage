'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUsageState, row } = require('../src/usageState');
const { friendlyGroup } = require('../src/util');
const { parseQuotaSummary } = require('../src/parse');
const now = Date.parse('2026-11-16T02:00:00Z');

test('same quota and reset never combine Gemini with Argon or add unreported windows', () => {
    const groups = parseQuotaSummary({
        response: {
            groups: ['Gemini Models', 'Claude and GPT models', 'Gemini 4 Argon'].map((displayName, i) => ({
                id: `source-${i}`,
                displayName,
                buckets: [{ displayName: 'Weekly', remainingFraction: 0.93, resetTime: '2026-11-20T00:00:00Z' }]
            }))
        }
    });
    const p = buildUsageState({ antigravity: { data: { groups }, observedAt: now } }, now).providers[0];
    assert.equal(p.groups.length, 3);
    const rows = p.groups.flatMap((g) => g.rows);
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map((r) => r.id)).size, 3);
    assert.ok(rows.every((r) => r.label === 'Weekly'));
    assert.equal(friendlyGroup('Gemini 4 Argon'), 'Argon');
    assert.equal(friendlyGroup('Gemini Experimental X'), 'Gemini Experimental X');
});
test('reset elapsed retains observed usage; real zero differs from missing', () => {
    const past = '2026-11-16T01:00:00Z';
    const s = row('a', '5-hour', 90, past, { observedAt: now - 3600000 }, 300000, now);
    assert.equal(s.usedPct, 90);
    assert.equal(s.remainingPct, 10);
    assert.equal(s.stale, true);
    assert.equal(s.resetPending, true);
    assert.equal(row('a', '5-hour', null, null, {}, 300000, now).usedPct, null);
    assert.equal(row('a', '5-hour', 0, null, { observedAt: now }, 300000, now).usedPct, 0);
});
test('rereading an old Codex event does not freshen its source time', () => {
    const data = { limits: { at: now - 3600000, windows: [{ name: '5-hour', pct: 16 }] } };
    const p = buildUsageState({ codex: { data, checkedAt: now } }, now).providers[2];
    assert.equal(p.groups[0].rows[0].observedAt, now - 3600000);
    assert.equal(p.groups[0].rows[0].stale, true);
    assert.equal(p.groups[0].rows.find((r) => r.label === 'Weekly').usedPct, null);
});
test('errors retain last success, all missing providers stay visible, context stays separate', () => {
    const view = buildUsageState(
        {
            claude: {
                data: { fetchedAt: now, windows: [], spend: { used: 35.14, usedPct: 17.57 } },
                error: 'timeout',
                context: { pct: 56 }
            }
        },
        now
    );
    assert.equal(view.providers.length, 3);
    assert.equal(view.providers[1].spend.used, 35.14);
    assert.equal(view.providers[1].spend.stale, true);
    assert.equal(view.providers[1].spend.usedPct, 17.57);
    assert.equal(view.providers[1].context.pct, 56);
});
