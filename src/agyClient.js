'use strict';

const http = require('http');
const { execFile } = require('child_process');
const {
    parseUserStatus,
    parseProcessLines,
    parseNetstatListening,
    parseLsofListening,
    pickTrajectory,
    parseGeneratorMetadata,
    orderPorts,
    newestFirst,
    parseQuotaSummary
} = require('./parse');

const META = { metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' } };
const RPC_PATH = '/exa.language_server_pb.LanguageServerService/';
const DISCOVERY_BACKOFF_MS = 20000;
const REDISCOVER_MS = 5 * 60000;
// The summary goes through to Google, so ask at most this often.
const LIMITS_MIN_GAP_MS = 2 * 60000;
const LIMITS_RETRY_MS = 30000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const IS_WIN = process.platform === 'win32';

function run(cmd, args, timeout = 6000) {
    return new Promise((resolve) => {
        execFile(
            cmd,
            args,
            { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
            (err, stdout) => resolve(err && !stdout ? '' : stdout || '')
        );
    });
}

function rpc(port, csrf, name, body, timeout = 4000) {
    let deadline;
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body || {});
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                path: RPC_PATH + name,
                method: 'POST',
                // Keep the session token off any proxy configured for the extension host.
                agent: false,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'Connect-Protocol-Version': '1',
                    'X-Codeium-Csrf-Token': csrf
                }
            },
            (res) => {
                res.on('error', reject);
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    req.destroy();
                    return;
                }
                const chunks = [];
                let size = 0;
                res.on('data', (c) => {
                    size += c.length;
                    if (size > MAX_BODY_BYTES) {
                        reject(new Error('RESPONSE_TOO_LARGE'));
                        req.destroy();
                        return;
                    }
                    chunks.push(c);
                });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                    } catch (e) {
                        reject(e);
                    }
                });
            }
        );
        req.on('error', reject);
        deadline = setTimeout(() => {
            reject(new Error('TIMEOUT'));
            req.destroy();
        }, timeout);
        req.end(payload);
    }).finally(() => clearTimeout(deadline));
}

async function listProcesses() {
    if (IS_WIN) {
        const ps =
            "Get-CimInstance Win32_Process -Filter \"Name LIKE 'agy%' OR Name LIKE 'language_server%'\" | " +
            "ForEach-Object { [string]$_.ProcessId + ' ' + [string]([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() + ' ' + $_.CommandLine }";
        return parseProcessLines(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps]));
    }
    return parseProcessLines(await run('ps', ['-A', '-ww', '-o', 'pid=,etime=,args=']));
}

async function listeningPorts(pid, netstatCache) {
    if (IS_WIN) {
        if (!netstatCache.p) netstatCache.p = run('netstat', ['-ano', '-p', 'tcp'], 4000);
        return parseNetstatListening(await netstatCache.p, pid);
    }
    return parseLsofListening(await run('lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN'], 4000));
}

function firstOk(promises) {
    return new Promise((resolve) => {
        let pending = promises.length;
        if (pending === 0) return resolve(null);
        for (const p of promises) {
            p.then(
                (v) => {
                    if (v) resolve(v);
                },
                () => {}
            ).finally(() => {
                if (--pending === 0) resolve(null);
            });
        }
    });
}

const NOOP_LOG = { info() {}, warn() {} };

function sameConnection(previous, current) {
    return !!previous && previous.kind === current.kind && previous.pid === current.pid
        && previous.port === current.port && previous.csrf === current.csrf;
}

// Diagnostics never include the csrf token.
class AgyClient {
    constructor(log, getOfficialApi) {
        this.log = log || NOOP_LOG;
        this.getOfficialApi = getOfficialApi;
        this.server = null;
        this.discovering = null;
        this.lastFailedDiscovery = 0;
        this.ctxCache = null;
        this.limitsCache = null;
        this.others = [];
        this.lastDiscoveryAt = 0;
        this.diag = {
            lastOkAt: 0,
            lastError: '',
            processes: 0,
            probed: 0,
            lastDiscoveryAt: 0,
            limits: 'not asked yet'
        };
    }

    fail(msg) {
        if (this.diag.lastError !== msg) this.log.warn(`Antigravity: ${msg}`);
        this.diag.lastError = msg;
    }

    probe(port, csrf, pid, started) {
        return rpc(port, csrf, 'GetUserStatus', META, 2500).then(
            (data) => (data && data.userStatus ? { port, csrf, pid, started, data } : null),
            () => null
        );
    }

    // Other live agy servers (often a different account); read once, then cleared.
    takeOthers() {
        const o = this.others;
        this.others = [];
        return o;
    }

    rediscoverSoon() {
        this.lastDiscoveryAt = 0;
        this.lastFailedDiscovery = 0;
    }

