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
        extensions: { getExtension: () => undefined },
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
        async getStatus() {
            return { email: 'private@example.com', planName: 'Pro' };
        }
        async getLimits() {
            this.limitsFetchedAt = Date.now();
            return [{ id: 'argon', name: 'Gemini 4 Argon', windows: [{ id: 'wk', name: 'Weekly', remainingPct: 93 }] }];
        }
    };
    const orig = Module._load;
    const mocks = {
        vscode,
        './agyClient': { AgyClient: fakeAgy },
        './codex': {
            CodexReader: class {
                async read() {
                    return codexLimits && { limits: codexLimits };
                }
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

        await monitor.onMessage({ type: 'setSetting', key: 'antigravity.statusBar.argonWeekly', value: false });
        monitor.render();
        assert.equal(settings.get('antigravity.statusBar.argonWeekly'), false);
        assert.doesNotMatch(barItem.text, /Argon/);
        assert.match(barItem.tooltip.value, /Gemini 4 Argon/);
        assert.ok(posted.at(-1).state.providers[0].groups.some((g) => g.label === 'Gemini 4 Argon'));
        clearTimeout(monitor.startTimer);
        let refreshes = 0;
        monitor.refresh = async () => { refreshes++; };
        await monitor.onMessage({ type: 'setSetting', key: 'display.language', value: 'zh-TW' });
        configurationChanged({ affectsConfiguration: (key) => ['nexusAiUsage', 'nexusAiUsage.display.language'].includes(key) });
        assert.equal(refreshes, 0, 'Changing language must not query any provider');
        assert.equal(posted.at(-1).state.i18n.locale, 'zh-TW', 'Chinese can override an English editor');
        assert.match(barItem.text, /已用$/);
        assert.match(barItem.tooltip.value, /來源事件時間/);
        assert.equal(posted.at(-1).state.providers[1].spend.used, 35.14);
        assert.equal(posted.at(-1).state.timeZone, 'Asia/Taipei');
        receiver({ type: 'signIn' });
        await commands.get('nexusAiUsage.showDiagnostics')();
        assert.doesNotMatch(logs.join(''), /private@example/);
    } finally {
        monitor?.dispose();
        for (const d of context.subscriptions) d.dispose();
        Module._load = orig;
    }
});
