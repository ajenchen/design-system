#!/usr/bin/env bash
# Targeted regression coverage for the reserved infrastructure result:
# policy violations stay exit 2; malformed transport, unreadable authority, and parser faults use
# stderr marker GOVERNANCE_INTEGRITY plus exit 70.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_DIR="$SCRIPT_DIR/.."
REPO_ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

PASS=0
FAIL=0

expect_integrity() {
  local name="$1" payload="$2"
  shift 2
  local stdout_file stderr_file rc stderr_text
  stdout_file=$(mktemp)
  stderr_file=$(mktemp)
  set +e
  printf '%s' "$payload" | "$@" >"$stdout_file" 2>"$stderr_file"
  rc=$?
  set -e
  stderr_text=$(cat "$stderr_file")
  if [ "$rc" -eq 70 ] && [ ! -s "$stdout_file" ] \
    && printf '%s' "$stderr_text" | grep -qF 'GOVERNANCE_INTEGRITY:'; then
    printf '  PASS  %s\n' "$name"
    PASS=$((PASS + 1))
  else
    printf '  FAIL  %s (rc=%s)\n' "$name" "$rc"
    printf '%s\n' "$stderr_text" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
  fi
  rm -f "$stdout_file" "$stderr_file"
}

expect_silent() {
  local name="$1" payload="$2"
  shift 2
  local stdout_file stderr_file rc
  stdout_file=$(mktemp)
  stderr_file=$(mktemp)
  set +e
  printf '%s' "$payload" | "$@" >"$stdout_file" 2>"$stderr_file"
  rc=$?
  set -e
  if [ "$rc" -eq 0 ] && [ ! -s "$stdout_file" ] && [ ! -s "$stderr_file" ]; then
    printf '  PASS  %s\n' "$name"
    PASS=$((PASS + 1))
  else
    printf '  FAIL  %s (rc=%s)\n' "$name" "$rc"
    sed 's/^/    stdout: /' "$stdout_file"
    sed 's/^/    stderr: /' "$stderr_file"
    FAIL=$((FAIL + 1))
  fi
  rm -f "$stdout_file" "$stderr_file"
}

echo '=== malformed canonical input envelopes ==='
for hook_name in \
  check_dynamic_tailwind_class.sh \
  check_substantive_edit_approval_preflight.sh \
  check_chrome_header_avatar_canonical.sh \
  check_sidebar_menu_button_implicit_wrap.sh \
  check_ds_anchor_preflight.sh \
  check_field_family_invariants.sh \
  check_story_invariants.sh \
  check_opacity_token_usage.sh \
  check_full_story_visual_interaction_sweep.sh \
  check_overlay_open_focus_escape_probe.sh \
  check_escape_marker_abuse.sh \
  check_tailwind_wildcard_in_docs.sh \
  check_consumer_code_quality.sh \
  check_layout_space_magic_numbers.sh \
  check_tabs_content_chrome_body_double_gap.sh
do
  expect_integrity "$hook_name malformed JSON → 70" '{' \
    env GOVERNANCE_PROJECT_DIR="$REPO_ROOT" bash "$HOOK_DIR/$hook_name"
done
expect_integrity 'block_prototype_imports malformed JSON → 70' '{' \
  env GOVERNANCE_PROJECT_DIR="$REPO_ROOT" python3 "$HOOK_DIR/block_prototype_imports.py"
expect_integrity 'multiple JSON documents are not one envelope → 70' $'{}\n{}' \
  env GOVERNANCE_PROJECT_DIR="$REPO_ROOT" bash "$HOOK_DIR/check_dynamic_tailwind_class.sh"
expect_integrity 'NUL-bearing strings are rejected before shell extraction → 70' \
  '{"tool_name":"Write","tool_input":{"file_path":"apps/demo/src/App.tsx\u0000escape"}}' \
  env GOVERNANCE_PROJECT_DIR="$REPO_ROOT" bash "$HOOK_DIR/check_dynamic_tailwind_class.sh"

POISON_BIN="$TMP_ROOT/poison-bin"
mkdir -p "$POISON_BIN"
printf '#!/bin/sh\nexit 2\n' > "$POISON_BIN/grep"
chmod +x "$POISON_BIN/grep"
LAYOUT_POISON_PAYLOAD=$(jq -nc \
  '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:"apps/demo/src/App.tsx",content:"<div className=\"p-4\" />"}}')
expect_integrity 'layout matcher command failure → 70' "$LAYOUT_POISON_PAYLOAD" \
  env PATH="$POISON_BIN:$PATH" GOVERNANCE_PROJECT_DIR="$REPO_ROOT" \
  bash "$HOOK_DIR/check_layout_space_magic_numbers.sh"
TABS_POISON_PAYLOAD=$(jq -nc \
  '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:"apps/demo/src/App.tsx"}}')