    discover() {
        if (this.discovering) return this.discovering;
        if (Date.now() - this.lastFailedDiscovery < DISCOVERY_BACKOFF_MS) return Promise.resolve(null);
        this.discovering = (async () => {
            const procs = await listProcesses();
            const netstatCache = {};
            const plans = await Promise.all(
                procs.map(async (p) => ({ p, ...orderPorts(p.ports, await listeningPorts(p.pid, netstatCache)) }))
            );
            // One answer per process (its first port that replies), then the newest process wins.
            const perProc = plans.map(({ p, ports, verified }) => {
                if (!verified)
                    this.log.info(
                        `Antigravity: could not verify ports of pid ${p.pid}; using its command-line ports only`
                    );
                return firstOk(ports.map((port) => this.probe(port, p.csrf, p.pid, p.started)));
            });
            const probed = plans.reduce((n, x) => n + x.ports.length, 0);
            const all = newestFirst((await Promise.all(perProc)).filter(Boolean));
            const found = all[0] || null;
            this.diag.processes = procs.length;
            this.diag.probed = probed;
            this.diag.servers = all.length;
            this.diag.lastDiscoveryAt = Date.now();
            this.lastDiscoveryAt = Date.now();
            if (found) {
                const changed = !this.server || this.server.pid !== found.pid;
                this.server = { port: found.port, csrf: found.csrf, pid: found.pid };
                this.others = all
                    .slice(1)
                    .map((f) => parseUserStatus(f.data))
                    .filter(Boolean);
                if (changed)
                    this.log.info(
                        `Antigravity: connected to pid ${found.pid} on port ${found.port}${all.length > 1 ? ` (newest of ${all.length} servers)` : ''}`
                    );
            } else {
                this.lastFailedDiscovery = Date.now();
                this.fail(
                    procs.length
                        ? `found ${procs.length} process(es) but no port answered`
                        : 'no compatible legacy Antigravity process found'
                );
            }
            return found;
        })().finally(() => {
            this.discovering = null;
        });
        return this.discovering;
    }

    officialConnection() {
        const api = this.getOfficialApi?.();
        const port = api?.port;
        const csrf = api?.csrfToken;
        if (!Number.isInteger(port) || port < 1 || port > 65535 || typeof csrf !== 'string' || !csrf) return null;
        const url = api.client?.serverUrl;
        if (url && url !== `http://127.0.0.1:${port}` && url !== `http://localhost:${port}`) return null;
        return { kind: 'ide-extension', port, csrf };
    }

    async getProcessStatus() {
        if (this.server?.kind === 'ide-extension') this.server = null;
        let data = null;
        // Re-scan now and then: a newer agy session may be signed in to another account.
        if (this.server && Date.now() - this.lastDiscoveryAt > REDISCOVER_MS) {
            const found = await this.discover();
            if (found) data = found.data;
        }
        if (!data && this.server) {
            try {
                data = await rpc(this.server.port, this.server.csrf, 'GetUserStatus', META);
            } catch (e) {
                this.log.info(`Antigravity: port ${this.server.port} stopped answering (${e.message}); rediscovering`);
                this.server = null;
            }
        }
        return data?.userStatus ? data : (await this.discover())?.data;
    }

    async getStatus() {
        const official = this.officialConnection();
        let data;
        if (official) {
            data = await rpc(official.port, official.csrf, 'GetUserStatus', META).catch(() => null);
            if (!data?.userStatus) {
                this.server = null;
                this.fail('IDE extension endpoint did not return user status');
                return null;
            }
            if (!sameConnection(this.server, official)) this.server = official;
        } else {
            data = await this.getProcessStatus();
            if (!data) return null;
        }
        const parsed = parseUserStatus(data);
        if (parsed) {
            this.account = parsed.email.trim().toLowerCase();
            this.diag.lastOkAt = Date.now();
            this.diag.lastError = '';
        } else {
            this.server = null;
            this.fail('server answered without user status');
        }
        return parsed;
    }

    // Quota buckets per model group. Keeps the last good answer on errors.
    async getLimits(status) {
        const s = this.server;
        if (!s || !status) return null;
        const account = status.email.trim().toLowerCase();
        const now = Date.now();
        const cached = this.limitsCache;
        const c = cached?.account === account && sameConnection(cached.server, s) ? cached : null;
        if (c && now - c.at < (c.error ? LIMITS_RETRY_MS : LIMITS_MIN_GAP_MS)) {
            this.limitsFetchedAt = c.fetchedAt;
            this.limitsError = c.error;
            return c.result;
        }
        let result = c?.result || null;
        let fetchedAt = c?.fetchedAt || null;
        let error = '';
        try {
            const next = parseQuotaSummary(
                await rpc(s.port, s.csrf, 'RetrieveUserQuotaSummary', !c ? { forceRefresh: true } : {}, 8000)
            );
            if (next === null) error = 'Quota summary contains no usable groups';
            else {
                result = next;
                fetchedAt = Date.now();
            }
        } catch {
            error = 'Quota summary request failed';
        }
        this.limitsCache = { account, server: s, at: now, fetchedAt, result, error };
        this.limitsFetchedAt = fetchedAt;
        this.limitsError = error;
        this.diag.limits = error || 'available';
        return result;
    }

    async getContext(wsPaths, modelLabels) {
        const s = this.server;
        if (!s) return null;
        const traj = await rpc(s.port, s.csrf, 'GetAllCascadeTrajectories', {});
        const picked = pickTrajectory(traj && traj.trajectorySummaries, wsPaths);
        if (!picked) return null;
        const c = this.ctxCache;
        if (c && c.id === picked.id && c.time === picked.time && c.account === this.account && sameConnection(c.server, s))
            return c.result;
        const meta = await rpc(s.port, s.csrf, 'GetCascadeTrajectoryGeneratorMetadata', { cascade_id: picked.id });
        const result = parseGeneratorMetadata(meta, modelLabels, picked);
        this.ctxCache = { id: picked.id, time: picked.time, account: this.account, server: s, result };
        return result;
    }
}

module.exports = { AgyClient, rpc, MAX_BODY_BYTES };
