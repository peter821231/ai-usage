'use strict';

// Adapted from Claude Usage Ultra by Wei Xu (MIT). See THIRD-PARTY-NOTICES.md.
const { spawn } = require('node:child_process');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const CLI_ARGS = ['--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence'];

class UsageCliError extends Error {
    constructor(code) { super(code); this.code = code; }
}

function bundledCliPath(extensionPath, platform = process.platform) {
    return path.join(extensionPath, 'resources', 'native-binary', platform === 'win32' ? 'claude.exe' : 'claude');
}

// No user turns are sent. Never log raw output: initialize can include private metadata.
function fetchUsage({ command, argsPrefix = [], cwd, env, signal, timeoutMs = 45000, maxBytes = 8 * 1024 * 1024, killGraceMs = 2000 }) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new UsageCliError('cancelled'));
        let child;
        try {
            child = spawn(command, [...argsPrefix, ...CLI_ARGS], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
        } catch { return reject(new UsageCliError('cli-unavailable')); }
        const initId = randomUUID();
        const usageId = randomUUID();
        let phase = 'initialize';
        let buffer = '';
        let received = 0;
        let outcome = null;
        let settled = false;
        let killTimer;
        const timer = setTimeout(() => finish(new UsageCliError('timeout')), timeoutMs);
        const abort = () => finish(new UsageCliError('cancelled'));
        signal?.addEventListener('abort', abort, { once: true });

        function complete() {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearTimeout(killTimer);
            signal?.removeEventListener('abort', abort);
            const result = outcome || { error: new UsageCliError('cli-exited') };
            if (result.error) reject(result.error); else resolve(result.value);
        }
        function finish(error, value) {
            if (outcome) return;
            outcome = { error, value };
            clearTimeout(timer);
            child.stdin.end();
            if (!child.pid) return complete();
            child.kill('SIGTERM');
            killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
        }
        function send(id, subtype) {
            child.stdin.write(JSON.stringify({ type: 'control_request', request_id: id, request: { subtype } }) + '\n', () => {});
        }
        function line(text) {
            let msg;
            try { msg = JSON.parse(text); } catch { return; }
            if (msg?.type !== 'control_response') return;
            const r = msg.response;
            const expectedId = phase === 'initialize' ? initId : usageId;
            if (!r || r.request_id !== expectedId) return;
            if (r.subtype === 'error') return finish(new UsageCliError('request-refused'));
            if (r.subtype !== 'success') return;
            if (phase === 'initialize') { phase = 'usage'; send(usageId, 'get_usage'); }
            else finish(null, r.response);
        }
        child.on('error', () => finish(new UsageCliError('cli-unavailable')));
        child.on('close', complete);
        child.stdin.on('error', () => finish(new UsageCliError('cli-exited')));
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
            if (outcome) return;
            received += Buffer.byteLength(chunk);
            if (received > maxBytes) return finish(new UsageCliError('output-too-large'));
            buffer += chunk;
            let end;
            while (!outcome && (end = buffer.indexOf('\n')) >= 0) {
                const next = buffer.slice(0, end); buffer = buffer.slice(end + 1);
                if (next.trim()) line(next);
            }
        });
        send(initId, 'initialize');
    });
}

module.exports = { fetchUsage, bundledCliPath, UsageCliError, CLI_ARGS };
