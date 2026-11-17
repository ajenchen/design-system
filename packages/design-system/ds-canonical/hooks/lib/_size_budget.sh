#!/bin/bash
# _size_budget.sh —— 治理檔大小上限的唯一一張表,連同量法(helper,被 source;本身不是 hook)。
#
# 讀者:check_file_size_budget.sh(PreToolUse,寫入當下提醒)。Stop hook 的上限清單也要改接本檔 ——
#       接完之後,全庫各檔(instruction entry / memory / spec / SKILL)的上限只剩這一張表。
#       外部文件寫「check_file_size_budget.sh 的 case 表」指的就是這裡的 governance_size_budget。
# 不在這裡的門檻:開場檔「總」行數、hook 數、memory 索引條數 → session_start_governance_check.sh(檔頭 + Check 1 / 7 / 8);
#       memory 會讓 CI 紅的那一份 → governance/memory/contract.json(本表 memory 那一列直接讀它,不另寫數字)。
#
# 介面(全部只讀,不寫任何檔):
#   governance_size_budget <repo 相對路徑>
#       有預算 → 印一行 `BUDGET<TAB>TRANSITION<TAB>UNIT<TAB>LABEL`(UNIT 目前只有 lines;LABEL 放最後,可含空白),回 0
#       不在表內 → 不印,回 1
#       量具壞了(registry / contract 讀不到)→ 回 2。「讀不到」不等於「不在表內」,呼叫端不得當成放行。
#   governance_size_measure <檔案> <lines>
#       印 `手寫量<TAB>被扣掉的量`。扣掉的是 scripts/add-reciprocal-pointers.mjs 自動維護的「## 被引用(auto-maintained…)」段
#      (標題行起,到下一個 `## ` 標題或檔尾為止;段後若還有手寫章節照算)—— 該段長度只取決於有幾份 spec 指向本檔,
#       作者刪不掉也不該刪,量它就是拿代理當性質(M37)。
#
# 全部都只是「預算」:超標要不要擋由呼叫端決定(check_file_size_budget.sh 檔頭寫了它的做法)。

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
  local rel="${1#./}" skills_root max_lines
  local instruction_entry shared_entry provider_skill_root skill_entry
  [ -n "$rel" ] || return 1

  # ── 1. 只看路徑就能判的類別(不需要知道現在是哪個 provider)──
  case "$rel" in
    governance/memory/*.md)
      max_lines="$(_governance_size_memory_max_lines)" || return 2
      _governance_size_emit "$max_lines" "$max_lines" lines "memory file"
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

  # ── 2. canonical SKILL.md ──
  skills_root="$(governance_canonical_relative_root skills 2>/dev/null)" || return 2
  if governance_path_is_under "$rel" "$skills_root" && [ "${rel##*/}" = "SKILL.md" ]; then
    _governance_size_emit 250 400 lines "canonical SKILL.md"
    return 0
  fi

  # ── 3. 要知道是哪個 provider 才能判的類別 ──
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
    _governance_size_emit 250 400 lines "provider skill entry($skill_entry)"
    return 0
  fi
  return 1
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
    *) return 1 ;;
  esac
}
