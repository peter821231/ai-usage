'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { AgyClient } = require('../src/agyClient');

test('failed summary refresh keeps last value and its original source acquisition time', async () => {
    let failed = false;
    const server = http.createServer((_req, res) => {
        if (failed) {
            res.writeHead(500);
            return res.end();
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(
            JSON.stringify({
                response: {
                    groups: [
                        { displayName: 'Gemini 4 Argon', buckets: [{ displayName: 'Weekly', remainingFraction: 0.93 }] }
                    ]
                }
            })
        );
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
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
