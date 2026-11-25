'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

test('activation wires isolated commands; updates all three providers without touching account state', async () => {
    const commands = new Map();
    const posted = [];
    const logs = [];
    const settings = new Map();
    const barItem = {
        show() { this.visible = true; },
        hide() { this.visible = false; },
        dispose() {}
    };
    let codexLimits = null;
    let codexAppLimits = null;
    let codexAppError = false;
    let codexSessionReads = 0;
    let antigravityPending;
    const argon = { id: 'argon', name: 'Gemini 4 Argon', windows: [{ id: 'wk', name: 'Weekly', remainingPct: 93 }] };
    let antigravityGroups = [argon];
    let antigravityEmail = 'private@example.com';
    const officialAntigravity = { isActive: false, exports: { port: 1234, csrfToken: 'private fixture token' } };
    let provider;
    let receiver;
    let configurationChanged;
    const disposable = () => ({ dispose() {} });
    const vscode = {
        StatusBarAlignment: { Right: 2 },
        ConfigurationTarget: { Global: 1 },
        ThemeColor: class {},
        MarkdownString: class {
            constructor() {
                this.value = '';
            }
            appendMarkdown(s) {
                this.value += s;
            }
        },
        Uri: { joinPath: (u, ...parts) => ({ fsPath: path.join(u.fsPath, ...parts) }) },
        env: { remoteName: 'wsl', language: 'en' },
        extensions: { getExtension: (id) => id === 'google.google-antigravity' ? officialAntigravity : undefined },
        workspace: {
            workspaceFolders: [],
            getConfiguration: (section) => {
                assert.equal(section, 'nexusAiUsage');
                return {
                    get: (key) => settings.get(key),
                    inspect: (key) => ({ defaultValue: true, globalValue: settings.get(key) }),
                    update: async (key, value, target) => {
                        assert.equal(target, vscode.ConfigurationTarget.Global);
                        settings.set(key, value);
                    }
                };
            },
            onDidChangeConfiguration: (listener) => {
                configurationChanged = listener;
                return disposable();
            }
        },
        window: {
            state: { focused: true },
            onDidChangeWindowState: disposable,
            createStatusBarItem: () => barItem,
            createOutputChannel: () => ({ info: (s) => logs.push(s), show() {}, dispose() {} }),
            registerWebviewViewProvider: (_id, p) => {
                provider = p;
                return disposable();
            }
        },
        commands: {
            registerCommand: (id, fn) => {
                commands.set(id, fn);
                return disposable();
            },
            executeCommand: async () => {}
        }
    };
    const fakeAgy = class {
        constructor(_log, getOfficialApi) {
            assert.equal(getOfficialApi(), null);
            officialAntigravity.isActive = true;
            assert.equal(getOfficialApi(), officialAntigravity.exports);
        }
        async getStatus() {
            return { email: antigravityEmail, planName: 'Pro' };
        }
        async getLimits() {
            await antigravityPending;
            this.limitsFetchedAt = Date.now();
            return antigravityGroups;
        }
    };
    const orig = Module._load;
    const mocks = {
        vscode,
        './agyClient': { AgyClient: fakeAgy },
        './codex': {
            CodexReader: class {
                async read() {
                    codexSessionReads++;
                    return codexLimits && { limits: codexLimits };
                }
            }
        },
        './codexAppServer': {
            findCodexCommand: () => '/fixture/codex',
            fetchCodexLimits: async () => {
                if (codexAppError) throw Error('private diagnostic');
                return codexAppLimits;
            }
        },
        './claudeUsageStore': {
            refreshClaude: async () => ({
                data: {
                    fetchedAt: Date.now(),
                    windows: [],
                    spend: {
                        used: 35.14,
                        limit: 200,
                        remaining: 164.86,
                        currency: 'USD',
                        usedPct: 17.57,
                        status: 'available'
                    }
                }
            })
        }
    };
    Module._load = function (key, ...rest) {
        return mocks[key] || orig.call(this, key, ...rest);
    };
    let monitor;
    const context = {
        subscriptions: [],
        extensionUri: { fsPath: path.join(__dirname, '..') },
        globalStorageUri: { fsPath: '/tmp/nexus-unused-test-storage' },
        extension: { id: 'nexus-ai-usage-local.nexus-ai-usage', packageJSON: { version: '0.1.0' } }
    };
    try {
        for (const name of ['extension', 'config', 'statusBar', 'webview'])
            delete require.cache[require.resolve('../src/' + name)];
        monitor = require('../src/extension').activate(context);
        assert.equal(barItem.visible, false);
        for (const c of require('../package.json').contributes.commands) assert.ok(commands.has(c.command));
        assert.ok([...commands.keys()].every((k) => !/switch|signIn/.test(k)));
        provider.resolveWebviewView({
            visible: true,
            webview: {
                cspSource: 'vscode-resource:',
                asWebviewUri: (u) => u.fsPath,
                onDidReceiveMessage: (fn) => {
                    receiver = fn;
                },
                postMessage: (m) => posted.push(m)
            },
            onDidChangeVisibility() {},
            onDidDispose() {}
        });
        receiver({ type: 'ready' });
        await monitor.refresh();
        const state = posted.at(-1).state;
        assert.equal(state.providers.length, 3);
        assert.equal(state.providers[1].spend.used, 35.14);
        assert.ok(state.providers[0].groups.some((g) => g.label === 'Gemini 4 Argon'));
        assert.doesNotMatch(JSON.stringify(state), /private@example/);
        const settingValue = (key) => posted.at(-1).state.settings.flatMap((group) => group.items)
            .find((item) => item.key === key).value;
        const codexSetting = 'codex.showInStatusBar';
        assert.equal(barItem.visible, true);
        assert.match(barItem.text, /Argon wk 7%/);
        assert.match(barItem.text, /Claude/);
        assert.doesNotMatch(barItem.text, /Codex/);
        assert.match(barItem.tooltip.value, /Codex/);
        assert.equal(settingValue(codexSetting), false);
        assert.equal(settings.size, 0);

        await monitor.onMessage({ type: 'setSetting', key: codexSetting, value: true });
        monitor.render();
        assert.match(barItem.text, /Codex/);
        assert.equal(settingValue(codexSetting), true);

        await monitor.onMessage({ type: 'setSetting', key: codexSetting, value: false });
        codexLimits = { at: Date.now(), windows: [{ name: '5-hour', pct: 0 }] };
        await monitor.refresh();
        assert.doesNotMatch(barItem.text, /Codex/);
        assert.equal(settingValue(codexSetting), false);

        settings.delete(codexSetting);
        monitor.render();
        assert.match(barItem.text, /Codex 5h 0%/);
        assert.equal(settingValue(codexSetting), true);
        codexLimits = null;
        await monitor.refresh();
        assert.match(barItem.text, /Codex 5h 0%/);

        const liveAt = Date.now() - 1000;
        codexAppLimits = { at: liveAt, source: 'app-server', windows: [{ name: '5-hour', pct: 12 }] };
        codexLimits = { at: liveAt - 1000, windows: [{ name: '5-hour', pct: 30 }] };
        const previousSessionReads = codexSessionReads;
        await monitor.onMessage({ type: 'refresh' });
        assert.equal(codexSessionReads, previousSessionReads);
        const codexProvider = () => posted.at(-1).state.providers.find((p) => p.id === 'codex');
        assert.match(barItem.text, /Codex 5h 12%/);
        assert.equal(codexProvider().source, 'Official Codex App Server · account limits');
        assert.equal(codexProvider().sourceTimeKey, 'source.fetched');
        codexAppError = true;
        await monitor.refresh();
        assert.match(barItem.text, /Codex 5h 12%/);
        assert.equal(codexProvider().groups[0].rows[0].observedAt, liveAt);
        assert.match(codexProvider().error, /Could not query account limits/);
        codexLimits = { ...codexLimits, at: liveAt + 1 };
        await monitor.refresh();
        assert.match(barItem.text, /Codex 5h 30%/);
        assert.equal(codexProvider().sourceTimeKey, 'source.event');
        assert.equal(codexProvider().error, '');
        const codexDiagnostics = monitor.diagnostics().sources.codex;
        assert.equal(codexDiagnostics.appServerError, 'codex-query-failed');
        assert.equal(codexDiagnostics.error, '');

        codexAppError = false;
        let unblockAntigravity;
        antigravityPending = new Promise((resolve) => { unblockAntigravity = resolve; });
        const slowRefresh = monitor.refresh();
        await monitor.readCodex();
        codexAppLimits = { ...codexAppLimits, windows: [{ name: '5-hour', pct: 17 }] };
        const manualRefresh = monitor.onMessage({ type: 'refresh' });
        await monitor.readCodex();
        assert.match(barItem.text, /Codex 5h 17%/);
        unblockAntigravity();
        await Promise.all([slowRefresh, manualRefresh]);

        await monitor.onMessage({ type: 'setSetting', key: 'antigravity.statusBar.argonWeekly', value: false });
        monitor.render();
        assert.equal(settings.get('antigravity.statusBar.argonWeekly'), false);
        assert.doesNotMatch(barItem.text, /Argon/);
        assert.match(barItem.tooltip.value, /Gemini 4 Argon/);
        assert.ok(posted.at(-1).state.providers[0].groups.some((g) => g.label === 'Gemini 4 Argon'));

        clearTimeout(monitor.startTimer);
        let refreshes = 0;
        monitor.refresh = async () => { refreshes++; };
        const compactKey = 'statusBar.compact';
        const summary = barItem.text;
        assert.equal(settingValue(compactKey), false);
        for (const compact of [true, false]) {
            await monitor.onMessage({ type: 'setSetting', key: compactKey, value: compact });
            configurationChanged({ affectsConfiguration: (key) => ['nexusAiUsage', `nexusAiUsage.${compactKey}`].includes(key) });
            assert.equal(settingValue(compactKey), compact);
            assert.equal(barItem.text, compact ? '$(dashboard)' : summary);
            assert.equal(barItem.visible, true);
            assert.equal(barItem.command, 'nexusAiUsage.dashboard.focus');
            assert.match(barItem.tooltip.value, /Gemini 4 Argon/);
        }
        const antigravity = () => posted.at(-1).state.providers.find((p) => p.id === 'antigravity');
        const otherWindows = 'antigravity.statusBar.otherWindows';
        await monitor.onMessage({ type: 'setSetting', key: 'antigravity.statusBar.argonWeekly', value: true });
        antigravityGroups = [
            { id: 'gemini', name: 'Gemini Models', windows: [{ id: 'wk', name: 'Weekly', remainingPct: null }] },
            { id: 'new', name: 'New model pool', windows: [{ id: 'wk', name: 'Weekly', remainingPct: 74 }] }
        ];
        await monitor.readAntigravity();
        assert.deepEqual(antigravity().groups.map((g) => g.label), ['Gemini Models', 'New model pool']);
        assert.match(barItem.text, /Gemini wk Unknown/);
        assert.doesNotMatch(barItem.text, /Argon|5h Unknown|New model pool/);
        assert.match(barItem.tooltip.value, /New model pool/);
        assert.doesNotMatch(barItem.tooltip.value, /Argon/);
        assert.equal(settingValue(otherWindows), false);
        await monitor.onMessage({ type: 'setSetting', key: otherWindows, value: true });
        await monitor.onMessage({ type: 'setSetting', key: 'antigravity.statusBar.geminiWeekly', value: false });
        monitor.render();
        assert.match(barItem.text, /New model pool wk 26%/);
        assert.doesNotMatch(barItem.text, /Gemini|Argon/);
        assert.match(barItem.tooltip.value, /Gemini Models/);
        antigravityGroups = [];
        await monitor.readAntigravity();
        assert.deepEqual(antigravity().groups, []);
        assert.equal(antigravity().error, '');
        assert.match(antigravity().notice, /no active quota windows/);
        assert.doesNotMatch(barItem.text, /\bAG\b/);

        antigravityEmail = '';
        antigravityGroups = [argon];
        await monitor.readAntigravity();
        assert.equal(antigravity().groups[0].label, 'Gemini 4 Argon');
        antigravityEmail = 'private@example.com';
        antigravityGroups = null;
        await monitor.readAntigravity();
        assert.deepEqual(antigravity().groups, []);
        assert.equal(monitor.snapshots.antigravity.observedAt, null);

        assert.equal(refreshes, 0, 'Changing compact mode must not query any provider');
        await monitor.onMessage({ type: 'setSetting', key: 'display.language', value: 'zh-TW' });
        configurationChanged({ affectsConfiguration: (key) => ['nexusAiUsage', 'nexusAiUsage.display.language'].includes(key) });
        assert.equal(refreshes, 0, 'Changing language must not query any provider');
        assert.equal(posted.at(-1).state.i18n.locale, 'zh-TW', 'Chinese can override an English editor');
        assert.match(barItem.text, /已用$/);
        assert.match(barItem.tooltip.value, /開啟儀表板/);
        assert.equal(posted.at(-1).state.providers[1].spend.used, 35.14);
        assert.equal(posted.at(-1).state.timeZone, 'Asia/Taipei');
        receiver({ type: 'signIn' });
        await commands.get('nexusAiUsage.showDiagnostics')();
        assert.doesNotMatch(logs.join(''), /private@example/);
        assert.doesNotMatch(logs.join(''), /private diagnostic|private fixture token/);
    } finally {
        monitor?.dispose();
        for (const d of context.subscriptions) d.dispose();
        Module._load = orig;
    }
});
