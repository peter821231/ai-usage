'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { buildUsageState } = require('../src/usageState');
const { parseUsage } = require('../src/claudeUsage');
const { createI18n, localizeView } = require('../src/i18n');
const { personalUsage, extraUsage } = require('./fixtures/personal-claude.cjs');
function load() {
    const items = [];
    const vscode = {
        StatusBarAlignment: { Right: 2 },
        ThemeColor: class {},
        MarkdownString: class {
            constructor() {
                this.value = '';
            }
            appendMarkdown(s) {
                this.value += s;
            }
        },
        window: {
            createStatusBarItem: () => {
                const v = {
                    show() {
                        this.visible = true;
                    },
                    hide() {
                        this.visible = false;
                    },
                    dispose() {}
                };
                items.push(v);
                return v;
            }
        }
    };
    const orig = Module._load;
    Module._load = function (key, ...rest) {
        return key === 'vscode' ? vscode : orig.call(this, key, ...rest);
    };
    try {
        delete require.cache[require.resolve('../src/statusBar')];
        return { ...require('../src/statusBar'), items };
    } finally {
        Module._load = orig;
    }
}
const now = Date.parse('2026-11-16T02:00:00Z');
function view() {
    const money = (n) => ({ amount_minor: n, exponent: 2, currency: 'USD' });
    return buildUsageState(
        {
            antigravity: {
                observedAt: now,
                data: {
                    groups: [
                        {
                            id: 'gemini',
                            name: 'Gemini Models',
                            windows: [{ id: '5', name: '5-hour', remainingPct: 90 }]
                        },
                        {
                            id: 'argon',
                            name: 'Gemini 4 Argon',
                            windows: [{ id: 'wk', name: 'Weekly', remainingPct: 90 }]
                        }
                    ]
                }
            },
            claude: {
                data: parseUsage(
                    {
                        rate_limits: { spend: { used: money(3514), limit: money(20000) } }
                    },
                    now
                )
            },
            codex: {
                data: {
                    limits: {
                        at: now,
                        windows: [
                            { name: '5-hour', pct: 0 },
                            { name: 'Weekly', pct: 20 }
                        ]
                    }
                }
            }
        },
        now
    );
}
test('status bar keeps Argon and window names distinct and money separate from context', () => {
    const { StatusBar, items } = load();
    const bar = new StatusBar();
    const v = view();
    bar.update(v);
    assert.match(items[0].text, /Gemini 5h 10%/);
    assert.match(items[0].text, /wk Unknown/);
    assert.match(items[0].text, /Argon wk 10%/);
    assert.doesNotMatch(items[0].text, /Claude\/GPT/);
    assert.match(items[0].text, /Claude USD 35.14 \/ 200.00/);
    assert.match(items[0].text, /Codex 5h 0% · wk 20%/);
    assert.match(items[0].tooltip.value, /USD 35\\?\.14 \/ USD 200\\?\.00/);
    assert.match(items[0].tooltip.value, /Gemini 4 Argon/);
    assert.match(items[0].tooltip.value, /Claude and GPT models/);
    assert.doesNotMatch(items[0].tooltip.value, /Status bar space is limited|Source event|Fetched/);
    assert.equal(items.length, 1);
    assert.doesNotMatch(items[0].text, /Context/);
    assert.match(items[0].tooltip.value, /🟢 5\\-hour .*?`▪▫{9}` .*?\*\*10%\*\*/);
});

test('status bar and hover distinguish Fable from the all-models weekly window', () => {
    const { StatusBar, items } = load();
    const bar = new StatusBar();
    const state = buildUsageState({
        antigravity: { enabled: false },
        codex: { enabled: false },
        claude: { data: parseUsage({ subscription_type: 'team', rate_limits: {
            five_hour: { utilization: 13 },
            seven_day: { utilization: 3 },
            model_scoped: [{ display_name: 'Fable', utilization: 5 }]
        } }, now) }
    }, now);
    bar.update(state);
    assert.match(items[0].text, /Claude 5h 13% · wk 3% · Fable wk 5%/);
    assert.match(items[0].tooltip.value, /\*\*Fable\*\*  \n&ensp;🟢 Weekly/);

    const enterprise = buildUsageState({
        antigravity: { enabled: false },
        codex: { enabled: false },
        claude: { data: parseUsage({ subscription_type: 'enterprise', rate_limits: {
            extra_usage: extraUsage,
            model_scoped: [{ display_name: 'Fable', utilization: 5 }]
        } }, now) }
    }, now);
    bar.update(enterprise);
    assert.match(items[0].text, /Claude USD 3.21 \/ 50.00 · Fable wk 5%/);
});

