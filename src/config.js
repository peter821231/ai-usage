'use strict';
const vscode = require('vscode');
const SECTION = 'nexusAiUsage';
const DEFINITIONS = new Map(
    require('../package.json').contributes.configuration.flatMap((group) => Object.entries(group.properties))
);
function get(key, fallback) {
    const value = vscode.workspace.getConfiguration(SECTION).get(key);
    const definition = DEFINITIONS.get(`${SECTION}.${key}`);
    if (value === undefined || value === null) return fallback;
    if (definition?.enum && !definition.enum.includes(value)) return fallback;
    if (definition?.type === 'boolean' && typeof value !== 'boolean') return fallback;
    return value;
}
function getExplicitBoolean(key) {
    const setting = vscode.workspace.getConfiguration(SECTION).inspect(key);
    return [setting?.workspaceFolderValue, setting?.workspaceValue, setting?.globalValue]
        .find((value) => typeof value === 'boolean');
}
function set(key, value) {
    return vscode.workspace.getConfiguration(SECTION).update(key, value, vscode.ConfigurationTarget.Global);
}
function interval() {
    const n = Number(get('refresh.activeInterval', 60000));
    return Math.max(30000, Number.isFinite(n) ? n : 60000);
}
function timeZone() {
    const zone = get('display.timeZone', 'Asia/Taipei');
    return zone === 'UTC' ? 'UTC' : 'Asia/Taipei';
}
module.exports = { SECTION, get, getExplicitBoolean, set, interval, timeZone };
