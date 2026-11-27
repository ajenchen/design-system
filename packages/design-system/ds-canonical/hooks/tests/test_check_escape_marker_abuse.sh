#!/bin/bash
# Tests for check_escape_marker_abuse.sh(P0 BLOCKER,user 2026-05-27 verbatim
# 「不亂加 escape markers — 加就跳 enforcement」)
#
# Hook 規則(PreToolUse,Edit / Write / MultiEdit):
#   Scope gate:
#     - tool_name ∈ {Edit, Write, MultiEdit} 才檢查(其他 tool → exit 0)
#     - file_path 必 match /(apps|consumer)/...(tsx|ts)$(consumer fork-user code)
#     - file_path 含 packages/design-system/src/ → 排除(DS 有 legit exception)
#     - content 取自 tool_input.new_string // tool_input.content;空 → exit 0
#   BLOCK(exit 2)condition:
#     - DISTINCT escape-marker types ≥ 3  OR
#     - TOTAL escape-marker occurrences ≥ 5
#   Override:GOVERNANCE_BYPASS_ESCAPE_MARKER_AUDIT=1 → exit 0(audit-logged)。
#
# Negative-case 斷言用「EXIT != 2(未 block)」為契約,不假設 stderr 全 silent:
#   hook clean-input path 有 cosmetic `0\n0: integer expression expected` stderr
#   noise(latent bug,見 hookBugFound),但 block 決策正確(exit 0)。測試斷言
#   正確 block 行為,不遷就 noise。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_escape_marker_abuse.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

