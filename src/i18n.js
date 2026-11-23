'use strict';

const { createTranslator } = require('../media/i18n');
const bundles = require('../locales/index.json').map((locale) => require(`../locales/${locale}.json`));
const english = bundles.find((bundle) => bundle.locale === 'en');

function resolveLocale(requested = 'auto', editorLanguage = 'en') {
    const raw = requested === 'auto' ? editorLanguage : requested;
    const language = String(raw || 'en').toLowerCase();
    const exact = bundles.find((bundle) =>
        [bundle.locale, bundle.vscodeLocale, ...(bundle.aliases || [])].some((name) => name.toLowerCase() === language)
    );
    if (exact) return exact.locale;
    const baseLanguage = language.split('-')[0];
    const base = bundles.find((bundle) => bundle.locale === baseLanguage);
    if (base && baseLanguage !== 'zh') return base.locale;
    return 'en';
}

function createI18n(requested = 'auto', editorLanguage = 'en') {
    const locale = resolveLocale(requested, editorLanguage);
    const selected = bundles.find((bundle) => bundle.locale === locale);
    return createTranslator(selected, english.messages);
}

// Localize only the display projection, never parser output or the shared cache.
function localizeView(view, i18n) {
    const { t } = i18n;
    return {
        ...view,
        i18n: i18n.bundle,
        providers: view.providers.map((provider) => ({
            ...provider,
            source: t(provider.sourceKey || `source.${provider.id}`),
            error: provider.errorKey ? t(provider.errorKey) : provider.error,
            notice: provider.noticeKey ? t(provider.noticeKey) : provider.notice,
            plan: provider.plan === 'Unknown' ? t('common.unknown') : provider.plan,
            context: provider.context ? {
                ...provider.context,
                model: provider.context.modelKnown === false ? t('context.unknownModel') : provider.context.model
            } : provider.context,
            groups: provider.groups.map((group) => ({
                ...group,
                label: group.groupType ? t(`group.${group.groupType}`) : group.label,
                rows: group.rows.map((row) => ({ ...row, label: i18n.windowLabel(row) }))
            })),
            spend: provider.spend ? {
                ...provider.spend,
                title: t(provider.spend.titleKey),
                issue: provider.spend.issueKey ? t(provider.spend.issueKey) : provider.spend.issue
            } : provider.spend
        }))
    };
}

module.exports = { createI18n, resolveLocale, localizeView };
