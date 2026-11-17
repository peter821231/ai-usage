'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const GAP_MS = 5 * 60000;
const LEASE_MS = 2 * 60000;
const SAFE_ERRORS = new Set([
    'cli-unavailable',
    'cli-exited',
    'timeout',
    'cancelled',
    'request-refused',
    'output-too-large',
    'unsupported-payload'
]);

async function read(file) {
    try {
        if ((await fs.stat(file)).size > 256 * 1024) return null;
        const v = JSON.parse(await fs.readFile(file, 'utf8'));
        if (!v || v.version !== 1 || !Number.isFinite(v.checkedAt) || !Number.isFinite(v.retryAt)) return null;
        if (v.data && (!Number.isFinite(v.data.fetchedAt) || !Array.isArray(v.data.windows))) return null;
        return v;
    } catch {
        return null;
    }
}

async function refreshClaude({ storageDir, query, force = false, signal, now = () => Date.now() }) {
    await fs.mkdir(storageDir, { recursive: true, mode: 0o700 });
    const cachePath = path.join(storageDir, 'claude-usage-v1.json');
    const lockPath = path.join(storageDir, 'claude-usage.lock');
    const cached = await read(cachePath);
    const due = !cached || (now() >= cached.retryAt && now() - cached.checkedAt >= (force ? 60000 : GAP_MS));
    if (!due) return cached;
    const owner = randomUUID();
    try {
        await fs.mkdir(lockPath, { mode: 0o700 });
    } catch (error) {
        if (error.code !== 'EEXIST') throw new Error('storage-unavailable');
        // Remove only the expired owner's unique file, then the empty directory.
        // Competing reclaimers cannot recursively remove a fresh owner's lease.
        try {
            const owners = await fs.readdir(lockPath);
            const stat = await fs.stat(lockPath);
            if (now() - stat.mtimeMs > LEASE_MS) {
                if (owners.length <= 1) {
                    if (owners.length) await fs.unlink(path.join(lockPath, owners[0]));
                    await fs.rmdir(lockPath);
                    return refreshClaude({ storageDir, query, force, signal, now });
                }
            }
        } catch {
            /* another window acquired or released the lock */
        }
        return cached || { version: 1, data: null, checkedAt: null, error: '', pending: true };
    }
    const ownerPath = path.join(lockPath, owner);
    let temp;
    try {
        await fs.writeFile(ownerPath, owner, { mode: 0o600, flag: 'wx' });
        if ((await fs.readdir(lockPath)).length !== 1) return cached;
        // Re-read after acquiring: another window may have published between our read and mkdir.
        const latest = await read(cachePath);
        if (latest && now() < latest.retryAt) return latest;
        if (latest && now() - latest.checkedAt < (force ? 60000 : GAP_MS)) return latest;
        let data = latest?.data || cached?.data || null;
        let error = '';
        let failures = 0;
        try {
            data = await query(signal);
        } catch (e) {
            error = SAFE_ERRORS.has(e.code || e.message) ? e.code || e.message : 'query-failed';
            failures = (latest?.failures || cached?.failures || 0) + 1;
        }
        if (signal?.aborted) return latest || cached;
        const checkedAt = now();
        const next = {
            version: 1,
            data,
            checkedAt,
            error,
            failures,
            retryAt: error ? checkedAt + Math.min(GAP_MS * 2 ** Math.min(failures - 1, 4), 3600000) : checkedAt
        };
        // A paused process whose lease was replaced cannot publish over the new owner's result.
        if ((await fs.readFile(ownerPath, 'utf8').catch(() => '')) !== owner) return await read(cachePath);
        temp = `${cachePath}.${owner}.tmp`;
        await fs.writeFile(temp, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
        await fs.rename(temp, cachePath);
        return next;
    } finally {
        if (temp) await fs.rm(temp, { force: true }).catch(() => {});
        try {
            await fs.unlink(ownerPath);
            await fs.rmdir(lockPath);
        } catch {
            /* replaced or already released */
        }
    }
}

module.exports = { refreshClaude, GAP_MS, LEASE_MS };
