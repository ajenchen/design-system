#!/bin/bash
# Tests for check_story_anatomy.sh
#
# Runs focused R1 scenarios by crafting PreToolUse JSON payloads on stdin and checking
# the hook's exit code (0 = pass / 2 = block) + stderr output.
#
# Usage: bash test_check_story_anatomy.sh

set -u

export GOVERNANCE_PROVIDER=codex
export GOVERNANCE_READ_ONLY=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Cluster A merge(2026-05-10):check_story_anatomy.sh 已 fold 進
# check_story_invariants.sh dispatcher R1。本 test 改 call dispatcher,
# dispatcher 會跑完整 story rules；anatomy 違反時 R1 fire 攔截。
HOOK="$SCRIPT_DIR/../check_story_invariants.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

# ── Helpers ──────────────────────────────────────────────────────────────────

# run_hook <file_path> <content> → emits JSON payload and runs hook
# Captures exit code in $EXIT, stderr in $STDERR, stdout in $STDOUT
run_hook() {
  local file_path="$1"
  local content="$2"
  local tool="${3:-Write}"

  local payload
  payload=$(jq -n \
    --arg tool "$tool" \
    --arg fp "$file_path" \
    --arg c  "$content" \
    '{hook_event_name: "PreToolUse", tool_name: $tool, tool_input: {file_path: $fp, content: $c}}')

  STDOUT=$(mktemp)
  STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass() {
  local name="$1"
  if [ "$EXIT" = "0" ]; then
    echo "  PASS  $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 0, got $EXIT)"
    echo "  --- stderr ---"
    echo "$STDERR_TEXT" | sed 's/^/    /'
    echo "  --- end stderr ---"
    FAIL=$((FAIL+1))
    FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"
  local needle="$2"
  if [ "$EXIT" = "2" ]; then
    if echo "$STDERR_TEXT" | grep -qF "$needle"; then
      echo "  PASS  $name"
      PASS=$((PASS+1))
    else
      echo "  FAIL  $name (exit 2 OK but stderr missing '$needle')"
      echo "  --- stderr ---"
      echo "$STDERR_TEXT" | sed 's/^/    /'
      echo "  --- end stderr ---"
      FAIL=$((FAIL+1))
      FAILED_TESTS="${FAILED_TESTS}\n  - $name"
    fi
  else
    echo "  FAIL  $name (expected exit 2, got $EXIT)"
    echo "  --- stderr ---"
    echo "$STDERR_TEXT" | sed 's/^/    /'
    echo "  --- end stderr ---"
    FAIL=$((FAIL+1))
    FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

# ── Test 1: Normal story using <MenuItem> → pass ─────────────────────────────
echo "Test 1: normal <MenuItem> usage → pass"
read -r -d '' T1_CONTENT <<'EOF' || true
import { MenuItem, ItemIcon, ItemLabel } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Folder } from 'lucide-react'

export const Default = {
  render: () => (
    <MenuItem>
      <ItemIcon icon={Folder} />
      <ItemLabel>專案檔案</ItemLabel>
    </MenuItem>
  ),
}
EOF
run_hook "/fake/src/design-system/components/Menu/menu.stories.tsx" "$T1_CONTENT"
expect_pass "Test 1 normal MenuItem usage passes"

# ── Test 2: hand-craft raw row → block ───────────────────────────────────────
echo ""
echo "Test 2: raw <div flex items-center><Icon/> → block"
read -r -d '' T2_CONTENT <<'EOF' || true
import { Folder } from 'lucide-react'

export const Default = {
  render: () => (
    <div className="flex items-center gap-2 px-3 py-2"><Folder className="size-4" />
      <span>專案檔案</span>
    </div>
  ),
}
EOF
run_hook "/fake/src/design-system/components/Menu/menu.stories.tsx" "$T2_CONTENT"
expect_block "Test 2 raw item-anatomy row is blocked" "A.1"

# ── Test 3: dismiss via label Button → block ─────────────────────────────────
echo ""
echo "Test 3: <Button>關閉</Button> under onClose context → block"
read -r -d '' T3_CONTENT <<'EOF' || true
import { Dialog, DialogHeader } from '@/design-system/components/Dialog/dialog'
import { Button } from '@/design-system/components/Button/button'

export const Default = {
  render: ({ onClose }: { onClose: () => void }) => (
    <Dialog>
      <DialogHeader>
        <h2>確認送出</h2>
        <Button onClick={onClose}>關閉</Button>
      </DialogHeader>
    </Dialog>
  ),
}
EOF
run_hook "/fake/src/design-system/components/Dialog/dialog.stories.tsx" "$T3_CONTENT"
expect_block "Test 3 dismiss via label Button is blocked" "[B dismiss via label]"

# ── Test 4: file-level allowlist → bypass ────────────────────────────────────
echo ""
echo "Test 4: file-level // @anatomy-exempt marker → pass even with violation"
read -r -d '' T4_CONTENT <<'EOF' || true
// @anatomy-exempt: teaching raw primitive — anatomy docs show internals
import { Folder } from 'lucide-react'

export const Anatomy = {
  render: () => (
    <div className="flex items-center gap-2"><Folder className="size-4" />
      <span>anatomy demo</span>
    </div>
  ),
}
EOF
run_hook "/fake/src/design-system/components/Menu/menu.stories.tsx" "$T4_CONTENT"
expect_pass "Test 4 file-level exempt bypasses hook"

# ── Test 5: per-line allowlist → only that line skipped, next violation blocks ──
echo ""
echo "Test 5: // @anatomy-exempt-next skips only the following line"
# First sub-test: the exempted line is clean, hook should still block on a
# NEW violation later in the file.
read -r -d '' T5_CONTENT <<'EOF' || true
import { Folder } from 'lucide-react'

export const Demo = {
  render: () => (
    <>
      {/* @anatomy-exempt-next */}
      <div className="flex items-center gap-2"><Folder className="size-4" /><span>exempt</span></div>
      <div className="flex items-center gap-2"><Folder className="size-4" /><span>NOT exempt</span></div>
    </>
  ),
}
EOF
run_hook "/fake/src/design-system/components/Menu/menu.stories.tsx" "$T5_CONTENT"
expect_block "Test 5 per-line exempt skips one line but next violation still blocks" "A.1"

# ── Test 6: canonical first child is allowlisted ─────────────────────────────
echo ""
echo "Test 6: raw flex row whose first child is canonical → pass"
run_hook "/fake/src/design-system/components/Menu/menu.stories.tsx" \
  '<div className="flex items-center gap-2"><MenuItem /></div>'
expect_pass "Test 6 canonical first child is not an A.1 violation"

# ── Test 7-8: full-surface loading + lookahead boundary ──────────────────────
echo ""
echo "Test 7: absolute inset loading with nearby progress → block"
run_hook "/fake/src/design-system/components/Foo/foo.stories.tsx" '
<div className="absolute inset-0 flex items-center">
  <CircularProgress />
</div>'
expect_block "Test 7 hand-crafted loading is blocked" "[A.3 hand-craft loading]"

echo ""
echo "Test 8: progress outside four-line lookahead → pass"
run_hook "/fake/src/design-system/components/Foo/foo.stories.tsx" '
<div className="absolute inset-0 flex items-center">
  <span />
  <span />
  <span />
  <span />
  <CircularProgress />
</div>'
expect_pass "Test 8 A.3 lookahead boundary is preserved"

# ── Test 9: hand-crafted field ───────────────────────────────────────────────
echo ""
echo "Test 9: raw h-field input → block"
run_hook "/fake/src/design-system/components/Foo/foo.stories.tsx" \
  '<input className="h-field-md border-border" />'
expect_block "Test 9 hand-crafted field is blocked" "[A.4 hand-craft field]"

# ── Test 10-11: overlay context + boundary ───────────────────────────────────
echo ""
echo "Test 10: absolute styled div with nearby dismiss → block"
run_hook "/fake/src/design-system/components/Foo/foo.stories.tsx" '
<div className="absolute bg-surface shadow-lg">
  <span />
  {onClose()}
</div>'
expect_block "Test 10 hand-crafted overlay is blocked" "[C hand-craft overlay]"

echo ""
echo "Test 11: dismiss outside six-line lookahead → pass"
run_hook "/fake/src/design-system/components/Foo/foo.stories.tsx" '
<div className="absolute bg-surface shadow-lg">
  <span />
  <span />
  <span />
  <span />
  <span />
  <span />
  {onClose()}
</div>'
expect_pass "Test 11 C lookahead boundary is preserved"

# ── Test 12: DataTable family owns raw table anatomy ─────────────────────────
echo ""
echo "Test 12: DataTable family raw table → pass"
run_hook "/fake/packages/design-system/src/components/DataTable/data-table.stories.tsx" \
  '<table><tbody><tr><td>x</td></tr></tbody></table>'
expect_pass "Test 12 DataTable raw-table family exemption is preserved"

# ── Test 13-16: B 只管角落的關閉 ×,頁腳的「取消 / 關閉」動作鈕放行(2026-11-27,h46 線回報) ─────────
# 13 = dialog.stories.tsx 標籤選擇 / 匯入預覽兩則的形狀:頁腳「取消」包 DialogClose、旁邊主鈕套用後 setOpen(false)。
#      修前 B 只看上下 4 行有沒有 setOpen(false),把它當違規(對照組:修前 hook 對同一份內容 exit 2)。
echo ""
echo "Test 13: footer 取消 next to a primary that calls setOpen(false) → pass"
read -r -d '' T13_CONTENT <<'EOF' || true
import { Dialog, DialogContent, DialogFooter, DialogClose } from '@/design-system/components/Dialog/dialog'
import { Button } from '@/design-system/components/Button/button'

export const Picker = {
  render: ({ setOpen, apply }: { setOpen: (v: boolean) => void; apply: () => void }) => (
    <Dialog>
      <DialogContent>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button variant="primary" onClick={() => { apply(); setOpen(false) }}>套用</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}
EOF
run_hook "/fake/src/design-system/components/Dialog/dialog.stories.tsx" "$T13_CONTENT"
expect_pass "Test 13 footer cancel beside a closing primary is not dismiss-via-label"

# 14 = 頁腳寫在同一行(dialog.stories.tsx 焦點鎖夾具的形狀)
echo ""
echo "Test 14: single-line footer 關閉 with onClose nearby → pass"
run_hook "/fake/src/design-system/components/Dialog/dialog.stories.tsx" \
  $'const f = ({ onClose }) => (\n  <DialogFooter><DialogClose asChild><Button variant="tertiary">關閉</Button></DialogClose></DialogFooter>\n)\nconst g = onClose'
expect_pass "Test 14 single-line footer close button passes"

# 15 = 頁腳已經關掉之後,標題列裡的有字關閉鈕照擋(深度要扣回 0,不能整檔一出現 Footer 就放行)
echo ""
echo "Test 15: labeled close in a header after a closed footer → block"
read -r -d '' T15_CONTENT <<'EOF' || true
export const A = {
  render: () => (
    <DialogFooter>
      <Button variant="primary">儲存</Button>
    </DialogFooter>
  ),
}
export const B = {
  render: ({ onClose }: { onClose: () => void }) => (
    <SheetHeader>
      <Button variant="tertiary" onClick={onClose}>關閉</Button>
    </SheetHeader>
  ),
}
EOF
# (按鈕屬性裡有箭頭函式 `onClick={() => …}` 時,B 的按鈕比對 `<Button\b[^>]*>` 停在 `=>`、整顆按鈕比不到 —— 修前就是如此,
#  本次只修頁腳誤判、不擴大比對範圍;已寫進 h46 回報)
run_hook "/fake/src/design-system/components/Sheet/sheet.stories.tsx" "$T15_CONTENT"
expect_block "Test 15 labeled header close after a closed footer is still blocked" "[B dismiss via label]"

# 16 = 自閉合的 <DialogFooter /> 不算打開頁腳
echo ""
echo "Test 16: self-closing footer does not open a footer scope → block"
run_hook "/fake/src/design-system/components/Dialog/dialog.stories.tsx" \
  $'const f = ({ onClose }) => (\n  <DialogHeader>\n    <DialogFooter />\n    <Button onClick={onClose}>關閉</Button>\n  </DialogHeader>\n)'
expect_block "Test 16 self-closing footer does not exempt a labeled close" "[B dismiss via label]"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  Results: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed tests:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0
