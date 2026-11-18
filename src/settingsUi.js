'use strict';

const pkg = require('../package.json');
const { createI18n } = require('./i18n');

const PREFIX = 'nexusAiUsage.';
// Display labels are resolved for each render, never at module load time.
const LABEL_KEYS = new Set([
    'display.language', 'display.percentMode', 'display.timeZone', 'refresh.activeInterval',
    'refresh.pauseWhenUnfocused', 'context.show', 'statusBar.show', 'statusBar.compact',
    'antigravity.statusBar.geminiFiveHour', 'antigravity.statusBar.geminiWeekly',
    'antigravity.statusBar.claudeGptFiveHour', 'antigravity.statusBar.claudeGptWeekly',
    'antigravity.statusBar.argonWeekly', 'claudeCode.timeoutSeconds', 'claudeCode.enterpriseResetSchedule'
]);
const NEEDS = Object.fromEntries(
    [...LABEL_KEYS]
        .filter((key) => key.startsWith('antigravity.statusBar.'))
        .map((key) => [key, 'antigravity.showInStatusBar'])
);

function plain(s) {
    return String(s || '')
        .replace(/`#nexusAiUsage\.([\w.]+)#`/g, '$1')
        .replace(/[*`]/g, '');
}

function kindOf(p) {
    if (p.type === 'boolean') return 'bool';
    if (Array.isArray(p.enum)) return 'enum';
    return p.type === 'array' ? 'list' : null;
}

// Built from package.json so the panel and VS Code Settings never drift apart.
const MODEL = pkg.contributes.configuration.map((cat) => ({
    id: Object.keys(cat.properties)[0].split('.')[1],
    title: cat.title,
    items: Object.entries(cat.properties)
        .filter(([, p]) => !p.markdownDeprecationMessage && kindOf(p))
        .sort((a, b) => a[1].order - b[1].order)
        .map(([full, p]) => {
            const key = full.slice(PREFIX.length);
            const item = {
                key,
                labelKey: `settings.label.${LABEL_KEYS.has(key) ? key : key.split('.').pop()}`,
                help: p.description || p.markdownDescription,
                kind: kindOf(p),
                def: p.default
            };
            if (item.kind === 'enum')
                item.options = p.enum.map((value, i) => ({
                    value,
                    label: (p.enumItemLabels || [])[i] || String(value)
                }));
            return item;
        })
}));
const BY_KEY = new Map(MODEL.flatMap((g) => g.items.map((i) => [i.key, i])));

// Only known keys with a value of the right type; lists are edited in VS Code Settings.
function isValidSetting(key, value) {
    const item = typeof key === 'string' ? BY_KEY.get(key) : null;
    if (!item) return false;
    if (item.kind === 'bool') return typeof value === 'boolean';
    if (item.kind === 'enum') return item.options.some((o) => o.value === value);
    return false;
}

function settingsView(get, i18n = createI18n('en')) {
    const resolve = (value) => {
        const match = /^%([^%]+)%$/.exec(value || '');
        return match ? i18n.t(match[1]) : value;
    };
    const val = (k) => {
        const v = get(k);
        return v === undefined ? BY_KEY.get(k).def : v;
    };
    return MODEL.map((g) => ({
        id: g.id,
        title: resolve(g.title),
        items: g.items.map((i) => {
            const toolSwitch = `${i.key.split('.')[0]}.enable`;
            const toolOff = i.key !== toolSwitch && BY_KEY.has(toolSwitch) && val(toolSwitch) === false;
            const needOff = NEEDS[i.key] ? val(NEEDS[i.key]) !== true : false;
            return {
                ...i,
                label: i18n.t(i.labelKey),
                help: plain(resolve(i.help)),
                options: i.options?.map((option) => ({ ...option, label: resolve(option.label) })),
                value: val(i.key),
                disabled: toolOff || needOff
            };
        })
    }));
}

module.exports = { settingsView, isValidSetting };
