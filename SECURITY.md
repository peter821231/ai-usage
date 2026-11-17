# Security and data boundaries

This is an independent local preview derived from Quota Nexus. It has no public
security-reporting service. Report issues privately to the maintainer of your
copy; do not attach tokens, Cookies, credential files, raw CLI output or complete
session logs.

The official Claude CLI owns authentication. The monitor does not open Claude
credential files, perform sign-in, refresh tokens itself or send model prompts.
Antigravity discovery uses a local session token in memory to talk to loopback;
Codex and optional context readers inspect local log tails. The extension is not
an assertion that those sources are free of sensitive data.

Normalized Claude usage is cached in this extension's storage, with restrictive
file permissions where supported. Raw CLI stdout/stderr and account identifiers
are not persisted. Webview messages are allowlisted; setting updates are limited
to declared boolean/enum values. Display strings use text nodes or Markdown
escaping. The webview uses a nonce CSP and local media resources.

The Claude cache belongs to one extension host and is not account keyed. After
changing the official tool's login, confirm a successful new reading and its
Fetched time before treating cached usage as the new account's data. This preview
does not promise concurrent monitoring or isolation between multiple Claude logins
under the same OS user.

Workspace settings are validated against declared enum/boolean types on read as
well as on webview updates, preventing invalid timer values from becoming rapid
polling. The VSIX uses a runtime-file allowlist; local .env, credential folders,
tests and audit reports are excluded. A passing scan is bounded evidence, not a
guarantee that installed tools, OS permissions or provider protocols are secure.

Keep the original monitors available until the preview passes official-data
comparison. An unknown value, failed query or expired source is never treated as
zero. Internal provider protocols can change; diagnostics should show an error
instead of initiating a sign-in or requesting credentials.

The MIT licenses for original and adapted code are preserved in LICENSE and
THIRD-PARTY-NOTICES.md. The official Claude CLI is not redistributed.
