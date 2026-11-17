'use strict';
const vscode = require('vscode');
const { escapeMarkdown: esc, formatCountdown, textBar } = require('./util');
const FOCUS = 'nexusAiUsage.dashboard.focus';
const AG_STATUS_WINDOWS = [
    { key: 'geminiFiveHour', group: 'Gemini Models', window: '5-hour', default: true },
    { key: 'geminiWeekly', group: 'Gemini Models', window: 'Weekly', default: true },
    { key: 'claudeGptFiveHour', group: 'Claude and GPT models', window: '5-hour', default: false },
    { key: 'claudeGptWeekly', group: 'Claude and GPT models', window: 'Weekly', default: false },
    { key: 'argonWeekly', group: 'Gemini 4 Argon', window: 'Weekly', default: true }
];
const STATUS_SPACE_NOTE =
    'Status bar space is limited; only selected summaries are shown. All monitored limits remain in this hover and the dashboard.';
function selectStatusProvider(provider, choices = {}) {
    if (provider.id !== 'antigravity') return provider;
    const enabled = AG_STATUS_WINDOWS.filter((choice) =>
        typeof choices[choice.key] === 'boolean' ? choices[choice.key] : choice.default
    );
    return {
        ...provider,
        groups: provider.groups
            .map((group) => ({
                ...group,
                rows: group.rows.filter((row) =>
                    enabled.some((choice) =>
                        choice.group.toLowerCase() === group.label.trim().toLowerCase() && choice.window === row.label
                    )
                )
            }))
            .filter((group) => group.rows.length)
    };
}
function amount(value, currency) {
    return typeof value === 'number' && Number.isFinite(value) ? `${currency || '?'} ${value.toFixed(2)}` : 'Unknown';
}
function pct(value) {
    return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 10) / 10}%` : 'Unknown';
}
function time(value, zone = 'Asia/Taipei') {
    return value ? new Date(value).toLocaleString('en-GB', { timeZone: zone }) : 'Unknown';
}
function reset(row, zone, now = Date.now()) {
    return `${time(row.resetAt, zone)}${row.resetAt && !row.resetPending ? ` · in ${formatCountdown(row.resetAt, now)}` : ''}${row.resetBasis === 'event-relative' ? ' · event + interval' : ''}${row.resetBasis === 'official-monthly-rule' ? ' · official monthly rule (00:00 UTC)' : ''}${row.resetPending ? ' · elapsed; awaiting new reading' : ''}`;
}
function marker(provider) {
    const rows = provider.groups.flatMap((g) => g.rows);
    if (provider.error || provider.spend?.status === 'unsupported') return ' !';
    if (provider.spend?.stale || rows.some((r) => r.stale && !r.recordedOnly && r.usedPct !== null)) return ' ~';
    return rows.some((r) => r.usedPct === null) && (!provider.spend || provider.primaryMetric === 'quota') ? ' ?' : '';
}
function summary(provider, mode) {
    if (provider.id === 'claude' && provider.spend && provider.primaryMetric !== 'quota')
        return `Claude ${amount(provider.spend.used, provider.spend.currency)} / ${provider.spend.limit === null ? 'Unknown' : provider.spend.limit.toFixed(2)}${marker(provider)}`;
    const values = provider.groups
        .map((g) => {
            return `${provider.id === 'antigravity' ? g.short + ' ' : ''}${g.rows.map((r) => `${r.label === 'Weekly' ? 'wk' : r.label === '5-hour' ? '5h' : r.label} ${pct(mode === 'left' ? r.remainingPct : r.usedPct)}`).join(' · ')}`;
        })
        .filter(Boolean)
        .join(' · ');
    return `${provider.id === 'antigravity' ? 'AG' : provider.id === 'codex' ? 'Codex' : 'Claude'} ${values || 'Unknown'}${marker(provider)}`;
}
function progress(value) {
    return typeof value === 'number' && Number.isFinite(value) ? `\`${textBar(value, 12)}\`` : 'Unknown';
}
function compactReset(row, zone, now) {
    if (!row.resetAt) return 'Unknown';
    if (row.resetPending) return 'Elapsed · awaiting reading';
    const wall = new Date(row.resetAt).toLocaleString('en-GB', {
        timeZone: zone || 'Asia/Taipei',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
    return `${formatCountdown(row.resetAt, now)} (${wall})${row.resetBasis === 'event-relative' ? ' · event + interval' : ''}${row.resetBasis === 'official-monthly-rule' ? ' · official monthly rule (00:00 UTC)' : ''}`;
}
function hover(view) {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = { enabledCommands: [FOCUS] };
    const left = view.percentMode === 'left';
    const main = left ? 'remainingPct' : 'usedPct';
    const other = left ? 'usedPct' : 'remainingPct';
    const label = left ? 'Remaining' : 'Used';
    md.appendMarkdown(`**Nexus AI Usage · ${label.toLowerCase()}**\n\n`);
    md.appendMarkdown(`${STATUS_SPACE_NOTE}\n\n`);
    for (const p of view.providers) {
        const rows = p.groups.flatMap((g) => g.rows);
        const times = [
            ...new Set(
                [...rows.map((r) => r.observedAt), p.spend?.observedAt].filter((t) => typeof t === 'number' && t > 0)
            )
        ];
        md.appendMarkdown(`### ${esc(p.title)}${p.plan ? ` · ${esc(p.plan)}` : ''}\n\n`);
        md.appendMarkdown(
            `${esc(p.source)}\n\n${p.id === 'codex' ? 'Source event' : 'Fetched'}: ${times.length === 1 ? esc(time(times[0], view.timeZone)) : times.length ? 'multiple source times; see details' : 'Unknown'}\n\n`
        );
        if (p.error) md.appendMarkdown(`**Error: ${esc(p.error)}. Last successful reading, if any, is retained.**\n\n`);
        if (p.notice) md.appendMarkdown(`${esc(p.notice)}\n\n`);
        if (rows.some((r) => r.recordedOnly))
            md.appendMarkdown('**Last recorded:** local Codex event, not a live quota query. Rereading the log does not refresh its source time.\n\n');
        if (p.spend) {
            const money = p.spend;
            md.appendMarkdown(`**${esc(money.title || 'Account budget')}**\n\n`);
            md.appendMarkdown(
                `Spent **${esc(amount(money.used, money.currency))}** / limit **${esc(amount(money.limit, money.currency))}**\n\n`
            );
            md.appendMarkdown(
                `${progress(money.usedPct)} **${pct(money.usedPct)} budget used** · Remaining **${esc(amount(money.remaining, money.currency))}**\n\n`
            );
            md.appendMarkdown(
                `${money.stale ? '**Stale** · ' : ''}Reset: ${esc(compactReset(money, view.timeZone, view.now))}${money.enabled === false ? ' · spending disabled' : ''}\n\n`
            );
            if (money.issue) md.appendMarkdown(`**${esc(money.issue)}**\n\n`);
        }
        if (rows.length) {
            const grouped = p.id === 'antigravity';
            md.appendMarkdown(
                `| ${grouped ? 'Model group | ' : ''}Window | Usage | ${label} | Resets |\n|${grouped ? '---|' : ''}---|---|---|---|\n`
            );
            for (const g of p.groups)
                for (const [index, row] of g.rows.entries()) {
                    const name = grouped ? `${index === 0 ? `**${esc(g.label)}**` : ''} | ` : '';
                    md.appendMarkdown(
                        `| ${name}${esc(row.label)}${row.recordedOnly ? ' (last recorded)' : row.stale && row.usedPct !== null ? ' (stale)' : ''} | ${progress(row[main])} | ${pct(row[main])} (${pct(row[other])} ${left ? 'used' : 'left'}) | ${esc(compactReset(row, view.timeZone, view.now))} |\n`
                    );
                }
            md.appendMarkdown('\n');
        }
        if (!p.spend && !rows.length) md.appendMarkdown('Usage unknown. No valid reading yet.\n\n');
    }
    md.appendMarkdown(
        `Times: ${esc(view.timeZone || 'Asia/Taipei')}. ~ stale · ! error · ? missing data.\n\n[Open full details](command:${FOCUS})`
    );
    return md;
}
class StatusBar {
    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
        this.item.name = 'Nexus AI Usage';
        this.item.command = FOCUS;
    }
    update(view, options = {}) {
        const visibleProviders = view.providers
            .filter((p) => !options.hidden?.includes(p.id))
            .map((p) => selectStatusProvider(p, options.antigravityWindows))
            .filter((p) => p.id !== 'antigravity' || p.groups.length);
        this.item.text =
            '$(dashboard) ' +
            visibleProviders.map((p) => summary(p, view.percentMode)).join(' | ') +
            (visibleProviders.length ? ` · ${view.percentMode === 'left' ? 'left' : 'used'}` : 'All providers hidden');
        this.item.tooltip = hover(view);
        this.item.accessibilityInformation = {
            label: this.item.text.replace('$(dashboard)', '')
        };
        this.item.backgroundColor = visibleProviders.some((p) => p.id === 'codex' ? !!p.error : !!marker(p))
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;
        if (options.show === false || !visibleProviders.length) this.item.hide();
        else this.item.show();
    }
    dispose() {
        this.item.dispose();
    }
}
module.exports = { StatusBar, summary, hover, amount, pct, reset, progress, AG_STATUS_WINDOWS, STATUS_SPACE_NOTE };
