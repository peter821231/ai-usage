'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const { buildUsageState: buildRawUsageState } = require(root + '/src/usageState');
const { createI18n, localizeView } = require(root + '/src/i18n');
const buildUsageState = (input, now) => localizeView(buildRawUsageState(input, now), createI18n('en'));
require('./locales.cjs').check();
const { settingsView } = require(root + '/src/settingsUi');
const { parseUsage } = require(root + '/src/claudeUsage');
const { parseGeneratorMetadata, parseQuotaSummary } = require(root + '/src/parse');
const { personalUsage, extraUsage } = require(root + '/test/fixtures/personal-claude.cjs');
const original = Module._load;
Module._load = function (key, ...args) {
    return key === 'vscode'
        ? {
              Uri: {
                  joinPath: (u, ...parts) => ({
                      fsPath: path.join(u.fsPath, ...parts)
                  })
              }
          }
        : original.call(this, key, ...args);
};
const { DashboardProvider } = require(root + '/src/webview');
Module._load = original;
const dark = {
    '--vscode-foreground': '#d5d5d5',
    '--vscode-descriptionForeground': '#a0a0a0',
    '--vscode-editor-background': '#1f1f1f',
    '--vscode-sideBar-background': '#181818',
    '--vscode-panel-border': '#343434',
    '--vscode-progressBar-background': '#4c83ff',
    '--vscode-editorWarning-foreground': '#e9b660',
    '--vscode-editorError-foreground': '#f27878',
    '--vscode-button-secondaryBackground': '#283348',
    '--vscode-button-secondaryForeground': '#dce5f6',
    '--vscode-button-secondaryHoverBackground': '#34415a',
    '--vscode-focusBorder': '#73acfa',
    '--vscode-font-family': 'system-ui',
    '--vscode-dropdown-background': '#283348',
    '--vscode-dropdown-foreground': '#dce5f6'
};
const light = {
    ...dark,
    '--vscode-foreground': '#24334c',
    '--vscode-descriptionForeground': '#576680',
    '--vscode-editor-background': '#ffffff',
    '--vscode-sideBar-background': '#f2f5f9',
    '--vscode-panel-border': '#ccd5e3',
    '--vscode-editorWarning-foreground': '#8d5600',
    '--vscode-button-secondaryBackground': '#e5ebf4',
    '--vscode-button-secondaryForeground': '#24334c'
};
const now = Date.parse('2026-11-16T02:00:00Z');
const future = '2026-11-22T00:00:00Z';
const money = (n) => ({ amount_minor: n, exponent: 2, currency: 'USD' });
const state = buildUsageState(
    {
        antigravity: {
            observedAt: now,
            data: {
                plan: 'Google AI Pro',
                credits: {
                    prompt: { available: 500, monthly: 50000 },
                    flow: { available: 100, monthly: 150000 }
                },
                models: ['Gemini 3.8 Flash', 'Claude and GPT models', 'Gemini 4 Argon'],
                groups: [
                    ['Gemini Models', [1, 3]],
                    ['Claude and GPT models', [0, 0]],
                    ['Gemini 4 Argon', [7]]
                ].map(([name, values], i) => ({
                    id: 'pool' + i,
                    name,
                    windows: values.map((used, j) => ({
                        id: String(j),
                        name: i === 2 || j === 1 ? 'Weekly' : '5-hour',
                        remainingPct: 100 - used,
                        resetTime: i === 2 ? '2026-11-22T00:00:00Z' : j === 0 ? '2026-11-16T03:24:00Z' : future
                    }))
                }))
            },
            context: {
                model: 'Gemini 4 Hydro',
                pct: 5,
                usedTokens: 50400,
                windowTokens: 1000000,
                windowExact: false
            }
        },
        claude: {
            context: {
                model: 'claude-opus-5-5',
                pct: 68,
                usedTokens: 683900,
                windowTokens: 1000000,
                windowExact: false
            },
            data: parseUsage(
                {
                    subscription_type: 'enterprise',
                    rate_limits: {
                        spend: { used: money(3514), limit: money(20000), enabled: true }
                    }
                },
                now
            )
        },
        codex: {
            data: {
                limits: {
                    at: now - 600000,
                    plan: 'Plus',
                    windows: [
                        { name: '5-hour', pct: 16, resetsAt: '2026-11-16T03:24:00Z' },
                        { name: 'Weekly', pct: 3, resetsAt: future }
                    ]
                }
            }
        }
    },
    now
);
state.timeZone = 'Asia/Taipei';
state.settings = settingsView(() => undefined);
let base;
let browser;
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        const p = new DashboardProvider({ fsPath: root }, () => {});
        res.setHeader('Content-Type', 'text/html');
        res.end(
            p.html(
                {
                    cspSource: base,
                    asWebviewUri: (u) => base + '/media/' + path.basename(u.fsPath)
                },
                { fsPath: root + '/media' }
            )
        );
    } else if (['/media/main.css', '/media/main.js', '/media/i18n.js'].includes(req.url)) {
        res.setHeader('Content-Type', req.url.endsWith('css') ? 'text/css' : 'application/javascript');
        res.end(fs.readFileSync(root + req.url));
    } else {
        res.writeHead(404);
        res.end();
    }
});
(async () => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    const layouts = {};
    const captureDemo = async (name) => {
        await page.locator('header .badge').evaluate((n) => {
            n.textContent = 'DEMO DATA';
        });
        layouts[name] = await page.locator('#root').evaluate((node) => ({
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
            cards: [...node.querySelectorAll('.provider-card')].map((card) => ({
                provider: card.dataset.provider,
                height: card.getBoundingClientRect().height,
                headerHeight: card.querySelector('.provider-toggle').getBoundingClientRect().height
            }))
        }));
        await page.locator('#root').screenshot({ path: root + '/artifacts/' + name + '.png' });
    };
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
        window.__messages = [];
        window.acquireVsCodeApi = () => ({
            postMessage: (m) => window.__messages.push(m),
            getState: () => JSON.parse(sessionStorage.getItem('nexus-ui') || 'null'),
            setState: (value) => sessionStorage.setItem('nexus-ui', JSON.stringify(value))
        });
    });
    await page.goto(base);
    await page.evaluate(
        (theme) => Object.entries(theme).forEach(([k, v]) => document.documentElement.style.setProperty(k, v)),
        dark
    );
    await page.evaluate(
        (s) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: s } })),
        state
    );
    for (const width of [280, 360, 900]) {
        await page.setViewportSize({ width, height: 1000 });
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
            throw Error('overflow ' + width);
    }
    if ((await page.locator('.quota').count()) !== 7) throw Error('Expected seven quota rows');
    const codexCard = page.locator('[data-provider="codex"]');
    if (!(await codexCard.locator('.provider-status').textContent()).includes('Last recorded'))
        throw Error('Old Codex events should use recorded-data wording');
    if (await codexCard.locator('.stale-dot, .row-stale').count())
        throw Error('Normal recorded Codex data should not show an amber stale indicator');
    if ((await page.locator('.money').textContent()) !== 'USD 35.14 / USD 200.00') throw Error('Money mismatch');
    if (await page.locator('[data-provider="claude"]').getByRole('heading', { name: 'Fable', exact: true }).count())
        throw Error('An Enterprise spend-only response should have no Fable group');
    if (!(await page.locator('.reset-policy').textContent()).includes('00:00 UTC'))
        throw Error('Reset rule basis missing');
    if (!(await page.locator('.budget-reset').getAttribute('title')).includes('1 Dec 2026, 08:00'))
        throw Error('Reset does not match the confirmed Usage date');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    if (!(await page.evaluate(() => window.__messages.some((m) => m.type === 'refresh'))))
        throw Error('Refresh not wired');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    if (!(await page.locator('.status-bar-note').textContent()).includes('space is limited'))
        throw Error('Missing status-bar space/selection explanation');
    const chosen = (key) => page.locator(`input[data-focus="setting:antigravity.statusBar.${key}"]`);
    for (const [key, expected] of [['geminiFiveHour', true], ['geminiWeekly', true], ['claudeGptFiveHour', false], ['claudeGptWeekly', false], ['argonWeekly', true], ['otherWindows', false]]) {
        if ((await chosen(key).isChecked()) !== expected)
            throw Error('Wrong default summary selection: ' + key);
    }
    for (const width of [280, 360, 900]) {
        await page.setViewportSize({ width, height: 1000 });
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
            throw Error('Settings overflow ' + width);
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    await captureDemo('dashboard-demo-status-settings');
    if (process.argv.includes('--docs')) {
        await page.locator('.settings').evaluate((node, version) => {
            const label = document.createElement('p');
            label.className = 'detail';
            label.textContent = `DEMO DATA · v${version} · synthetic settings preview`;
            node.prepend(label);
        }, require('../package.json').version);
        await page.locator('.settings').screenshot({ path: root + '/artifacts/documentation-status-settings.png' });
    }
    await chosen('claudeGptFiveHour').setChecked(true);
    if (!(await page.evaluate(() => window.__messages.some((m) => m.type === 'setSetting' && m.key === 'antigravity.statusBar.claudeGptFiveHour' && m.value === true))))
        throw Error('Antigravity summary choice not wired');
    await chosen('otherWindows').setChecked(true);
    if (!(await page.evaluate(() => window.__messages.some((m) => m.type === 'setSetting' && m.key === 'antigravity.statusBar.otherWindows' && m.value === true))))
        throw Error('Other quota windows choice not wired');
    const compactMode = page.getByRole('checkbox', { name: 'Compact mode' });
    if (await compactMode.isChecked()) throw Error('Compact mode should default to off');
    await compactMode.setChecked(true);
    if (!(await page.evaluate(() => window.__messages.some((m) => m.type === 'setSetting' && m.key === 'statusBar.compact' && m.value === true))))
        throw Error('Compact mode setting not wired');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const card = page.locator('[data-provider="antigravity"]');
    await page.getByRole('button', { name: 'Collapse Antigravity', exact: true }).click();
    if (!(await card.locator('.card-preview').isVisible()) || (await card.locator('.card-body').isVisible()))
        throw Error('Card did not collapse');
    await page.evaluate(
        (s) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: s } })),
        state
    );
    if (!(await page.getByRole('button', { name: 'Expand Antigravity', exact: true }).isVisible()))
        throw Error('Collapse lost after refresh');
    await page.reload();
    await page.evaluate(
        (theme) => Object.entries(theme).forEach(([k, v]) => document.documentElement.style.setProperty(k, v)),
        dark
    );
    await page.evaluate(
        (s) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: s } })),
        state
    );
    const expand = page.getByRole('button', {
        name: 'Expand Antigravity',
        exact: true
    });
    if (!(await expand.isVisible())) throw Error('Collapse lost after reload');
    await expand.focus();
    await expand.press('Enter');
    if (
        !(await page
            .getByRole('button', { name: 'Collapse Antigravity', exact: true })
            .evaluate((node) => node === document.activeElement))
    )
        throw Error('Keyboard focus lost');
    const source = card.locator('.source-details summary');
    await source.click();
    await page.evaluate(
        (s) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: s } })),
        state
    );
    if (!(await card.locator('.source-details').evaluate((node) => node.open)))
        throw Error('Source details lost after refresh');
    await card.locator('.source-details summary').click();
    await page.evaluate(
        (s) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: s } })),
        state
    );
    if (await card.locator('.source-details').evaluate((node) => node.open))
        throw Error('Closed source details reopened after refresh');
    const leftState = structuredClone(state);
    leftState.percentMode = 'left';
    await page.evaluate(
        (s) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: s } })),
        leftState
    );
    if ((await page.locator('.quota .meter').first().getAttribute('aria-valuenow')) !== '99')
        throw Error('Meter does not follow remaining mode');
    await page.evaluate(
        (s) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: s } })),
        state
    );
    await page.locator('header .badge').evaluate((n) => {
        n.textContent = 'DEMO DATA';
    });
    await page.setViewportSize({ width: 390, height: 1100 });
    await captureDemo('dashboard-demo-dark');
    const contextState = structuredClone(state);
    contextState.showContext = true;
    await page.evaluate(
        (s) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: s } })),
        contextState
    );
    await page.locator('header .badge').evaluate((n) => {
        n.textContent = 'DEMO DATA';
    });
    if ((await page.locator('.context').count()) !== 2) throw Error('Context sections missing');
    await captureDemo('dashboard-demo-dark-context');
    await page.evaluate(
        (theme) => Object.entries(theme).forEach(([k, v]) => document.documentElement.style.setProperty(k, v)),
        light
    );
    await captureDemo('dashboard-demo-light');
    await page.emulateMedia({ forcedColors: 'active' });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('High contrast overflow');
    await page.emulateMedia({ forcedColors: 'none' });
    for (const plan of ['pro', 'max']) {
        for (const format of ['legacy', 'limits']) {
            for (const extra of [undefined, extraUsage, { used_credits: 321, monthly_limit: 5000 }]) {
                const personal = buildUsageState(
                    {
                        antigravity: { enabled: false },
                        codex: { enabled: false },
                        claude: {
                            data: parseUsage(personalUsage(plan, format, extra), now),
                            context: { pct: 68 }
                        }
                    },
                    now
                );
                personal.timeZone = 'Asia/Taipei';
                personal.showContext = true;
                await page.evaluate(
                    (s) =>
                        window.dispatchEvent(
                            new MessageEvent('message', {
                                data: { type: 'state', state: s }
                            })
                        ),
                    personal
                );
                const cc = page.locator('[data-provider="claude"]');
                if ((await cc.locator('.quota').count()) !== (format === 'legacy' ? 5 : 4))
                    throw Error('Personal subscription quota rows lost');
                if ((await cc.locator('.quota .meter').first().getAttribute('aria-valuenow')) !== '0')
                    throw Error('Real subscription zero lost');
                if (!(await cc.locator('.quota .reset').first().getAttribute('title')).includes('16 Nov 2026, 13:00'))
                    throw Error('Personal source reset overwritten');
                if (await cc.locator('.reset-policy').count()) throw Error('Enterprise reset applied to personal plan');
                if (format === 'legacy' && (await cc.locator('.quota').last().locator('.fill').count()))
                    throw Error('Unknown personal quota rendered as zero');
                if (extra) {
                    if (!(await cc.locator('.spend h3').textContent()).includes('Extra usage budget'))
                        throw Error('Extra spending confused with subscription quota');
                    if (
                        !(await cc
                            .locator('.card-body')
                            .evaluate(
                                (n) =>
                                    n.querySelector('.group').compareDocumentPosition(n.querySelector('.spend')) &
                                    Node.DOCUMENT_POSITION_FOLLOWING
                            ))
                    )
                        throw Error('Personal extra spending hides main quotas');
                    if ((await cc.locator('.budget-reset').getAttribute('title')) !== 'Unknown')
                        throw Error('Personal spending received guessed reset');
                } else if (await cc.locator('.spend').count()) throw Error('Invented personal budget');
                await page.getByRole('button', { name: 'Collapse Claude Code', exact: true }).click();
                if (await cc.locator('.mini-money').count()) throw Error('Personal preview hides quotas behind money');
                if (!(await cc.locator('.card-preview').textContent()).includes('5h0%'))
                    throw Error('Collapsed personal preview lost subscription quota');
                await page.getByRole('button', { name: 'Expand Claude Code', exact: true }).click();
                for (const width of [280, 360, 900]) {
                    await page.setViewportSize({ width, height: 1000 });
                    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
                        throw Error('Personal plan overflow ' + width);
                }
                if (plan === 'pro' && format === 'legacy' && extra === extraUsage) {
                    await page.evaluate(
                        (theme) =>
                            Object.entries(theme).forEach(([k, v]) => document.documentElement.style.setProperty(k, v)),
                        dark
                    );
                    await page.locator('header .badge').evaluate((n) => {
                        n.textContent = 'DEMO DATA';
                    });
                    await page.setViewportSize({ width: 390, height: 1000 });
                    await captureDemo('dashboard-demo-claude-personal');
                }
            }
        }
    }
    const evil = structuredClone(state);
    evil.providers[0].groups[0].label = '<img src=x onerror=alert(1)>';
    await page.evaluate(
        (s) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: s } })),
        evil
    );
    if (await page.locator('img').count()) throw Error('Unsafe label rendering');
    const empty = buildUsageState({}, now);
    empty.timeZone = 'Asia/Taipei';
    await page.evaluate(
        (s) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: s } })),
        empty
    );
    if (!(await page.locator('body').innerText()).includes('Unknown')) throw Error('Missing data hidden');
    if (await page.locator('.quota .meter .fill').count()) throw Error('Unknown readings rendered as zero bars');

    const sendState = (value) => page.evaluate(
        (s) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: s } })), value
    );
    const quotaState = (groups) => buildUsageState({
        antigravity: { data: { groups: parseQuotaSummary({ response: { groups } }) }, observedAt: now }
    }, now);
    await sendState(quotaState([
        { displayName: 'Gemini Models', buckets: [{ displayName: 'Weekly' }] },
        { displayName: 'New model pool', buckets: [{ displayName: 'Daily', remainingFraction: 0.7 }] }
    ]));
    if (await card.getByRole('heading', { name: 'Gemini 4 Argon', exact: true }).count())
        throw Error('Removed Argon pool is still visible');
    if (!(await card.getByRole('heading', { name: 'New model pool', exact: true }).isVisible()))
        throw Error('New quota pool did not appear');
    if (await card.locator('.quota').count() !== 2 || await card.locator('.unknown-value').count() !== 1)
        throw Error('Only reported quota windows should be visible');
    await sendState(quotaState([]));
    if (await card.locator('.quota').count() || !(await card.getByText('Antigravity reported no active quota windows.').isVisible()))
        throw Error('Empty quota summary did not clear the reported windows');

    const team = buildUsageState({ claude: { data: parseUsage({
        subscription_type: 'team', rate_limits: {
            five_hour: { utilization: 13 },
            seven_day: { utilization: 3 },
            model_scoped: [{ display_name: 'Fable', utilization: 5, resets_at: future }]
        }
    }, now) } }, now);
    await sendState(team);
    const claudeCard = page.locator('[data-provider="claude"]');
    const fable = claudeCard.locator('.group').filter({ has: page.getByRole('heading', { name: 'Fable', exact: true }) });
    if (await fable.locator('.quota').count() !== 1 || await fable.locator('.value').textContent() !== '5%')
        throw Error('Fable should have its own weekly section and percentage');
    if (await claudeCard.locator('.group').first().locator('.quota').count() !== 2)
        throw Error('Fable should be separate from the common quota windows');
    if (!(await fable.locator('.reset').getAttribute('title')).includes('22 Nov 2026, 08:00'))
        throw Error('Fable should show its CLI reset timestamp');
    await claudeCard.getByRole('button', { name: 'Collapse Claude Code' }).click();
    if (!(await claudeCard.locator('.card-preview').textContent()).includes('Fable wk'))
        throw Error('Fable must be identified in the collapsed view');
    await claudeCard.getByRole('button', { name: 'Expand Claude Code' }).click();
    const enterpriseWithFable = buildUsageState({ claude: { data: parseUsage({
        subscription_type: 'enterprise', rate_limits: {
            spend: { used: money(3514), limit: money(20000), enabled: true },
            model_scoped: [{ display_name: 'Fable', utilization: 5, resets_at: future }]
        }
    }, now) } }, now);
    await sendState(enterpriseWithFable);
    await claudeCard.getByRole('button', { name: 'Collapse Claude Enterprise' }).click();
    const enterprisePreview = await claudeCard.locator('.card-preview').textContent();
    if (!enterprisePreview.includes('USD 35.14') || !enterprisePreview.includes('Fable wk'))
        throw Error('Enterprise with a Fable reading should show both spend and Fable in the collapsed preview');
    await claudeCard.getByRole('button', { name: 'Expand Claude Enterprise' }).click();

    // Drive the same setting message and state update used by an English editor.
    await sendState(state);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('[data-provider="antigravity"] .source-details summary').click();
    await page.getByRole('button', { name: 'Collapse Codex', exact: true }).click();
    const languageSelect = page.locator('select[data-focus="setting:display.language"]');
    const refreshCount = await page.evaluate(() => window.__messages.filter((m) => m.type === 'refresh').length);
    await languageSelect.focus();
    await languageSelect.selectOption(JSON.stringify('zh-TW'));
    if (!(await page.evaluate(() => window.__messages.some((m) => m.type === 'setSetting' && m.key === 'display.language' && m.value === 'zh-TW'))))
        throw Error('Language selection is not wired');
    const chineseI18n = createI18n('zh-TW', 'en');
    const chinese = localizeView(state, chineseI18n);
    chinese.settings = settingsView((key) => key === 'display.language' ? 'zh-TW' : undefined, chineseI18n);
    await sendState(chinese);
    if ((await page.locator('html').getAttribute('lang')) !== 'zh-TW') throw Error('Document language did not change');
    if (!(await page.getByRole('button', { name: '重新整理', exact: true }).isVisible())) throw Error('Chinese actions missing');
    if (!(await page.locator('.language-note').textContent()).includes('編輯器原生設定頁')) throw Error('Language scope explanation missing');
    if (!(await page.getByRole('checkbox', { name: '精簡模式' }).isVisible())) throw Error('Chinese compact mode label missing');
    if (!(await languageSelect.evaluate((node) => node === document.activeElement))) throw Error('Language switch lost focus');
    if (!(await page.getByRole('button', { name: '展開 Codex', exact: true }).isVisible())) throw Error('Language switch lost collapse state');
    if (!(await page.locator('[data-provider="antigravity"] .source-details').evaluate((node) => node.open))) throw Error('Language switch lost source details');
    if ((await page.locator('.money').textContent()) !== 'USD 35.14 / USD 200.00') throw Error('Language switch changed money');
    if (!(await page.locator('.budget-reset').getAttribute('title')).includes('08:00')) throw Error('Language switch changed timezone');
    if ((await page.locator('.quota .meter').first().getAttribute('aria-valuenow')) !== '1') throw Error('Language switch changed quota');
    if ((await page.evaluate(() => window.__messages.filter((m) => m.type === 'refresh').length)) !== refreshCount) throw Error('Language switch requested a refresh');
    if (/%manifest\.|action\.refresh|common\.unknown/.test(await page.locator('body').innerText())) throw Error('Unresolved translation key');
    for (const width of [280, 360, 900]) {
        await page.setViewportSize({ width, height: 1000 });
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Chinese settings overflow ' + width);
    }
    await page.setViewportSize({ width: 390, height: 1100 });
    await captureDemo('dashboard-demo-zh-TW-settings');
    await page.getByRole('button', { name: '設定', exact: true }).click();
    await page.getByRole('button', { name: '展開 Codex', exact: true }).click();
    await page.locator('[data-provider="antigravity"] .source-details summary').click();
    for (const width of [280, 360, 900]) {
        await page.setViewportSize({ width, height: 1000 });
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Chinese dashboard overflow ' + width);
    }
    await page.setViewportSize({ width: 390, height: 1100 });
    await captureDemo('dashboard-demo-zh-TW');
    const chineseLeft = structuredClone(chinese);
    chineseLeft.percentMode = 'left';
    await sendState(chineseLeft);
    if ((await page.locator('.quota .meter').first().getAttribute('aria-valuenow')) !== '99') throw Error('Chinese remaining mode lost semantics');
    await sendState(localizeView(empty, chineseI18n));
    if (!(await page.locator('body').innerText()).includes('未知')) throw Error('Chinese missing readings hidden');
    if (await page.locator('.quota .meter .fill').count()) throw Error('Chinese unknown readings rendered as zero');
    const missingModel = buildRawUsageState({
        antigravity: { context: parseGeneratorMetadata({
            generatorMetadata: [{ chatModel: { model: 'MODEL_PLACEHOLDER_M9', usage: { inputTokens: 42 } } }]
        }, {}, null) },
        claude: { enabled: false },
        codex: { enabled: false }
    }, now);
    missingModel.showContext = true;
    await sendState(localizeView(missingModel, chineseI18n));
    if ((await page.locator('.context-model').textContent()) !== '未知模型')
        throw Error('Missing context model was not translated');
    await sendState(localizeView(missingModel, createI18n('en')));
    if ((await page.locator('.context-model').textContent()) !== 'Unknown model')
        throw Error('English missing context model was not restored');
    const longTranslation = structuredClone(chinese);
    longTranslation.i18n.messages['action.refresh'] = 'VeryLongTranslatedRefreshLabel'.repeat(6);
    longTranslation.i18n.messages['quota.used'] = 'VeryLongTranslatedPercentageLabel'.repeat(6);
    longTranslation.providers[0].groups[0].label = '<img src=x onerror=alert(1)>';
    await sendState(longTranslation);
    await page.setViewportSize({ width: 280, height: 1000 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Long translation overflow');
    if (await page.locator('img').count()) throw Error('Localized text interpreted as HTML');
    await sendState(state);
    if ((await page.locator('html').getAttribute('lang')) !== 'en') throw Error('Could not return to English');
    if (!(await page.getByRole('button', { name: 'Refresh', exact: true }).isVisible())) throw Error('English actions not restored');
    if (errors.length) throw Error(errors.join(';'));
    fs.writeFileSync(root + '/artifacts/dashboard-layout-metrics.json', JSON.stringify(layouts, null, 2) + '\n');
    console.log(
        JSON.stringify({
            quotaRows: 7,
            widths: [280, 360, 900],
            themes: ['dark', 'light', 'forced-colors'],
            actions: ['refresh', 'settings', 'collapse', 'keyboard-expand', 'source-details'],
            collapseSurvivesRefreshAndReload: true,
            contextSeparateFromBudget: true,
            personalSubscriptions: ['pro', 'max'],
            personalUsageFormats: ['legacy', 'limits'],
            personalExtraUsage: ['absent', 'supported', 'unsupported'],
            statusBarWindowChoices: 6,
            codexRecordedDataNeutral: true,
            languages: ['en', 'zh-TW'],
            languageSwitchPreservesFocusAndDetails: true,
            longTranslations: true,
            pageErrors: errors,
            demoScreenshots: true
        })
    );
    await browser.close();
    server.close();
})().catch(async (e) => {
    console.error(e);
    await browser?.close();
    server.close();
    process.exitCode = 1;
});
