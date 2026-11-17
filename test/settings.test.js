'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const { isValidSetting, settingsView } = require('../src/settingsUi');
test('preview manifest is isolated and exposes monitoring-only commands', () => {
    assert.notEqual(pkg.publisher + '.' + pkg.name, 'quota-nexus.quota-nexus');
    for (const c of pkg.contributes.commands) {
        assert.ok(c.command.startsWith('nexusAiUsage.'));
        assert.doesNotMatch(c.command, /signIn|switch|Account|Alerts/);
    }
    for (const group of pkg.contributes.configuration)
        for (const key of Object.keys(group.properties)) assert.ok(key.startsWith('nexusAiUsage.'));
    assert.deepEqual(
        pkg.contributes.menus['view/title'].filter((m) => m.group.startsWith('navigation')).map((m) => m.command),
        ['nexusAiUsage.refresh', 'nexusAiUsage.quickSettings']
    );
});
test('only known enum and boolean settings may be changed by a webview', () => {
    assert.equal(isValidSetting('refresh.activeInterval', 60000), true);
    assert.equal(isValidSetting('refresh.activeInterval', 1), false);
    assert.equal(isValidSetting('codex.enable', 'false'), false);
    assert.equal(isValidSetting('context.show', true), true);
    assert.equal(isValidSetting('workbench.colorTheme', 'x'), false);
    assert.equal(isValidSetting('display.timeZone', 'invalid'), false);
    assert.equal(isValidSetting('claudeCode.enterpriseResetSchedule', 'unknown'), true);
    assert.equal(isValidSetting('claudeCode.enterpriseResetSchedule', 'daily'), false);
    const panel = settingsView(() => undefined);
    assert.equal(panel.flatMap((g) => g.items).find((i) => i.key === 'context.show').value, false);
});

test('Antigravity summary defaults select both Gemini windows and independent Argon; choices are validated', () => {
    const items = settingsView(() => undefined).find((g) => g.title === 'Antigravity').items;
    const choices = items.filter((i) => i.key.startsWith('antigravity.statusBar.'));
    assert.equal(choices.length, 5);
    assert.deepEqual(choices.filter((i) => i.value).map((i) => i.key), [
        'antigravity.statusBar.geminiFiveHour', 'antigravity.statusBar.geminiWeekly', 'antigravity.statusBar.argonWeekly'
    ]);
    for (const choice of choices) {
        assert.equal(isValidSetting(choice.key, false), true);
        assert.equal(isValidSetting(choice.key, 'false'), false);
    }
    const disabled = settingsView((key) => key === 'antigravity.showInStatusBar' ? false : undefined)
        .find((g) => g.title === 'Antigravity').items.filter((i) => i.key.startsWith('antigravity.statusBar.'));
    assert.ok(disabled.every((i) => i.disabled));
});
