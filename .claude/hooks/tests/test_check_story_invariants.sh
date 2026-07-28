#!/bin/bash
# Tests for check_story_invariants.sh(Cluster A merge dispatcher,2026-05-10)
#
# Hook 規則:Pre/PostToolUse + Edit|Write|MultiEdit + *.stories.tsx
# 內部 10 rules:
#   R1 anatomy(PreToolUse;raw hand-craft item/table/loading/overlay/dismiss → exit 2)
#   R2 slot_split(PreToolUse;WithStartIcon+WithEndIcon / Default+AllVariants 拆 → exit 2)
#   R3 category(PreToolUse;trait-based — spec/frontmatter cases由 companion focused test cover)
#   R4 title_canonical(PreToolUse;non-canonical English name: → P1 neutral context)
#   R5 name_jargon(PostToolUse;reads disk;L<n> layer / canonical / 中英夾雜 jargon)
#   R6 description_jargon(PostToolUse;TS generic in description: → neutral context)
#   R7 story_baseline_reference(PreToolUse;wrap Sidebar/ChromeHeader/DataTable 無 baseline marker → context)
#   R8 story_archetype_registry(PreToolUse;讀 canonical references/story-baseline-registry.json;
#      block-severity antiPattern → P0 record_worst 2,2026-06-02 升 P0)
#   R9 handcraft_overlay_header(PreToolUse;手刻浮層/header chrome → exit 2)
#   R10 link_canonical(PreToolUse;link hover drift → neutral context)
#
# Test 重點:silent skip / 各 rule fire / allowlist marker escape。
# R3 spec/frontmatter 與 trusted after-image stale-disk 回歸在 test_check_story_category.sh。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_story_invariants.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

