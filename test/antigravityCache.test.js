'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { AgyClient } = require('../src/agyClient');

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
