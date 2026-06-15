#!/bin/bash
# 2026-06-11 repoint:check_addon_subdir_ship.sh 已合併進 check_storybook_addon_packaging.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_storybook_addon_packaging.sh(P0 BLOCKER,2026-05-28 beta.27 anchor)
#
# Hook 規則(PreToolUse,Edit / Write / MultiEdit):
#   Scope: file_path 命中 /(\.storybook|storybook-config)/addons/<addonName>/<MainFile>.(ts|tsx)$
#          (addon 主檔。子資料夾檔 utils/x.ts / *.stories.tsx 等不在 scope)
#   Reads: tool_input.new_string // tool_input.content (CONTENT)
#   BLOCKER(exit 2 + stderr "ADDON SUBDIR SHIP BLOCKER"):
#          CONTENT 含 `from './<subdir>/...'` relative-subdir import,
#          但 dirname(file_path)/<subdir> 在真實檔案系統不存在 → block + cite missing dir。
#   Escape: CONTENT 含 `@addon-subdir-skip:` → silent。
#   Non-block(silent exit 0):
#          - 非 Edit/Write/MultiEdit tool
#          - 非 addon 主檔 path
#          - import 的 subdir 真的存在(correctly shipped)
#          - 只 same-dir import(`from './constants'` 無 subdir 段)
#
# IMPORTANT: hook 對 dirname(file_path)/<subdir> 做真實 filesystem `[ -d ]` 檢查,
# 因此本 test 把 file_path 指到 TMP_DIR 內真實建立的 addon 結構,藉建/不建 subdir
# 控制 missing-vs-shipped。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_storybook_addon_packaging.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Real addon dir on disk(hook 用 [ -d ] 查真實 path)。
# addon 主檔住這:$ADDON/<MainFile>.ts ;子資料夾依 case 建或不建。
ADDON="$TMP_DIR/packages/storybook-config/addons/ds-devmode"
mkdir -p "$ADDON"
PREVIEW="$ADDON/preview.ts"
MANAGER="$ADDON/manager.tsx"

run_hook() {
  # $1=file_path  $2=content  $3=tool_name(default Write)  $4=content_field(default content)
  local file_path="$1"; local content="$2"
  local tool="${3:-Write}"; local field="${4:-content}"
  local payload
  if [ "$field" = "new_string" ]; then
    payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg t "$tool" \
      '{hook_event_name:"PreToolUse", tool_name:$t, tool_input:{file_path:$fp, new_string:$c}}')
  else
    payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg t "$tool" \
      '{hook_event_name:"PreToolUse", tool_name:$t, tool_input:{file_path:$fp, content:$c}}')
  fi
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected BLOCK exit=2 + '$needle', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

NEEDLE="ADDON SUBDIR SHIP BLOCKER"

echo "=== check_addon_subdir_ship tests ==="

# ─────────────────────────────────────────────────────────────────────
# POSITIVE cases — SHOULD trigger the BLOCKER (exit 2)
# ─────────────────────────────────────────────────────────────────────

# P1. addon 主檔 import 從 ./utils/* 但 utils/ dir 不存在 → BLOCK
#     (真 beta.27 anchor:ds-devmode 搬家漏帶 utils/ 6 files)
rm -rf "$ADDON/utils"
run_hook "$PREVIEW" "import { measure } from './utils/dom-geometry';
export const decorators = [];"
expect_block "P1. import ./utils/* but utils/ absent → BLOCK" "$NEEDLE"

# P2. manager.tsx import 從 ./components/* 但 components/ 不存在 → BLOCK
#     (probe over-NARROW: hook 不該只認 utils/ 一個固定名;任意缺漏 subdir 都要抓)
rm -rf "$ADDON/components"
run_hook "$MANAGER" "import { Panel } from './components/Panel';
addons.register('ds-devmode', () => {});"
expect_block "P2. import ./components/* (non-utils name) but absent → BLOCK [M34 over-narrow guard]" "$NEEDLE"

# P3. content via new_string field(Edit / MultiEdit 用 new_string 而非 content)→ BLOCK
rm -rf "$ADDON/utils"
run_hook "$PREVIEW" "import { drift } from './utils/token-drift-detector';" "Edit" "new_string"
expect_block "P3. Edit tool via new_string, missing subdir → BLOCK" "$NEEDLE"

# ─────────────────────────────────────────────────────────────────────
# NEGATIVE cases — SHOULD stay silent (exit 0)
# ─────────────────────────────────────────────────────────────────────

# N1. utils/ dir 真實存在(correctly shipped)→ silent
#     [M34 over-broad guard:子 dir 有一起 ship 時不可 false-positive block]
mkdir -p "$ADDON/utils"
: > "$ADDON/utils/dom-geometry.ts"
run_hook "$PREVIEW" "import { measure } from './utils/dom-geometry';
export const decorators = [];"
expect_pass_silent "N1. import ./utils/* AND utils/ shipped → silent [M34 over-broad guard]"

# N2. 只 same-dir import(`from './constants'` 無第二層 subdir 段)→ silent
#     (near-miss:./constants 是同層檔不是子資料夾,不該被當 subdir import 誤抓)
run_hook "$PREVIEW" "import { ADDON_ID } from './constants';
import { PANEL_ID } from './constants';"
expect_pass_silent "N2. same-dir './constants' import (no subdir) → silent [near-miss]"

# N3. @addon-subdir-skip escape comment present(即使 subdir 缺)→ silent
rm -rf "$ADDON/utils"
run_hook "$PREVIEW" "// @addon-subdir-skip: utils intentionally resolved via tsconfig paths
import { measure } from './utils/dom-geometry';"
expect_pass_silent "N3. @addon-subdir-skip escape + missing subdir → silent"

# N4. 非 addon 主檔 path(DS component tsx)→ out of scope → silent
#     (near-miss:同樣有 ./utils/* 缺漏 import,但 path 不在 addons/ scope)
DS_TSX="$TMP_DIR/packages/design-system/src/components/Foo/Foo.tsx"
mkdir -p "$(dirname "$DS_TSX")"
run_hook "$DS_TSX" "import { x } from './utils/helper';"
expect_pass_silent "N4. non-addon path (DS component) → out of scope → silent [near-miss]"

# N5. addon 子資料夾檔本身(utils/x.ts,非主檔)→ regex 要求主檔在 addonName 同層,
#     子層檔不命中 [^/]+/<Main>\.ts$ → out of scope → silent
SUBFILE="$ADDON/utils/dom-geometry.ts"
mkdir -p "$(dirname "$SUBFILE")"
run_hook "$SUBFILE" "import { y } from './sub/missing';"
expect_pass_silent "N5. addon subdir file (not main file) → out of scope → silent [near-miss]"

# N6. 非 Edit/Write/MultiEdit tool(Read)→ silent
run_hook "$PREVIEW" "import { measure } from './utils/dom-geometry';" "Read"
expect_pass_silent "N6. tool=Read → skip → silent"

# N7. addon 主檔但只 package import(無 relative subdir)→ silent
run_hook "$PREVIEW" "import React from 'react';
import { addons } from '@storybook/manager-api';"
expect_pass_silent "N7. only package imports, no relative subdir → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0
