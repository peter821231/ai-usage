'use strict';

const { resetTime } = require('./claudeUsage');
const { spendReset } = require('./resetPolicy');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const AG_GROUPS = new Map([
    ['gemini models', { type: 'gemini', short: 'Gemini', order: 0 }],
    ['claude and gpt models', { type: 'claudeGpt', short: 'Claude/GPT', order: 1 }],
    ['gemini 4 argon', { type: 'argon', short: 'Argon', order: 2 }]
]);
const WINDOW_TYPES = { '5-hour': 'fiveHour', Weekly: 'weekly', Daily: 'daily', Limit: 'limit' };
// Canonical names come from the parsers; translated labels never enter matching.
function windowIdentity(label) {
    if (typeof label !== 'string') return { windowType: null, scope: '' };
    const [name, ...scope] = label.split(' · ');
    return { windowType: Object.hasOwn(WINDOW_TYPES, name) ? WINDOW_TYPES[name] : null, scope: scope.join(' · ') };
}
const ERROR_KEYS = {
    'cli-unavailable': 'error.claude.cliUnavailable',
    timeout: 'error.claude.timeout',
    'cli-exited': 'error.claude.cliExited',
    'request-refused': 'error.claude.refused',
    'unsupported-payload': 'error.claude.unsupported',
    'output-too-large': 'error.claude.outputTooLarge',
    'query-failed': 'error.claude.failed',
    'agy-summary-unavailable': 'error.agy.summary',
    'agy-unavailable': 'error.agy.unavailable',
    'codex-no-event': 'error.codex.noEvent',
    'codex-read-failed': 'error.codex.read',
    'codex-query-failed': 'error.codex.query',
    'cache-unavailable': 'error.cache',
    // Compatibility with earlier in-memory errors and cached spend issues.
    'Quota summary is unavailable': 'error.agy.summary',
    'Quota summary request failed': 'error.agy.request',
    'Quota summary contains no usable groups': 'error.agy.noGroups',
    'Local Antigravity service is unavailable in this extension host': 'error.agy.unavailable',
    'No Codex rate-limit event found in this extension host': 'error.codex.noEvent',
    'Could not read local Codex rate-limit events': 'error.codex.read',
    'Usage cache is unavailable in this extension host': 'error.cache'
};

function row(id, label, usedPct, resetAt, snapshot, ttl, now) {
    const known = finite(usedPct) && usedPct >= 0;
    const reset = resetTime(resetAt);
    const observedAt = finite(snapshot.observedAt) && snapshot.observedAt > 0 ? snapshot.observedAt : null;
    const resetPending = !!(reset && Date.parse(reset) <= now);
    let staleReason = null;
    if (snapshot.error) staleReason = 'error';
    else if (!observedAt) staleReason = 'unknown-time';
    else if (resetPending) staleReason = 'reset-elapsed';
    else if (now - observedAt > ttl) staleReason = 'age';
    const stale = staleReason !== null;
    return {
        id,
        label,
        ...windowIdentity(label),
        usedPct: known ? usedPct : null,
        remainingPct: known ? Math.max(0, 100 - usedPct) : null,
        resetAt: reset,
        resetPending,
        staleReason,
        observedAt,
        checkedAt: snapshot.checkedAt || null,
        stale,
        status: known ? (snapshot.error ? 'error' : 'available') : 'missing'
    };
}

function antigravityView(snapshot = {}, now = Date.now()) {
    const groups = (snapshot.data?.groups || [])
        .map((group) => ({ group, known: AG_GROUPS.get(group.name.trim().toLowerCase()) }))
        .sort((a, b) => (a.known?.order ?? AG_GROUPS.size) - (b.known?.order ?? AG_GROUPS.size))
        .map(({ group, known }) => ({
            id: group.id,
            label: group.name,
            groupType: known?.type,
            short: known?.short || group.name,
            rows: group.windows.map((w) => ({
                ...row(
                    `${group.id}:${w.id}`,
                    w.name,
                    finite(w.remainingPct) ? 100 - w.remainingPct : null,
                    w.resetTime,
                    snapshot,
                    5 * 60000,
                    now
                ),
                sourceLabel: group.name,
                resetBasis: 'provider',
                timeBasis: 'fetched'
            }))
        }));
    return {
        id: 'antigravity',
        title: 'Antigravity',
        source: 'Antigravity local quota summary',
        credits: snapshot.data?.credits || {},
        models: snapshot.data?.models || [],
        groups,
        error: snapshot.error || '',
        errorKey: ERROR_KEYS[snapshot.error],
        noticeKey: snapshot.data?.groups?.length === 0 && !snapshot.error ? 'quota.noActive' : null,
        observedAt: snapshot.observedAt || null,
        plan: snapshot.data?.plan || '',
        context: snapshot.context || null,
        enabled: snapshot.enabled !== false
    };
}

