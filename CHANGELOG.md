# AI Usage changelog

## 0.1.18 — 2026-11-18 (Preview)

- Preserve standard Claude windows when the structured limit list only reports
  a model-specific window.
- Include a source-reported Fable limit next to Enterprise spend in the Claude
  status bar summary and collapsed card.

## 0.1.17 — 2026-11-18 (Preview)

- Remove the experimental Claude Desktop history and Windows usage-page readers,
  along with their diagnostics and display code.
- Document the same-host installation requirements and data limits for each
  provider in both READMEs.

## 0.1.16 — 2026-11-18 (Preview)

- When Claude Code is unavailable, use Windows accessibility to read quotas and
  reset text from the open Claude Desktop Usage page, including Fable when shown.
  Keep the existing history fallback for when the page cannot be read.

## 0.1.15 — 2026-11-18 (Preview)

- Describe Claude Desktop sample field names and types in Diagnostics, including
  when the newest sample differs from the one usable by the dashboard. The
  report omits account details and raw field values.

## 0.1.14 — 2026-11-18 (Preview)

- Show the source-reported Claude Fable weekly limit as a separate quota group
  in the dashboard and identify it in the status bar and hover.
- Explain the Claude Desktop sample refresh behavior and report the file's sample
  time and the displayed reading's source time in Diagnostics.

## 0.1.13 — 2026-11-18 (Preview)

- Read Claude Desktop's local plan usage history when Claude Code cannot start
  or its sign-in method does not provide subscription limits. Display the source
  sample time and label the data Last recorded.
- Check Windows MSIX and Roaming, macOS Application Support, and Linux XDG paths.
  Report Desktop history presence and workspace ambiguity in Diagnostics.

## 0.1.12 — 2026-11-18 (Preview)

- Fall back to the official standalone Claude Code CLI's native install path
  when the official editor extension's bundled CLI cannot start.
- Report bundled and standalone CLI presence in Diagnostics and explain how to
  resolve a missing CLI in the editor's extension host.
- Parse Claude's `model_scoped` weekly windows, including Fable when the source
  returns it. Team quotas are covered by synthetic CLI responses. Signed-in
  Team and Pro / Max comparisons are pending.

## 0.1.11 — 2026-11-18 (Preview)

- Fix broken README screenshots on the installed extension details page by
  rewriting their relative paths to HTTPS image URLs when packaging the VSIX.

## 0.1.10 — 2026-11-17 (Preview)

- Store translations in a Map to avoid dynamic property writes flagged by CodeQL.
- Normalize CRLF when checking generated locale files so Windows checkouts pass
  the same consistency check as Linux and macOS. Add regression coverage for both.

## 0.1.9 — 2026-11-17 (Preview)

- Derive language-selection test expectations from the registered catalogs so
  new translations no longer require JavaScript test changes. Run the real test
  suite with synthetic French and German catalogs as a regression check.
- Translate the application fallback for missing context model names while
  preserving actual provider labels and context values.
- Keep Claude errors as codes in the usage state and resolve display text from
  the language catalog, removing duplicate English error messages.

## 0.1.8 — 2026-11-17 (Preview)

- Review Taiwan Traditional Chinese against the pinned Taiwan.md terminology
  snapshot; align reset, template, view and conversation-context wording.
- Clarify that internal Antigravity Prompt/Flow credit fields have unverified
  semantics. No credit parsing, quota calculations or rendering behavior changes.

## 0.1.7 — 2026-11-17 (Preview)

- Add independently selectable English and Taiwan Traditional Chinese for the
  dashboard, quick settings, status bar, hover and accessibility labels. Follow
  the editor by default; keep native contributions tied to editor language.
- Preserve source identities, values, timestamps, selected windows and UI focus
  when switching language, without issuing provider queries.
- Add single-file JSON translation catalogs, a template generator, placeholder
  validation and generated native manifest translations. No runtime dependencies.

## 0.1.6 — 2026-11-17 (Preview)

- Default Antigravity's status summary to Gemini Models 5-hour / Weekly and
  independent Gemini 4 Argon Weekly. Add five validated per-window checkboxes,
  including optional Claude/GPT windows, in both dashboard and native settings.
