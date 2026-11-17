'use strict';

// Pure formatting shared by the extension host and the CSP-restricted webview.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.NexusI18n = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    function createTranslator(bundle, fallbackMessages = {}) {
        const locale = bundle.locale;
        const messages = new Map(Object.entries(fallbackMessages));
        for (const [key, value] of Object.entries(bundle.messages))
            if (typeof value === 'string' && value.trim()) messages.set(key, value);
        const formatLocale = locale === 'en' ? 'en-GB' : locale;
        const t = (key, args = {}) => {
            const message = messages.get(key);
            if (typeof message !== 'string' || !message.trim()) throw new Error(`Missing translation: ${key}`);
            return message.replace(/\{(\w+)\}/g, (match, name) =>
                Object.hasOwn(args, name) ? String(args[name]) : match
            );
        };
        const unknown = () => t('common.unknown');
        const finite = (value) => typeof value === 'number' && Number.isFinite(value);
        const number = (value, options) => new Intl.NumberFormat(formatLocale, options).format(value);
        const percent = (value) => finite(value) ? `${number(Math.round(value * 10) / 10, { useGrouping: false, maximumFractionDigits: 1 })}%` : unknown();
        const money = (value, currency) => finite(value)
            ? `${currency || '?'} ${number(value, { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : unknown();
        const stamp = (value, zone = 'Asia/Taipei', options = { dateStyle: 'medium', timeStyle: 'short' }) =>
            value ? new Date(value).toLocaleString(formatLocale, { timeZone: zone, hourCycle: 'h23', ...options }) : unknown();
        function duration(iso, now, pending = false, rounding = 'ceil') {
            if (!iso) return unknown();
            if (pending) return t('reset.pending');
            const diff = Date.parse(iso) - now;
            if (!Number.isFinite(diff)) return unknown();
            if (diff <= 0) return t('time.now');
            const minutes = Math.max(1, Math[rounding](diff / 60000));
            const days = Math.floor(minutes / 1440);
            const hours = Math.floor((minutes % 1440) / 60);
            const mins = minutes % 60;
            return days ? t('duration.daysHours', { days: number(days), hours: number(hours) })
                : hours ? t('duration.hoursMinutes', { hours: number(hours), minutes: number(mins) })
                    : t('duration.minutes', { minutes: number(mins) });
        }
        function age(value, now) {
            if (!value) return t('source.noReading');
            const minutes = Math.max(0, Math.floor((now - value) / 60000));
            if (!minutes) return t('time.justNow');
            const [amount, unit] = minutes < 60 ? [minutes, 'minute']
                : minutes < 1440 ? [Math.floor(minutes / 60), 'hour'] : [Math.floor(minutes / 1440), 'day'];
            // Short units retain the existing compact English presentation.
            return new Intl.RelativeTimeFormat(locale, { style: 'narrow', numeric: 'always' }).format(-amount, unit);
        }
        function windowLabel(row, compact = false) {
            if (!row.windowType) return row.label;
            const name = t(`window.${row.windowType}${compact && !row.scope ? '.short' : ''}`);
            const scope = row.scope === 'OAuth apps' ? t('scope.oauthApps') : row.scope;
            return scope ? t('window.scoped', { window: name, scope }) : name;
        }
        return { locale, t, unknown, number, percent, money, stamp, duration, age, windowLabel, bundle: { locale, messages: Object.fromEntries(messages) } };
    }
    return { createTranslator };
});
