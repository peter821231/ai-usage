'use strict';

const { resetTime } = require('./claudeUsage');

// Official Enterprise monthly cap rule, also confirmed against this user's Usage page:
// https://support.claude.com/en/articles/14782391-claude-enterprise-consumption-guide
function nextMonthlyUtc(fetchedAt) {
    if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt) || fetchedAt <= 0) return null;
    const reading = new Date(fetchedAt);
    if (!Number.isFinite(reading.getTime())) return null;
    const next = Date.UTC(reading.getUTCFullYear(), reading.getUTCMonth() + 1, 1);
    return Number.isFinite(next) ? new Date(next).toISOString() : null;
}

function spendReset(data, policy = 'monthlyUtc') {
    const provided = resetTime(data?.spend?.resetAt);
    if (provided) return { resetAt: provided, resetBasis: 'provider' };
    const period = data?.spend?.period;
    const eligible =
        policy === 'monthlyUtc' &&
        data?.plan === 'enterprise' &&
        data.available !== false &&
        data.spend?.status === 'available' &&
        (!period || period === 'monthly');
    const derived = eligible ? nextMonthlyUtc(data.fetchedAt) : null;
    return { resetAt: derived, resetBasis: derived ? 'official-monthly-rule' : null };
}

module.exports = { nextMonthlyUtc, spendReset };
