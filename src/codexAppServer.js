'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { buildCodexAppLimits } = require('./codex');
const { version } = require('../package.json');

const MAX_OUTPUT_BYTES = 1024 * 1024;
const TIMEOUT_MS = 10000;
const INIT_ID = 1;
const LIMITS_ID = 2;

function findCodexCommand(extensionPath, searchPath = process.env.PATH || '', platform = process.platform, arch = process.arch) {
    const executable = platform === 'win32' ? 'codex.exe' : 'codex';
    const bundledPlatform = { win32: 'windows', darwin: 'macos' }[platform] || platform;
    const bundledArch = { x64: 'x86_64', arm64: 'aarch64' }[arch] || arch;
    const directories = extensionPath && path.isAbsolute(extensionPath)
        ? [path.join(extensionPath, 'bin', `${bundledPlatform}-${bundledArch}`), path.join(extensionPath, 'bin')]
        : [];
    directories.push(...searchPath.split(path.delimiter).filter((dir) => path.isAbsolute(dir)));
    for (const dir of directories) {
        const candidate = path.join(dir, executable);
        try {
            if (!fs.statSync(candidate).isFile()) continue;
            fs.accessSync(candidate, fs.constants.X_OK);
            return candidate;
        } catch {
            // The CLI may only be installed in another extension host.
        }
    }
    return null;
}

function fetchCodexLimits({ command, cwd, signal, timeoutMs = TIMEOUT_MS, spawnProcess = spawn }) {
    if (!command || signal?.aborted) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        const child = spawnProcess(command, ['app-server'], {
            cwd,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'ignore']
        });
        let settled = false;
        let initialized = false;
        let buffer = '';
        let outputBytes = 0;
        let killTimer;
        const timer = setTimeout(fail, timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });

        function finish(limits, error) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            child.stdin.end();
            child.stdout.destroy();
            if (child.pid && child.exitCode === null && child.signalCode === null) {
                killTimer = setTimeout(() => child.kill('SIGKILL'), 1000);
                killTimer.unref();
            }
            if (error) reject(error);
            else resolve(limits);
        }
        function fail() {
            finish(null, new Error('codex-query-failed'));
        }
        function abort() {
            finish(null);
        }
        function send(message) {
            child.stdin.write(JSON.stringify(message) + '\n', (error) => {
                if (error) fail();
            });
        }
        function handleLine(line) {
            let message;
            try {
                message = JSON.parse(line);
            } catch {
                return;
            }
            if (!initialized && message?.id === INIT_ID) {
                if (!message.result || message.error) return fail();
                initialized = true;
                send({ method: 'initialized' });
                send({ id: LIMITS_ID, method: 'account/rateLimits/read' });
            } else if (initialized && message?.id === LIMITS_ID) {
                const limits = !message.error && buildCodexAppLimits(message.result, Date.now());
                if (limits) finish(limits);
                else fail();
            }
        }

        child.on('error', fail);
        child.on('close', () => {
            clearTimeout(killTimer);
            fail();
        });
        child.stdin.on('error', fail);
        child.stdout.on('error', fail);
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            if (settled) return;
            outputBytes += Buffer.byteLength(chunk);
            if (outputBytes > MAX_OUTPUT_BYTES) return fail();
            buffer += chunk;
            let end;
            while (!settled && (end = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, end);
                buffer = buffer.slice(end + 1);
                handleLine(line);
            }
        });
        send({ id: INIT_ID, method: 'initialize', params: { clientInfo: { name: 'nexus-ai-usage', version } } });
    });
}

module.exports = { findCodexCommand, fetchCodexLimits };