- Keep the complete hover/dashboard independent of status selections. Omit the
  Antigravity summary if every window is deselected and ignore unselected-window
  warnings when rendering the selected summary.
- Explain limited/shared status bar space without inventing a fixed character cap
  or silently truncating quota/money values.
- Show old Codex events as neutral Last recorded data, preserve source timestamps,
  amounts and pending resets, and reserve Codex's yellow background for read errors.
  No provider query or credential handling changes.

## 0.1.5 — 2026-11-16 (Preview)

- Fix hidden providers affecting status-bar warning colors; hide the item when all
  providers are excluded. Keep missing core personal subscription windows Unknown.
- Continue Codex tail expansion until a rate-limit event is found, and keep missing
  or invalid Claude context token components Unknown instead of reporting zero.
- Validate workspace enum/boolean values before using timers or monitoring switches.
- Remove inactive account, alert, history and legacy view-state code and obsolete
  tests; preserve current source-reading coverage with focused regression tests.
- Allowlist VSIX contents, protect local secret files with Git ignores, preserve
  local notice links and remove misleading upstream repository metadata.
- Override the development-only minimatch dependency to 11.0.1 for
  GHSA-g3hv-75wg-m249; add npm development-tool updates to Dependabot.
- Record bounded security/code-review evidence and remaining live-account limits.

## 0.1.4 — 2026-11-16 (Preview)

- Reduce card header and body padding, quota-row height, card gaps and secondary
  section spacing. Preserve existing quota labels, resets, model scopes, error
  states, collapse controls and separate budget/context sections.
- Keep quota percentages at their previous font size; reduce provider icons and
  headline spend slightly instead of shrinking all text.
- Capture demo previews around actual panel content and record layout dimensions
  for consistent visual comparison. Existing data sources and policies are unchanged.

## 0.1.3 — 2026-11-16 (Preview)

- Keep Pro / Max subscription quotas primary in the status bar, expanded card
  and collapsed preview when extra spending is also present. Show extra usage
  as a separate budget and preserve Enterprise's spend-first presentation.
- Preserve source-provided personal 5-hour, weekly and model-specific resets;
  the Enterprise monthly rule never assigns personal reset dates.
- Give legacy model-scoped windows readable labels. Keep reported windows with
  invalid or missing percentages visible as Unknown instead of dropping them.
- Add artificial Pro / Max regression coverage for both CLI usage formats,
  optional/unsupported extra spending, stale data, collapse and narrow panels.
  Personal account live comparison remains unverified.

## 0.1.2 — 2026-11-16 (Preview)

- Add the official Enterprise monthly reset policy, confirmed against the user's
  personal Usage screen: first of the month at 00:00 UTC (08:00 Asia/Taipei).
- Clearly label calculated policy dates instead of claiming the CLI returns them;
  provider timestamps take precedence and source-only behavior remains selectable.
- Pin each derived reset to the usage reading's month. An expired cached reading
  stays stale/pending with its original dollar spend, never auto-zeroed.
- Preserve explicit non-monthly source periods and do not apply the rule to other
  plans or unsupported money formats. No organization key or cloud service added.

## 0.1.1 — 2026-11-16 (Preview)

- Restore compact provider cards with AG / CC / CX badges, inline progress bars,
  per-window reset countdowns, and persistent collapse state.
- Restore status bar hover usage charts with unambiguous Argon group names.
- Keep Enterprise account spend and Context in separate visual sections; retain
  source-provided Antigravity credits and model labels without extra queries.
- Put verbose source/reset metadata in an optional disclosure, and retain keyboard
  focus and disclosure state during automatic updates.
- Keep 0.1.0 authentication, money and freshness semantics; unknown reset remains
  unknown rather than inferring a billing date.

## 0.1.0 — 2026-11-16 (Preview)

- Independent extension, command, view, settings and cache identities.
- Antigravity Gemini Models, Claude and GPT models, and Gemini 4 Argon remain
  distinct; no pool inference from equal percentages or reset times.
- Official Claude Code CLI usage transport, Enterprise spend parsing and shared
  host cache/lease. No direct Claude credential-file reader or model prompts.
