'use strict';
const vscode = require('vscode');
const { escapeMarkdown: esc, textBar } = require('./util');
const { createI18n } = require('./i18n');
const { createTranslator } = require('../media/i18n');
const FOCUS = 'nexusAiUsage.dashboard.focus';
const AG_STATUS_WINDOWS = [
    { key: 'geminiFiveHour', groupType: 'gemini', windowType: 'fiveHour', default: true },
    { key: 'geminiWeekly', groupType: 'gemini', windowType: 'weekly', default: true },
    { key: 'claudeGptFiveHour', groupType: 'claudeGpt', windowType: 'fiveHour', default: false },
    { key: 'claudeGptWeekly', groupType: 'claudeGpt', windowType: 'weekly', default: false },
    { key: 'argonWeekly', groupType: 'argon', windowType: 'weekly', default: true }
];
const english = createI18n('en');
const STATUS_SPACE_NOTE = english.t('status.spaceNote');
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
function progress(value, i18n = english) {
    return typeof value === 'number' && Number.isFinite(value) ? `\`${textBar(value, 12)}\`` : i18n.unknown();
}
function compactReset(row, zone, now, i18n = english) {
    const { t } = i18n;
    if (!row.resetAt) return i18n.unknown();
    if (row.resetPending) return t('reset.elapsedShort');
    const wall = i18n.stamp(row.resetAt, zone, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return `${i18n.duration(row.resetAt, now, false, 'floor')} (${wall})${row.resetBasis === 'event-relative' ? ' · ' + t('reset.event') : ''}${row.resetBasis === 'official-monthly-rule' ? ' · ' + t('reset.monthly') : ''}`;
}
function hover(view) {
    const i18n = translator(view);
    const { t } = i18n;
    const text = (key, args) => esc(t(key, args));
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = { enabledCommands: [FOCUS] };
    const left = view.percentMode === 'left';
    const main = left ? 'remainingPct' : 'usedPct';
    const other = left ? 'usedPct' : 'remainingPct';
    const label = t(left ? 'quota.remaining' : 'quota.used');
    md.appendMarkdown(`**${text('hover.title', { mode: t(left ? 'quota.remaining.short' : 'quota.used.short') })}**\n\n`);
    md.appendMarkdown(`${text('status.spaceNote')}\n\n`);
    for (const p of view.providers) {
        const rows = p.groups.flatMap((g) => g.rows);
        const times = [...new Set([...rows.map((r) => r.observedAt), p.spend?.observedAt].filter((at) => typeof at === 'number' && at > 0))];
        md.appendMarkdown(`### ${esc(p.title)}${p.plan ? ` · ${esc(p.plan)}` : ''}\n\n`);
        md.appendMarkdown(`${esc(p.source)}\n\n${text(p.id === 'codex' ? 'source.event' : 'source.fetched')}: ${times.length === 1 ? esc(time(times[0], view.timeZone, i18n)) : times.length ? text('source.multiple') : esc(i18n.unknown())}\n\n`);
        if (p.error) md.appendMarkdown(`**${text('hover.error', { error: p.error })}**\n\n`);
        if (p.notice) md.appendMarkdown(`${esc(p.notice)}\n\n`);
        if (rows.some((r) => r.recordedOnly)) md.appendMarkdown(`${text('source.recordedHint')}\n\n`);
        if (p.spend) {
            const money = p.spend;
            md.appendMarkdown(`**${esc(money.title || t('budget.account'))}**\n\n`);
            md.appendMarkdown(`${text('hover.spent', { used: amount(money.used, money.currency, i18n), limit: amount(money.limit, money.currency, i18n) })}\n\n`);
            md.appendMarkdown(`${progress(money.usedPct, i18n)} **${text('hover.budgetUsed', { value: pct(money.usedPct, i18n) })}** · ${text('budget.remaining', { amount: amount(money.remaining, money.currency, i18n) })}\n\n`);
            md.appendMarkdown(`${money.stale ? `**${text('source.stale')}** · ` : ''}${text('reset.label', { reset: compactReset(money, view.timeZone, view.now, i18n) })}${money.enabled === false ? ' · ' + text('budget.disabled') : ''}\n\n`);
            if (money.issue) md.appendMarkdown(`**${esc(money.issue)}**\n\n`);
        }
        if (rows.length) {
            const grouped = p.id === 'antigravity' || p.groups.some((g) => g.groupType === 'fable');
            md.appendMarkdown(`| ${grouped ? text('hover.group') + ' | ' : ''}${text('hover.window')} | ${text('hover.usage')} | ${esc(label)} | ${text('hover.resets')} |\n|${grouped ? '---|' : ''}---|---|---|---|\n`);
            for (const g of p.groups)
                for (const [index, row] of g.rows.entries()) {
                    const name = grouped ? `${index === 0 ? `**${esc(g.label)}**` : ''} | ` : '';
                    md.appendMarkdown(`| ${name}${esc(row.label)}${row.recordedOnly ? ` (${text('source.lastRecorded')})` : row.stale && row.usedPct !== null ? ` (${text('source.stale')})` : ''} | ${progress(row[main], i18n)} | ${esc(pct(row[main], i18n))} (${text('hover.other', { value: pct(row[other], i18n), mode: t(left ? 'quota.used.short' : 'quota.remaining.short') })}) | ${esc(compactReset(row, view.timeZone, view.now, i18n))} |\n`);
                }
            md.appendMarkdown('\n');
        }
        if (!p.spend && !rows.length) md.appendMarkdown(`${text('quota.empty')}\n\n`);
    }
    md.appendMarkdown(`${text('hover.times', { zone: view.timeZone || 'Asia/Taipei' })}\n\n[${text('hover.open')}](command:${FOCUS})`);
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
        this.item.text = '$(dashboard) ' + visibleProviders.map((p) => summary(p, view.percentMode, i18n)).join(' | ')
            + (visibleProviders.length ? ` · ${i18n.t(view.percentMode === 'left' ? 'quota.remaining.short' : 'quota.used.short')}` : i18n.t('status.hidden'));
        this.item.tooltip = hover(view);
        this.item.accessibilityInformation = { label: this.item.text.replace('$(dashboard)', '') };
        this.item.backgroundColor = visibleProviders.some((p) => p.id === 'codex' ? !!p.error : !!marker(p))
            ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
        if (options.show === false || !visibleProviders.length) this.item.hide();
        else this.item.show();
    }
    dispose() { this.item.dispose(); }
}
module.exports = { StatusBar, summary, hover, amount, pct, reset, progress, AG_STATUS_WINDOWS, STATUS_SPACE_NOTE };
