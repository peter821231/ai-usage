'use strict';

const { resetTime } = require('./claudeUsage');
const { spendReset } = require('./resetPolicy');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const EXPECTED = [
    ['Gemini Models', 'Gemini', ['5-hour', 'Weekly']],
    ['Claude and GPT models', 'Claude/GPT', ['5-hour', 'Weekly']],
    ['Gemini 4 Argon', 'Argon', ['Weekly']]
];
const GROUP_TYPES = {
    'Gemini Models': 'gemini',
    'Claude and GPT models': 'claudeGpt',
    'Gemini 4 Argon': 'argon'
};
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
    const groups = snapshot.data?.groups || [];
    const result = [];
    const seen = new Set();
    for (const [name, short, windows] of EXPECTED) {
        const matches = groups.filter((g) => g.name.toLowerCase().trim() === name.toLowerCase());
        if (!matches.length) matches.push({ id: name, name, windows: [] });
        for (const g of matches) {
            seen.add(g);
            const all = [...g.windows];
            for (const name of windows)
                if (!all.some((w) => w.name === name)) all.push({ id: name, name, remainingPct: null });
            result.push({
                id: g.id,
                label: g.name,
                groupType: GROUP_TYPES[name],
                short,
                rows: all.map((w) => ({
                    ...row(
                        `${g.id}:${w.id}`,
                        w.name,
                        finite(w.remainingPct) ? 100 - w.remainingPct : null,
                        w.resetTime,
                        snapshot,
                        5 * 60000,
                        now
                    ),
                    sourceLabel: g.name,
                    resetBasis: 'provider',
                    timeBasis: 'fetched'
                }))
            });
        }
    }
    for (const g of groups)
        if (!seen.has(g))
            result.push({
                id: g.id,
                label: g.name,
                short: g.name,
                rows: g.windows.map((w) =>
                    row(
                        `${g.id}:${w.id}`,
                        w.name,
                        finite(w.remainingPct) ? 100 - w.remainingPct : null,
                        w.resetTime,
                        snapshot,
                        5 * 60000,
                        now
                    )
                )
            });
    return {
        id: 'antigravity',
        title: 'Antigravity',
        source: 'Antigravity local quota summary',
        credits: snapshot.data?.credits || {},
        models: snapshot.data?.models || [],
        groups: result,
        error: snapshot.error || '',
        errorKey: ERROR_KEYS[snapshot.error],
        plan: snapshot.data?.plan || '',
        context: snapshot.context || null,
        enabled: snapshot.enabled !== false
    };
}

function claudeView(snapshot = {}, now = Date.now(), resetPolicy = 'monthlyUtc') {
    const data = snapshot.data;
    const timing = { ...snapshot, observedAt: data?.fetchedAt || null };
    const windows = [...(data?.windows || [])];
    if (['pro', 'max'].includes(data?.plan) && data.available !== false) {
        for (const [id, name] of [
            ['five_hour', '5-hour'],
            ['seven_day', 'Weekly']
        ])
            if (!windows.some((w) => w.name === name))
                windows.push({ id: `missing:${id}`, name, usedPct: null, resetAt: null });
    }
    const groups = [
        {
            id: 'claude-windows',
            label: 'Time-window quotas',
            groupType: 'timeWindows',
            short: 'Claude',
            rows: windows.map((w) => ({
                ...row(w.id, w.name, w.usedPct, w.resetAt, timing, 10 * 60000, now),
                timeBasis: 'fetched'
            }))
        }
    ];
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
        primaryMetric: data?.plan !== 'enterprise' && groups[0].rows.length ? 'quota' : 'spend',
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
    const timing = { ...snapshot, observedAt: limits?.at || null };
    const windows = [...(limits?.windows || [])];
    for (const name of ['5-hour', 'Weekly'])
        if (!windows.some((w) => w.name === name)) windows.push({ name, pct: null });
    return {
        id: 'codex',
        title: 'Codex',
        source: 'Local Codex session rate-limit event',
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
                        recordedOnly: reading.usedPct !== null && !!reading.observedAt &&
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
