'use strict';
const readline = require('node:readline');
const mode = process.env.NEXUS_FAKE_CLI || 'ok';
if (mode === 'exit') process.exit(2);
if (mode === 'hang') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); }
const lines = readline.createInterface({ input: process.stdin });
let initialized = false;
const respond = (request, response, subtype = 'success') => {
    const line = JSON.stringify({ type: 'control_response', response: { request_id: request.request_id, subtype, response, error: 'SECRET should never be logged' } }) + '\n';
    if (mode === 'chunks') { process.stdout.write(line.slice(0, 15)); setTimeout(() => process.stdout.write(line.slice(15)), 5); }
    else process.stdout.write(line);
};
lines.on('line', line => {
    const r = JSON.parse(line);
    if (mode === 'hang') return;
    if (mode === 'large') return process.stdout.write('x'.repeat(20000));
    if (mode === 'refuse') return respond(r, null, 'error');
    if (mode === 'wrong-id') return respond({ request_id: 'wrong' }, {});
    if (r.request?.subtype === 'initialize') { initialized = true; respond(r, {}); }
    else if (r.request?.subtype === 'get_usage' && initialized) respond(r, { rate_limits: { five_hour: { utilization: 0 } } });
    else process.exit(4);
});
