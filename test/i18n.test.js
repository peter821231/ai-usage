'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createI18n, resolveLocale, localizeView } = require('../src/i18n');
const { createTranslator } = require('../media/i18n');
const { buildUsageState } = require('../src/usageState');
const { parseGeneratorMetadata } = require('../src/parse');
const { parseUsage } = require('../src/claudeUsage');
const { settingsView, isValidSetting } = require('../src/settingsUi');
const { parseJson, validateBundle, check } = require('../scripts/locales.cjs');
const base = require('../locales/en.json');
const chinese = require('../locales/zh-TW.json');
const supportedLocales = require('../locales/index.json');
const catalogs = supportedLocales.map((locale) => require(`../locales/${locale}.json`));

test('explicit language overrides editor language; auto normalizes supported locales without assuming all Chinese is Taiwan Chinese', () => {
    assert.equal(resolveLocale('zh-TW', 'en'), 'zh-TW');
    assert.equal(resolveLocale('en', 'zh-tw'), 'en');
    for (const language of ['zh-tw', 'ZH-TW', 'zh-Hant', 'zh-Hant-TW'])
        assert.equal(resolveLocale('auto', language), 'zh-TW');
    const registeredTags = new Set();
    for (const catalog of catalogs) {
        assert.equal(resolveLocale(catalog.locale, 'en'), catalog.locale);
        for (const tag of [catalog.locale, catalog.vscodeLocale, ...catalog.aliases]) {
            registeredTags.add(tag.toLowerCase());
            assert.equal(resolveLocale('auto', tag.toUpperCase()), catalog.locale);
        }
    }
    for (const language of ['zh', 'zh-cn', 'zh-Hans', 'zh-HK', 'en-US'])
        if (!registeredTags.has(language.toLowerCase())) assert.equal(resolveLocale('auto', language), 'en');
    for (const language of ['unsupported_locale', '', undefined]) assert.equal(resolveLocale('auto', language), 'en');
    assert.equal(resolveLocale('../../private'), 'en');
});

test('missing or empty translations fall back per message without changing the source catalogs', () => {
    const partial = { locale: 'zh-TW', messages: { 'quota.used': '已使用', 'common.unknown': '', 'quota.remaining': null } };
    const before = structuredClone(partial);
    const i18n = createTranslator(partial, base.messages);
    assert.equal(i18n.t('quota.used'), '已使用');
    assert.equal(i18n.t('common.unknown'), 'Unknown');
    assert.equal(i18n.t('quota.remaining'), 'Remaining');
    assert.deepEqual(partial, before);
    assert.equal(i18n.bundle.messages['reset.pending'], 'Pending');
});

test('named variables preserve literal values and allow translation to reorder the sentence', () => {
    const i18n = createI18n('zh-TW');
    assert.equal(i18n.t('reset.in', { duration: '1時 20分' }), '1時 20分後');
    const hostile = '[click](command:evil) <img onerror=x> $& {amount}';
    assert.equal(i18n.t('budget.remaining', { amount: hostile }), '剩餘 ' + hostile);
});

test('formatting preserves zero, unknown, over-budget money and the chosen timezone', () => {
    const i18n = createI18n('zh-TW');
    assert.equal(i18n.percent(0), '0%');
    assert.equal(i18n.percent(null), '未知');
    assert.equal(i18n.money(null, 'USD'), '未知');
    assert.equal(i18n.money(-12.34, 'EUR'), 'EUR -12.34');
    const date = '2026-12-01T00:00:00Z';
    assert.match(i18n.stamp(date, 'Asia/Taipei'), /08:00/);
    assert.match(i18n.stamp(date, 'UTC'), /00:00/);
    const now = Date.parse('2026-11-30T22:40:00Z');
    assert.equal(i18n.duration(date, now), '1時 20分');
    assert.equal(i18n.duration(date, now, true), '待確認');
    assert.equal(i18n.duration(null, now), '未知');
    assert.match(i18n.age(now - 3600000, now), /1.*時.*前/);
});

