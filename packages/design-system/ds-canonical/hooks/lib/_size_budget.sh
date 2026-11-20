#!/bin/bash
# _size_budget.sh —— 治理檔大小上限的唯一一張表,連同量法(helper,被 source;本身不是 hook)。
#
# 讀者:check_file_size_budget.sh(PreToolUse,寫入當下判:寫完超過 TRANSITION 而且這次變長 → 擋,其餘超標只提醒)。
#       Stop hook 的上限清單也要改接本檔 ——
#       接完之後,全庫各檔(instruction entry / memory / rules / spec / SKILL)的上限只剩這一張表。
#       外部文件寫「check_file_size_budget.sh 的 case 表」指的就是這裡的 governance_size_budget。
# 不在這裡的門檻:開場檔「總」行數、hook 數、memory 索引條數 → session_start_governance_check.sh(檔頭 + Check 1 / 7 / 8);
#       memory 會讓 CI 紅的那一份 → governance/memory/contract.json(本表 memory 那一列直接讀它,不另寫數字)。
#
# 介面(全部只讀,不寫任何檔):
#   governance_size_budget <repo 相對路徑>
#       有預算 → 印一行 `BUDGET<TAB>TRANSITION<TAB>UNIT<TAB>LABEL`(UNIT = lines | chars;LABEL 放最後,可含空白),回 0
#       不在表內 → 不印,回 1
#       量具壞了(registry / contract 讀不到;或路徑要靠 provider 才判得出、provider 卻解析不到)→ 回 2。
#       「讀不到」不等於「不在表內」,呼叫端不得當成放行。provider 只在第 4 段用到:spec / memory / rules /
#       canonical SKILL 只看路徑就能判,provider 壞了照樣量(測試 Test 26–28 兩面都守著)。
#   governance_size_measure <檔案> <lines|chars>
#       印 `手寫量<TAB>被扣掉的量`。扣掉的是 scripts/add-reciprocal-pointers.mjs 自動維護的「## 被引用(auto-maintained…)」段
#      (標題行起,到下一個 `## ` 標題或檔尾為止;段後若還有手寫章節照算)—— 該段長度只取決於有幾份 spec 指向本檔,
#       作者刪不掉也不該刪,量它就是拿代理當性質(M37)。chars = Unicode 字元數(與 UTF-8 locale 下的 `wc -m` 同值),
#       不受執行環境 locale 影響。
#   governance_size_cell_budget <repo 相對路徑>
#       有「表格單格」上限 → 印 `N<TAB>LABEL`,回 0;沒有 → 回 1。目前只有 meta-patterns.md 的 M-rule 第 2 欄。
#   governance_size_oversized_cells <檔案> <N>
#       每個第 2 欄超過 N 字的 M-rule 列印一行 `<M-ID><TAB><字數>`(GFM 的 `\|` 是格內的字,不切格)。
#
# 本檔只給數字與量法;超標要不要擋由呼叫端決定(check_file_size_budget.sh 檔頭:2026-11-21 起寫完超過 TRANSITION
# 而且這次變長就擋,檔頭 `@size-budget-allow: <reason>` 整檔豁免;依據與沿革也記在那裡)。

# 路徑事實(provider / canonical roots)一律經 _provider_paths.sh 由 registry 解析;呼叫端還沒 source 就在這裡補。
if ! declare -F governance_provider_string_field >/dev/null 2>&1; then
  # shellcheck source=/dev/null
  source "$(dirname "${BASH_SOURCE[0]}")/_provider_paths.sh" || return 2
fi

_governance_size_emit() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4"
}

# memory 每檔行數:數字只住在 governance/memory/contract.json 的 maxLinesPerMemory
#(scripts/validate-memory-contract.mjs 用同一個值讓 CI 紅);這裡讀它,不再寫第二個 100。
_governance_size_memory_max_lines() {
  local corpus contract
  corpus="$(governance_corpus_root)" || return 1
  contract="$corpus/governance/memory/contract.json"
  [ -f "$contract" ] && [ ! -L "$contract" ] || return 1
  jq -er '.maxLinesPerMemory | select(type == "number" and . > 0 and . == floor)' "$contract" 2>/dev/null
}