# TMP_DIR for any hook state(_log-fire.sh writes under GOVERNANCE_PROJECT_DIR)
TMP_DIR=$(mktemp -d)
[ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ] || { echo "❌ mktemp -d failed(TMP_DIR;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf "$TMP_DIR"' EXIT
export GOVERNANCE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"
mkdir -p "$TMP_DIR/apps/template/src"

# run_hook: feed JSON payload to hook via stdin
#   $1 tool_name  $2 file_path  $3 content-field-name(content|new_string)  $4 content
run_hook() {
  local tool="$1"; local fp="$2"; local field="$3"; local content="$4"
  local payload
  payload=$(jq -n --arg t "$tool" --arg fp "$fp" --arg c "$content" --arg f "$field" \
    '{hook_event_name:"PreToolUse", tool_name:$t, tool_input:({file_path:$fp} + {($f):$c})}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

# run_hook_bypass: same but with GOVERNANCE_BYPASS_ESCAPE_MARKER_AUDIT=1
run_hook_bypass() {
  local tool="$1"; local fp="$2"; local field="$3"; local content="$4"
  local payload
  payload=$(jq -n --arg t "$tool" --arg fp "$fp" --arg c "$content" --arg f "$field" \
    '{hook_event_name:"PreToolUse", tool_name:$t, tool_input:({file_path:$fp} + {($f):$c})}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | GOVERNANCE_BYPASS_ESCAPE_MARKER_AUDIT=1 bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

# expect_block: exit 2 + needle in stderr
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

# expect_not_block: NOT blocked(exit != 2)。contract = 不擋;允許 cosmetic stderr。
expect_not_block() {
  local name="$1"
  if [ "$EXIT" != "2" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected NOT blocked, got exit=2 BLOCKER)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_pass() {
  local name="$1"
  if [ "$EXIT" = "0" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=0, got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

CONSUMER="/repo/apps/template/src/App.tsx"
BLOCK_NEEDLE="ESCAPE-MARKER-ABUSE BLOCKER"

echo "=== check_escape_marker_abuse tests ==="

# ---------- POSITIVE cases(SHOULD block)----------

# P1. 3 distinct markers(DISTINCT>=3 path)→ BLOCK
C_3DISTINCT='// @ds-misuse-allow legacy grid
import { Button } from "@qijenchen/design-system";
// @story-baseline-allow snapshot drift
export const App = () => <Button />;
// @consumer-catalog-allow custom icon
export const Foo = 1;'
run_hook "Write" "$CONSUMER" "content" "$C_3DISTINCT"
expect_block "P1. 3 distinct markers → BLOCK (DISTINCT>=3)" "$BLOCK_NEEDLE"

# P2. 5 occurrences of SAME marker(TOTAL>=5 path, DISTINCT=1)→ BLOCK
#     guards against over-narrow regex that only triggers on distinct-count
C_5TOTAL='// @ds-misuse-allow case 1
// @ds-misuse-allow case 2
// @ds-misuse-allow case 3
// @ds-misuse-allow case 4
// @ds-misuse-allow case 5
export const X = 1;'
run_hook "Write" "$CONSUMER" "content" "$C_5TOTAL"
expect_block "P2. 5 same-marker occurrences → BLOCK (TOTAL>=5)" "$BLOCK_NEEDLE"

# P3. Edit tool reads new_string field(not content)→ BLOCK
#     guards the new_string // content field-resolution fallback
run_hook "Edit" "$CONSUMER" "new_string" "$C_3DISTINCT"
expect_block "P3. Edit tool new_string field → BLOCK" "$BLOCK_NEEDLE"

# P4. consumer/ path variant(not apps/)also in scope → BLOCK
run_hook "Write" "/repo/consumer/widgets/Card.tsx" "content" "$C_3DISTINCT"
expect_block "P4. /consumer/ path in scope → BLOCK" "$BLOCK_NEEDLE"

# ---------- NEGATIVE cases(should NOT block)----------

# N1. Clean consumer tsx, zero markers → NOT blocked
C_CLEAN='import { Button } from "@qijenchen/design-system";
export const App = () => <Button>Save</Button>;'
run_hook "Write" "$CONSUMER" "content" "$C_CLEAN"
expect_not_block "N1. clean consumer tsx, no markers → not blocked"

# N2. NEAR-MISS over-narrow guard: 2 distinct markers (< 3) and 2 total (< 5)
#     real near-miss to the DISTINCT threshold — must NOT block
C_2DISTINCT='// @ds-misuse-allow legacy grid only
// @benchmark-unverified pending source check
export const App = 1;'
run_hook "Write" "$CONSUMER" "content" "$C_2DISTINCT"
expect_not_block "N2. near-miss 2 distinct / 2 total (< threshold) → not blocked"

# N3. NEAR-MISS over-broad guard: marker-lookalikes that are NOT in the list.
#     5 non-listed @-annotations (would block if regex were over-broad) → not blocked
C_LOOKALIKE='// @eslint-disable-next-line
// @ts-ignore
// @deprecated use Bar instead
// @internal helper
// @todo refactor later
export const App = 1;'
run_hook "Write" "$CONSUMER" "content" "$C_LOOKALIKE"
expect_not_block "N3. over-broad guard: 5 non-listed @-annotations → not blocked"

# N4. Scope exclusion: DS source path(packages/design-system/src/)→ not blocked
#     even with 3 distinct markers(DS has legit per-spec exceptions)
run_hook "Write" "/repo/packages/design-system/src/components/Foo.tsx" "content" "$C_3DISTINCT"
expect_not_block "N4. DS source path excluded → not blocked (even 3 markers)"

# N5. Scope exclusion: non-consumer path(src/ root, not apps|consumer)→ skip
run_hook "Write" "/repo/src/utils/helper.tsx" "content" "$C_3DISTINCT"
expect_not_block "N5. non-consumer path (src/) → not blocked"

# N6. Scope exclusion: .css file(only .tsx/.ts in scope)→ skip
run_hook "Write" "/repo/apps/template/src/styles.css" "content" "$C_3DISTINCT"
expect_not_block "N6. .css file out of scope → not blocked"

# N7. Tool gate: Read tool → skip(only Edit/Write/MultiEdit)
run_hook "Read" "$CONSUMER" "content" "$C_3DISTINCT"
expect_not_block "N7. tool=Read → not blocked"

# N8. Empty content → exit 0(early return)
run_hook "Write" "$CONSUMER" "content" ""
expect_not_block "N8. empty content → not blocked"

# N9. Override env GOVERNANCE_BYPASS_ESCAPE_MARKER_AUDIT=1 → not blocked
run_hook_bypass "Write" "$CONSUMER" "content" "$C_3DISTINCT"
expect_not_block "N9. GOVERNANCE_BYPASS_ESCAPE_MARKER_AUDIT=1 override → not blocked"

# N10.(2026-11-27 上游判定 E18 改寫)以前 AllDsComponents.stories.tsx 有專屬放寬(distinct ≥6);範本改名
# DsImportSmoke.stories.tsx、0 個 marker 後例外刪除 —— 同樣 3 種 marker 在舊檔名也照一般門檻擋(拿掉例外的對照組)。
# (2026-11-27 r72:超過額度改成「理由都夠具體就放行」;這裡第三個理由改成不到 10 個字的 debug,維持測「超過額度」這條路)
C_PORTAL='// @anatomy-exempt: canonical proxy portal
// @consumer-catalog-allow: imports only, never hand-mocks components
// @layout-space-magic-ok: debug
export const Portal = 1;'
run_hook "Write" "/repo/apps/template/src/AllDsComponents.stories.tsx" "content" "$C_PORTAL"
expect_block "N10. 舊 portal 檔名不再有專屬放寬:3 distinct markers → blocked" "$BLOCK_NEEDLE"

# N11. A layout-space marker that documents mechanically proven canonical micro geometry is
# redundant compatibility metadata, not an active governance escape. It must not consume the
# per-file distinct ceiling while an ordinary layout escape still does.
C_CANONICAL_MICRO_MARKER='// @layout-space-magic-ok: legacy rationale for canonical item gap
const Meta = () => <span className="inline-flex items-center gap-1"><Info />Details</span>;
// @ds-misuse-allow: one true exception
// @benchmark-unverified cited in audit notes
export const App = 1;'
run_hook "Write" "$CONSUMER" "content" "$C_CANONICAL_MICRO_MARKER"
expect_pass "N11. proven canonical micro marker excluded from per-file ceiling"

# N12. The carve-out is structural, not value-only. A gap-1 marker on an ordinary macro div still
# counts; together with two other marker families it reaches the ordinary distinct ceiling.
C_GENERIC_GAP_MARKER='<div className="flex flex-col gap-1">Sections</div> // @layout-space-magic-ok: claimed micro
// @ds-misuse-allow: true exception
// @benchmark-unverified cited in audit notes
export const App = 1;'
run_hook "Write" "$CONSUMER" "content" "$C_GENERIC_GAP_MARKER"
expect_block "N12. generic gap marker still consumes per-file ceiling" "$BLOCK_NEEDLE"

# N13. Same-line canonical micro markers are ignored too; support is symmetric with the preceding
# comment form used by JSX.
C_CANONICAL_MICRO_SAME_LINE='const Meta = () => <span className="flex items-center gap-2">Meta</span>; // @layout-space-magic-ok: legacy item anatomy rationale
// @ds-misuse-allow: one true exception
// @benchmark-unverified cited in audit notes'
run_hook "Write" "$CONSUMER" "content" "$C_CANONICAL_MICRO_SAME_LINE"
expect_pass "N13. same-line proven canonical micro marker excluded from ceiling"

# N14.(2026-11-27 H2 + H3 + H4)規格登記的寫法(頁面列表列 gap-3 px-4 py-3 + 頭像 / Item 零件)上方的
# layout 標記已經多餘,不佔每檔額度 —— 與 N11 同一個判法,只是分類器多認一種規格寫法。
C_SPEC_PATTERN_MARKER='// @layout-space-magic-ok: legacy rationale for the page list row
const Row = () => <div className="flex items-start gap-3 px-4 py-3"><Avatar src={u.photo} alt={u.name} /><ItemContent label={u.name} /></div>;
// @ds-misuse-allow: one true exception
// @benchmark-unverified cited in audit notes
export const App = 1;'
run_hook "Write" "$CONSUMER" "content" "$C_SPEC_PATTERN_MARKER"
expect_pass "N14. spec-registered page-list row marker excluded from per-file ceiling"

# N15. 反例對照:同一組 gap-3 px-4 py-3 旁邊沒有頭像 / Item 零件 → 不是規格寫法 → 標記照佔額度 → 三族湊滿就擋
C_SPEC_PATTERN_LOOKALIKE='// @layout-space-magic-ok: claimed page list row
const Row = () => <div className="flex items-start gap-3 px-4 py-3"><Info /><span>維護通知</span></div>;
// @ds-misuse-allow: one true exception
// @benchmark-unverified cited in audit notes
export const App = 1;'
run_hook "Write" "$CONSUMER" "content" "$C_SPEC_PATTERN_LOOKALIKE"
expect_block "N15. lookalike gap-3 px-4 py-3 without avatar / Item parts still consumes ceiling" "$BLOCK_NEEDLE"

# ── R-series:repo 級累計 ratchet(2026-07-08 WM 戰役 R4)──────────────────────
# 存量 ≥10(apps/** 全 repo)後,只擋「本次 edit 再新增 marker」;無 marker edit 不 brick。
mkdir -p "$TMP_DIR/apps/work/src"
for i in 1 2 3 4 5 6; do
  printf '// @ds-misuse-allow: seeded reason %s\n// @layout-space-magic-ok: seeded reason %sb\n' "$i" "$i" \
    > "$TMP_DIR/apps/work/src/seed$i.tsx"
done

# R1. 存量 12 ≥ cap 10 + 本次新增 1 marker → BLOCK(ratchet)
run_hook "Write" "$TMP_DIR/apps/work/src/new.tsx" "content" '<div /> // @ds-misuse-allow: one more'
expect_block "R1. repo 存量 12 ≥ cap + edit 加 marker → blocked (ratchet)" "ESCAPE-MARKER-REPO-RATCHET"

# R2. 存量 12 ≥ cap 但本次 edit 無 marker → not blocked(不因存量 brick 無關 edit)
run_hook "Write" "$TMP_DIR/apps/work/src/new.tsx" "content" '<div className="flex" />'
expect_not_block "R2. repo 存量 ≥ cap 但 edit 無 marker → not blocked"

# R3. 存量降到 4 < cap + 本次加 1 marker → not blocked
rm -f "$TMP_DIR/apps/work/src/seed3.tsx" "$TMP_DIR/apps/work/src/seed4.tsx" \
      "$TMP_DIR/apps/work/src/seed5.tsx" "$TMP_DIR/apps/work/src/seed6.tsx"
run_hook "Write" "$TMP_DIR/apps/work/src/new.tsx" "content" '<div /> // @ds-misuse-allow: legit case'
expect_not_block "R3. repo 存量 4 < cap + edit 加 marker → not blocked"

# R4. Repo ratchet must count real escapes, not legacy comments attached to geometry that the
# canonical layout classifier now proves without an escape. Seed 12 such comments (> cap), then
# verify one genuine but still-below-cap exception is accepted.
rm -rf "$TMP_DIR/apps/work/src"
mkdir -p "$TMP_DIR/apps/work/src"
for i in 1 2 3 4 5 6; do
  printf '// @layout-space-magic-ok: legacy canonical micro %s\nconst A%s = () => <span className="inline-flex items-center gap-1">A</span>\n// @layout-space-magic-ok: legacy canonical micro %sb\nconst B%s = () => <span className="flex items-start gap-2">B</span>\n' \
    "$i" "$i" "$i" "$i" > "$TMP_DIR/apps/work/src/micro$i.tsx"
done
run_hook "Write" "$TMP_DIR/apps/work/src/new.tsx" "content" '<div /> // @ds-misuse-allow: one bounded true exception'
expect_pass "R4. repo canonical micro markers do not consume escape ratchet"

# ── P-series:每個 app 各自計數(2026-11-27,上游判定 B1)+ 規範位置的建置輸出不計(B4)──────────
# 計數根 = 本次編輯檔所在的 apps/<name>;template 是一個 repo 放多個 app(workspaces = apps/*)。
seed_app() { # seed_app <app> <n>:在 apps/<app>/src 放 n 個真 escape marker
  mkdir -p "$TMP_DIR/apps/$1/src"
  i=1
  while [ "$i" -le "$2" ]; do
    printf '// @ds-misuse-allow: seeded reason %s %s\n' "$1" "$i" > "$TMP_DIR/apps/$1/src/seed$i.tsx"
    i=$((i + 1))
  done
}
rm -rf "$TMP_DIR/apps"; mkdir -p "$TMP_DIR/apps"
seed_app alpha 9; seed_app beta 9
# P1. 兩個 app 各 9 個(合計 18 > 10)→ 各自加 1 個都放行(舊實作:全 apps/** 合算 18 ≥ 10 → 擋)
run_hook "Write" "$TMP_DIR/apps/alpha/src/new.tsx" "content" '<div /> // @ds-misuse-allow: alpha bounded exception'
expect_not_block "P1a. alpha 9 < cap(beta 的 9 不算進來)+ 加 1 → not blocked"
run_hook "Write" "$TMP_DIR/apps/beta/src/new.tsx" "content" '<div /> // @ds-misuse-allow: beta bounded exception'
expect_not_block "P1b. beta 9 < cap + 加 1 → not blocked"
# P2. alpha 到 11 個 → 只擋 alpha;beta 仍可新增
# (2026-11-27 r72:超過額度改成「理由都夠具體就放行」;P2a / P3a / P5a / P5b 的理由改成不到 10 個字,維持測計數根這條路;
#  理由夠具體就放行的那一面在下方 Q-series)
seed_app alpha 11
run_hook "Write" "$TMP_DIR/apps/alpha/src/new.tsx" "content" '<div /> // @ds-misuse-allow: alpha'
expect_block "P2a. alpha 存量 11 ≥ cap + 加 marker → blocked(只擋 alpha)" "ESCAPE-MARKER-REPO-RATCHET"
run_hook "Write" "$TMP_DIR/apps/beta/src/new.tsx" "content" '<div /> // @ds-misuse-allow: beta still fine'
expect_not_block "P2b. alpha 超標不拖累 beta(beta 9 < cap)→ not blocked"
# P3.(2026-11-27 規格核對必修 1 改寫)apps/<x> 還不存在 → 退回整個 apps/ 計數,不再當存量 0(那等於 ratchet 關掉)
#    此時 alpha 11 + beta 9 = 20 ≥ cap → 擋並指名 apps/**
run_hook "Write" "$TMP_DIR/apps/gamma/src/new.tsx" "content" '<div /> // @ds-misuse-allow: first'
expect_block "P3a. apps/gamma 還不存在 → 以整個 apps/ 計(20 ≥ cap)→ blocked" "apps/gamma 還不存在"
# P3b. 對照:整個 apps/ 未達上限時,不存在的 app 第一筆照放行
rm -rf "$TMP_DIR/apps"; seed_app alpha 3
run_hook "Write" "$TMP_DIR/apps/gamma/src/new.tsx" "content" '<div /> // @ds-misuse-allow: first exception in a new app'
expect_not_block "P3b. apps/gamma 還不存在、整個 apps/ 只有 3 → not blocked"
# P5.(必修 1)巢狀路徑:app 名取 apps/ 之後的第一段。apps/alpha/src/apps/zzz/… 屬於 alpha(舊貪婪 sed 取到 zzz → 存量 0 → 放行)
seed_app alpha 11
mkdir -p "$TMP_DIR/apps/alpha/src/apps/zzz"
run_hook "Write" "$TMP_DIR/apps/alpha/src/apps/zzz/new.tsx" "content" '<div /> // @ds-misuse-allow: nested'
expect_block "P5a. apps/alpha/src/apps/zzz/new.tsx 算 alpha(11 ≥ cap)→ blocked" "apps/alpha escape marker"
# P5b. 專案根本身在 …/apps/proj/ 底下、編輯 consumer/…:不屬於任何 app → 以整個 apps/ 計(舊貪婪 sed 取到 proj → 不存在 → 0 → 放行)
NEST_PROJ="$TMP_DIR/outer/apps/proj"
mkdir -p "$NEST_PROJ/.claude/logs" "$NEST_PROJ/consumer/src" "$NEST_PROJ/apps/one/src"
i=1
while [ "$i" -le 11 ]; do
  printf '// @ds-misuse-allow: seeded nested %s\n' "$i" > "$NEST_PROJ/apps/one/src/seed$i.tsx"
  i=$((i + 1))
done
GOVERNANCE_PROJECT_DIR="$NEST_PROJ" run_hook "Write" "$NEST_PROJ/consumer/src/new.tsx" "content" '<div /> // @ds-misuse-allow: consumer'
expect_block "P5b. 專案根在 …/apps/proj/ 底下、consumer/ 檔 → 整個 apps/ 11 ≥ cap → blocked" "apps/** escape marker"
# P5c. 對照:同一個專案,apps/one 降到 3 → 放行(證明 P5b 紅是因為存量,不是路徑本身被擋)
rm -f "$NEST_PROJ"/apps/one/src/seed[4-9].tsx "$NEST_PROJ"/apps/one/src/seed1[01].tsx
GOVERNANCE_PROJECT_DIR="$NEST_PROJ" run_hook "Write" "$NEST_PROJ/consumer/src/new.tsx" "content" '<div /> // @ds-misuse-allow: consumer exception'
expect_not_block "P5c. 同一專案 apps/ 只剩 3 → not blocked"
rm -rf "$TMP_DIR/outer"
# P4(B4). 規範位置的建置輸出(apps/<name>/storybook-static、node_modules、dist …)不計;src 底下叫 dist 的資料夾照計
rm -rf "$TMP_DIR/apps"; mkdir -p "$TMP_DIR/apps/delta/storybook-static" "$TMP_DIR/apps/delta/src/dist"
i=1
while [ "$i" -le 12 ]; do
  printf '// @ds-misuse-allow: built output copy %s\n' "$i" > "$TMP_DIR/apps/delta/storybook-static/out$i.ts"
  i=$((i + 1))
done
run_hook "Write" "$TMP_DIR/apps/delta/src/new.tsx" "content" '<div /> // @ds-misuse-allow: real source exception'
expect_not_block "P4a. apps/delta/storybook-static 的 12 個 marker 是建置輸出、不計 → not blocked"
i=1
while [ "$i" -le 12 ]; do
  printf '// @ds-misuse-allow: source under a dist-named folder %s\n' "$i" > "$TMP_DIR/apps/delta/src/dist/src$i.ts"
  i=$((i + 1))
done
run_hook "Write" "$TMP_DIR/apps/delta/src/new.tsx" "content" '<div /> // @ds-misuse-allow: one more'
expect_block "P4b. apps/delta/src/dist 是原始碼(不在規範位置)、12 個照計 → blocked" "ESCAPE-MARKER-REPO-RATCHET"

rm -rf "$TMP_DIR/apps"

# ── Q-series(2026-11-27 r72,user 同日 model2 留言「當消費者有合理的理由想要修正應該也要給予可以調整的空間」)──
# 超過額度不再一律擋:每個標記冒號後至少 10 個字、同一份內容不重複同一句 → 放行;否則擋並逐行指出。
# 空理由在任何數量下都擋(-allow / -ok / -skip 三種字尾,JSX 註解收尾也算空)。
mkdir -p "$TMP_DIR/apps/template/src"
# Q1. 每檔超過額度(3 種),每個理由都針對那一行 → 放行(以前這裡一律擋)
C_Q_SPECIFIC='// @ds-misuse-allow: 表格在側欄內寬度不夠,放不下 DataTable 的工具列
// @story-baseline-allow: 這支只測鍵盤操作順序,不做畫面比對
// @consumer-catalog-allow: 只匯入元件確認打包成功,沒有手刻元件
export const App = 1;'
run_hook "Write" "$CONSUMER" "content" "$C_Q_SPECIFIC"
expect_pass "Q1. 超過每檔額度 + 每個理由都夠具體 → 放行"
# Q2. 對照:同樣超過額度,但兩行複製貼上同一句理由 → 擋並指出是同一句
C_Q_DUP='// @ds-misuse-allow: 產品經理指定的特殊版面需求
// @story-baseline-allow: 產品經理指定的特殊版面需求
// @consumer-catalog-allow: 只匯入元件確認打包成功,沒有手刻元件
export const App = 1;'
run_hook "Write" "$CONSUMER" "content" "$C_Q_DUP"
expect_block "Q2. 超過每檔額度 + 兩行同一句理由 → 擋" "與第 1 行同一句理由"
# Q3. 對照:超過額度、其中一個理由太短 → 擋並指出不到 10 個字
C_Q_SHORT='// @ds-misuse-allow: 表格在側欄內寬度不夠,放不下 DataTable 的工具列
// @story-baseline-allow: 暫時
// @consumer-catalog-allow: 只匯入元件確認打包成功,沒有手刻元件
export const App = 1;'
run_hook "Write" "$CONSUMER" "content" "$C_Q_SHORT"
expect_block "Q3. 超過每檔額度 + 一個理由太短 → 擋" "理由不到 10 個字"
# Q4. app 存量 11 ≥ 額度(原生寫入)+ 本次理由夠具體 → 放行;對照 R1 / P2a(理由太短 → 擋)
seed_app alpha 11
run_hook "Write" "$TMP_DIR/apps/alpha/src/new.tsx" "content" '<div /> // @ds-misuse-allow: 這一列是唯讀摘要,刻意不用可互動的 MenuItem'
expect_pass "Q4. app 存量超過額度 + 本次理由夠具體 → 放行"
# Q5. CI 重播(整份檔,GOVERNANCE_STATIC_REPLAY=1):app 存量 11 > 10。理由太短 → 擋;改成具體理由 → 放行(兩面)
GOVERNANCE_STATIC_REPLAY=1 run_hook "Write" "$TMP_DIR/apps/alpha/src/new.tsx" "content" '<div /> // @ds-misuse-allow: 暫時'
expect_block "Q5a. CI 重播 app 超過額度 + 理由太短 → 擋" "ESCAPE-MARKER-REPO-RATCHET"
GOVERNANCE_STATIC_REPLAY=1 run_hook "Write" "$TMP_DIR/apps/alpha/src/new.tsx" "content" '<div /> // @ds-misuse-allow: 這一列是唯讀摘要,刻意不用可互動的 MenuItem'
expect_pass "Q5b. CI 重播 app 超過額度 + 理由夠具體 → 放行"
rm -rf "$TMP_DIR/apps"; mkdir -p "$TMP_DIR/apps/template/src"
# Q6. 空理由:-ok 家族(以前只認 -allow)與 JSX 註解收尾 `*/}` 都算空 → 擋;寫了理由 → 放行
run_hook "Write" "$CONSUMER" "content" '<span>{/* @cat-solid-ok: */}</span>'
expect_block "Q6a. {/* @cat-solid-ok: */} 空理由 → 擋" "ESCAPE-MARKER-NO-RATIONALE"
run_hook "Write" "$CONSUMER" "content" 'const now = Date.now(); // @nondeterministic-ok:'
expect_block "Q6b. // @nondeterministic-ok: 空理由 → 擋" "ESCAPE-MARKER-NO-RATIONALE"
run_hook "Write" "$CONSUMER" "content" 'export const S = 1; // @app-story-title-skip:   '
expect_block "Q6c. -skip 家族空理由 → 擋" "ESCAPE-MARKER-NO-RATIONALE"
run_hook "Write" "$CONSUMER" "content" '<span>{/* @cat-solid-ok: 品牌指定活動色,白字對比已量過 */}</span>'
expect_pass "Q6d. -ok 家族寫了理由 → 放行"
run_hook "Write" "$CONSUMER" "content" '// @anatomy-rationale:
// 這支 anatomy 只有兩個零件,理由寫在下一行'
expect_pass "Q6e. -rationale 家族是多行說明開頭,不算空理由 → 放行"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0
