# Contributing a translation

Each language has one JSON catalog. `en.json` is the complete source of truth;
`zh-TW.json` provides Taiwan Traditional Chinese. Runtime strings and native
editor contributions live together in `messages`. No JavaScript changes or
runtime npm dependencies are needed to add a translation.

## Create a template

With the project's Node development environment installed:

```sh
npm run locales:new -- fr "Français"
```

This creates `locales/fr.json` with all message keys and empty translations. It
refuses to overwrite an existing file. For a regional locale, use a canonical
BCP 47 tag, for example `pt-BR`; the optional third argument is the editor locale
(defaults to lowercase, for example `pt-br`).

Fill in the file's metadata and every message:

- `locale`: canonical locale tag, matching the filename; also used by `Intl`.
- `nativeName`: the language's own name, used in the language selector.
- `vscodeLocale`: lowercase locale used for the native `package.nls.*.json` file.
- `aliases`: additional exact editor language tags, if needed. Taiwan Chinese
  accepts `zh-Hant` and `zh-Hant-TW`; Simplified Chinese is not mapped to it.
- `messages`: translate the values and preserve the keys.

Use the English catalog for source text and `message-context.json` for UI context.
Keep `{amount}`, `{provider}`, `{duration}` and other named variables exactly as
written. You may move them to fit your language's sentence order. Values are
inserted literally and are never interpreted as HTML. Do not add markup or
command links to translations.

## Validate and generate

```sh
npm run locales:build
npm run locales:check
npm run check
npm test
npm run test:ui
```

`locales:build` validates all catalogs and generates the language index, language
setting choices in `package.json`, and `package.nls*.json` files. Commit these
generated files with your translation. Never edit generated native language
files directly. `locales:check` verifies that generated files match their source.
The existing CI checks and packaging command also include localization checks.

Validation rejects duplicate JSON keys, missing or empty messages, unexpected
keys, incorrect metadata, ambiguous aliases, and mismatched or malformed named
variables. An incomplete template cannot be shipped. At runtime, missing or empty
translations still fall back to English per message.

Native command labels, settings and static view names follow the editor language.
The extension's **Language** choice controls the dashboard, quick settings and
status bar. Inspect both surfaces when reviewing a translation; native
contributions require testing in the target editor with its language pack.

Please include previews at a narrow sidebar width (280–360 px). Check source
details, settings, collapsed summaries, reset countdowns, unknown values, errors
and accessibility labels. Product/model names and unknown source labels stay in
their original form; changing language never changes a reading or its timezone.

## Updating messages

When adding or changing a feature, keep stable semantic keys, update `en.json`,
all shipped translations and `message-context.json`, then regenerate. Avoid
building sentences out of translated fragments. Use full-message named variables
for different word orders. Compact countdown templates use numbers with brief
units; relative ages use `Intl.RelativeTimeFormat`. If a new sentence needs
grammatical plural forms, implement explicit variants with `Intl.PluralRules`
rather than embedding English plural rules in a string.

`index.json` and native language files are generated. The remaining files are
maintained by contributors. Reviewed locale JSON catalogs, the generated index
and this guide are packaged; translator context notes stay in the repository.

## 台灣繁中補充

以 `en.json` 為基準，用 `npm run locales:new -- fr "Français"` 產生新語系範本，
填寫譯文後執行上述驗證與產生指令，連同產生檔一起提交 PR。

台灣用語統一為「用量、額度、狀態列、設定、重新整理、對話脈絡」。
「未知」不代表 0；「資料過期」與 Codex 的「最後記錄」是不同狀態。
保留 `{變數}`、產品名稱與來源模型名稱，不修改數值或時區。
