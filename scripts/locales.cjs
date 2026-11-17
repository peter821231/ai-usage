'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const localePattern = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const placeholders = (value) => [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
const json = (value) => JSON.stringify(value, null, 2) + '\n';

// JSON.parse alone silently accepts duplicate keys, including escaped key names.
function parseJson(source, name = 'JSON') {
    const value = JSON.parse(source);
    const tokens = source.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) || [];
    const stack = [];
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token === '{') stack.push(new Set());
        else if (token === '[') stack.push(null);
        else if (token === '}' || token === ']') stack.pop();
        else if (token.startsWith('"') && tokens[index + 1] === ':') {
            const key = JSON.parse(token);
            const keys = stack.at(-1);
            if (keys.has(key)) throw new Error(`${name}: duplicate key ${key}`);
            keys.add(key);
        }
    }
    return value;
}
const read = (relative) => parseJson(fs.readFileSync(path.join(root, relative), 'utf8'), relative);

function validateBundle(bundle, base) {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new Error('Invalid locale bundle');
    if (!localePattern.test(bundle.locale) || Intl.getCanonicalLocales(bundle.locale)[0] !== bundle.locale)
        throw new Error(`Invalid canonical locale: ${bundle.locale}`);
    if (typeof bundle.nativeName !== 'string' || !bundle.nativeName.trim()) throw new Error(`${bundle.locale}: missing nativeName`);
    if (typeof bundle.vscodeLocale !== 'string' || !localePattern.test(bundle.vscodeLocale) || bundle.vscodeLocale !== bundle.vscodeLocale.toLowerCase())
        throw new Error(`${bundle.locale}: invalid vscodeLocale`);
    if (!Array.isArray(bundle.aliases) || bundle.aliases.some((alias) => typeof alias !== 'string' || !localePattern.test(alias)))
        throw new Error(`${bundle.locale}: invalid aliases`);
    if (!bundle.messages || typeof bundle.messages !== 'object' || Array.isArray(bundle.messages))
        throw new Error(`${bundle.locale}: invalid messages`);
    const messages = bundle.messages;
    for (const key of Object.keys(messages))
        if (!Object.hasOwn(base.messages, key)) throw new Error(`${bundle.locale}: unknown message ${key}`);
    for (const [key, original] of Object.entries(base.messages)) {
        if (typeof messages[key] !== 'string' || !messages[key].trim())
            throw new Error(`${bundle.locale}: missing or empty message ${key}`);
        if (/[{}]/.test(messages[key].replace(/\{\w+\}/g, '')))
            throw new Error(`${bundle.locale}: invalid placeholder syntax in ${key}`);
        if (JSON.stringify(placeholders(messages[key])) !== JSON.stringify(placeholders(original)))
            throw new Error(`${bundle.locale}: placeholder mismatch in ${key}`);
    }
}

function generatedFiles() {
    const files = fs.readdirSync(path.join(root, 'locales')).filter((name) => name.endsWith('.json') && !['index.json', 'message-context.json'].includes(name));
    const bundles = files.map((name) => {
        if (!localePattern.test(name.slice(0, -5))) throw new Error(`Invalid locale filename: ${name}`);
        const bundle = read(`locales/${name}`);
        if (name !== `${bundle.locale}.json`) throw new Error(`Locale filename mismatch: ${name}`);
        return bundle;
    }).sort((a, b) => a.locale === 'en' ? -1 : b.locale === 'en' ? 1 : a.locale.localeCompare(b.locale, 'en'));
    const base = bundles.find((bundle) => bundle.locale === 'en');
    if (!base) throw new Error('Missing English catalog');
    const aliases = new Map();
    for (const bundle of bundles) {
        validateBundle(bundle, base);
        for (const alias of [bundle.locale, bundle.vscodeLocale, ...bundle.aliases]) {
            const key = alias.toLowerCase();
            if (aliases.has(key) && aliases.get(key) !== bundle.locale) throw new Error(`Ambiguous locale alias: ${alias}`);
            aliases.set(key, bundle.locale);
        }
    }
    const contexts = read('locales/message-context.json');
    for (const key of Object.keys(base.messages))
        if (typeof contexts[key] !== 'string' || !contexts[key].trim()) throw new Error(`Missing translator context: ${key}`);
    for (const key of Object.keys(contexts))
        if (!Object.hasOwn(base.messages, key)) throw new Error(`Unknown translator context: ${key}`);
    const pkg = read('package.json');
    const language = pkg.contributes.configuration.flatMap((group) => Object.entries(group.properties))
        .find(([key]) => key === 'nexusAiUsage.display.language')[1];
    language.enum = ['auto', ...bundles.map((bundle) => bundle.locale)];
    language.enumItemLabels = ['%manifest.setting.display.language.option.0%', ...bundles.map((bundle) => bundle.nativeName)];
    for (const [, key] of JSON.stringify(pkg).matchAll(/%([^%"\s]+)%/g))
        if (!Object.hasOwn(base.messages, key) || !key.startsWith('manifest.')) throw new Error(`Missing manifest message: ${key}`);
    const output = new Map([
        ['package.json', json(pkg)],
        ['locales/index.json', json(bundles.map((bundle) => bundle.locale))]
    ]);
    for (const bundle of bundles) {
        const filename = bundle.locale === 'en' ? 'package.nls.json' : `package.nls.${bundle.vscodeLocale}.json`;
        if (output.has(filename)) throw new Error(`Duplicate output: ${filename}`);
        output.set(filename, json(Object.fromEntries(Object.entries(bundle.messages).filter(([key]) => key.startsWith('manifest.')))));
    }
    return output;
}

function check() {
    for (const [file, expected] of generatedFiles())
        if (!fs.existsSync(path.join(root, file)) || fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n') !== expected)
            throw new Error(`${file} is out of date; run npm run locales:build`);
    console.log('Locale catalogs and generated manifest translations verified');
}
function build() {
    for (const [file, content] of generatedFiles()) fs.writeFileSync(path.join(root, file), content);
    console.log('Generated locale index, language choices and manifest translations');
}
function newLocale(locale, nativeName, vscodeLocale = String(locale).toLowerCase()) {
    if (!localePattern.test(locale) || Intl.getCanonicalLocales(locale)[0] !== locale || !nativeName?.trim())
        throw new Error('Usage: npm run locales:new -- fr "Français" [vscode-locale]');
    if (!localePattern.test(vscodeLocale) || vscodeLocale !== vscodeLocale.toLowerCase())
        throw new Error('The VS Code locale must be a lowercase language tag');
    const bundle = { locale, nativeName, vscodeLocale, aliases: [], messages: Object.fromEntries(Object.keys(read('locales/en.json').messages).map((key) => [key, ''])) };
    fs.writeFileSync(path.join(root, 'locales', `${locale}.json`), json(bundle), { flag: 'wx' });
    console.log(`Created locales/${locale}.json. Translate every empty message before running locales:build.`);
}
if (require.main === module) {
    try {
        const [command, ...args] = process.argv.slice(2);
        if (command === 'build') build();
        else if (command === 'check') check();
        else if (command === 'new') newLocale(...args);
        else throw new Error('Expected check, build or new');
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
module.exports = { parseJson, validateBundle, generatedFiles, check, build };