run_hook() {
  local event="$1"; local tool="$2"; local file_path="$3"; local content="$4"
  local payload
  CURRENT_EVENT="$event"
  if [ "$tool" = "Edit" ]; then
    payload=$(printf '%s' "$content" | jq -Rs \
      --arg ev "$event" --arg tn "$tool" --arg fp "$file_path" \
      '{hook_event_name:$ev, tool_name:$tn, tool_input:{file_path:$fp, new_string:.}}')
  else
    payload=$(printf '%s' "$content" | jq -Rs \
      --arg ev "$event" --arg tn "$tool" --arg fp "$file_path" \
      '{hook_event_name:$ev, tool_name:$tn, tool_input:{file_path:$fp, content:.}}')
  fi
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$TMP_DIR" GOVERNANCE_PROVIDER=codex \
    GOVERNANCE_READ_ONLY=1 bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

run_raw() {
  local payload="$1"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$TMP_DIR" GOVERNANCE_PROVIDER=codex \
    GOVERNANCE_READ_ONLY=1 bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

run_raw_trusted() {
  local payload="$1"
  CURRENT_EVENT="PreToolUse"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" \
    | GOVERNANCE_PROJECT_DIR="$TMP_DIR" GOVERNANCE_PROVIDER=codex \
      GOVERNANCE_READ_ONLY=1 GOVERNANCE_WRITE_STATE_TRUST=runner-v1 \
      bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

run_raw_bounded() {
  local payload="$1"
  local input_file="$TMP_DIR/bounded-hook-input.json"
  CURRENT_EVENT="PreToolUse"
  printf '%s' "$payload" > "$input_file"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  python3 - "$HOOK" "$input_file" "$STDOUT" "$STDERR" "$TMP_DIR" <<'PY'
import os
import signal
import subprocess
import sys

hook, input_path, stdout_path, stderr_path, project_dir = sys.argv[1:]
environment = {
    **os.environ,
    "GOVERNANCE_PROJECT_DIR": project_dir,
    "GOVERNANCE_PROVIDER": "codex",
    "GOVERNANCE_READ_ONLY": "1",
}
with (
    open(input_path, "rb") as stdin,
    open(stdout_path, "wb") as stdout,
    open(stderr_path, "wb") as stderr,
):
    child = subprocess.Popen(
        ["bash", hook],
        stdin=stdin,
        stdout=stdout,
        stderr=stderr,
        env=environment,
        start_new_session=True,
    )
    try:
        exit_code = child.wait(timeout=20)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait()
        exit_code = 124
sys.exit(exit_code)
PY
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR" "$input_file"
}

is_exact_context() {
  local event="$1" needle="$2" compact
  compact=$(printf '%s' "$STDOUT_TEXT" | jq -c . 2>/dev/null) || return 1
  [ "$STDOUT_TEXT" = "$compact" ] || return 1
  printf '%s' "$STDOUT_TEXT" | jq -se --arg event "$event" --arg needle "$needle" '
    length == 1
    and (.[0] | type == "object" and (keys | sort) == ["governanceContext"])
    and (.[0].governanceContext |
      type == "object"
      and (keys | sort) == ["hookEventName", "message"]
      and .hookEventName == $event
      and (.message | type == "string" and length > 0 and contains($needle)))
  ' >/dev/null
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && [ -z "$STDOUT_TEXT" ] \
    && grep -qF "$needle" <<< "$STDERR_TEXT" \
    && ! grep -qF "GOVERNANCE_INTEGRITY:" <<< "$STDERR_TEXT" \
    && ! grep -qiF "broken pipe" <<< "$STDERR_TEXT"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected BLOCK exit=2 + '$needle', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
    && is_exact_context "${CURRENT_EVENT:-PreToolUse}" "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exact governance context '$needle', exit=$EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_integrity() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] \
    && grep -qF "GOVERNANCE_INTEGRITY:" <<< "$STDERR_TEXT" \
    && grep -qF "$needle" <<< "$STDERR_TEXT"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected stderr-only integrity failure containing '$needle', exit=$EXIT)"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_story_invariants tests ==="

# 1. Non-stories file → skip
run_hook "PreToolUse" "Edit" "/foo/button.tsx" "<table>"
expect_pass_silent "1. non-stories.tsx → skip"

# 2. Wrong tool → skip
run_hook "PreToolUse" "Read" "/foo/button.stories.tsx" "<table>"
expect_pass_silent "2. tool=Read → skip"

# 3. R2 slot_split: WithStartIcon + WithEndIcon both → BLOCK exit 2
STORIES_BTN="/foo/my-project/packages/design-system/src/components/Button/button.stories.tsx"
run_hook "PreToolUse" "Write" "$STORIES_BTN" '
export const Default = { args: {} };
export const WithStartIcon = { args: { startIcon: <Icon /> } };
export const WithEndIcon = { args: { endIcon: <Icon /> } };
'
expect_block "3. R2 WithStartIcon + WithEndIcon → BLOCK" "WithStartIcon + WithEndIcon"

# 4. R2 slot_split: allow marker → silent
run_hook "PreToolUse" "Write" "$STORIES_BTN" '// @story-split-rationale: legacy showcase
export const Default = { args: {} };
export const WithStartIcon = { args: { startIcon: <Icon /> } };
export const WithEndIcon = { args: { endIcon: <Icon /> } };
'
expect_pass_silent "4. R2 with @story-split-rationale marker → silent"

# 5. R1 anatomy: raw <table> outside DataTable → BLOCK exit 2
run_hook "PreToolUse" "Write" "$STORIES_BTN" '
export const Default = () => (
  <div>
    <table>
      <tr><td>x</td></tr>
    </table>
  </div>
);
'
expect_block "5. R1 raw <table> outside DataTable → BLOCK" "raw <table>"

# 6. R1 anatomy: allowlist @anatomy-exempt: → silent
run_hook "PreToolUse" "Write" "$STORIES_BTN" '// @anatomy-exempt: legacy demo with raw table
export const Default = () => (
  <div>
    <table>
      <tr><td>x</td></tr>
    </table>
  </div>
);
'
expect_pass_silent "6. R1 @anatomy-exempt marker → silent"

# 7. Clean story (no violations) → silent
# Note: AllVariants alone(no Default)since hook flags `Default + AllVariants` as redundant
STORIES_CLEAN="/foo/my-project/packages/design-system/src/components/Foo/foo.stories.tsx"
run_hook "PreToolUse" "Write" "$STORIES_CLEAN" '
export const AllVariants = { args: {} };
export const Disabled = { args: { disabled: true } };
'
expect_pass_silent "7. clean story (AllVariants + Disabled, no anti-patterns) → silent"

# 8. R5 name_jargon (PostToolUse, reads disk): L<n> layer name → context
STORIES_DISK="$TMP_DIR/datatable.stories.tsx"
cat > "$STORIES_DISK" <<'EOF'
export const Default = {
  name: 'L1 基本展示',
};
EOF
run_hook "PostToolUse" "Edit" "$STORIES_DISK" "(any update marker)"
expect_warn "8. R5 PostToolUse L<n> layer name → exact context" "L<n>"

# 9. R4 title_canonical: prop-leak syntax in name → P1 stderr warn (exit 0)
# Use prop/parameter leak pattern `(prop)` which matches `\([a-zA-Z]+\)` branch — robust on macOS BSD grep
# (pure English non-whitelisted depends on `[^\x00-\x7F]` regex semantics which vary)
run_hook "PreToolUse" "Write" "$STORIES_CLEAN" "
export const Default = {
  name: 'Default (size=md)',
};
"
expect_warn "9. R4 prop-leak syntax in name → P1 warn" "R4 title_canonical"

# 10. R7 baseline reference: wrap <Sidebar> without baseline marker → stderr warn
# Use a path NOT in skip list (Sidebar/, DataTable/, etc are skipped self-family)
STORIES_APP="/foo/my-project/packages/design-system/src/components/AppShell/app-shell.stories.tsx"
run_hook "PreToolUse" "Write" "$STORIES_APP" '
export const Default = () => (
  <Sidebar>
    <SidebarHeader><WorkspaceBrand /></SidebarHeader>
  </Sidebar>
);
'
expect_warn "10. R7 wrap <Sidebar> no @story-baseline → stderr warn" "R7 story_baseline_reference"

# 11. R8 archetype registry P0(2026-06-02 升 P0;DS+consumer 零違規確認後升級):
#     wrap <Sidebar> + simplified <SidebarHeader><span> mock(registry block-severity antiPattern)→ BLOCK
#     有 @story-baseline marker(R7 missing-marker 不 fire)→ exit 2 純由 R8 record_worst 2 造成
mkdir -p "$TMP_DIR/.claude/references"
printf '%s\n' '{"components":{}}' > "$TMP_DIR/.claude/references/story-baseline-registry.json"
STORIES_R8="/foo/my-project/packages/design-system/src/components/AppShell/app-shell-r8.stories.tsx"
run_hook "PreToolUse" "Write" "$STORIES_R8" '
// @story-baseline: @qijenchen/design-system/components/Sidebar/sidebar.stories.tsx#IconCollapse
export const Default = () => (
  <Sidebar>
    <SidebarHeader><span>Acme</span></SidebarHeader>
  </Sidebar>
);
'
expect_block "11. R8 canonical registry blocks even when .claude view is poisoned" "R8 story_archetype_registry"

# 12. R8 MULTI-LINE Sidebar drift(2026-06-03 回歸防護;修前 grep -E line-oriented + \s 當字面 's' → 多行靜默漏 = 假 P0):
#     <SidebarHeader> 與 <span> 分行(真實 JSX 縮排格式)→ 修後(hook tr 換行→空格 + regex [[:space:]])應 BLOCK
run_hook "PreToolUse" "Write" "$STORIES_R8" '
// @story-baseline: @qijenchen/design-system/components/Sidebar/sidebar.stories.tsx#IconCollapse
export const Default = () => (
  <Sidebar>
    <SidebarHeader>
      <span>Acme</span>
    </SidebarHeader>
  </Sidebar>
);
'
expect_block "12. R8 多行 <SidebarHeader> 換行 <span> → P0 BLOCK(回歸防護)" "R8 story_archetype_registry"

# 13. R8 MULTI-LINE ChromeHeader drift:<ChromeHeader> 與 <span flex-1> 分行 → 修後應 BLOCK
#     (修前 [\s\S]*? 在 BSD grep -E 是字元類非「任意字元」+ line-oriented → 雙重漏)
STORIES_CH="/foo/my-project/packages/design-system/src/components/AppShell/app-shell-ch.stories.tsx"
run_hook "PreToolUse" "Write" "$STORIES_CH" '
// @story-baseline: @qijenchen/design-system/components/Sidebar/sidebar.stories.tsx#IconCollapse
export const Default = () => (
  <ChromeHeader>
    <SidebarTrigger />
    <span className="flex-1 text-body-lg">儀表板</span>
  </ChromeHeader>
);
'
expect_block "13. R8 多行 <ChromeHeader> 換行 <span flex-1> → P0 BLOCK" "R8 story_archetype_registry"

# 14. R8 false-positive 防護:正確多行 ChromeHeader(h1 緊鄰、無 flex-1 span)+ 另一 story 遠處(距 >160 字)
#     有無關 flex-1 span → .{0,160} 長度界擋住跨 story 誤匹配(greedy .* boolean 等同 lazy,故必設界)→ NO block
run_hook "PreToolUse" "Write" "$STORIES_CH" '
// @story-baseline: @qijenchen/design-system/components/Sidebar/sidebar.stories.tsx#IconCollapse
export const Correct = () => (
  <ChromeHeader>
    <SidebarTrigger />
    <h1 className="text-body-lg font-medium">儀表板</h1>
  </ChromeHeader>
);
export const Unrelated = () => (
  <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-surface p-6 mt-4">
    <div className="text-body-sm text-muted">統計面板區塊內容說明文字</div>
    <span className="flex-1">無關的彈性間距元素</span>
  </div>
);
'
expect_pass_silent "14. R8 正確多行 ChromeHeader + 遠處無關 flex-1(>160 字)→ 不誤判"

# 15. R8 disk @story-baseline-allow 豁免(2026-06-03 回歸防護,fragment-vs-file bug class,對抗稽核抓到):
#     檔頭有 @story-baseline-allow 的 disk 檔 + Edit 只送無 marker 片段(含 antiPattern)→ R8 不擋
#     (補查整檔 disk head;修前只查片段 → 編輯有 marker 的 story 任一非 marker 行就被 R8 誤擋)。
#     斷言 EXIT=0(R8 未 record_worst 2);R7 anti-pattern stderr 警告與否不影響此斷言。
DISK_STORY_R8="$TMP_DIR/r8-disk-allow.stories.tsx"
printf '%s\n' "// @story-baseline-allow: legacy migration RFC-123" "export const X = () => (<Sidebar><SidebarHeader><span>A</span></SidebarHeader></Sidebar>)" > "$DISK_STORY_R8"
run_hook "PreToolUse" "Edit" "$DISK_STORY_R8" '  <SidebarHeader><span>Acme</span></SidebarHeader>'
if [ "$EXIT" = "0" ]; then
  echo "  PASS  15. R8 disk @story-baseline-allow + Edit 無 marker 片段 → R8 不擋(回歸防護)"; PASS=$((PASS+1))
else
  echo "  FAIL  15. R8 disk marker exempt (expected exit 0, got exit=$EXIT)"
  echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 15. R8 disk marker"
fi

# 16. R9 hand-craft overlay/chrome header(2026-06-04 codify per upload-manager 面板 drift):
#     story 內手刻 <div px-[var(--layout-space-loose)] ... border-b border-divider> → P0 BLOCK
run_hook "PreToolUse" "Write" "$TMP_DIR/r9-handcraft.stories.tsx" '
export const Panel = () => (
  <div className="max-w-md rounded-lg border bg-surface shadow-[var(--elevation-200)]">
    <div className="flex items-center justify-between px-[var(--layout-space-loose)] py-2 border-b border-divider">
      <span className="text-body font-medium">正在上傳 3 個項目</span>
    </div>
  </div>
);
'
expect_block "16. R9 手刻 <div px-loose border-b border-divider> overlay header → P0 BLOCK" "R9 hand-craft overlay"

# 17. R9 false-positive 防護:正確消費 SurfaceHeader + PopoverTitle → 不擋(silent)
run_hook "PreToolUse" "Write" "$TMP_DIR/r9-correct.stories.tsx" '
export const Panel = () => (
  <div className="max-w-md flex flex-col rounded-lg border-border bg-surface-raised shadow-[var(--elevation-200)]">
    <SurfaceHeader className="justify-between">
      <div className="flex-1 min-w-0"><PopoverTitle>正在上傳 3 個項目</PopoverTitle></div>
    </SurfaceHeader>
  </div>
);
'
expect_pass_silent "17. R9 正確消費 SurfaceHeader+PopoverTitle → 不誤判"

# 18. R9 false-positive 防護:doc-table row 用 px-4(非 loose token)+ border-b → 不擋
run_hook "PreToolUse" "Write" "$TMP_DIR/r9-doctable.stories.tsx" '
export const Tbl = () => (<div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">表頭列</div>);
'
expect_pass_silent "18. R9 doc-table px-4 + border-b(非 loose token)→ 不誤判"

# 19. R9 escape:檔頭 @story-baseline-allow → 不擋
run_hook "PreToolUse" "Write" "$TMP_DIR/r9-allow.stories.tsx" '// @story-baseline-allow: legacy panel demo
export const P = () => (<div className="px-[var(--layout-space-loose)] py-2 border-b border-divider" />);
'
expect_pass_silent "19. R9 @story-baseline-allow 豁免 → 不擋"

# 20. R9 FN-001 回歸(2026-06-04 adversarial workflow):多行 className flatten 後多空格 → 仍 BLOCK
#     (修前單空格 regex 漏;改 border-b[[:space:]]+border-divider)
run_hook "PreToolUse" "Write" "$TMP_DIR/r9-multispace.stories.tsx" 'export const P = () => (
  <div
    className="flex justify-between px-[var(--layout-space-loose)] py-2
      border-b
      border-divider"
  >正在上傳</div>
);
'
expect_block "20. R9 多行/多空格 className 手刻 header → BLOCK(FN-001 修)" "R9 hand-craft overlay"

# 21. R9 FP-001 防護:border-b border-divider 在 data-* 屬性(非 className)→ 不擋
#     (修前 [^>]* 跨屬性誤判;改 [^\">]* 限同 className 字串)
run_hook "PreToolUse" "Write" "$TMP_DIR/r9-crossattr.stories.tsx" '
export const P = () => (<div className="px-[var(--layout-space-loose)]" data-x="border-b border-divider">x</div>);
'
expect_pass_silent "21. R9 border-divider 在 data-* 屬性 → 不誤判(FP-001 修)"

# 22. R9 FP-002 防護:純註解行含 pattern → 不擋(drop comment-only line 後 flatten)
run_hook "PreToolUse" "Write" "$TMP_DIR/r9-comment.stories.tsx" '// 範例(禁): <div className="px-[var(--layout-space-loose)] border-b border-divider">
export const P = () => (<SurfaceHeader>x</SurfaceHeader>);
'
expect_pass_silent "22. R9 純註解行含 pattern → 不誤判(FP-002 修)"

# 23. R9 skip-list 補 isOverlay 家(FileViewer)→ 不擋(R9-SKIP-001)
run_hook "PreToolUse" "Write" "/foo/my-project/packages/design-system/src/components/FileViewer/fv.stories.tsx" '
export const P = () => (<div className="px-[var(--layout-space-loose)] border-b border-divider">x</div>);
'
expect_pass_silent "23. R9 skip FileViewer(isOverlay 家)→ 不檢查"

# 24. R10 link_canonical: text-primary hover:underline → P1 warn(非 block)
run_hook "PreToolUse" "Edit" "/foo/my-project/packages/design-system/src/components/Foo/foo.principles.stories.tsx" '
<span className="text-primary hover:underline font-medium cursor-pointer">查看詳情</span>
'
expect_warn "24. R10 text-primary hover:underline → P1 warn" "R10 link_canonical"

# 25. R10 canonical(hover:text-primary-hover 換色)→ silent
run_hook "PreToolUse" "Edit" "/foo/my-project/packages/design-system/src/components/Foo/foo.principles.stories.tsx" '
<span className="text-primary hover:text-primary-hover font-medium cursor-pointer">查看詳情</span>
'
expect_pass_silent "25. R10 canonical hover:text-primary-hover → silent"

# 26. R10 escape marker @link-style-allow → silent
run_hook "PreToolUse" "Edit" "/foo/my-project/packages/design-system/src/components/Foo/foo.principles.stories.tsx" '// @link-style-allow: legacy doc-nav underline
<span className="text-primary hover:underline">查看詳情</span>
'
expect_pass_silent "26. R10 @link-style-allow 豁免 → silent"

# 27. R10 broadened: class-separated(cursor-pointer 隔開)text-primary … hover:underline → warn
run_hook "PreToolUse" "Edit" "/foo/my-project/packages/design-system/src/components/Foo/foo.anatomy.stories.tsx" '
<button className="text-caption text-primary cursor-pointer hover:underline">重設</button>
'
expect_warn "27. R10 class-separated text-primary…hover:underline → warn" "R10 link_canonical"

# 28. R10 不誤判描述 label「text-primary · hover:underline」(· 非 class-char,如 LinkInput anatomy 註解)→ silent
run_hook "PreToolUse" "Edit" "/foo/my-project/packages/design-system/src/components/Foo/foo.anatomy.stories.tsx" '
<span className="text-fg-muted font-mono">text-primary · hover:underline · 點擊開啟連結</span>
'
expect_pass_silent "28. R10 描述 label(· 分隔)→ 不誤判"

# 29. Multiple PostToolUse warnings from independent rules must become one exact envelope.
STORIES_MULTI="$TMP_DIR/multi-warning.stories.tsx"
cat > "$STORIES_MULTI" <<'EOF'
export const Default = {
  name: 'L2 API canonical',
  parameters: {
    docs: {
      description: {
        story: `回傳 Record<string, string>`,
      },
    },
  },
};
EOF
run_hook "PostToolUse" "Edit" "$STORIES_MULTI" "(post update)"
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
  && is_exact_context "PostToolUse" "R5 name jargon" \
  && printf '%s' "$STDOUT_TEXT" | jq -e \
    '.governanceContext.message | contains("R6 description jargon")' >/dev/null; then
  echo "  PASS  29. R5+R6 warnings → one exact PostToolUse context"
  PASS=$((PASS+1))
else
  echo "  FAIL  29. PostToolUse warning aggregation contract"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 29. warning aggregation"
fi

run_raw '{'
if [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] \
  && grep -qF "GOVERNANCE_INTEGRITY:" <<< "$STDERR_TEXT" \
  && grep -qF "invalid input envelope" <<< "$STDERR_TEXT"; then
  echo "  PASS  30. malformed input → stderr-only integrity failure"
  PASS=$((PASS+1))
else
  echo "  FAIL  30. malformed input output contract"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 30. malformed input"
fi

# 31-33. Large-payload regressions: every payload exceeds 256 KiB and places the
# decisive allow/policy token before a large trailing body. These caught producer
# SIGPIPE under `set -o pipefail` when `grep -q` stopped reading early.
LARGE_FILLER=$(awk 'BEGIN {
  for (i = 0; i < 5000; i++) {
    printf "safe_%08d_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", i
  }
}')
if [ "${#LARGE_FILLER}" -le 262144 ]; then
  echo "FATAL: large story regression fixture must exceed 256 KiB"
  exit 1
fi

LARGE_ALLOW_CONTENT="// @story-split-rationale: intentional split for migration
export const WithStartIcon = { args: { startIcon: true } };
export const WithEndIcon = { args: { endIcon: true } };
// ${LARGE_FILLER}"
run_hook "PreToolUse" "Write" "$STORIES_BTN" "$LARGE_ALLOW_CONTENT"
expect_pass_silent "31. >256KiB early allow marker → exact silent allow"

LARGE_CLEAN_CONTENT="export const Disabled = { args: { disabled: true } };
// ${LARGE_FILLER}"
run_hook "PreToolUse" "Write" "$STORIES_CLEAN" "$LARGE_CLEAN_CONTENT"
expect_pass_silent "32. >256KiB clean payload → exact silent allow"

LARGE_FINDING_CONTENT="export const Variants = { args: {} };
// ${LARGE_FILLER}"
run_hook "PreToolUse" "Write" "$STORIES_CLEAN" "$LARGE_FINDING_CONTENT"
expect_block "33. >256KiB early policy finding → exact block, no integrity failure" "Variants → AllVariants"

# 34. Provider-neutral normalized envelopes may carry compatibility aliases for
# the same mutation. The hook must select the tool's authoritative field once,
# rather than multiplying one finding through content/new_string/edits.
ALIAS_FINDING='<table><tr><td>x</td></tr></table>'
ALIAS_PAYLOAD=$(jq -cn \
  --arg content "$ALIAS_FINDING" \
  --arg fp "$STORIES_BTN" \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{
      file_path:$fp,
      content:$content,
      new_string:$content,
      edits:[{new_string:$content}]
    }
  }')
run_raw "$ALIAS_PAYLOAD"
ALIAS_FINDING_COUNT=$(grep -c '\[A.2 raw <table>\]' <<< "$STDERR_TEXT" || true)
if [ "$EXIT" = "2" ] && [ "$ALIAS_FINDING_COUNT" = "1" ] \
  && [ -z "$STDOUT_TEXT" ] \
  && ! grep -qF "GOVERNANCE_INTEGRITY:" <<< "$STDERR_TEXT"; then
  echo "  PASS  34. normalized compatibility aliases → authoritative Edit payload scanned once"
  PASS=$((PASS+1))
else
  echo "  FAIL  34. normalized compatibility aliases duplicated or corrupted the finding (exit=$EXIT, count=$ALIAS_FINDING_COUNT)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 34. normalized alias selection"
fi

# 35. Real stories are line-rich, not just one very long line. Keep an explicit
# process-group timeout so a regression in flattening/per-line scanning fails
# promptly instead of hanging the canonical enforcement suite.
LINE_RICH_CONTENT=$(awk 'BEGIN {
  for (i = 0; i < 4000; i++) {
    printf "const safeLine%04d = %d; // inert story fixture padding for linear replay\n", i, i
  }
}')
LINE_RICH_PAYLOAD=$(printf '%s' "$LINE_RICH_CONTENT" | jq -Rs \
  --arg fp "$STORIES_CLEAN" \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{
      file_path:$fp,
      content: .,
      new_string: .,
      edits:[{new_string:.}]
    }
  }')
run_raw_bounded "$LINE_RICH_PAYLOAD"
expect_pass_silent "35. 4,000-line normalized full-file replay → silent within 20s budget"

# 36. event-v1 fallback must ignore a null compatibility alias and select the
# valid provider materialization instead of silently scanning an empty string.
NULL_ALIAS_PAYLOAD=$(jq -cn \
  --arg content "$ALIAS_FINDING" \
  --arg fp "$STORIES_BTN" \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{file_path:$fp,new_string:null,content:$content}
  }')
run_raw "$NULL_ALIAS_PAYLOAD"
expect_block "36. null Edit alias + valid content fallback → R1 still blocks" "raw <table>"

# 37-38. The event-v1 adapter shape can expose Edit content without a native
# new_string. R7/R8 must consume the unified mutation text.
CONTENT_ONLY_R7=$(jq -cn \
  --arg fp "$STORIES_APP" \
  --arg content '<Sidebar><WorkspaceBrand /></Sidebar>' \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{file_path:$fp,content:$content}
  }')
run_raw "$CONTENT_ONLY_R7"
expect_warn "37. adapter-shaped Edit content-only → R7 warning survives" "R7 story_baseline_reference"

CONTENT_ONLY_R8=$(jq -cn \
  --arg fp "$STORIES_R8" \
  --arg content '<Sidebar><SidebarHeader><span>Acme</span></SidebarHeader></Sidebar>' \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{file_path:$fp,content:$content}
  }')
run_raw "$CONTENT_ONLY_R8"
expect_block "38. adapter-shaped Edit content-only → R8 block survives" "R8 story_archetype_registry"

# 39-43. proposed-text-v1 is the managed PreToolUse contract. The trusted full
# after-image wins over raw fragments for Edit and MultiEdit; malformed,
# mismatched, or untrusted states fail closed.
PROPOSED_REL="packages/design-system/src/components/AppShell/proposed.stories.tsx"
PROPOSED_FP="$TMP_DIR/$PROPOSED_REL"
PROPOSED_VIOLATION='<Sidebar><SidebarHeader><span>Acme</span></SidebarHeader></Sidebar>'
PROPOSED_PAYLOAD=$(jq -cn \
  --arg fp "$PROPOSED_FP" \
  --arg rel "$PROPOSED_REL" \
  --arg proposed "$PROPOSED_VIOLATION" \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{
      file_path:$fp,
      new_string:"<Sidebar><WorkspaceBrand /></Sidebar>",
      governance_write_state:{
        schemaVersion:1,
        path:$rel,
        kind:"text",
        content:$proposed
      }
    }
  }')
run_raw_trusted "$PROPOSED_PAYLOAD"
expect_block "39. proposed-text Edit after-image wins over clean raw fragment" "R8 story_archetype_registry"

PROPOSED_MULTI=$(jq -cn \
  --arg fp "$PROPOSED_FP" \
  --arg rel "$PROPOSED_REL" \
  --arg proposed "$PROPOSED_VIOLATION" \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"MultiEdit",
    tool_input:{
      file_path:$fp,
      edits:[{new_string:"clean fragment"}],
      governance_write_state:{
        schemaVersion:1,
        path:$rel,
        kind:"text",
        content:$proposed
      }
    }
  }')
run_raw_trusted "$PROPOSED_MULTI"
expect_block "40. proposed-text MultiEdit receives the same R8 enforcement" "R8 story_archetype_registry"

PROPOSED_MISSING=$(jq -cn \
  --arg fp "$PROPOSED_FP" \
  '{hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:$fp,new_string:"clean"}}')
run_raw_trusted "$PROPOSED_MISSING"
expect_integrity "41. runner trust without proposed state → fail closed" "missing or malformed"

PROPOSED_MISMATCH=$(jq -cn \
  --arg fp "$PROPOSED_FP" \
  --arg proposed "$PROPOSED_VIOLATION" \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{
      file_path:$fp,
      governance_write_state:{
        schemaVersion:1,
        path:"packages/design-system/src/components/Other/other.stories.tsx",
        kind:"text",
        content:$proposed
      }
    }
  }')
run_raw_trusted "$PROPOSED_MISMATCH"
expect_integrity "42. mismatched proposed state path → fail closed" "does not match"

PROPOSED_DELETED=$(jq -cn \
  --arg fp "$PROPOSED_FP" \
  --arg rel "$PROPOSED_REL" \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{
      file_path:$fp,
      governance_write_state:{schemaVersion:1,path:$rel,kind:"deleted"}
    }
  }')
run_raw_trusted "$PROPOSED_DELETED"
expect_pass_silent "43. trusted deletion after-image → silent"

# 44. A line-rich story can legitimately contain many harmless divs. Keep this
# separate from inert text so the R1 candidate prefilter itself stays bounded.
DIV_HEAVY_CONTENT=$(awk 'BEGIN {
  for (i = 0; i < 2500; i++) {
    printf "<div className=\"grid gap-2\">safe-%04d</div>\n", i
  }
}')
DIV_HEAVY_PAYLOAD=$(printf '%s' "$DIV_HEAVY_CONTENT" | jq -Rs \
  --arg fp "$STORIES_CLEAN" \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{file_path:$fp,new_string:.}
  }')
run_raw_bounded "$DIV_HEAVY_PAYLOAD"
expect_pass_silent "44. 2,500 harmless div lines → silent within 20s budget"

# 45-50. A trusted full after-image is the sole marker authority. Removing an
# old disk exemption/citation must take effect in the same mutation.
MARKER_REL="packages/design-system/src/components/Foo/marker-removal.stories.tsx"
MARKER_FP="$TMP_DIR/$MARKER_REL"
mkdir -p "$(dirname "$MARKER_FP")"

printf '%s\n' \
  '// @anatomy-exempt: old exception' \
  '<table><tr><td>x</td></tr></table>' > "$MARKER_FP"
MARKER_PAYLOAD=$(jq -cn \
  --arg fp "$MARKER_FP" --arg rel "$MARKER_REL" \
  --arg proposed '<table><tr><td>x</td></tr></table>' \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{
      file_path:$fp,
      governance_write_state:{schemaVersion:1,path:$rel,kind:"text",content:$proposed}
    }
  }')
run_raw_trusted "$MARKER_PAYLOAD"
expect_block "45. removing @anatomy-exempt → R1 blocks immediately" "raw <table>"

printf '%s\n' \
  '// @story-split-rationale: old exception' \
  'export const WithStartIcon = {};' \
  'export const WithEndIcon = {};' > "$MARKER_FP"
MARKER_PAYLOAD=$(jq -cn \
  --arg fp "$MARKER_FP" --arg rel "$MARKER_REL" \
  --arg proposed $'export const WithStartIcon = {};\nexport const WithEndIcon = {};' \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{
      file_path:$fp,
      governance_write_state:{schemaVersion:1,path:$rel,kind:"text",content:$proposed}
    }
  }')
run_raw_trusted "$MARKER_PAYLOAD"
expect_block "46. removing @story-split-rationale → R2 blocks immediately" "WithStartIcon + WithEndIcon"

printf '%s\n' \
  '// @story-name-canonical-allow: old exception' \
  "export const Default = { name: 'Default (size=md)' };" > "$MARKER_FP"
MARKER_PAYLOAD=$(jq -cn \
  --arg fp "$MARKER_FP" --arg rel "$MARKER_REL" \
  --arg proposed "export const Default = { name: 'Default (size=md)' };" \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{
      file_path:$fp,
      governance_write_state:{schemaVersion:1,path:$rel,kind:"text",content:$proposed}
    }
  }')
run_raw_trusted "$MARKER_PAYLOAD"
expect_warn "47. removing @story-name-canonical-allow → R4 warns immediately" "R4 title_canonical"

printf '%s\n' \
  '// @story-baseline: old citation being removed' \
  '<Sidebar><WorkspaceBrand /></Sidebar>' > "$MARKER_FP"
MARKER_PAYLOAD=$(jq -cn \
  --arg fp "$MARKER_FP" --arg rel "$MARKER_REL" \
  --arg proposed '<Sidebar><WorkspaceBrand /></Sidebar>' \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{
      file_path:$fp,
      governance_write_state:{schemaVersion:1,path:$rel,kind:"text",content:$proposed}
    }
  }')
run_raw_trusted "$MARKER_PAYLOAD"
expect_warn "48. removing @story-baseline citation → R7 warns immediately" "R7 story_baseline_reference"

printf '%s\n' \
  '// @story-baseline-allow: old exception' \
  '<Sidebar><SidebarHeader><span>Acme</span></SidebarHeader></Sidebar>' > "$MARKER_FP"
MARKER_PAYLOAD=$(jq -cn \
  --arg fp "$MARKER_FP" --arg rel "$MARKER_REL" \
  --arg proposed '<Sidebar><SidebarHeader><span>Acme</span></SidebarHeader></Sidebar>' \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{
      file_path:$fp,
      governance_write_state:{schemaVersion:1,path:$rel,kind:"text",content:$proposed}
    }
  }')
run_raw_trusted "$MARKER_PAYLOAD"
expect_block "49. removing @story-baseline-allow → R8 blocks immediately" "R8 story_archetype_registry"

printf '%s\n' \
  '// @story-baseline-allow: old exception' \
  '<div className="px-[var(--layout-space-loose)] border-b border-divider" />' > "$MARKER_FP"
MARKER_PAYLOAD=$(jq -cn \
  --arg fp "$MARKER_FP" --arg rel "$MARKER_REL" \
  --arg proposed '<div className="px-[var(--layout-space-loose)] border-b border-divider" />' \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{
      file_path:$fp,
      governance_write_state:{schemaVersion:1,path:$rel,kind:"text",content:$proposed}
    }
  }')
run_raw_trusted "$MARKER_PAYLOAD"
expect_block "50. removing @story-baseline-allow → R9 blocks immediately" "R9 hand-craft overlay"

# 51. Exercise the actual R1 candidate path at the provider line ceiling. A
# per-line external-process implementation exceeds the child runtime budget;
# the canonical single-pass scanner must stay comfortably bounded.
CANDIDATE_HEAVY_CONTENT=$(awk 'BEGIN {
  for (i = 0; i < 16000; i++) {
    printf "<div className=\"absolute inset-0 flex\">safe-%05d</div>\n", i
  }
}')
CANDIDATE_HEAVY_PAYLOAD=$(printf '%s' "$CANDIDATE_HEAVY_CONTENT" | jq -Rs \
  --arg fp "$STORIES_CLEAN" \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Edit",
    tool_input:{file_path:$fp,new_string:.}
  }')
run_raw_bounded "$CANDIDATE_HEAVY_PAYLOAD"
expect_pass_silent "51. 16,000 R1 candidate lines → silent within 20s budget"

# 52. TMPDIR is data, not shell source. A valid directory name containing
# spaces/metacharacters must neither break cleanup nor execute injected text.
TRICKY_TMPDIR="$TMP_DIR/tmp space;touch\${IFS}trap-sentinel;#"
TRAP_SENTINEL="$TMP_DIR/trap-sentinel"
mkdir -p "$TRICKY_TMPDIR"
TRAP_PAYLOAD=$(jq -cn \
  --arg fp "$STORIES_CLEAN" \
  '{
    hook_event_name:"PreToolUse",
    tool_name:"Write",
    tool_input:{file_path:$fp,content:"export const Disabled = {};"}
  }')
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
(
  cd "$TMP_DIR" || exit 71
  printf '%s' "$TRAP_PAYLOAD" \
    | TMPDIR="$TRICKY_TMPDIR" GOVERNANCE_PROJECT_DIR="$TMP_DIR" \
      GOVERNANCE_PROVIDER=codex GOVERNANCE_READ_ONLY=1 \
      bash "$HOOK"
) >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDOUT_TEXT=$(cat "$STDOUT")
STDERR_TEXT=$(cat "$STDERR")
rm -f "$STDOUT" "$STDERR"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ] \
  && [ ! -e "$TRAP_SENTINEL" ]; then
  echo "  PASS  52. metacharacter TMPDIR → safe cleanup, no command injection"
  PASS=$((PASS+1))
else
  echo "  FAIL  52. metacharacter TMPDIR cleanup contract (exit=$EXIT)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 52. TMPDIR cleanup safety"
fi

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi
