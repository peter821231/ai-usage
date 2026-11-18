'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cfg = require('./config');
const { AgyClient } = require('./agyClient');
const { CodexReader } = require('./codex');
const { ClaudeContextReader } = require('./claudeCode');
const { bundledCliPath, nativeCliPath, fetchHostUsage } = require('./claudeUsageCli');
const { parseUsage } = require('./claudeUsage');
const { refreshClaude } = require('./claudeUsageStore');
const { buildUsageState } = require('./usageState');
const { StatusBar, AG_STATUS_WINDOWS } = require('./statusBar');
const { DashboardProvider } = require('./webview');
const { settingsView, isValidSetting } = require('./settingsUi');
const { createI18n, localizeView } = require('./i18n');

class Monitor {
    constructor(context) {
        this.context = context;
        this.home = os.homedir();
        this.agy = new AgyClient();
        this.codex = new CodexReader(this.home);
        this.claudeContext = new ClaudeContextReader(this.home);
        this.bar = new StatusBar();
        this.log = vscode.window.createOutputChannel('Nexus AI Usage', { log: true });
        this.view = new DashboardProvider(context.extensionUri, (msg) => this.onMessage(msg));
        this.snapshots = { antigravity: {}, claude: {}, codex: {} };
        this.abort = new AbortController();
        this.disposed = false;
    }
    start() {
        const command = (name, action) => vscode.commands.registerCommand(`nexusAiUsage.${name}`, action);
        this.context.subscriptions.push(
            this.bar,
            this.log,
            vscode.window.registerWebviewViewProvider('nexusAiUsage.dashboard', this.view),
            command('refresh', () => this.refresh(true)),
            command('showDiagnostics', () => this.diagnostics()),
            command('openSettings', () =>
                vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${this.context.extension.id}`)
            ),
            command('quickSettings', () => this.view.showSettings()),
            command('togglePercentMode', () =>
                cfg.set('display.percentMode', cfg.get('display.percentMode', 'used') === 'used' ? 'left' : 'used')
            ),
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (!e.affectsConfiguration(cfg.SECTION)) return;
                if (e.affectsConfiguration(`${cfg.SECTION}.refresh`)) this.schedule();
                this.render();
                const sourceSettings = ['refresh', 'antigravity.enable', 'claudeCode.enable',
                    'claudeCode.timeoutSeconds', 'codex.enable', 'context.show', 'claudeCode.enterpriseResetSchedule'];
                if (sourceSettings.some((key) => e.affectsConfiguration(`${cfg.SECTION}.${key}`)))
                    void this.refresh();
            }),
            vscode.window.onDidChangeWindowState((s) => {
                if (s.focused) void this.refresh();
            }),
            { dispose: () => this.dispose() }
        );
        this.schedule();
        this.render();
        this.startTimer = setTimeout(() => void this.refresh(), 50);
    }
    schedule() {
        clearInterval(this.timer);
        clearInterval(this.clockTimer);
        this.timer = setInterval(() => {
            if (!cfg.get('refresh.pauseWhenUnfocused', true) || vscode.window.state.focused) void this.refresh();
        }, cfg.interval());
        this.clockTimer = setInterval(() => this.render(), 30000);
    }
    paths() {
        return (vscode.workspace.workspaceFolders || [])
            .filter((f) => f.uri.scheme === 'file')
            .map((f) => f.uri.fsPath);
    }
    refresh(force = false) {
        if (this.disposed) return Promise.resolve();
        if (this.inFlight) return this.inFlight;
        this.inFlight = Promise.allSettled([this.readAntigravity(), this.readCodex(), this.readClaude(force)])
            .then(() => this.render())
            .finally(() => {
                this.inFlight = null;
            });
        return this.inFlight;
    }
    async readAntigravity() {
        if (!cfg.get('antigravity.enable', true)) return;
        const s = this.snapshots.antigravity;
        try {
            const status = await this.agy.getStatus();
            if (!status) throw new Error('source-unavailable');
            const groups = await this.agy.getLimits(status);
            if (this.agIdentity && this.agIdentity !== status.email) {
                s.data = null;
                s.observedAt = null;
            }
            this.agIdentity = status.email;
            if (groups) {
                s.data = {
                    groups,
                    plan: status.planName,
                    credits: status.credits || {},
                    models: [...new Set(Object.values(status.modelLabels || {}))]
                };
                s.observedAt = this.agy.limitsFetchedAt;
            }
            s.error = this.agy.limitsError || (groups ? '' : 'agy-summary-unavailable');
            s.context = cfg.get('context.show', false)
                ? await this.agy.getContext(this.paths(), status.modelLabels).catch(() => null)
                : null;
        } catch {
            s.error = 'agy-unavailable';
        }
        s.checkedAt = Date.now();
        this.render();
    }
    async readCodex() {
        if (!cfg.get('codex.enable', true)) return;
        const s = this.snapshots.codex;
        try {
            const data = await this.codex.read(this.paths());
            if (data?.limits) {
                s.data = data;
                s.error = '';
            } else s.error = 'codex-no-event';
        } catch {
            s.error = 'codex-read-failed';
        }
        s.checkedAt = Date.now();
        this.render();
    }
    async readClaude(force) {
        if (!cfg.get('claudeCode.enable', true)) return;
        const s = this.snapshots.claude;
        try {
            const official = vscode.extensions.getExtension('anthropic.claude-code');
            const storageDir = this.context.globalStorageUri.fsPath;
            const result = await refreshClaude({
                storageDir,
                force,
                signal: this.abort.signal,
                query: async (signal) => parseUsage(await fetchHostUsage({
                    extensionPath: official?.extensionPath,
                    home: this.home,
                    cwd: storageDir,
                    timeoutMs: cfg.get('claudeCode.timeoutSeconds', 45) * 1000,
                    signal
                }))
            });
            if (result) {
                s.data = result.data;
                s.error = result.error;
                s.checkedAt = result.checkedAt;
                s.pending = result.pending;
            }
            s.context = cfg.get('context.show', false)
                ? await this.claudeContext.read(this.paths()).catch(() => null)
                : null;
        } catch {
            s.error = 'cache-unavailable';
        }
        this.render();
    }
    render() {
        if (this.disposed) return;
        const input = {
            ...this.snapshots,
            percentMode: cfg.get('display.percentMode', 'used'),
            enterpriseResetSchedule: cfg.get('claudeCode.enterpriseResetSchedule', 'monthlyUtc')
        };
        for (const [id, key] of [
            ['antigravity', 'antigravity'],
            ['claude', 'claudeCode'],
            ['codex', 'codex']
        ]) {
            input[id] = { ...input[id], enabled: cfg.get(`${key}.enable`, true) };
        }
        const i18n = createI18n(cfg.get('display.language', 'auto'), vscode.env.language);
        const view = localizeView(buildUsageState(input), i18n);
        view.showContext = cfg.get('context.show', false);
        view.timeZone = cfg.timeZone();
        view.settings = settingsView((k) => cfg.get(k), i18n);
        this.bar.update(view, {
            show: cfg.get('statusBar.show', true),
            antigravityWindows: Object.fromEntries(
                AG_STATUS_WINDOWS.map((choice) => [
                    choice.key, cfg.get(`antigravity.statusBar.${choice.key}`, choice.default)
                ])
            ),
            hidden: ['antigravity', 'claude', 'codex'].filter(
                (id) => !cfg.get(`${id === 'claude' ? 'claudeCode' : id}.showInStatusBar`, true)
            )
        });
        this.view.setState(view);
    }
    async onMessage(msg) {
        if (msg.type === 'refresh') return this.refresh(true);
        if (msg.type === 'diagnostics') return this.diagnostics();
        if (msg.type === 'openSettings') return vscode.commands.executeCommand('nexusAiUsage.openSettings');
        if (msg.type === 'setSetting' && isValidSetting(msg.key, msg.value)) return cfg.set(msg.key, msg.value);
    }
    diagnostics() {
        const official = vscode.extensions.getExtension('anthropic.claude-code');
        const report = {
            platform: process.platform,
            remoteName: vscode.env.remoteName || 'local',
            extensionVersion: this.context.extension.packageJSON.version,
            officialClaudeVersion: official?.packageJSON.version || null,
            officialCliPresent: !!official && fs.existsSync(bundledCliPath(official.extensionPath)),
            nativeCliPresent: fs.existsSync(nativeCliPath(this.home)),
            codexLogsPresent: fs.existsSync(path.join(this.home, '.codex', 'sessions')),
            antigravityConnected: !!this.agy.server,
            sources: Object.fromEntries(
                Object.entries(this.snapshots).map(([id, s]) => [
                    id,
                    { hasData: !!s.data, checkedAt: s.checkedAt || null, error: s.error || '' }
                ])
            )
        };
        this.log.info(JSON.stringify(report, null, 2));
        this.log.show(true);
        return report;
    }
    dispose() {
        this.disposed = true;
        this.abort.abort();
        clearTimeout(this.startTimer);
        clearInterval(this.timer);
        clearInterval(this.clockTimer);
    }
}
function activate(context) {
    const monitor = new Monitor(context);
    monitor.start();
    return monitor;
}
function deactivate() {}
module.exports = { activate, deactivate, Monitor };
