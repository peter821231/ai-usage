'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('workspace values obey declared types and enums before becoming timers or switches', () => {
    const values = {};
    const orig = Module._load;
    Module._load = function (key, ...rest) {
        return key === 'vscode'
            ? { workspace: { getConfiguration: () => ({ get: (key) => values[key] }) } }
            : orig.call(this, key, ...rest);
    };
    let cfg;
    try {
        delete require.cache[require.resolve('../src/config')];
        cfg = require('../src/config');
    } finally {
        Module._load = orig;
    }
    for (const invalid of [2 ** 32, Number.MAX_SAFE_INTEGER, Infinity, -1, '60000', {}, null]) {
        values['refresh.activeInterval'] = invalid;
        assert.equal(cfg.interval(), 60000);
    }
    values['refresh.activeInterval'] = 300000;
    assert.equal(cfg.interval(), 300000);
    values['claudeCode.timeoutSeconds'] = 2 ** 32;
    assert.equal(cfg.get('claudeCode.timeoutSeconds', 45), 45);
    values['codex.enable'] = 'false';
    assert.equal(cfg.get('codex.enable', true), true);
    values['codex.enable'] = false;
    assert.equal(cfg.get('codex.enable', true), false);
    values['antigravity.statusBar.argonWeekly'] = 'false';
    assert.equal(cfg.get('antigravity.statusBar.argonWeekly', true), true);
    values['antigravity.statusBar.argonWeekly'] = false;
    assert.equal(cfg.get('antigravity.statusBar.argonWeekly', true), false);
});
