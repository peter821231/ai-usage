'use strict';
(() => {
    const api = acquireVsCodeApi();
    const root = document.getElementById('root');
    let state;
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
    const percent = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 10) / 10}%` : 'Unknown');
    const money = (v, c) => (typeof v === 'number' && Number.isFinite(v) ? `${c || '?'} ${v.toFixed(2)}` : 'Unknown');
    const stamp = (value) =>
        value
            ? new Date(value).toLocaleString('en-GB', {
                  timeZone: state.timeZone || 'Asia/Taipei',
                  dateStyle: 'medium',
                  timeStyle: 'short'
              })
            : 'Unknown';
    function countdown(row) {
        if (!row.resetAt) return 'Unknown';
        if (row.resetPending) return 'Pending';
        const minutes = Math.max(1, Math.ceil((Date.parse(row.resetAt) - state.now) / 60000));
        const days = Math.floor(minutes / 1440),
            hours = Math.floor((minutes % 1440) / 60),
            mins = minutes % 60;
        return days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins}m` : `${mins}m`;
    }
    function resetText(row) {
        if (!row.resetAt) return 'Unknown';
        return `${stamp(row.resetAt)} · ${row.resetPending ? 'elapsed; awaiting new reading' : 'in ' + countdown(row)}${row.resetBasis === 'event-relative' ? ' · from event + interval' : ''}${row.resetBasis === 'official-monthly-rule' ? ' · official monthly rule (00:00 UTC)' : ''}`;
    }
    function tokens(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unknown';
        if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
        if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
        return String(value);
    }
    function creditCount(value) {
        return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : 'Unknown';
    }
    function sourceTime(p) {
        return (
            p.spend?.observedAt ||
            p.observedAt ||
            p.groups.flatMap((g) => g.rows).find((r) => r.observedAt)?.observedAt ||
            null
        );
    }
    function age(value) {
        if (!value) return 'No reading';
        const minutes = Math.max(0, Math.floor((state.now - value) / 60000));
        return minutes < 1
            ? 'just now'
            : minutes < 60
              ? `${minutes}m ago`
              : minutes < 1440
                ? `${Math.floor(minutes / 60)}h ago`
                : `${Math.floor(minutes / 1440)}d ago`;
    }
    function button(label, action) {
        const b = el('button', 'button', label);
        b.type = 'button';
        if (label) b.dataset.focus = `action:${label}`;
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
            track.setAttribute('aria-valuetext', 'Unknown');
        }
        return track;
    }
    function quota(row) {
        const box = el('div', 'quota');
        const label = el('span', 'window', row.label);
        label.title = row.label;
        if (row.stale && !row.recordedOnly && row.usedPct !== null) {
            const warning = el('span', 'row-stale', ' ~');
            warning.title = 'Stale: last observation retained';
            warning.setAttribute('aria-label', 'Stale');
            label.append(warning);
        }
        const value = state.percentMode === 'left' ? row.remainingPct : row.usedPct;
        const valueText = el('strong', value === null ? 'value unknown-value' : 'value', percent(value));
        const reset = el('span', 'reset', countdown(row));
        reset.title = `Reset: ${resetText(row)}`;
        box.title = `${row.label}: ${percent(row.usedPct)} used · ${percent(row.remainingPct)} remaining. Reset: ${resetText(row)}`;
        box.append(
            label,
            meter(value, `${row.label}: ${percent(value)} ${state.percentMode === 'left' ? 'remaining' : 'used'}`),
            valueText,
            reset
        );
        return box;
    }
    function spend(s) {
        const box = el('div', 'spend');
        const line = el('div', 'line spend-heading');
        line.append(el('h3', '', s.title || 'Account budget'));
        if (s.stale) line.append(badge('Stale', true));
        if (s.enabled === false) line.append(badge('Spending disabled', true));
        box.append(line);
        const big = el('div', 'money');
        big.append(el('strong', '', money(s.used, s.currency)), el('span', 'cap', ` / ${money(s.limit, s.currency)}`));
        box.append(big, meter(s.usedPct, `Budget ${percent(s.usedPct)} used`));
        const meta = el('div', 'spend-meta');
        meta.append(
            el('span', 'muted', `${percent(s.usedPct)} used`),
            el(
                'span',
                'remaining',
                s.remaining !== null && s.remaining < 0
                    ? `Over budget ${money(-s.remaining, s.currency)}`
                    : `Remaining ${money(s.remaining, s.currency)}`
            )
        );
        const reset = el('div', 'budget-reset');
        reset.append(el('span', 'muted', 'Resets in'), el('span', '', countdown(s)));
        reset.title = resetText(s);
        box.append(meta, reset);
        if (s.resetBasis === 'official-monthly-rule')
            box.append(el('div', 'detail reset-policy', 'Monthly · 1st at 00:00 UTC · official rule'));
        if (s.issue) box.append(el('p', 'problem', s.issue));
        return box;
    }
    function contextView(c) {
        const section = el('section', 'context');
        const known = typeof c.windowTokens === 'number' && typeof c.usedTokens === 'number';
        const heading = el('div', 'context-heading');
        heading.append(
            el('h3', '', 'Context'),
            el('span', 'context-model', c.model || ''),
            el(
                'strong',
                'context-value',
                `${percent(c.pct)}${known ? ' · ' + tokens(c.usedTokens) + ' / ' + tokens(c.windowTokens) : ''}`
            )
        );
        heading.title = 'Conversation context occupancy, separate from quota and budget';
        section.append(heading, meter(c.pct, `Conversation context: ${percent(c.pct)} occupied`));
        const meta = el('div', 'context-meta');
        meta.append(
            el('span', '', c.windowExact ? 'Context window' : 'Estimated context'),
            el('span', '', known ? `${tokens(Math.max(0, c.windowTokens - c.usedTokens))} left` : 'Unknown')
        );
        section.append(meta);
        return section;
    }
    function sourceDetails(p) {
        const details = el('details', 'source-details');
        details.open = expandedDetails.has(p.id);
        const summary = el('summary', '', 'Source & reset details');
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
                `${p.id === 'codex' ? 'Source event' : 'Fetched'}: ${stamp(sourceTime(p))} · ${state.timeZone || 'Asia/Taipei'}`
            )
        );
        for (const g of p.groups)
            for (const r of g.rows) {
                const item = el('p', 'detail');
                item.append(
                    el('strong', '', `${p.id === 'antigravity' ? g.label + ' · ' : ''}${r.label}: `),
                    el('span', '', `reset ${resetText(r)} · source ${stamp(r.observedAt)}`)
                );
                details.append(item);
            }
        if (p.spend) details.append(el('p', 'detail', `Budget reset: ${resetText(p.spend)}`));
        if (p.models?.length) details.append(el('p', 'detail models', `Models: ${p.models.join(', ')}`));
        return details;
    }
    function preview(p) {
        const mini = el('div', 'card-preview');
        if (p.spend && p.primaryMetric !== 'quota') {
            mini.append(
                el(
                    'strong',
                    'mini-money',
                    `${money(p.spend.used, p.spend.currency)} / ${money(p.spend.limit, p.spend.currency)}`
                ),
                meter(p.spend.usedPct, 'Budget used')
            );
        } else {
            const grid = el('div', 'mini-grid');
            for (const g of p.groups)
                for (const r of g.rows) {
                    const item = el('div', 'mini-item');
                    const label = `${p.id === 'antigravity' ? g.short + ' ' : ''}${r.label === 'Weekly' ? 'wk' : r.label === '5-hour' ? '5h' : r.label}`;
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
        toggle.setAttribute('aria-label', `${isCollapsed ? 'Expand' : 'Collapse'} ${p.title}`);
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
                `${issue ? (hasData ? 'Needs attention' : 'Unavailable') : stale ? 'Stale' : recorded ? 'Last recorded' : hasData ? 'Active' : 'Waiting'} · ${age(sourceTime(p))}`
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
        if (p.error) body.append(el('p', 'problem', `${p.error}. Last successful values, if any, are retained.`));
        if (p.notice) body.append(el('p', 'problem', p.notice));
        if (p.spend && p.primaryMetric !== 'quota') body.append(spend(p.spend));
        let count = 0;
        for (const g of p.groups) {
            if (!g.rows.length) continue;
            const group = el('div', 'group');
            const title = el('div', 'group-heading');
            title.append(el('h3', '', g.label));
            if (count === 0)
                title.append(el('span', 'legend', `${state.percentMode === 'left' ? 'Left' : 'Used'} · Resets in`));
            group.append(title);
            g.rows.forEach((r) => group.append(quota(r)));
            body.append(group);
            count += g.rows.length;
        }
        if (p.spend && p.primaryMetric === 'quota') body.append(spend(p.spend));
        if (!p.spend && !count) body.append(el('p', 'problem', 'Usage unknown. No valid reading yet.'));
        if (state.showContext && p.context) body.append(contextView(p.context));
        if (p.credits && Object.keys(p.credits).length) {
            const credits = el('div', 'credits');
            for (const [kind, label] of [
                ['prompt', 'Prompt credits left'],
                ['flow', 'Flow credits left']
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
        panel.append(el('h2', '', 'Display & monitoring'));
        for (const g of state.settings || []) {
            panel.append(el('h3', '', g.title));
            if (g.title === 'Status Bar')
                panel.append(el('p', 'detail status-bar-note', 'Status bar space is limited; only selected summaries are shown. Hover or open the dashboard for all limits.'));
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
                `${state.percentMode === 'left' ? 'Remaining' : 'Used'} · ${state.timeZone || 'Asia/Taipei'}`
            )
        );
        header.append(title, badge('PREVIEW'));
        fragment.append(header);
        const actions = el('nav', 'actions');
        actions.setAttribute('aria-label', 'Usage actions');
        actions.append(
            button('Refresh', () => api.postMessage({ type: 'refresh' })),
            button('Settings', () => {
                showSettings = !showSettings;
                render();
            }),
            button('Diagnostics', () => api.postMessage({ type: 'diagnostics' }))
        );
        fragment.append(actions);
        if (showSettings) fragment.append(settings());
        for (const p of state.providers || []) fragment.append(provider(p));
        if (!state.providers?.length)
            fragment.append(el('p', 'problem', 'All providers are disabled. Enable monitoring in Settings.'));
        fragment.append(el('footer', 'muted', 'Unknown = no reading · ~ = stale. Values retain their source time.'));
        root.replaceChildren(fragment);
        if (focus)
            [...root.querySelectorAll('[data-focus]')]
                .find((node) => node.dataset.focus === focus)
                ?.focus({ preventScroll: true });
    }
    window.addEventListener('message', (event) => {
        if (event.data?.type === 'state') {
            state = event.data.state;
            render();
        }
        if (event.data?.type === 'showSettings') {
            showSettings = event.data.mode === 'open' || !showSettings;
            render();
        }
    });
    api.postMessage({ type: 'ready' });
})();