governance_size_budget() {
  local rel="${1#./}" skills_root rules_root rule_name max_lines
  local instruction_entry shared_entry provider_skill_root skill_entry
  [ -n "$rel" ] || return 1

  # ── 1. 只看路徑就能判的類別(不需要知道現在是哪個 provider)──
  case "$rel" in
    governance/memory/*.md)
      max_lines="$(_governance_size_memory_max_lines)" || return 2
      # BUDGET = TRANSITION = contract 上限:寫完超過而且變長 → 呼叫端擋;沒變長只提醒。這一類另有 CI 會擋,label 照實講出來。
      _governance_size_emit "$max_lines" "$max_lines" lines "memory file(CI fails above this cap: scripts/validate-memory-contract.mjs)"
      return 0 ;;
    # Super-foundational SSOT spec(item-anatomy = Family 1+2 跨 10+ 消費者 SSOT,唯一例外)
    */item-anatomy.spec.md)
      _governance_size_emit 800 1200 lines "super-foundational SSOT spec.md(item-anatomy 例外)"
      return 0 ;;
    # Foundational SSOT specs(2026-04-24 升 cap 800 — spec 內部有 rationale section)
    # 2026-05-18 加 data-table:DS 最複雜 composite + 跨家族 anchor(L1-L4 完整 grid taxonomy,
    # 行對齊 item-anatomy / 浮層對齊 overlay-surface / state 對齊 field-controls)。
    # frontmatter 已標 `foundational_ssot: true`。
    # 2026-05-22 prune:color.spec.md 升 tier 2 cap 1000(/knowledge-prune Lens 1+2 verdict — 218-line semantic
    # 不可拆 + nested theme + Atlassian rationale 集中一處)。當時另引的「foundational ≤ 800-1200」已不存在,
    # 數值以本表為準。
    */color.spec.md)
      _governance_size_emit 800 1000 lines "foundational SSOT spec.md(color tier 2 cap 1000)"
      return 0 ;;
    */sidebar.spec.md|*/tree-view.spec.md|*/data-table.spec.md)
      _governance_size_emit 500 800 lines "foundational SSOT spec.md"
      return 0 ;;
    *.spec.md)
      _governance_size_emit 300 500 lines "spec.md"
      return 0 ;;
  esac

  # ── 2. canonical rules(rules/*.md;2026-11-18 新增,單位是字數)──
  # 規則檔是每次對話都塞進 context 的檔(meta-patterns 無 paths、永遠載入;其餘依 paths 命中載入),
  # 成本跟字數走,不跟行數走 —— meta-patterns 一列可以三千多字,量行數永遠量不到。
  # 數值 = 38649f5a 實量取整(進位到千),TRANSITION 再 +10%:
  #   meta-patterns.md 31,983 字 → 32,000 / 35,200;
  #   其餘規則檔最大的是 story-rules.md 14,131 字 → 15,000 / 16,500(拿 meta-patterns 的數字套它們,
  #   story-rules 可以再長一倍多都沒有訊號,等於沒訂)。
  # registry 沒宣告 rules root(只有測試用的 fixture registry 會這樣)= 沒有規則檔可管。
  rules_root="$(governance_canonical_relative_root rules 2>/dev/null || true)"
  if [ -n "$rules_root" ] && governance_path_is_under "$rel" "$rules_root"; then
    rule_name="${rel#"$rules_root"/}"
    case "$rule_name" in
      meta-patterns.md)
        _governance_size_emit 32000 35200 chars "always-loaded rule file(meta-patterns.md)"
        return 0 ;;
      */*) ;;
      *.md)
        _governance_size_emit 15000 16500 chars "path-scoped rule file"
        return 0 ;;
    esac
  fi

  # ── 3. canonical SKILL.md ──
  skills_root="$(governance_canonical_relative_root skills 2>/dev/null)" || return 2
  if [ "$rel" = "$skills_root/design-system-audit/SKILL.md" ]; then
    _governance_size_budget_design_system_audit
    return 0
  fi
  if governance_path_is_under "$rel" "$skills_root" && [ "${rel##*/}" = "SKILL.md" ]; then
    _governance_size_emit 250 400 lines "canonical SKILL.md"
    return 0
  fi

  # ── 4. 要知道是哪個 provider 才能判的類別 ──
  # provider 解析不到 → 回 2(量具壞了),不准回 1(那等於把 instruction entry / provider skill view 默默放行)。
  instruction_entry="$(governance_provider_string_field instructionEntry 2>/dev/null)" || return 2
  shared_entry="$(governance_provider_string_field sharedInstructionEntry 2>/dev/null)" || return 2
  provider_skill_root="$(governance_provider_string_field skillDirectory 2>/dev/null)" || return 2
  skill_entry="$(governance_provider_skill_entry_file 2>/dev/null || true)"
  case "$rel" in
    "$instruction_entry"|"$shared_entry")
      _governance_size_emit 400 800 lines "instruction entry"
      return 0 ;;
  esac
  if [ -n "$skill_entry" ] && governance_path_is_under "$rel" "$provider_skill_root" \
    && [ "${rel##*/}" = "$skill_entry" ]; then
    # provider skill view 是 canonical SKILL.md 的投影,上限跟著 canonical 走(同一份內容,同一個數字)
    if [ "$rel" = "$provider_skill_root/design-system-audit/$skill_entry" ]; then
      _governance_size_budget_design_system_audit
    else
      _governance_size_emit 250 400 lines "provider skill entry($skill_entry)"
    fi
    return 0
  fi
  return 1
}