test('localized projections preserve source identity, timestamps, errors, zero and all monitored windows', () => {
    const now = Date.parse('2026-11-17T00:00:00Z');
    const input = {
        antigravity: { observedAt: now, data: { groups: [
            { id: 'source-argon', name: 'Gemini 4 Argon', windows: [{ id: 'wk', name: 'Weekly', remainingPct: 93 }] },
            { id: 'unknown-pool', name: 'Experimental <model>', windows: [{ id: 'x', name: 'Mystery window', remainingPct: 12 }] }
        ] } },
        codex: { data: { limits: { at: now - 3600000, windows: [{ name: '5-hour', pct: 0 }] } } },
        claude: { error: 'timeout' }
    };
    const view = buildUsageState(input, now);
    const before = structuredClone(view);
    const translated = localizeView(view, createI18n('zh-TW'));
    assert.deepEqual(view, before);
    const argon = translated.providers[0].groups.find((group) => group.id === 'source-argon');
    assert.equal(argon.groupType, 'argon');
    assert.equal(argon.rows[0].windowType, 'weekly');
    assert.equal(argon.rows[0].label, '每週');
    assert.equal(argon.rows[0].usedPct, 7);
    assert.equal(argon.rows[0].observedAt, now);
    assert.equal(translated.providers[0].groups.at(-1).label, 'Experimental <model>');
    assert.equal(translated.providers[0].groups.at(-1).rows[0].label, 'Mystery window');
    assert.match(translated.providers[1].error, /查詢逾時/);
    assert.equal(translated.providers[2].groups[0].rows[0].usedPct, 0);
    assert.equal(translated.providers[2].groups[0].rows[0].recordedOnly, true);
    assert.equal(translated.providers[2].groups[0].rows[0].observedAt, now - 3600000);
    assert.deepEqual(translated.providers.map((provider) => provider.groups.flatMap((group) => group.rows.map((row) => row.id))), view.providers.map((provider) => provider.groups.flatMap((group) => group.rows.map((row) => row.id))));
});

test('existing cached Claude windows and money issues are translated without changing the parsed cache', () => {
    const data = parseUsage({ subscription_type: 'pro', rate_limits: {
        five_hour: { utilization: 0 }, seven_day_opus: { utilization: 12 }, extra_usage: { used_credits: 42 }
    } });
    const before = structuredClone(data);
    const translated = localizeView(buildUsageState({ claude: { data } }), createI18n('zh-TW')).providers[1];
    assert.equal(translated.primaryMetric, 'quota');
    assert.equal(translated.groups[0].rows[1].label, '每週 · Opus');
    assert.equal(translated.spend.title, '額外用量預算');
    assert.match(translated.spend.issue, /舊版格式/);
    assert.equal(translated.spend.resetAt, null);
    assert.deepEqual(data, before);
});

test('missing model names are localized without translating real provider model labels', () => {
    const now = Date.parse('2026-11-17T00:00:00Z');
    for (const raw of [undefined, {}, 'MODEL_PLACEHOLDER_M9', 'models/', '   ']) {
        const context = parseGeneratorMetadata({
            generatorMetadata: [{ chatModel: { model: raw, usage: { inputTokens: 42 } } }]
        }, {}, null);
        const before = structuredClone(context);
        const view = buildUsageState({ antigravity: { context } }, now);
        assert.equal(context.modelKnown, false);
        assert.equal(localizeView(view, createI18n('en')).providers[0].context.model, 'Unknown model');
        const translated = localizeView(view, createI18n('zh-TW')).providers[0].context;
        assert.equal(translated.model, '未知模型');
        assert.equal(translated.usedTokens, 42);
        assert.equal(translated.windowTokens, context.windowTokens);
        assert.deepEqual(context, before);
    }
    const context = parseGeneratorMetadata({
        generatorMetadata: [{ chatModel: { model: 'real-model', usage: { inputTokens: 42 } } }]
    }, { 'real-model': 'Unknown model' }, null);
    assert.equal(context.modelKnown, true);
    assert.equal(localizeView(buildUsageState({ antigravity: { context } }, now), createI18n('zh-TW')).providers[0].context.model, 'Unknown model');
});

test('Claude errors retain their codes and use the catalog for display in every language', () => {
    for (const code of ['cli-unavailable', 'timeout', 'cli-exited', 'request-refused', 'unsupported-payload', 'output-too-large', 'query-failed']) {
        const view = buildUsageState({ claude: { error: code } });
        const provider = view.providers.find((item) => item.id === 'claude');
        assert.equal(provider.error, code);
        for (const locale of supportedLocales) {
            const i18n = createI18n(locale);
            assert.equal(localizeView(view, i18n).providers[1].error, i18n.t(provider.errorKey));
        }
    }
});

test('quick settings resolve native manifest placeholders and validate language values', () => {
    const panel = settingsView((key) => key === 'display.language' ? 'zh-TW' : undefined, createI18n('zh-TW'));
    assert.equal(panel[0].title, '一般');
    assert.equal(panel.find((group) => group.id === 'statusBar').title, '狀態列');
    const language = panel.flatMap((group) => group.items).find((item) => item.key === 'display.language');
    assert.equal(language.label, '語言');
    assert.equal(language.value, 'zh-TW');
    assert.deepEqual(language.options.map((option) => option.value), ['auto', ...supportedLocales]);
    assert.equal(language.options[0].label, '跟隨編輯器');
    assert.doesNotMatch(JSON.stringify(panel), /%manifest\./);
    for (const value of ['auto', ...supportedLocales]) assert.equal(isValidSetting('display.language', value), true);
    for (const value of ['unsupported_locale', undefined, null, {}, true, '../../private'])
        assert.equal(isValidSetting('display.language', value), false);
});