test('Antigravity selections change only the summary; all windows remain in hover and the original view', () => {
    const { StatusBar, items } = load();
    const bar = new StatusBar();
    const v = view();
    const before = structuredClone(v);
    const choices = { geminiFiveHour: false, geminiWeekly: false, argonWeekly: false, claudeGptFiveHour: true, claudeGptWeekly: true };
    bar.update(v, { antigravityWindows: choices });
    assert.match(items[0].text, /AG Claude\/GPT 5h Unknown · wk Unknown/);
    assert.doesNotMatch(items[0].text, /Gemini|Argon/);
    assert.match(items[0].tooltip.value, /Gemini Models/);
    assert.match(items[0].tooltip.value, /Gemini 4 Argon/);
    assert.deepEqual(v, before);
    bar.update(v, { antigravityWindows: { ...choices, claudeGptFiveHour: false, claudeGptWeekly: false } });
    assert.doesNotMatch(items[0].text, /\bAG\b/);
    assert.match(items[0].text, /Claude USD/);
    bar.update(v, { hidden: ['claude', 'codex'], antigravityWindows: { geminiFiveHour: false, geminiWeekly: false, argonWeekly: false } });
    assert.equal(items[0].visible, false);
});

test('Chinese status summaries use stable identities and retain every quota in the hover', () => {
    const { StatusBar, items } = load();
    const bar = new StatusBar();
    const v = localizeView(view(), createI18n('zh-TW'));
    bar.update(v, { antigravityWindows: { geminiFiveHour: false, geminiWeekly: false, argonWeekly: true } });
    assert.match(items[0].text, /AG Argon 週 10%/);
    assert.doesNotMatch(items[0].text, /Gemini/);
    assert.match(items[0].text, /Codex 5時 0% · 週 20%/);
    assert.match(items[0].tooltip.value, /Gemini 模型/);
    assert.match(items[0].tooltip.value, /Gemini 4 Argon/);
    assert.match(items[0].tooltip.value, /未知/);
    assert.match(items[0].tooltip.value, /帳戶預算/);
    assert.match(items[0].tooltip.value, /\[開啟儀表板\]\(command:nexusAiUsage.dashboard.focus\)/);
    v.providers[0].groups[0].label = '[unsafe](command:evil)';
    bar.update(v);
    assert.doesNotMatch(items[0].tooltip.value, /\[unsafe\]\(command:evil\)/);
});

test('unselected Antigravity windows do not color the selected summary', () => {
    const { StatusBar, items } = load();
    const bar = new StatusBar();
    const v = view();
    v.providers = [v.providers[0]];
    v.providers[0].groups[0].rows[1].usedPct = 4;
    const hiddenPool = v.providers[0].groups.find((g) => g.short === 'Claude/GPT');
    hiddenPool.rows[0].usedPct = 99;
    hiddenPool.rows[0].stale = true;
    bar.update(v);
    assert.equal(items[0].backgroundColor, undefined);
    bar.update(v, { antigravityWindows: { claudeGptFiveHour: true } });
    assert.ok(items[0].backgroundColor);
    bar.update(v, { compact: true, antigravityWindows: { claudeGptFiveHour: true } });
    assert.equal(items[0].text, '$(dashboard)');
    assert.match(items[0].accessibilityInformation.label, /Gemini/);
    assert.ok(items[0].backgroundColor);
    bar.update(v, { compact: true, show: false });
    assert.equal(items[0].visible, false);
    bar.update(v, { compact: true, hidden: ['antigravity'] });
    assert.equal(items[0].visible, false);
});

test('old Codex records keep real values and reset time without a yellow idle warning; read errors still warn', () => {
    const { StatusBar, items } = load();
    const bar = new StatusBar();
    const at = now - 29*60000;
    const input = { codex: { data: { limits: { at, windows: [
        { name: '5-hour', pct: 5, resetsAt: new Date(now+3600000).toISOString() },
        { name: 'Weekly', pct: 24 }
    ] } } } };
    const state = () => {
        const v = buildUsageState(input, now);
        v.providers = v.providers.filter((p) => p.id === 'codex');
        return v;
    };
    bar.update(state());
    assert.match(items[0].text, /Codex 5h 5% · wk 24%/);
    assert.doesNotMatch(items[0].text, /[~!]/);
    assert.equal(items[0].backgroundColor, undefined);
    assert.match(items[0].tooltip.value, /Last recorded/);
    assert.ok(items[0].tooltip.value.includes('↻ 1h 0m \\(Mon 11:00\\)'));
    assert.equal(state().providers[0].groups[0].rows[0].observedAt, at);
    input.codex.data.limits.windows[0].resetsAt = new Date(now-1000).toISOString();
    const expired = state().providers[0].groups[0].rows[0];
    assert.equal(expired.resetPending, true);
    assert.equal(expired.usedPct, 5);
    bar.update(state());
    assert.equal(items[0].backgroundColor, undefined);
    assert.match(items[0].tooltip.value, /Awaiting update · Last recorded/);
    input.codex.error = 'Could not read local Codex rate-limit events';
    bar.update(state());
    assert.ok(items[0].backgroundColor);
    assert.match(items[0].text, /!/);
    assert.match(items[0].tooltip.value, /Error/);
});

