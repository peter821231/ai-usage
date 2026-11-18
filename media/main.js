'use strict';
(() => {
    const api = acquireVsCodeApi();
    const root = document.getElementById('root');
    let state;
    let i18n;
    const t = (key, args) => i18n.t(key, args);
    let showSettings = false;
    const stored = api.getState?.();
    const collapsed = new Set(
        (Array.isArray(stored?.collapsed) ? stored.collapsed : []).filter((id) =>
            ['antigravity', 'claude', 'codex'].includes(id)
        )
    );
    const expandedDetails = new Set();
    const el = (tag, cls, text) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    };
    const percent = (value) => i18n.percent(value);
    const money = (value, currency) => i18n.money(value, currency);
    const stamp = (value) => i18n.stamp(value, state.timeZone);
    const countdown = (row) => i18n.duration(row.resetAt, state.now, row.resetPending);
    function resetText(row) {
        if (!row.resetAt) return t('common.unknown');
        return `${stamp(row.resetAt)} · ${row.resetPending ? t('reset.elapsed') : t('reset.in', { duration: countdown(row) })}${row.resetBasis === 'event-relative' ? ' · ' + t('reset.fromEvent') : ''}${row.resetBasis === 'official-monthly-rule' ? ' · ' + t('reset.monthly') : ''}`;
    }
    function tokens(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return t('common.unknown');
        if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
        if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
        return String(value);
    }
    function creditCount(value) {
        return typeof value === 'number' && Number.isFinite(value) ? i18n.number(value) : t('common.unknown');
    }
    function sourceTime(p) {
        return (
            p.spend?.observedAt ||
            p.observedAt ||
            p.groups.flatMap((g) => g.rows).find((r) => r.observedAt)?.observedAt ||
            null
        );
    }
    const age = (value) => i18n.age(value, state.now);
    function button(label, action, id) {
        const b = el('button', 'button', label);
        b.type = 'button';
        if (id) b.dataset.focus = `action:${id}`;
        b.addEventListener('click', action);
        return b;
    }
    function badge(label, warning) {
        return el('span', warning ? 'badge warning' : 'badge', label);
    }
    function meter(value, label) {
        const track = el('div', 'meter');
        track.setAttribute('role', 'meter');
        track.setAttribute('aria-label', label);
        if (typeof value === 'number' && Number.isFinite(value)) {
            track.setAttribute('aria-valuemin', '0');
            track.setAttribute('aria-valuemax', '100');
            track.setAttribute('aria-valuenow', String(Math.max(0, Math.min(100, value))));
            const fill = el('div', value >= 90 ? 'fill high' : value >= 75 ? 'fill medium' : 'fill');
            fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
            track.append(fill);
        } else {
            track.classList.add('unknown');
            track.setAttribute('aria-valuetext', t('common.unknown'));
        }
        return track;
    }
    function quota(row) {
        const box = el('div', 'quota');
        const label = el('span', 'window', row.label);
        label.title = row.label;
        if (row.stale && !row.recordedOnly && row.usedPct !== null) {
            const warning = el('span', 'row-stale', ' ~');
            warning.title = t('source.staleHint');
            warning.setAttribute('aria-label', t('source.stale'));
            label.append(warning);
        }
        const value = state.percentMode === 'left' ? row.remainingPct : row.usedPct;
        const valueText = el('strong', value === null ? 'value unknown-value' : 'value', percent(value));
        const reset = el('span', 'reset', countdown(row));
        reset.title = t('reset.label', { reset: resetText(row) });
        box.title = t('quota.reading', { window: row.label, used: percent(row.usedPct), remaining: percent(row.remainingPct), reset: resetText(row) });
        box.append(
            label,
            meter(value, t('quota.meter', { window: row.label, value: percent(value), mode: t(state.percentMode === 'left' ? 'quota.remaining' : 'quota.used') })),
            valueText,
            reset
        );
        return box;
    }
    function spend(s) {
        const box = el('div', 'spend');
        const line = el('div', 'line spend-heading');
        line.append(el('h3', '', s.title || t('budget.account')));
        if (s.stale) line.append(badge(t('source.stale'), true));
        if (s.enabled === false) line.append(badge(t('budget.disabled'), true));
        box.append(line);
        const big = el('div', 'money');
        big.append(el('strong', '', money(s.used, s.currency)), el('span', 'cap', ` / ${money(s.limit, s.currency)}`));
        box.append(big, meter(s.usedPct, t('budget.used', { value: percent(s.usedPct) })));
        const meta = el('div', 'spend-meta');
        meta.append(
            el('span', 'muted', t('quota.usedValue', { value: percent(s.usedPct) })),
            el(
                'span',
                'remaining',
                s.remaining !== null && s.remaining < 0
                    ? t('budget.over', { amount: money(-s.remaining, s.currency) })
                    : t('budget.remaining', { amount: money(s.remaining, s.currency) })
            )
        );
        const reset = el('div', 'budget-reset');
        reset.append(el('span', 'muted', t('reset.inLabel')), el('span', '', countdown(s)));
        reset.title = resetText(s);
        box.append(meta, reset);
        if (s.resetBasis === 'official-monthly-rule')
            box.append(el('div', 'detail reset-policy', t('budget.monthly')));
        if (s.issue) box.append(el('p', 'problem', s.issue));
        return box;
    }
    function contextView(c) {
        const section = el('section', 'context');
        const known = typeof c.windowTokens === 'number' && typeof c.usedTokens === 'number';
        const heading = el('div', 'context-heading');
        heading.append(
            el('h3', '', t('context.title')),
            el('span', 'context-model', c.model || ''),
            el(
                'strong',
                'context-value',
                `${percent(c.pct)}${known ? ' · ' + tokens(c.usedTokens) + ' / ' + tokens(c.windowTokens) : ''}`
            )
        );
        heading.title = t('context.hint');
        section.append(heading, meter(c.pct, t('context.meter', { value: percent(c.pct) })));
        const meta = el('div', 'context-meta');
        meta.append(
            el('span', '', t(c.windowExact ? 'context.window' : 'context.estimated')),
            el('span', '', known ? t('context.left', { tokens: tokens(Math.max(0, c.windowTokens - c.usedTokens)) }) : t('common.unknown'))
        );
        section.append(meta);
        return section;
    }
    function sourceDetails(p) {
        const details = el('details', 'source-details');
        details.open = expandedDetails.has(p.id);
        const summary = el('summary', '', t('source.details'));
        summary.dataset.focus = `source:${p.id}`;
        details.append(summary);
        summary.addEventListener('click', (event) => {
            event.preventDefault();
            details.open = !details.open;
            if (details.open) expandedDetails.add(p.id);
            else expandedDetails.delete(p.id);
        });
        details.append(
            el('p', 'detail', p.source),
            el(
                'p',
                'detail',
                `${t(p.id === 'codex' ? 'source.event' : 'source.fetched')}: ${stamp(sourceTime(p))} · ${state.timeZone || 'Asia/Taipei'}`
            )
        );
        for (const g of p.groups)
            for (const r of g.rows) {
                const item = el('p', 'detail');
                item.append(
                    el('strong', '', `${p.id === 'antigravity' || g.groupType === 'fable' ? g.label + ' · ' : ''}${r.label}: `),
                    el('span', '', t('source.rowDetails', { reset: resetText(r), time: stamp(r.observedAt) }))
                );
                details.append(item);
            }
        if (p.spend) details.append(el('p', 'detail', t('budget.reset', { reset: resetText(p.spend) })));
        if (p.models?.length) details.append(el('p', 'detail models', t('source.models', { models: p.models.join(', ') })));
        return details;
    }
    function preview(p) {
        const mini = el('div', 'card-preview');
        const spendFirst = p.spend && p.primaryMetric !== 'quota';
        if (spendFirst) {
            mini.append(
                el(
                    'strong',
                    'mini-money',
                    `${money(p.spend.used, p.spend.currency)} / ${money(p.spend.limit, p.spend.currency)}`
                ),
                meter(p.spend.usedPct, t('budget.usedLabel'))
            );
        }
        const groups = spendFirst ? p.groups.filter((g) => g.groupType === 'fable') : p.groups;
        if (groups.length) {
            const grid = el('div', 'mini-grid');
            for (const g of groups)
                for (const r of g.rows) {
                    const item = el('div', 'mini-item');
                    const label = `${p.id === 'antigravity' || g.groupType === 'fable' ? g.short + ' ' : ''}${i18n.windowLabel(r, true)}`;
                    item.append(
                        el('span', 'muted', label),
                        el(
                            'strong',
                            '',
                            `${percent(state.percentMode === 'left' ? r.remainingPct : r.usedPct)}${r.stale && !r.recordedOnly && r.usedPct !== null ? ' ~' : ''}`
                        )
                    );
                    grid.append(item);
                }
            mini.append(grid);
        }
        if (p.error) mini.append(el('p', 'problem', p.error));
        return mini;
    }
    function provider(p) {
        const card = el('section', `card provider-card provider-${p.id}`);
        card.dataset.provider = p.id;
        const isCollapsed = collapsed.has(p.id);
        const heading = el('h2', 'card-heading');
        const toggle = button('', () => {
            if (collapsed.has(p.id)) collapsed.delete(p.id);
            else collapsed.add(p.id);
            api.setState?.({ collapsed: [...collapsed] });
            render();
        });
        toggle.className = 'provider-toggle';
        toggle.dataset.focus = `collapse:${p.id}`;
        toggle.setAttribute('aria-expanded', String(!isCollapsed));
        toggle.setAttribute('aria-controls', `body-${p.id}`);
        toggle.setAttribute('aria-label', t(isCollapsed ? 'action.expand' : 'action.collapse', { provider: p.title }));
        toggle.append(el('span', 'provider-icon', { antigravity: 'AG', claude: 'CC', codex: 'CX' }[p.id]));
        const text = el('span', 'provider-label');
        text.append(el('span', 'provider-title', p.title));
        const rows = p.groups.flatMap((g) => g.rows);
        const hasData = typeof p.spend?.used === 'number' || rows.some((r) => r.usedPct !== null);
        const issue = p.error || p.spend?.status === 'unsupported';
        const stale = p.spend?.stale || rows.some((r) => r.stale && !r.recordedOnly && r.usedPct !== null);
        const recorded = rows.some((r) => r.recordedOnly);
        const status = el('span', 'provider-status');
        status.append(
            el('span', `status-dot ${issue || stale ? 'stale-dot' : recorded ? '' : hasData ? 'active-dot' : ''}`),
            el(
                'span',
                '',
                `${t(issue ? (hasData ? 'status.attention' : 'status.unavailable') : stale ? 'source.stale' : recorded ? 'source.lastRecorded' : hasData ? 'status.active' : 'status.waiting')} · ${age(sourceTime(p))}`
            )
        );
        text.append(status);
        toggle.append(text);
        if (p.plan && !p.title.toLowerCase().includes(p.plan.toLowerCase())) {
            const plan = badge(p.plan.replace(/^Google AI /, ''));
            plan.title = p.plan;
            toggle.append(plan);
        }
        toggle.append(el('span', isCollapsed ? 'chevron' : 'chevron expanded'));
        heading.append(toggle);
        card.append(heading);
        const body = el('div', 'card-body');
        body.id = `body-${p.id}`;
        body.hidden = isCollapsed;
        if (p.error) body.append(el('p', 'problem', t('error.retained', { error: p.error })));
        if (p.notice) body.append(el('p', 'problem', p.notice));
        if (p.spend && p.primaryMetric !== 'quota') body.append(spend(p.spend));
        let count = 0;
        for (const g of p.groups) {
            if (!g.rows.length) continue;
            const group = el('div', 'group');
            const title = el('div', 'group-heading');
            title.append(el('h3', '', g.label));
            if (count === 0)
                title.append(el('span', 'legend', t('quota.legend', { mode: t(state.percentMode === 'left' ? 'quota.left' : 'quota.used') })));
            group.append(title);
            g.rows.forEach((r) => group.append(quota(r)));
            body.append(group);
            count += g.rows.length;
        }
        if (p.spend && p.primaryMetric === 'quota') body.append(spend(p.spend));
        if (!p.spend && !count) body.append(el('p', 'problem', t('quota.empty')));
        if (state.showContext && p.context) body.append(contextView(p.context));
        if (p.credits && Object.keys(p.credits).length) {
            const credits = el('div', 'credits');
            for (const [kind, label] of [
                ['prompt', t('credits.prompt')],
                ['flow', t('credits.flow')]
            ])
                if (p.credits[kind]) {
                    const line = el('div', 'credit-line');
                    line.append(
                        el('span', '', label),
                        el(
                            'span',
                            '',
                            `${creditCount(p.credits[kind].available)} / ${creditCount(p.credits[kind].monthly)}`
                        )
                    );
                    credits.append(line);
                }
            body.append(credits);
        }
        body.append(sourceDetails(p));
        const mini = preview(p);
        mini.hidden = !isCollapsed;
        card.append(body, mini);
        return card;
    }
    function settings() {
        const panel = el('section', 'card settings');
        panel.append(el('h2', '', t('settings.title')));
        for (const g of state.settings || []) {
            panel.append(el('h3', '', g.title));
            if (g.id === 'statusBar')
                panel.append(el('p', 'detail status-bar-note', t('settings.statusNote')));
            for (const item of g.items) {
                const label = el('label', 'setting');
                label.append(el('span', '', item.label));
                label.title = item.help;
                const input = el(item.kind === 'bool' ? 'input' : 'select');
                input.disabled = item.disabled;
                input.dataset.focus = `setting:${item.key}`;
                if (item.kind === 'bool') {
                    input.type = 'checkbox';
                    input.checked = item.value;
                } else
                    for (const option of item.options || []) {
                        const o = el('option', '', option.label);
                        o.value = JSON.stringify(option.value);
                        o.selected = option.value === item.value;
                        input.append(o);
                    }
                input.addEventListener('change', () =>
                    api.postMessage({
                        type: 'setSetting',
                        key: item.key,
                        value: item.kind === 'bool' ? input.checked : JSON.parse(input.value)
                    })
                );
                label.append(input);
                panel.append(label);
                if (item.key === 'display.language')
                    panel.append(el('p', 'detail language-note', t('settings.languageNote')));
            }
        }
        return panel;
    }
    function render() {
        if (!state) return;
        const focus = document.activeElement?.dataset?.focus;
        const fragment = document.createDocumentFragment();
        const header = el('header');
        const title = el('div');
        title.append(
            el('h1', 'sr-only', 'Nexus AI Usage'),
            el(
                'p',
                'muted',
                `${t(state.percentMode === 'left' ? 'quota.remaining' : 'quota.used')} · ${state.timeZone || 'Asia/Taipei'}`
            )
        );
        header.append(title, badge(t('dashboard.preview')));
        fragment.append(header);
        const actions = el('nav', 'actions');
        actions.setAttribute('aria-label', t('action.usage'));
        actions.append(
            button(t('action.refresh'), () => api.postMessage({ type: 'refresh' }), 'refresh'),
            button(t('action.settings'), () => {
                showSettings = !showSettings;
                render();
            }, 'settings'),
            button(t('action.diagnostics'), () => api.postMessage({ type: 'diagnostics' }), 'diagnostics')
        );
        fragment.append(actions);
        if (showSettings) fragment.append(settings());
        for (const p of state.providers || []) fragment.append(provider(p));
        if (!state.providers?.length)
            fragment.append(el('p', 'problem', t('dashboard.noProviders')));
        fragment.append(el('footer', 'muted', t('dashboard.footer')));
        root.replaceChildren(fragment);
        if (focus)
            [...root.querySelectorAll('[data-focus]')]
                .find((node) => node.dataset.focus === focus)
                ?.focus({ preventScroll: true });
    }
    window.addEventListener('message', (event) => {
        if (event.data?.type === 'state') {
            state = event.data.state;
            i18n = NexusI18n.createTranslator(state.i18n);
            document.documentElement.lang = i18n.locale;
            render();
        }
        if (event.data?.type === 'showSettings') {
            showSettings = event.data.mode === 'open' || !showSettings;
            render();
        }
    });
    api.postMessage({ type: 'ready' });
})();
