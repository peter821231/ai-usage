'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { AgyClient } = require('../src/agyClient');

test('uses the active IDE endpoint without process credentials and invalidates quota cache when its session changes', async () => {
    let token = 'fixture-first-session';
    let statusCode = 200;
    const requests = [];
    const server = http.createServer((req, res) => {
        const method = req.url.split('/').at(-1);
        requests.push(method);
        if (req.headers['x-codeium-csrf-token'] !== token || statusCode !== 200) {
            res.writeHead(statusCode === 200 ? 403 : statusCode);
            return res.end();
        }
        const data = method === 'GetUserStatus'
            ? { userStatus: { email: 'fixture@example.invalid' } }
            : { response: { groups: [{ displayName: 'New pool', buckets: [{ displayName: 'Weekly', remainingFraction: 0.45 }] }] } };
        res.end(JSON.stringify(data));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const port = server.address().port;
        const api = { port, csrfToken: token, client: { serverUrl: `http://127.0.0.1:${port}` } };
        const client = new AgyClient(undefined, () => api);
        client.discover = () => assert.fail('A ready IDE endpoint should own the current account');

        const status = await client.getStatus();
        assert.ok(status);
        assert.equal(client.server.kind, 'ide-extension');
        const first = await client.getLimits(status);
        assert.equal(first[0].windows[0].remainingPct, 45);
        assert.deepEqual(await client.getLimits(await client.getStatus()), first);
        assert.deepEqual(requests, ['GetUserStatus', 'RetrieveUserQuotaSummary', 'GetUserStatus']);

        api.csrfToken = token = 'fixture-second-session';
        assert.deepEqual(await client.getLimits(await client.getStatus()), first);
        assert.equal(requests.at(-1), 'RetrieveUserQuotaSummary');
        statusCode = 503;
        assert.equal(await client.getStatus(), null);
        assert.equal(client.server, null);
        assert.match(client.diag.lastError, /endpoint did not return user status/);
        assert.doesNotMatch(JSON.stringify(client.diag), /fixture/);

        api.client.serverUrl = `https://example.invalid:${port}`;
        client.getProcessStatus = async () => ({ userStatus: { email: 'legacy@example.invalid' } });
        assert.equal((await client.getStatus()).email, 'legacy@example.invalid');
        assert.equal(requests.length, 6);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('successful quota summaries replace cached pools while failed refreshes keep the last reading', async () => {
    let failed = false;
    let response = {
        groups: [{ displayName: 'Gemini 4 Argon', buckets: [{ displayName: 'Weekly', remainingFraction: 0.93 }] }]
    };
    const server = http.createServer((_req, res) => {
        if (failed) {
            res.writeHead(500);
            return res.end();
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ response }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const client = new AgyClient();
        client.server = { pid: 1, port: server.address().port, csrf: 'fixture' };
        const first = await client.getLimits({ email: 'fixture' });
        const acquired = client.limitsFetchedAt;
        assert.equal(first[0].name, 'Gemini 4 Argon');
        client.limitsCache.at = 0;
        failed = true;
        const second = await client.getLimits({ email: 'fixture' });
        assert.deepEqual(second, first);
        assert.equal(client.limitsFetchedAt, acquired);
        assert.ok(client.limitsError);
        // Different source identity must never reuse the previous identity's cached data.
        assert.equal(await client.getLimits({ email: 'other' }), null);

        failed = false;
        response = {
            groups: [
                { displayName: 'Gemini Models', buckets: [{ displayName: 'Weekly', remainingFraction: 0.6 }] },
                { groupId: 'new-pool', displayName: 'New model pool', buckets: [{ window: '3600s' }] }
            ]
        };
        const current = await client.getLimits({ email: 'fixture' });
        assert.deepEqual(current.map(({ name }) => name), ['Gemini Models', 'New model pool']);
        assert.deepEqual(current[1].windows[0], {
            id: 'new-pool-3600s', name: '3600s', remainingPct: null, resetTime: null
        });
        assert.equal(client.limitsError, '');

        client.limitsCache.at = 0;
        response = { groups: [{ buckets: 'new unsupported format' }] };
        assert.deepEqual(await client.getLimits({ email: 'fixture' }), current);
        assert.ok(client.limitsError);

        client.limitsCache.at = 0;
        response = { groups: [] };
        assert.deepEqual(await client.getLimits({ email: 'fixture' }), []);
        assert.equal(client.limitsError, '');
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