- Explicit missing, error and stale states. Elapsed resets retain observations.
- One monitoring status bar and detailed panel; context is separate and optional.
- Preserved MIT notices, reproducible development-tool lockfile, unit/browser
  tests, and isolated VSIX packaging. No account switching or cloud service.

The entries below are the original Quota Nexus history. Source baseline:
`4e229eb0330ca939086f14d288e04b04e5d40d54` (package 1.2.8), compared with
Open VSX 1.2.10. This preview is not an upstream release.

---

# Changelog

## [1.2.8] - 2026-10-15

### Added
- **Antigravity 5-hour and weekly limits.** Antigravity now shows both limits for each model group (Gemini, Claude), the same numbers as Antigravity's **View Usage**: on the dashboard, in the status bar hover, and in the status bar itself (each group shows its tighter limit). Nexus asks the local agy server at most every 2 minutes. If agy does not report them, you see one value per pool as before.
- **Smart alternate-account suggestion banner.** When the active Antigravity account runs low on quota, Quota Nexus checks your saved account snapshots and suggests switching to an account with healthy quota (e.g. 100% available) with a 1-click **Switch now** button.
- **Token breakdown for the context window.** Hover a context meter to see input, cache read, thinking and output tokens.
- **Quota drain velocity.** Hover a limit to see how fast it is being used (e.g. `↓ 12%/hr`) next to the run-out forecast.
- **Saved accounts priority reordering.** Move other Antigravity accounts up and down with priority rankings (`#1`, `#2`) to customize your fallback order in the switch list.
- **Pace marker.** A tick on each limit bar shows how much of the time window has passed, so you can see if you are using it faster than it resets.

### Changed
- **Cleaner dashboard.** Each card has a product tile, one info line and its plan. Open cards show one row per limit (bar, percent, time to reset). Collapsed cards show every limit in a tidy two-column grid with small bars.
- **Clearer names.** "Gemini" and "Claude" replace "Gem" and "Cl/GPT" on the dashboard and in the status bar.
- **Status colours no longer depend on the theme.** Bars are blue when fine, amber when tight and red when low, with a warning icon, in every theme.
- The "Used / Left" column header and the pace marker follow the **Percent mode** setting.
- New README screenshots of the dashboard (open and collapsed) and the hover.

### Fixed
- **No more limits from the wrong account.** Right after a switch, agy could still report the previous account's 5-hour and weekly numbers. Nexus now asks agy for fresh numbers when the account changes, and ignores any that do not match the account's own quota.
- Codex windows reported as 299 or 10079 minutes now read **5-hour** and **Weekly** instead of "299-min" and "10079-min".
- The context meter shows the full window size again (for example `162.4K / 1M`).

## [1.2.7] - 2026-10-15

### Changed
- **Easier account switching.** "Sign Out and Switch" runs `/logout` in agy, then opens a fresh agy on its sign-in menu and starts Google sign-in for you. After you pick the account in the browser, **Paste Code** sends Google's code from the clipboard straight to agy. Only text shaped like a Google sign-in code is pasted, and it is never stored or logged. Quota Nexus still never reads, stores or moves sign-in tokens.

### Fixed
- "Resets now" instead of "Resets in now" when a reset time has just passed.
- **The dashboard follows the account you switched to.** After a switch, the old agy server can keep running, still signed in to the old account, and Quota Nexus kept reading it. It now uses the newest agy server, looks again after a sign-in and every 5 minutes, and shows accounts on other running agy servers as "Other Antigravity accounts" with their live quota.

## [1.2.6] - 2026-10-15

### Fixed
- Clearer wording in `used` mode. A quota with nothing used says "Nothing used yet" instead of "Full", which read like "used up". A passed reset time says "likely back to 0% used" (or "100% left" in `left` mode). The hover's Resets column says "not used".

### Changed
- New README screenshots of the dashboard and the settings panel.

## [1.2.5] - 2026-10-14

