# AI Usage

**English** | [繁體中文（台灣）](README.zh-TW.md)

A local quota monitor for Antigravity, Claude subscription quotas,
Enterprise account spend, and Codex.
Derived from [Quota Nexus](https://github.com/praveen2git/quota-nexus), with Claude
usage-query code adapted from Claude Usage Ultra. See [LICENSE](LICENSE) and
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

This preview has a separate extension ID, commands, settings and cache:
`nexus-ai-usage-local.nexus-ai-usage`. It does not replace or migrate Quota Nexus.
It is unofficial and is not affiliated with Google, Anthropic or OpenAI.

## 0.1.20 preview

AI Usage now fetches Codex account limits from the official Codex App Server
even when no conversation is active. It checks once a minute by default and
also supports manual refresh. Local session records are available as a
fallback. [Changelog](CHANGELOG.md)

## UI preview

Turn on **Settings → Status Bar → Compact mode** to show a single quota gauge.
Hover over it for grouped limits, status dots, larger progress segments, and
reset times. Click the gauge to open the dashboard.

![AI Usage 0.1.19 compact status bar and grouped hover with demo data for Antigravity, Claude Enterprise, and Codex](docs/images/v0.1.19-compact-hover-demo.png)

The screenshot comes from 0.1.19 and uses demo values. The maintainer verified
the larger segments and compact mode in the IDE on 2026-11-18 using the
Traditional Chinese interface.

## Earlier UI preview — 0.1.6

The status bar, dashboard and hover below are maintainer-provided screenshots from
Antigravity IDE on **2026-11-17**. Values are account-specific snapshots, not live
readings or fixed budgets. The settings preview is separately labelled synthetic
**DEMO DATA**; it does not represent a signed-in Pro / Max account test.

### Selected status bar summary

![Actual 0.1.6 status bar showing Gemini 5-hour and weekly, independent Argon weekly, Claude Enterprise spend and Codex limits](docs/images/v0.1.6-status-bar.png)

Gemini **5-hour / Weekly** and **Argon Weekly** are selected by default. Claude/GPT
can be added in settings; the complete limits remain in the hover and dashboard.

### Detailed dashboard

| Antigravity | Claude Enterprise and Codex |
| --- | --- |
| ![Actual Antigravity card with separate Gemini Models, Claude and GPT models, and Gemini 4 Argon groups](docs/images/v0.1.6-antigravity.png) | ![Actual Claude Enterprise account budget and Codex Last recorded cards](docs/images/v0.1.6-claude-codex.png) |

Enterprise spending, remaining budget and the labelled monthly reset rule are
separate from conversation context. Codex **Last recorded** keeps the original
event time without treating normal idle time as a yellow warning; read failures
still warn.

<details>
<summary>Full hover: all monitored limits, including those omitted from the status bar</summary>

![Actual full hover with independent model groups, usage bars, account spending and source times](docs/images/v0.1.6-hover.png)

</details>

<details>
<summary>Choose status bar windows — synthetic settings preview</summary>

![Synthetic 0.1.6 settings preview labelled DEMO DATA, with Gemini 5-hour, Gemini Weekly and Argon Weekly selected](docs/images/v0.1.6-settings-demo.png)

Use **Settings → Antigravity** to select individual windows. These choices affect
only the summary, not provider polling or the full dashboard.

</details>

See [preview provenance and UI highlights](https://github.com/peter821231/nexus-ai-usage/blob/main/docs/ui-previews.md) for image sources,
the changes illustrated and instructions to regenerate the synthetic settings view.

## Interface language

Open **Quick Settings → General → Language** to choose **Follow Editor** (default),
**English**, or **繁體中文（台灣）**. The dashboard, quick settings and status bar
switch immediately, including source details and accessibility labels. This lets
an English editor show usage in Taiwan Traditional Chinese.

Command names, native editor settings and static view names follow the editor's
display language. Language selection does not change the timezone, usage values
or source timestamps, and does not query providers. Missing translations fall
back to English. See the [translation contribution guide](locales/README.md) to
generate a template and add another language.

## Features

- **Antigravity:** Gemini Models 5-hour and weekly; Claude and GPT models 5-hour
  and weekly; Gemini 4 Argon weekly. Full group identity is preserved even when
  percentages and reset times happen to match.
- **Claude Pro / Max and Team (fixture-tested):** source-provided 5-hour, weekly and model-scoped quotas
  with their own resets. Subscription quotas stay primary in the status bar,
  expanded card and collapsed preview, even with extra usage enabled. Additional
  spending is a separate budget section; missing values stay **Unknown**.
- **Claude Enterprise:** actual account spend, source-provided limit, remaining amount and
  budget percentage through the installed official Claude Code CLI. The limit
  is never hard-coded to USD 200. The display describes account usage; it does
  not claim a separate Claude-Code-only bill.
- **Codex:** account rate limits and reset times from the official Codex App
  Server, including while Codex is idle. Local session logs provide a fallback.
- Compact AG / CC / CX provider cards with inline quota bars and reset countdowns;
  cards can collapse and retain their state after refresh or webview reload.
  Reduced header padding, row heights and section spacing keep more usage visible
  in the sidebar while retaining quota labels, resets and separate budget/context.
  Full source times and absolute resets remain in each card’s **Source & reset
  details** disclosure. Model labels and internal Antigravity credit fields are read without
  extra queries. The meaning and scale of those credit fields have not been
  verified against the official Usage UI; they are not confirmed quota balances.
- The status bar hover groups quota windows with a status dot, a segmented
  progress bar, the selected percentage and the reset time.
- Antigravity's status summary defaults to **Gemini Models 5-hour / Weekly** and
  independent **Gemini 4 Argon Weekly**. Five boolean choices let you include or
  omit each window; these affect only the summary, not the full hover or dashboard.
- One status bar summary and a detailed panel. Percentages default to **used**;
  the panel also shows **remaining**. Conversation context is an optional,
  separate detail section, off by default.
- Missing readings are **Unknown**. Failed queries retain the last successful
  reading and show an error. Stale readings stay visible with their source time.
  Passing a reset time never rewrites an observation to 0% or 100%.
- Absolute reset times, countdowns and timezone are explicit. For this verified
  Enterprise monthly plan, when the CLI omits a reset, the next UTC calendar-month
  boundary is calculated from the reading time and labelled **official monthly
  rule**. It is not represented as a reset timestamp returned by the CLI.

No account switching, sign-in flow, additional providers, cloud service,
telemetry, burn-rate prediction or notifications are enabled in this version.

## Requirements and limits

Install AI Usage in the IDE where you use the providers' official integrations.
Each source must be reachable from the same extension host as AI Usage. Windows,
WSL, SSH and containers each have their own files, processes and sign-in state.
For example, a WSL workspace needs the integrations and data in its WSL host.
The IDE must support VS Code extensions and satisfy the version range in
[`package.json`](package.json).

| Provider | Requirements in the AI Usage extension host |
|---|---|
| Antigravity | Run and sign in to Antigravity IDE or its official editor integration. AI Usage needs a reachable Antigravity language server that can return quota data. |
| Claude | Install the official Claude Code extension (`anthropic.claude-code`) in the IDE host and sign in to the Claude account or Team workspace you want to monitor. Standalone Claude Desktop sign-in is outside the supported setup. |
| Codex | Sign in to ChatGPT with the official Codex extension or CLI in this host. AI Usage looks for the extension's bundled executable or a Codex executable on the host's `PATH`. Session fallback reads the default `~/.codex/sessions` directory. |

## Install and compare

1. Download `nexus-ai-usage-<version>.vsix` from [GitHub Releases](https://github.com/peter821231/nexus-ai-usage/releases) or build it with `npm run package` into `artifacts/`.
2. In the target IDE, run **Extensions: Install from VSIX…** and select the file.
3. Open **AI Usage** in the Activity Bar and run **Show Diagnostics** to check the local sources.
4. Compare values and reset times with each provider's official Usage view. Provider caches and the query interval can delay new readings.

## Sources, credentials and freshness

| Provider | Source | Freshness |
|---|---|---|
| Antigravity | Local loopback quota summary; existing process discovery and local session token | Check about once a minute; summary queries are cached for two minutes. Mark stale after five minutes without a successful summary. Time is labelled **Fetched**, not a backend event timestamp. |
| Claude | Official Claude Code extension's bundled CLI or same-host native CLI fallback | Queries run about every five minutes. Manual requests are at least a minute apart and respect failure backoff. Mark data stale after ten minutes. Multiple windows in the same host share a query lease and cache. |
| Codex | Official Codex App Server with local session events as a fallback | Query at the refresh interval (one minute by default) and on manual refresh. A manual refresh can query Codex while the other providers are still checking. |

If the bundled Claude Code CLI cannot start, AI Usage can try the official native
install location in the same host (`~/.local/bin/claude` on macOS/Linux or
`%USERPROFILE%\.local\bin\claude.exe` on Windows). **Diagnostics** reports the
presence of both executables. See [Claude Code installation troubleshooting](https://code.claude.com/docs/en/troubleshoot-install).

The monitor does not read Claude credential files or request tokens/Cookies.
The official CLI owns authentication. It is queried with `initialize` and
`get_usage`, without sending a model prompt, in the extension's own storage
folder, with an empty strict MCP configuration and no session persistence.
The control protocol is internal and can change with CLI updates. Global CLI
settings and authentication still belong to the official tool.

For Codex, AI Usage queries `account/rateLimits/read` over local standard input
and output. The official executable manages sign-in, and the query runs without
a conversation or model request. AI Usage retains the quota fields needed for
display. See the [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt).

AI Usage can use the official extension's bundled CLI on macOS with Apple
silicon or Intel. On Windows, it uses the bundled executable or `codex.exe`
on `PATH`.

In the Codex card, **Source & reset details** shows **Fetched** for successful
App Server reads. AI Usage reads the local session logs when a live reading is
unavailable or when context display is enabled. A fallback reading shows the
original **Source event** time. **Show Diagnostics** reports App Server
failures even when the panel can display a session reading.

Antigravity discovery does access its local session token in memory, and local
log parsing reads file tails to extract the needed events. It would be
incorrect to describe the extension as never touching sensitive local data.
Raw responses, credentials, conversation contents and account identifiers are
not written to monitor diagnostics, cache or fixtures. The shared Claude cache
contains only normalized usage fields and timestamps in extension storage.
The monitor does not bundle the official CLI.

Timeout, unavailable CLI, refused query, unsupported format, missing amount,
missing limit and unknown reset are distinct from a genuine zero. Money requires
known units and currency. Legacy `extra_usage` without an explicit currency and
scale is shown as unsupported, rather than assuming cents or USD. If the actual
CLI schema changes, check diagnostics and continue using the existing monitors
until the format is verified.

## Enterprise monthly reset

The [official consumption guide](https://support.claude.com/en/articles/14782391-claude-enterprise-consumption-guide)
says monthly spend caps reset at **00:00 UTC on the first of the month**. Confirmed
against an Enterprise account's personal Usage page (**08:00 GMT+8** in Asia/Taipei),
matching this rule.
This is independent of an invoice date or local midnight.

The default `claudeCode.enterpriseResetSchedule` is `monthlyUtc`, applying only
to valid Enterprise spend readings whose source does not report another period.
Set it to `unknown` for source-only behavior if a different account/plan does not
match this monthly rule. Other subscription plans are not assigned this reset.
A provider-supplied reset always takes precedence. The generated Admin API schema
also lists other periods, so this is not a claim that every Enterprise contract
has the same schedule. No Admin API key or new service is needed.

The derived reset belongs to the **reading's month**. An old November reading
still points to December 1 after that boundary passes and becomes stale/pending;
it does not silently advance to January or change spend to zero. A new source
query is needed to observe the next period's actual spend.

## Claude Pro / Max and Team subscriptions

The monitor uses the account signed in to the official Claude Code CLI. The
parser handles `five_hour` / `seven_day*`, `limits`, and the `model_scoped` list
of weekly model limits. The dashboard, collapsed card and status bar show Fable
when the CLI reports a distinct weekly Fable limit. The dashboard shows its
source-provided percentage and reset. Source-provided rows with
missing or invalid percentages remain visible as **Unknown**, distinct from 0%.
Only returned model-specific windows are shown; the monitor does not invent a
model quota or a USD 200 budget for a personal subscription.
Missing core 5-hour / Weekly windows for a recognized Pro / Max or Team plan are shown
as **Unknown**; model-specific windows are added only when the source reports them.

Personal subscription resets always come from the source. The Enterprise monthly
setting does not assign resets to personal quotas or extra spending. Optional
extra usage remains separate from subscription percentages and Context; an
unsupported money format does not prevent valid quota rows from displaying.

Synthetic responses cover Pro / Max with or without extra usage, and Team with
session, weekly all-model, and weekly Fable quotas. Verification against
signed-in Pro / Max or Team accounts is pending.

## Commands and settings

Commands: **Refresh Usage**, **Quick Settings**, **Open Settings**, **Toggle Used /
Remaining**, and **Show Diagnostics**, all under **AI Usage**.

Settings use only `nexusAiUsage.*`:

- `display.percentMode`: `used` or `left`.
- `display.language`: `auto` (follow editor), `en` or `zh-TW`.
- `display.timeZone`: `Asia/Taipei` (default) or `UTC`.
- `refresh.activeInterval`: 30 seconds, 1 minute, 2 minutes or 5 minutes.
- `refresh.pauseWhenUnfocused`: pause regular checks in the background.
- `context.show`: optional conversation-context section; off by default.
- `statusBar.show`, plus each provider's `enable` and `showInStatusBar`. When
  `showInStatusBar` is unset, the provider appears once quota or spend data is
  available. An explicit setting overrides automatic visibility.
- `statusBar.compact`: show only the quota gauge icon. Off by default.
- Under `antigravity.statusBar.*`, `geminiFiveHour`, `geminiWeekly` and `argonWeekly`
  are on by default; `claudeGptFiveHour` and `claudeGptWeekly` are off by default.
- `claudeCode.timeoutSeconds`: 15, 30, 45 (default) or 60 seconds.
- `claudeCode.enterpriseResetSchedule`: `monthlyUtc` (verified monthly UTC rule)
  or `unknown` (source-only). Rule-derived dates are visibly labelled.

Status bar markers: `~` stale, `!` error/unsupported money, `?` missing quota.
Only providers included in the status bar affect its warning background. Hiding
every provider hides the item; the hover still offers full monitored details.
The Antigravity summary includes the selected windows by name, including Unknown
values; deselecting all five omits Antigravity from the bar. Its hover and panel
still include all monitored windows, even ones omitted from the status bar.

Status bar space is shared with the IDE and other extensions. Width, font/zoom
and the other items determine what fits; this extension does not claim a fixed
character maximum or silently truncate values. Choose the summaries you need.
The hover includes every monitored limit. Its dots turn yellow at 75% used and
red at 90% used, and a white dot marks an unknown reading.
See [0.1.6 status-bar choices](docs/status-bar-0.1.6.md) for the exact settings and
the distinction between recorded Codex data and read failures.

Codex shows **Last recorded** for an old local event and preserves its original
values and timestamp. If the event's reset time has passed, the card shows
**Pending** and retains the observed usage. A Codex refresh error shows a warning
when the panel has to retain its previous reading or has no reading to display.

## Develop and verify

Use Node 22 and npm. All dependencies are development tools; the installed
extension has no npm runtime dependencies.

```sh
npm ci --ignore-scripts
npm run check
npm test
npx playwright install chromium --only-shell
npm run test:ui
npm run package
```

Chromium needs the platform's usual browser libraries. `test:ui` serves the actual
webview HTML/CSP, CSS and script on a temporary loopback port with a mocked VS
Code bridge and **artificial data**, not a logged-in browser profile. It checks
280/360/900-pixel widths, dark/light/forced-colors rendering, settings/refresh
messages, unknown values and safe text rendering. Demo screenshots are written
to ignored `artifacts/` and visibly labelled **DEMO DATA**.

The built VSIX is also in `artifacts/`. Packaging uses an allowlist of runtime
JavaScript, dashboard media, icons and notices. Agent documents, local credentials,
development tools, tests, reports and unrelated files stay outside the package.
Unused upstream account/history/forecast/notification helpers have been removed.
Build and test commands do not publish the extension to a marketplace. Pushing a
version tag (`v*`, matching `package.json` version) triggers the GitHub Actions
release workflow to verify checks, tests, UI tests, and attach the built `.vsix`
to a GitHub Release. Repository metadata points to this fork while original
upstream sources remain credited above.

The development-tool override for `minimatch` 11.0.1 addresses
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
It is not a runtime dependency. Package validation checks this override against
the actual VSIX contents. Dependabot tracks npm development tools and GitHub Actions.

## Repository map and review

- `src/`: extension host, source readers, usage normalization and status bar.
- `media/`: dashboard DOM and styles.
- `test/`: current runtime regression tests and synthetic protocol fixtures.
- `scripts/`: syntax, browser and local packaging checks.
- `docs/`: development notes ([development-notes.md](docs/development-notes.md)), status-bar reference, and review documentation.
- `images/`: inherited upstream reference screenshots, excluded from the VSIX.
- `artifacts/`: ignored local VSIX files and artificial preview output.

See [the security and code review](docs/review-2026-11-16.md) for scope, fixes,
dependency matching and remaining acceptance limits. Review outputs do not contain
credentials or raw provider responses.

Real-source integration was checked in WSL with Antigravity IDE 2.7.0 (VS Code
core 1.107.0) and official Claude Code extension 2.1.325. This does not substitute
for installing the VSIX in the IDE and comparing the current personal Usage page,
spend period and effective limit. No published marketplace release is implied.