test('catalog checks catch duplicate keys, missing strings, invalid variables and unknown messages', () => {
    assert.throws(() => parseJson('{"x":1,"\\u0078":2}'), /duplicate key x/);
    assert.deepEqual(parseJson('{"a":{"x":1},"b":{"x":2},"text":"{x}:"}'), { a: { x: 1 }, b: { x: 2 }, text: '{x}:' });
    validateBundle(chinese, base);
    for (const mutate of [
        (bundle) => delete bundle.messages['common.unknown'],
        (bundle) => { bundle.messages['common.unknown'] = ' '; },
        (bundle) => { bundle.messages['budget.remaining'] = '剩餘 {money}'; },
        (bundle) => { bundle.messages['budget.remaining'] = '剩餘 {amount} {bad-name}'; },
        (bundle) => { bundle.messages['typo.message'] = 'x'; }
    ]) {
        const bundle = structuredClone(chinese);
        mutate(bundle);
        assert.throws(() => validateBundle(bundle, base));
    }
    check();
});

test('contributors can generate a template and ship another locale using only translation data', () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-locales-'));
    try {
        fs.mkdirSync(path.join(scratch, 'scripts'));
        fs.mkdirSync(path.join(scratch, 'locales'));
        for (const file of ['package.json', 'scripts/locales.cjs', 'locales/en.json', 'locales/zh-TW.json', 'locales/message-context.json'])
            fs.copyFileSync(path.join(__dirname, '..', file), path.join(scratch, file));
        for (const directory of ['src', 'media', 'test'])
            fs.cpSync(path.join(__dirname, '..', directory), path.join(scratch, directory), { recursive: true });
        const command = (...args) => spawnSync(process.execPath, [path.join(scratch, 'scripts/locales.cjs'), ...args], { encoding: 'utf8' });
        const created = command('new', 'fr', 'Français');
        assert.equal(created.status, 0, created.stderr);
        const file = path.join(scratch, 'locales/fr.json');
        const template = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.equal(template.nativeName, 'Français');
        assert.ok(Object.values(template.messages).every((value) => value === ''));
        assert.deepEqual(Object.keys(template.messages), Object.keys(base.messages));
        assert.equal(command('new', 'fr', 'Français').status, 1, 'Never overwrite contributor work');
        assert.equal(command('build').status, 1, 'Do not ship an incomplete template');
        // Synthetic translations exercise the contributor workflow, not French quality.
        template.messages = { ...base.messages };
        template.messages['common.unknown'] = 'Inconnu';
        fs.writeFileSync(file, JSON.stringify(template));
        assert.equal(command('new', 'de', 'Deutsch').status, 0);
        const germanFile = path.join(scratch, 'locales/de.json');
        const german = JSON.parse(fs.readFileSync(germanFile, 'utf8'));
        german.messages = { ...base.messages, 'common.unknown': 'Unbekannt' };
        fs.writeFileSync(germanFile, JSON.stringify(german));
        const built = command('build');
        assert.equal(built.status, 0, built.stderr);
        // These exact lists describe this isolated fixture, not shipped languages.
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(scratch, 'locales/index.json'))), ['en', 'de', 'fr', 'zh-TW']);
        const pkg = JSON.parse(fs.readFileSync(path.join(scratch, 'package.json')));
        const language = pkg.contributes.configuration[0].properties['nexusAiUsage.display.language'];
        assert.deepEqual(language.enum, ['auto', 'en', 'de', 'fr', 'zh-TW']);
        assert.deepEqual(language.enumItemLabels.slice(1), ['English', 'Deutsch', 'Français', '繁體中文（台灣）']);
        assert.ok(fs.existsSync(path.join(scratch, 'package.nls.fr.json')));
        const checked = command('check');
        assert.equal(checked.status, 0, checked.stderr);
        // Run the real suite after adding data. Exclude this workflow to avoid recursion.
        const suite = fs.readdirSync(path.join(scratch, 'test'))
            .filter((name) => name.endsWith('.test.js')).map((name) => path.join('test', name));
        const tested = spawnSync(process.execPath, [
            '--test', '--test-reporter=dot',
            '--test-name-pattern=^(?!contributors can generate a template)', ...suite
        ], { cwd: scratch, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 });
        assert.equal(tested.status, 0, tested.stdout + tested.stderr);
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
});