function claudeView(snapshot = {}, now = Date.now(), resetPolicy = 'monthlyUtc') {
    const data = snapshot.data;
    const timing = { ...snapshot, observedAt: data?.fetchedAt || null };
    const windows = [...(data?.windows || [])];
    if (['pro', 'max', 'team'].includes(data?.plan) && data.available !== false) {
        for (const [id, name] of [
            ['five_hour', '5-hour'],
            ['seven_day', 'Weekly']
        ])
            if (!windows.some((w) => w.name === name))
                windows.push({ id: `missing:${id}`, name, usedPct: null, resetAt: null });
    }
    const rows = [];
    const fableRows = [];
    for (const w of windows) {
        const reading = {
            ...row(w.id, w.name, w.usedPct, w.resetAt, timing, 10 * 60000, now),
            timeBasis: 'fetched'
        };
        const fable = reading.windowType === 'weekly' && /^(?:Claude[ -])?Fable\b(.*)$/i.exec(reading.scope);
        if (fable) {
            const scope = fable[1].trim();
            fableRows.push({ ...reading, label: scope ? `Weekly · ${scope}` : 'Weekly', scope });
        } else {
            rows.push(reading);
        }
    }
    const groups = [
        {
            id: 'claude-windows',
            label: 'Time-window quotas',
            groupType: 'timeWindows',
            short: 'Claude',
            rows
        }
    ];
    if (fableRows.length) groups.push({ id: 'claude-fable', label: 'Fable', groupType: 'fable', short: 'Fable', rows: fableRows });
    const reset = spendReset(data, resetPolicy);
    const spend = data?.spend
        ? {
              ...data.spend,
              ...reset,
              title:
                  data.plan !== 'enterprise' && data.spend.format === 'extra_usage'
                      ? 'Extra usage budget'
                      : 'Account budget',
              titleKey: data.plan !== 'enterprise' && data.spend.format === 'extra_usage' ? 'budget.extra' : 'budget.account',
              issueKey: data.spend.issue ? (data.spend.format === 'extra_usage' ? 'error.money.legacy' : 'error.money.invalid') : null,
              observedAt: timing.observedAt,
              resetPending: !!(reset.resetAt && Date.parse(reset.resetAt) <= now),
              stale:
                  !!snapshot.error ||
                  !timing.observedAt ||
                  now - timing.observedAt > 10 * 60000 ||
                  !!(reset.resetAt && Date.parse(reset.resetAt) <= now)
          }
        : null;
    return {
        id: 'claude',
        title: data?.plan === 'enterprise' ? 'Claude Enterprise' : 'Claude Code',
        source: 'Official Claude Code CLI · account usage',
        groups,
        spend,
        primaryMetric: data?.plan !== 'enterprise' && windows.length ? 'quota' : 'spend',
        plan: data?.plan || '',
        observedAt: timing.observedAt,
        error: snapshot.error || '',
        errorKey: ERROR_KEYS[snapshot.error],
        notice: data?.available === false ? 'Usage is unavailable for this sign-in method' : '',
        noticeKey: data?.available === false ? 'source.signInUnavailable' : null,
        context: snapshot.context || null,
        enabled: snapshot.enabled !== false
    };
}

function codexView(snapshot = {}, now = Date.now()) {
    const limits = snapshot.data?.limits;
    const live = limits?.source === 'app-server';
    const timing = { ...snapshot, observedAt: limits?.at || null };
    const windows = [...(limits?.windows || [])];
    for (const name of ['5-hour', 'Weekly'])
        if (!windows.some((w) => w.name === name)) windows.push({ name, pct: null });
    return {
        id: 'codex',
        title: 'Codex',
        sourceKey: live ? 'source.codexAppServer' : 'source.codex',
        sourceTimeKey: live ? 'source.fetched' : 'source.event',
        groups: [
            {
                id: 'codex',
                label: 'Time-window quotas',
                groupType: 'timeWindows',
                short: 'Codex',
                rows: windows.map((w) => {
                    const reading = row(w.name, w.name, w.pct, w.resetsAt, timing, 5 * 60000, now);
                    return {
                        ...reading,
                        recordedOnly: !live && reading.usedPct !== null && !!reading.observedAt &&
                            ['age', 'reset-elapsed'].includes(reading.staleReason),
                        resetBasis: w.resetBasis || 'provider'
                    };
                })
            }
        ],
        plan: limits?.plan || '',
        error: snapshot.error || '',
        errorKey: ERROR_KEYS[snapshot.error],
        context: snapshot.data?.context || null,
        enabled: snapshot.enabled !== false
    };
}

function buildUsageState(input, now = Date.now()) {
    return {
        providers: [
            antigravityView(input.antigravity, now),
            claudeView(input.claude, now, input.enterpriseResetSchedule),
            codexView(input.codex, now)
        ].filter((p) => p.enabled),
        percentMode: input.percentMode === 'left' ? 'left' : 'used',
        now
    };
}

module.exports = {
    buildUsageState,
    row,
    antigravityView,
    claudeView,
    codexView
};
