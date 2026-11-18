'use strict';
const vscode = require('vscode');
const { clampPct, escapeMarkdown: esc } = require('./util');
const { createI18n } = require('./i18n');
const { createTranslator } = require('../media/i18n');
const FOCUS = 'nexusAiUsage.dashboard.focus';
const QUOTA_ICON = '$(dashboard)';
const AG_STATUS_WINDOWS = [
    { key: 'geminiFiveHour', groupType: 'gemini', windowType: 'fiveHour', default: true },
    { key: 'geminiWeekly', groupType: 'gemini', windowType: 'weekly', default: true },
    { key: 'claudeGptFiveHour', groupType: 'claudeGpt', windowType: 'fiveHour', default: false },
    { key: 'claudeGptWeekly', groupType: 'claudeGpt', windowType: 'weekly', default: false },
    { key: 'argonWeekly', groupType: 'argon', windowType: 'weekly', default: true }
];
const english = createI18n('en');
const translator = (view) => view.i18n ? createTranslator(view.i18n) : english;
function selectStatusProvider(provider, choices = {}) {
    if (provider.id !== 'antigravity') return provider;
    const enabled = AG_STATUS_WINDOWS.filter((choice) =>
        typeof choices[choice.key] === 'boolean' ? choices[choice.key] : choice.default
    );
    return {
        ...provider,
        groups: provider.groups.map((group) => ({
            ...group,
            rows: group.rows.filter((row) => enabled.some((choice) =>
                choice.groupType === group.groupType && choice.windowType === row.windowType
            ))
        })).filter((group) => group.rows.length)
    };
}
function amount(value, currency, i18n = english) {
    return i18n.money(value, currency);
}
function pct(value, i18n = english) {
    return i18n.percent(value);
}
function time(value, zone = 'Asia/Taipei', i18n = english) {
    return i18n.stamp(value, zone, {});
}
function reset(row, zone, now = Date.now(), i18n = english) {
    const { t } = i18n;
    return `${time(row.resetAt, zone, i18n)}${row.resetAt && !row.resetPending ? ' · ' + t('reset.in', { duration: i18n.duration(row.resetAt, now, false, 'floor') }) : ''}${row.resetBasis === 'event-relative' ? ' · ' + t('reset.event') : ''}${row.resetBasis === 'official-monthly-rule' ? ' · ' + t('reset.monthly') : ''}${row.resetPending ? ' · ' + t('reset.elapsed') : ''}`;
}
function marker(provider) {
    const rows = provider.groups.flatMap((g) => g.rows);
    if (provider.error || provider.spend?.status === 'unsupported') return ' !';
    if (provider.spend?.stale || rows.some((r) => r.stale && !r.recordedOnly && r.usedPct !== null)) return ' ~';
    return rows.some((r) => r.usedPct === null) && (!provider.spend || provider.primaryMetric === 'quota') ? ' ?' : '';
}
function summary(provider, mode, i18n = english) {
    const spend = provider.id === 'claude' && provider.primaryMetric !== 'quota' ? provider.spend : null;
    const values = spend ? [
        `${amount(spend.used, spend.currency, i18n)} / ${spend.limit === null ? i18n.unknown() : i18n.number(spend.limit, { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ] : [];
    for (const g of provider.groups) {
        if (!g.rows.length || (spend && g.groupType !== 'fable')) continue;
        const prefix = provider.id === 'antigravity' || g.groupType === 'fable' ? `${g.short} ` : '';
        values.push(prefix + g.rows.map((r) => `${i18n.windowLabel(r, true)} ${pct(mode === 'left' ? r.remainingPct : r.usedPct, i18n)}`).join(' · '));
    }
    return `${provider.id === 'antigravity' ? 'AG' : provider.id === 'codex' ? 'Codex' : 'Claude'} ${values.join(' · ') || i18n.unknown()}${marker(provider)}`;
}
function progress(value) {
    if (!Number.isFinite(value)) return '';
    const filled = Math.round(clampPct(value) / 10);
    return `\`${'▪'.repeat(filled)}${'▫'.repeat(10 - filled)}\``;
}
function quotaDot(usedPct) {
    // Keep the warning level tied to usage when the display switches to remaining.
    if (!Number.isFinite(usedPct)) return '⚪';
    if (usedPct >= 90) return '🔴';
    return usedPct >= 75 ? '🟡' : '🟢';
}
function hoverReading(label, usedPct, displayedPct, i18n) {
    return [`${quotaDot(usedPct)} ${esc(label)}`, progress(displayedPct), `**${esc(pct(displayedPct, i18n))}**`]
        .filter(Boolean).join(' &ensp; ');
}
function compactReset(row, zone, now, i18n = english) {
    const { t } = i18n;
    if (!row.resetAt) return '—';
    if (row.resetPending) return `↻ ${t('reset.elapsedShort')}`;
    const wall = i18n.stamp(row.resetAt, zone, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return `↻ ${i18n.duration(row.resetAt, now, false, 'floor')} (${wall})`;
}
function hover(view) {
    const i18n = translator(view);
    const { t } = i18n;
    const text = (key, args) => esc(t(key, args));
    const md = new vscode.MarkdownString();
    md.isTrusted = { enabledCommands: [FOCUS] };
    const left = view.percentMode === 'left';
    const main = left ? 'remainingPct' : 'usedPct';
    const zone = view.timeZone || 'Asia/Taipei';
    md.appendMarkdown(`**${text('hover.title', { mode: t(left ? 'quota.remaining.short' : 'quota.used.short') })}**\n\n`);
    for (const p of view.providers) {
        const lines = [`**${esc(p.title)}**${p.plan ? ` · ${esc(p.plan)}` : ''}`];
        if (p.error) lines.push(`⚠️ ${text('hover.error', { error: p.error })}`);
        if (p.notice) lines.push(esc(p.notice));
        if (p.spend) {
            const money = p.spend;
            const value = left && Number.isFinite(money.usedPct) ? Math.max(0, 100 - money.usedPct) : money.usedPct;
            const reading = hoverReading(money.title || t('budget.account'), money.usedPct, value, i18n);
            const funds = amount(left ? money.remaining : money.used, money.currency, i18n);
            const limit = amount(money.limit, money.currency, i18n);
            const details = [`${reading} · ${esc(funds)} / ${esc(limit)}`];
            if (money.resetAt) details.push(esc(compactReset(money, zone, view.now, i18n)));
            if (money.stale && !money.resetPending) details.push(text('source.stale'));
            if (money.enabled === false) details.push(text('budget.disabled'));
            lines.push(details.join(' · '));
            if (money.issue) lines.push(`⚠️ ${esc(money.issue)}`);
        }
        const groups = p.groups.filter((g) => g.rows.length);
        for (const g of groups) {
            if (p.id === 'antigravity' || g.groupType === 'fable') lines.push(`**${esc(g.label)}**`);
            for (const row of g.rows) {
                const reading = hoverReading(row.label, row.usedPct, row[main], i18n);
                const freshness = row.recordedOnly ? text('source.lastRecorded')
                    : row.stale && row.usedPct !== null && !row.resetPending ? text('source.stale') : '';
                lines.push(`&ensp;${reading} &ensp; ${esc(compactReset(row, zone, view.now, i18n))}${freshness ? ` · ${freshness}` : ''}`);
            }
        }
        if (!p.spend && !groups.length && !p.error && !p.notice) lines.push(text('quota.empty'));
        md.appendMarkdown(lines.join('  \n') + '\n\n');
    }
    md.appendMarkdown(`[${text('hover.open')}](command:${FOCUS}) · ${esc(zone)}`);
    return md;
}
class StatusBar {
    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
        this.item.name = 'Nexus AI Usage';
        this.item.command = FOCUS;
    }
    update(view, options = {}) {
        const i18n = translator(view);
        const visibleProviders = view.providers.filter((p) => !options.hidden?.includes(p.id))
            .map((p) => selectStatusProvider(p, options.antigravityWindows))
            .filter((p) => p.id !== 'antigravity' || p.groups.length);
        const label = visibleProviders.length
            ? `${visibleProviders.map((p) => summary(p, view.percentMode, i18n)).join(' | ')} · ${i18n.t(view.percentMode === 'left' ? 'quota.remaining.short' : 'quota.used.short')}`
            : i18n.t('status.hidden');
        this.item.text = options.compact ? QUOTA_ICON : `${QUOTA_ICON} ${label}`;
        this.item.tooltip = hover(view);
        this.item.accessibilityInformation = { label };
        this.item.backgroundColor = visibleProviders.some((p) => p.id === 'codex' ? !!p.error : !!marker(p))
            ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
        if (options.show === false || !visibleProviders.length) this.item.hide();
        else this.item.show();
    }
    dispose() { this.item.dispose(); }
}
module.exports = { StatusBar, summary, hover, amount, pct, reset, progress, AG_STATUS_WINDOWS };