expect_integrity 'tabs matcher command failure → 70' "$TABS_POISON_PAYLOAD" \
  env PATH="$POISON_BIN:$PATH" GOVERNANCE_PROJECT_DIR="$REPO_ROOT" \
  bash "$HOOK_DIR/check_tabs_content_chrome_body_double_gap.sh"

echo '=== authority, transcript, report, and read failures ==='
FIELD_REAL="$TMP_ROOT/field-real.tsx"
FIELD_LINK="$TMP_ROOT/field-link.tsx"
printf 'export const x = 1\n' > "$FIELD_REAL"
ln -s "$FIELD_REAL" "$FIELD_LINK"
FIELD_PAYLOAD=$(jq -nc --arg p "$FIELD_LINK" \
  '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:$p,content:"export const x = 2"}}')
expect_integrity 'field-family symlink target → 70' "$FIELD_PAYLOAD" \
  bash "$HOOK_DIR/check_field_family_invariants.sh"

MALFORMED_TRANSCRIPT="$TMP_ROOT/malformed.jsonl"
printf '{broken\n' > "$MALFORMED_TRANSCRIPT"
ANCHOR_PAYLOAD=$(jq -nc --arg t "$MALFORMED_TRANSCRIPT" \
  '{hook_event_name:"PreToolUse",tool_name:"Write",transcript_path:$t,tool_input:{file_path:"/repo/apps/demo/src/App.tsx",content:"export const App = () => <Sidebar />"}}')
expect_integrity 'DS-anchor malformed transcript → 70' "$ANCHOR_PAYLOAD" \
  env GOVERNANCE_PROJECT_DIR="$REPO_ROOT" bash "$HOOK_DIR/check_ds_anchor_preflight.sh"

APPROVAL_PAYLOAD=$(jq -nc --arg t "$MALFORMED_TRANSCRIPT" \
  '{hook_event_name:"PreToolUse",tool_name:"Edit",transcript_path:$t,tool_input:{file_path:"packages/design-system/src/components/Button/button.tsx",new_string:"export const x = 1"}}')
expect_integrity 'approval malformed transcript → 70' "$APPROVAL_PAYLOAD" \
  env GOVERNANCE_PROJECT_DIR="$REPO_ROOT" bash "$HOOK_DIR/check_substantive_edit_approval_preflight.sh"

MISSING_TABS="$TMP_ROOT/apps/demo/src/Missing.tsx"
TABS_PAYLOAD=$(jq -nc --arg p "$MISSING_TABS" \
  '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$p}}')
expect_integrity 'tabs PostToolUse missing target → 70' "$TABS_PAYLOAD" \
  bash "$HOOK_DIR/check_tabs_content_chrome_body_double_gap.sh"

CORPUS_BAD_TOKEN="$TMP_ROOT/corpus-token"
mkdir -p "$CORPUS_BAD_TOKEN/packages/design-system/src/tokens"
printf '{broken\n' > "$CORPUS_BAD_TOKEN/packages/design-system/src/tokens/utility-registry.json"
TOKEN_PAYLOAD=$(jq -nc \
  '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:"packages/design-system/src/components/Foo/foo.tsx",content:"className=\"opacity-30\""}}')
expect_integrity 'malformed canonical utility registry → 70' "$TOKEN_PAYLOAD" \
  env GOVERNANCE_CORPUS_ROOT="$CORPUS_BAD_TOKEN" GOVERNANCE_PROJECT_DIR="$REPO_ROOT" \
  bash "$HOOK_DIR/check_opacity_token_usage.sh"

CORPUS_BAD_STORY="$TMP_ROOT/corpus-story"
mkdir -p "$CORPUS_BAD_STORY/packages/governance/canonical"
mkdir -p "$CORPUS_BAD_STORY/packages/design-system/ds-canonical/references"
cp "$REPO_ROOT/packages/governance/canonical/providers.json" \
  "$CORPUS_BAD_STORY/packages/governance/canonical/providers.json"
jq '
  .components.Sidebar.antiPatterns[0].regex = "("
' "$REPO_ROOT/packages/design-system/ds-canonical/references/story-baseline-registry.json" \
  > "$CORPUS_BAD_STORY/packages/design-system/ds-canonical/references/story-baseline-registry.json"
STORY_PAYLOAD=$(jq -nc \
  '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:"packages/design-system/src/components/AppShell/bad.stories.tsx",content:"// @story-baseline: Sidebar#IconCollapse\nexport const X = () => <Sidebar><SidebarHeader><span>x</span></SidebarHeader></Sidebar>"}}')
expect_integrity 'R8 invalid registry regex → 70' "$STORY_PAYLOAD" \
  env GOVERNANCE_CORPUS_ROOT="$CORPUS_BAD_STORY" GOVERNANCE_PROJECT_DIR="$REPO_ROOT" \
  GOVERNANCE_PROVIDER=codex bash "$HOOK_DIR/check_story_invariants.sh"

