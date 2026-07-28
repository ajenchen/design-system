#!/usr/bin/env bash
# Codespaces onboarding; versions and governance snapshot were installed/verified by postCreateCommand.

cat <<'BANNER'

╭─────────────────────────────────────────────────────────────╮
│  Codespace ready                                             │
│  Node >=22.12.0 + Claude Code + Codex                      │
│  Exact npm snapshot + hooks-off governance check passed      │
╰─────────────────────────────────────────────────────────────╯

Choose either provider (both read the same governance SSOT):

  $ claude
  $ codex

No plugin or session-time install is required. Native hooks are fast
feedback; `npm run governance:check -- --hooks-off` + CI are authoritative.
Post-create ran the one provider-neutral setup entrypoint. Revalidate with:

  $ npm run setup:all

Product setup:

  $ npm run create-app <kebab-name>
  $ npm run storybook
  $ npm run setup:netlify

Netlify setup is Dashboard-only while the reviewed CLI candidate is blocked.
The command prints the manual steps and intentionally exits 2; no CLI is installed or invoked.

Netlify password (free edge-function path): add
STORYBOOK_BASIC_AUTH=user:password in Site configuration → Environment variables.
Credentials stay in Netlify and never enter Git.

See README.md and docs/01-first-time-setup.md.

BANNER