### Added
- `quotaNexus.antigravity.enable`: turn Antigravity tracking off. Quota Nexus then stops looking for the Antigravity server, and its card, hover section, other accounts and alerts go away.
- `quotaNexus.antigravity.showInStatusBar`: hide Antigravity quota from the status bar but keep it in the hover and dashboard.
- **Toggle Used / Left** command. The "Show used instead" link in the hover now switches in one click instead of opening Settings.

- **Settings in the dashboard.** The gear opens every setting right in the panel, grouped like VS Code Settings, with readable labels. A tool's switches grey out while that tool is off. The title-bar gear opens it too (**Quota Nexus: Quick Settings**).

### Fixed
- **Claude Code limits no longer get rate-limited (HTTP 429).** Windows and reloads now share one result instead of each asking. After a 429, Nexus waits 5, 10, 20, then up to 30 minutes (or what Anthropic's `Retry-After` asks). Changing settings no longer forces a request, and the Refresh button asks at most once a minute.
- While limits cannot be fetched, the last values stay on screen, marked with their age.

### Changed
- **One row of dashboard icons.** The dashboard's own header (name, bell, eye, refresh, gear) is gone; those actions now sit once in the view's title bar. The bell and eye change to show when alerts are snoozed or emails are masked. Switch account, Toggle Used / Left, Diagnostics and All Settings are in the "..." menu.
- **Settings are grouped** into General, Status Bar, Alerts, Antigravity, Claude Code and Codex. Each tool has the same switches in the same order: Enable, Show In Status Bar, Show Context Window.
- Dropdowns show readable labels (for example "1 minute" instead of `60000`).
- Renamed for consistency: `claudeCode.showInNavBar` and `codex.showInNavBar` are now `showInStatusBar`, and `contextWindow.showAntigravity` is now `antigravity.showContextWindow`. Values you set move over automatically on first start.

## [1.2.4] - 2026-10-14

### Fixed
- The 24-hour chart in the dashboard follows Percent Mode: in `used` mode the line rises as you use quota, matching the bars.

### Changed
- New README screenshots of the hover, the context window and the dashboard.

## [1.2.3] - 2026-10-14

### Added
- **Percent Mode setting** (`quotaNexus.display.percentMode`): show quota as `used` (default) or `left`. `used` matches the Claude Code and Codex screens. Alerts and colours still work on what is left.
- The hover and dashboard show both numbers, for example `57% (43% left)`, so they are easy to compare with each tool's own screen.
- Compact and minimal status bar formats mark each number with ↑ (used) or ↓ (left).
- A "Show left instead" link in the hover opens the setting.
- The context window follows Percent Mode too (for example `13% used (87% left)`), with an arrow in the status bar.

### Changed
- **Numbers show what is used by default again**, for all three tools. 1.2.2 showed what is left. Set Percent Mode to `left` to keep that.
- Tools with data are shown first. "Antigravity not detected" and idle Codex move to short notes at the bottom of the hover, and the Antigravity notice moves below the other cards in the dashboard.
- The context window hover shows **Used** tokens and **From cache**, instead of the confusing "Input tokens 2" (the new, uncached part).

### Fixed
- **Faster first view.** Each tool shows as soon as its own data is ready. Claude Code and Codex (read in milliseconds) no longer wait for the slower Antigravity server search or the Claude limits request. The first refresh starts right away instead of after 1 second.
- Antigravity started after VS Code is found within seconds, not at the next timed refresh.
- While you use Antigravity, its quota refreshes every 30 seconds (it used to wait for the full refresh interval).
- Countdowns and "Updated ..." redraw every minute between refreshes (no extra reads or network).
- While the first Antigravity search is running, the hover and dashboard say "Looking for Antigravity..." instead of "not detected".
- `auto` context mode shows every session used in the last 15 minutes, each tagged (for example `AG 3%↑ · CC 18%↑`), so using Claude Code and Antigravity side by side no longer flips between them. With one active session it stays short.
- In `auto` mode the status bar now switches to the session you are actually using. A session counts as active the moment its token count changes, because Antigravity reports its last-active time late.
- Coming back to VS Code after a minute away (for example from the Antigravity IDE) now refreshes right away, instead of waiting for the full refresh interval.
- The context window in the status bar now updates live while Claude Code, Codex or Antigravity is working. Before, nonstop log writes kept delaying the update until the next timed refresh (up to 5 minutes).
- README badges now use a working Marketplace badge service (the old one was retired).

## [1.2.2] - 2026-10-14

### Changed
- **Every percentage now shows what is left**, for all three tools. Claude Code and Codex used to show "used" while Antigravity showed "left". The status bar, hover table and dashboard now all count down, matching the yellow and red warnings. Descriptive labels say "left" after each tool.
- **Idle Codex is hidden.** If Codex has not run for 7 days, its limits and context leave the status bar, and its stale numbers no longer raise alerts or colour the status bar. The dashboard still shows the card, marked Idle, with when it was last used.

## [1.2.1] - 2026-10-14

### Fixed
- Antigravity pool names and order no longer flip between refreshes ("GPT-OSS / Claude" vs "Claude / GPT-OSS"). This also keeps each pool's history and alert state in one place.
- The 24-hour chart stays hidden until it has at least 2 hours of data, instead of drawing a stray dash.
- Claude Code and Codex colours no longer turn grey in themes that map chart colours to grey.
- Estimated Codex limits show `~` in the status bar too (for example `Codex: ~0%`).
- Antigravity model ids show as readable names (for example `gemini-3.8-flash-n` is now "Gemini 3.8 Flash").

### Changed
- The Claude Code card has a "Show 5-hour and weekly limits" button that turns the opt-in on after a consent dialog.
- README now has screenshots, install steps for VS Code and Open VSX, and badges.
- Clearer Marketplace description and more search keywords (usage limits, rate limits, token usage, AI usage).
- License holder is now "Quota Nexus" (was a leftover from 1.0).

## [1.2.0] - 2026-10-14

### Changed
- Renamed to **Quota Nexus** (extension ID `quota-nexus.quota-nexus`). Settings moved from `antigravityNexus.*` to `quotaNexus.*`, and commands to `quotaNexus.*`.
- The context window setting `contextWindow.display` now takes `codex` and `all` (replaces `both`).
- A workspace's own session wins only if it was active in the last 12 hours. Otherwise the newest session is shown, so old sessions no longer show stale context.

### Added
- **Codex support.** Shows rate limits, plan and context window from the local Codex logs, with no token and no network.
- **Run-out forecast** per quota, from your recent burn rate.
- **24-hour history chart** per quota (7 days kept).
- **Alerts for Claude Code and Codex limits**, plus a hint toward an Antigravity pool that still has room.
- **Snooze alerts** for 1 hour (bell button, alert button or command).
- **Diagnostics** output channel and the "Show Diagnostics" command.
- Each Antigravity pool lists the models that share it.
- `/compact` tips when a context window passes 80%.

### Security
- Replies from the local Antigravity server and from `api.anthropic.com` are capped (5 MB and 1 MB).
- The Antigravity session token is sent only to ports its own process is confirmed to listen on.
- All numbers and text from servers and logs are type-checked and range-checked before use.
- Build tool pinned to `@vscode/vsce@4.0.0`. CI and CodeQL workflows pin every action to a commit.
- Added `SECURITY.md` with a private reporting process.

## [1.1.0] - 2026-10-14

### Changed
- Quota now comes only from the local Antigravity server. No Google tokens, no OAuth client secret, no remote Google API calls.
- Account switching is a guided flow through Antigravity's own sign-out and sign-in. The extension never reads, decrypts, writes or deletes any sign-in credential.
- Other accounts show their last-seen quota, marked "likely full" once their reset time has passed.
- Claude Code limits are opt-in, read-only, and never refresh or rewrite the token.
- Theme-aware dashboard that updates in place, with a strict Content Security Policy.
- Saved accounts from 1.0.0 are not carried over.

### Added
- Low-quota and reset notifications, status bar colors, account labels, macOS and Linux support, pause polling when unfocused.

### Removed
- Credential Manager helper, DPAPI decryption, Python and SQLite access, force-killing `agy.exe`, "Smart switch on low quota".

### Fixed
- Extension host freezes, overlapping refreshes, workspace matching, weekly values copied from 5-hour values, unescaped emails.

## [1.0.0] - 2026-10-09

- First release.