CONSUMER_PROJECT="$TMP_ROOT/consumer-project"
CONSUMER_FILE="$CONSUMER_PROJECT/apps/demo/src/App.tsx"
mkdir -p "$(dirname "$CONSUMER_FILE")"
mkdir -p "$CONSUMER_PROJECT/node_modules/@qijenchen/design-system/src/tokens"
printf 'export const App = () => <div />\n' > "$CONSUMER_FILE"
printf '{broken\n' \
  > "$CONSUMER_PROJECT/node_modules/@qijenchen/design-system/src/tokens/utility-registry.json"
CONSUMER_PAYLOAD=$(jq -nc --arg p "$CONSUMER_FILE" \
  '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$p}}')
expect_silent 'consumer-quality ignores malformed mutable installed registry' "$CONSUMER_PAYLOAD" \
  env GOVERNANCE_CORPUS_ROOT="$REPO_ROOT" GOVERNANCE_PROJECT_DIR="$CONSUMER_PROJECT" \
  bash "$HOOK_DIR/check_consumer_code_quality.sh"
expect_integrity 'consumer-quality malformed authenticated registry → 70' "$CONSUMER_PAYLOAD" \
  env GOVERNANCE_CORPUS_ROOT="$CORPUS_BAD_TOKEN" GOVERNANCE_PROJECT_DIR="$CONSUMER_PROJECT" \
  bash "$HOOK_DIR/check_consumer_code_quality.sh"

OUTSIDE_PROJECT="$TMP_ROOT/outside-project"
BOUNDARY_PROJECT="$TMP_ROOT/boundary-project"
OUTSIDE_FILE="$OUTSIDE_PROJECT/apps/demo/src/App.tsx"
mkdir -p "$(dirname "$OUTSIDE_FILE")" "$BOUNDARY_PROJECT"
printf 'export const bad: any = 1\n' > "$OUTSIDE_FILE"
OUTSIDE_PAYLOAD=$(jq -nc --arg p "$OUTSIDE_FILE" \
  '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$p}}')
expect_integrity 'consumer-quality outside-project target → 70' "$OUTSIDE_PAYLOAD" \
  env GOVERNANCE_PROJECT_DIR="$BOUNDARY_PROJECT" bash "$HOOK_DIR/check_consumer_code_quality.sh"

SYMLINK_PROJECT="$TMP_ROOT/symlink-project"
SYMLINK_OUTSIDE="$TMP_ROOT/symlink-outside"
mkdir -p "$SYMLINK_PROJECT" "$SYMLINK_OUTSIDE/demo/src"
printf 'export const x = 1\n' > "$SYMLINK_OUTSIDE/demo/src/App.tsx"
ln -s "$SYMLINK_OUTSIDE" "$SYMLINK_PROJECT/apps"
SYMLINK_FILE="$SYMLINK_PROJECT/apps/demo/src/App.tsx"
FIELD_SYMLINK_PAYLOAD=$(jq -nc --arg p "$SYMLINK_FILE" \
  '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:$p,content:"export const x = 2"}}')
expect_integrity 'field-family ancestor symlink target → 70' "$FIELD_SYMLINK_PAYLOAD" \
  env GOVERNANCE_PROJECT_DIR="$SYMLINK_PROJECT" bash "$HOOK_DIR/check_field_family_invariants.sh"
TABS_SYMLINK_PAYLOAD=$(jq -nc --arg p "$SYMLINK_FILE" \
  '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$p}}')
expect_integrity 'tabs-body ancestor symlink target → 70' "$TABS_SYMLINK_PAYLOAD" \
  env GOVERNANCE_PROJECT_DIR="$SYMLINK_PROJECT" bash "$HOOK_DIR/check_tabs_content_chrome_body_double_gap.sh"

MANIFEST_PROJECT="$TMP_ROOT/manifest-project"
mkdir -p "$MANIFEST_PROJECT/packages/design-system"
printf '{}\n' > "$MANIFEST_PROJECT/packages/design-system/ds-story-manifest.json"
REPORT_PAYLOAD=$(jq -nc \
  '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:"/tmp/audit-report.json",content:"{\"storyResults\":[]}"}}')
expect_integrity 'invalid full-story manifest → 70' "$REPORT_PAYLOAD" \
  env GOVERNANCE_PROJECT_DIR="$MANIFEST_PROJECT" \
  bash "$HOOK_DIR/check_full_story_visual_interaction_sweep.sh"

NO_APPS_PROJECT="$TMP_ROOT/no-apps-project"
mkdir -p "$NO_APPS_PROJECT"
ESCAPE_PAYLOAD=$(jq -nc \
  '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:"/repo/apps/demo/src/App.tsx",content:"// @ds-misuse-allow: documented exception"}}')
expect_integrity 'escape-marker unavailable repository scan root → 70' "$ESCAPE_PAYLOAD" \
  env GOVERNANCE_PROJECT_DIR="$NO_APPS_PROJECT" bash "$HOOK_DIR/check_escape_marker_abuse.sh"

echo
printf 'Results: %s PASS, %s FAIL\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
