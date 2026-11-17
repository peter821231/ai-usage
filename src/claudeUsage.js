'use strict';

// Protocol shape informed by Claude Usage Ultra, Wei Xu (MIT); see notices.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const text = (v) => (typeof v === 'string' ? v.trim().slice(0, 120) : '');

function resetTime(value) {
    let ms;
    if (finite(value)) ms = value < 1e11 ? value * 1000 : value;
    else if (typeof value === 'string' && value.trim())
        ms = /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) * (Number(value) < 1e11 ? 1000 : 1) : Date.parse(value);
    return finite(ms) && ms > 0 && ms < 8.64e15 ? new Date(ms).toISOString() : null;
}

function money(raw) {
    if (
        !object(raw) ||
        !Number.isSafeInteger(raw.amount_minor) ||
        raw.amount_minor < 0 ||
        !Number.isInteger(raw.exponent) ||
        raw.exponent < 0 ||
        raw.exponent > 6 ||
        !/^[A-Z]{3}$/.test(raw.currency)
    )
        return null;
    return {
        minor: raw.amount_minor,
        exponent: raw.exponent,
        currency: raw.currency,
        amount: raw.amount_minor / 10 ** raw.exponent
    };
}

function parseSpend(rate) {
    if (object(rate.spend)) {
        const s = rate.spend;
        const used = money(s.used);
        const limit = money(s.limit);
        const validPair = used && limit && used.currency === limit.currency && used.exponent === limit.exponent;
        return {
            used: used?.amount ?? null,
            limit: validPair || !used ? (limit?.amount ?? null) : null,
            currency: used?.currency || limit?.currency || null,
            remaining: validPair ? (limit.minor - used.minor) / 10 ** used.exponent : null,
            usedPct: validPair && limit.minor > 0 ? (used.minor / limit.minor) * 100 : null,
            enabled: typeof s.enabled === 'boolean' ? s.enabled : null,
            status: validPair ? 'available' : 'unsupported',
            resetAt: resetTime(s.resets_at),
            issue: validPair ? '' : 'Money amount, scale, currency or limit is missing or inconsistent',
            format: 'spend',
            period: text(s.period) || null
        };
    }
    if (object(rate.extra_usage)) {
        const s = rate.extra_usage;
        // Older CLI schema defines credits as USD cents; accept only explicit scale/currency.
        const used = money({
            amount_minor: s.used_credits,
            exponent: s.decimal_places,
            currency: s.currency
        });
        const limit = money({
            amount_minor: s.monthly_limit,
            exponent: s.decimal_places,
            currency: s.currency
        });
        const pair = used && limit;
        return {
            used: used?.amount ?? null,
            limit: limit?.amount ?? null,
            currency: used?.currency || limit?.currency || null,
            remaining: pair ? (limit.minor - used.minor) / 10 ** used.exponent : null,
            usedPct: pair && limit.minor > 0 ? (used.minor / limit.minor) * 100 : null,
            enabled: typeof s.is_enabled === 'boolean' ? s.is_enabled : null,
            status: pair ? 'available' : 'unsupported',
            resetAt: resetTime(s.resets_at),
            issue: pair ? '' : 'Legacy money scale or currency is not provided',
            format: 'extra_usage',
            period: text(s.period) || null
        };
    }
    return null;
}

function parseUsage(raw, fetchedAt = Date.now()) {
    if (object(raw) && raw.rate_limits_available === false && !object(raw.rate_limits)) {
        return {
            fetchedAt,
            plan: text(raw.subscription_type),
            available: false,
            windows: [],
            spend: null
        };
    }
    if (!object(raw) || !object(raw.rate_limits)) throw new Error('unsupported-payload');
    const rate = raw.rate_limits;
    const windows = [];
    const push = (id, label, value, reset) => {
        windows.push({
            id,
            name: label,
            usedPct: finite(value) && value >= 0 ? value : null,
            resetAt: resetTime(reset)
        });
    };
    if (Array.isArray(rate.limits)) {
        for (const [index, w] of rate.limits.entries()) {
            if (!object(w)) continue;
            const kind = text(w.kind) || 'limit';
            const scope = text(w.scope?.model?.display_name);
            const scopeId = text(w.scope?.model?.id) || scope;
            const label = /session|five_hour/.test(kind) ? '5-hour' : /weekly|seven_day/.test(kind) ? 'Weekly' : kind;
            push(`${kind}:${scopeId}:${index}`, scope ? `${label} · ${scope}` : label, w.percent, w.resets_at);
        }
    }
    if (!windows.length) {
        for (const [key, label] of [
            ['five_hour', '5-hour'],
            ['seven_day', 'Weekly'],
            ['seven_day_opus', 'Weekly · Opus'],
            ['seven_day_sonnet', 'Weekly · Sonnet'],
            ['seven_day_oauth_apps', 'Weekly · OAuth apps']
        ]) {
            if (object(rate[key])) push(key, label, rate[key].utilization, rate[key].resets_at);
        }
    }
    const spend = parseSpend(rate);
    if (!windows.length && !spend && raw.rate_limits_available !== false) throw new Error('unsupported-payload');
    return {
        fetchedAt,
        plan: text(raw.subscription_type),
        available: raw.rate_limits_available !== false,
        windows,
        spend
    };
}

module.exports = { parseUsage, parseSpend, money, resetTime };