test('hover charts and warning dots distinguish zero, missing and low quota in either percent mode', () => {
    const { progress, hover } = load();
    assert.equal(progress(null), '');
    assert.equal(progress(undefined), '');
    assert.equal(progress(0), '`▫▫▫▫▫▫▫▫▫▫`');
    assert.equal(progress(100), '`▪▪▪▪▪▪▪▪▪▪`');
    const v = view();
    v.providers[1].context = { pct: 68 };
    const codexRows = v.providers[2].groups[0].rows;
    codexRows.push(
        { label: 'Low', usedPct: 75, remainingPct: 25 },
        { label: 'Critical', usedPct: 90, remainingPct: 10 }
    );
    const used = hover(v).value;
    assert.match(used, /🟢 Account budget .*?\*\*17\\\.6%\*\*/);
    assert.match(used, /🟢 5\\-hour .*?`▫{10}` .*?\*\*0%\*\*/);
    assert.match(used, /⚪ Weekly &ensp; \*\*Unknown\*\*/);
    assert.match(used, /🟡 Low .*?\*\*75%\*\*/);
    assert.match(used, /🔴 Critical .*?\*\*90%\*\*/);
    assert.doesNotMatch(used, /68%/);
    v.percentMode = 'left';
    const left = hover(v).value;
    assert.match(left, /🟢 Account budget .*?\*\*82\\\.4%\*\* · USD 164\\\.86/);
    assert.match(left, /🟡 Low .*?\*\*25%\*\*/);
    assert.match(left, /🔴 Critical .*?`▪▫{9}` .*?\*\*10%\*\*/);
});
test('unknown, stale, errors and used/remaining semantics are explicit', () => {
    const { StatusBar, items } = load();
    const bar = new StatusBar();
    const v = view();
    v.percentMode = 'left';
    v.providers[2].error = 'failed';
    v.providers[2].groups[0].rows[0].stale = true;
    bar.update(v);
    assert.match(items[0].text, /Codex 5h 100% · wk 80% !/);
    assert.match(items[0].text, /left$/);
    assert.match(items[0].tooltip.value, /Stale/);
    assert.match(items[0].tooltip.value, /Error/);
    bar.update(buildUsageState({}, now));
    assert.match(items[0].text, /Unknown/);
    assert.doesNotMatch(items[0].text, /0%/);
});

test('hidden sources do not color visible healthy usage, and all-hidden bars disappear', () => {
    const { StatusBar, items } = load();
    const bar = new StatusBar();
    const v = view();
    v.providers[0].error = 'hidden-source-failure';
    bar.update(v, { hidden: ['antigravity'] });
    assert.doesNotMatch(items[0].text, /AG|hidden-source-failure/);
    assert.equal(items[0].backgroundColor, undefined);
    assert.equal(items[0].visible, true);
    bar.update(v, { hidden: ['antigravity', 'claude', 'codex'] });
    assert.equal(items[0].visible, false);
    assert.equal(items[0].backgroundColor, undefined);
    bar.update(v, { hidden: ['antigravity'] });
    assert.equal(items[0].visible, true);
});

test('Pro and Max status summaries keep subscription windows visible with optional extra spending', () => {
    const { StatusBar, items } = load();
    const bar = new StatusBar();
    for (const plan of ['pro', 'max']) {
        for (const extra of [undefined, extraUsage, { used_credits: 321, monthly_limit: 5000 }]) {
            const v = buildUsageState(
                {
                    claude: {
                        data: parseUsage(personalUsage(plan, 'legacy', extra), now)
                    }
                },
                now
            );
            v.providers = v.providers.filter((p) => p.id === 'claude');
            bar.update(v);
            assert.match(items[0].text, /Claude 5h 0% · wk 42%/);
            assert.match(items[0].text, /Weekly · Opus 18%/);
            assert.doesNotMatch(items[0].text, /Claude USD|200\.00|monthly rule/);
            assert.match(items[0].tooltip.value, /Weekly · Sonnet/);
            assert.doesNotMatch(items[0].tooltip.value, /official monthly rule/);
            if (extra) assert.match(items[0].tooltip.value, /Extra usage budget/);
            v.percentMode = 'left';
            bar.update(v);
            assert.match(items[0].text, /Claude 5h 100% · wk 58%/);
        }
    }
});