# design-system-audit SKILL.md 是 audit dim 的 registry 正本(2026-11-18 訂;取代該檔「Budget note」的散文豁免):
#   - 「## The audit dimensions」段(38649f5a 實量:第 36–223 行共 188 行,91 列 dim)不能拆出去 ——
#     scripts/dispatch-audit-dims.mjs、sync-governance-counters.mjs、audit-preflight.mjs、audit-coverage-matrix.mjs
#     都直接讀這一個檔、用 `| N | **title**` 解析 dim 列;拆檔就是同時改四支 parser 的來源。所以這段不受一般 SKILL 的 250 行管。
#   - 段外的散文(同次量 209 行)仍照一般 SKILL 的標準:
#     BUDGET = 188 + 250 = 438 → 440;TRANSITION = 188 + 400 = 588 → 590。
#   - 之後新增 dim 讓 registry 段變長:重量那段行數,照同一個算式改這兩個數字。
_governance_size_budget_design_system_audit() {
  _governance_size_emit 440 590 lines "design-system-audit SKILL.md(audit dim registry SSOT)"
}

governance_size_measure() {
  local file="$1" unit="$2" total auto
  [ -f "$file" ] || return 1
  case "$unit" in
    lines)
      total=$(wc -l < "$file" | tr -d ' ') || return 1
      auto=$(awk '
        index($0, "## 被引用(auto-maintained") == 1 { skip = 1; n++; next }
        skip && /^## / { skip = 0 }
        skip { n++ }
        END { print n + 0 }
      ' "$file") || return 1
      printf '%s\t%s\n' "$((total - auto))" "$auto"
      ;;
    chars)
      python3 - "$file" <<'PY'
import sys

text = open(sys.argv[1], 'rb').read().decode('utf-8', 'replace')
parts = text.split('\n')
lines = [part + '\n' for part in parts[:-1]] + ([parts[-1]] if parts[-1] else [])
auto = 0
skip = False
for line in lines:
    if line.startswith('## 被引用(auto-maintained'):
        skip = True
        auto += len(line)
        continue
    if skip and line.startswith('## '):
        skip = False
    if skip:
        auto += len(line)
print(f'{len(text) - auto}\t{auto}')
PY
      ;;
    *) return 1 ;;
  esac
}

# meta-patterns.md 的 M-rule 表第 2 欄(Meta-Principle)單格上限,只提醒、不擋。
# N = 38649f5a 實量 33 列的 p90(nearest-rank)1,580 字,取整到 1,600。當時超過的是 M23 2,585 / M32 2,961 / M36 3,241 ——
# 規則欄裡夾了事件經過;經過該搬去 skills/design-system-audit/references/historical-bugs.md,規則欄留規則句與一行索引。
# 那幾列瘦下來之後,這個數字可以再收緊(重量分布,照同一個取法)。
governance_size_cell_budget() {
  local rel="${1#./}" rules_root
  rules_root="$(governance_canonical_relative_root rules 2>/dev/null)" || return 1
  [ "$rel" = "$rules_root/meta-patterns.md" ] || return 1
  printf '%s\t%s\n' 1600 "meta-patterns.md M-rule column 2 (Meta-Principle)"
}

governance_size_oversized_cells() {
  local file="$1" limit="$2"
  [ -f "$file" ] || return 1
  printf '%s' "$limit" | grep -qE '^[0-9]+$' || return 1
  python3 - "$file" "$limit" <<'PY'
import re
import sys

path, limit = sys.argv[1], int(sys.argv[2])
text = open(path, 'rb').read().decode('utf-8', 'replace')
row = re.compile(r'^\|\s*\*\*(M\d+)\*\*\s*\|')
for line in text.split('\n'):
    match = row.match(line)
    if not match:
        continue
    cells = re.split(r'(?<!\\)\|', line)
    if len(cells) < 4:
        continue
    size = len(cells[2].strip())
    if size > limit:
        print(f'{match.group(1)}\t{size}')
PY
}
