// governance-count-drift.mjs — 治理文件裡「寫死的總數」與實數比對(sync-governance-counters.mjs 的掃描核心)
//
// 抽成純函式的理由(M37):判斷式與「掃哪些檔」都要能被 meta-test 直接測,而 sync-governance-counters.mjs
// 必須真的消費這裡的函式 —— 不得各寫一份。scripts/test-sync-governance-counters.mjs 同時測判定表、
// 檔案清單(「那個值是誰算的」),以及跑一次真的 sync-governance-counters.mjs 證明它接的是這一份。
//
// 2026-11-21 knowledge-prune WP-10(H-R2):掃描範圍從 9 份人工挑的檔加寬到 AGENTS.md、canonical skills 的
// SKILL.md 與 references、rules 全部,並納管「數字 + dim」—— 這是 PreToolUse hook check_dim_count_drift.sh
// (已刪除)原本負責的事;那支 hook 註冊為 outputMode "diagnostic"、只在 stderr 印警告後 exit 0,不擋任何東西。
// 現在改由 CI 必過的 --check 擋(ci.yml → governance-build-graph --check → generate-governance-metadata --check)。
import { existsSync } from 'node:fs'
import { globSync } from 'node:fs'

export const CANONICAL = 'packages/design-system/ds-canonical'

// 固定要掃的單檔:根目錄與各層的 AGENTS.md / CLAUDE.md(原 hook 的 `*/AGENTS.md`、`*/CLAUDE.md` 範圍)、
// plugin 清單、template 說明,以及 skills 目錄自己的 README(寫著現役 skill 總數)。
const FIXED_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'packages/design-system/AGENTS.md',
  'packages/design-system/CLAUDE.md',
  `${CANONICAL}/fork/AGENTS.md`,
  `${CANONICAL}/fork/CLAUDE.md`,
  `${CANONICAL}/skills/README.md`,
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'scripts/check-plugin-installed.mjs',
  'template/ds-product-template/AGENTS.md',
  'template/ds-product-template/CLAUDE.md',
  'template/ds-product-template/README.md',
]

// 依目錄展開的範圍(canonical source;.claude/ .agents/ fork 副本是它們的生成投影,由 governance:check 保證逐字相同)。
const GLOBS = [
  `${CANONICAL}/skills/*/SKILL.md`,
  `${CANONICAL}/skills/*/references/*.md`,
  `${CANONICAL}/rules/*.md`,
]

// 歷史檔不掃:裡面的數字是「當時」的量測,本來就不該跟著現值變。每一筆都要說得出檔案自己怎麼標明它是歷史。
export const HISTORICAL_COUNT_FILES = new Map([
  [`${CANONICAL}/skills/design-system-audit/references/historical-bugs.md`, '逐案事故紀錄,每段帶當天日期'],
  [`${CANONICAL}/skills/knowledge-prune/references/meta-pattern-history.md`, '檔頭自述「數字(25 skills、本季 net add 12 等)是當時的量測」'],
])

export function resolveLiveCountFiles(root) {
  const files = new Set(FIXED_FILES)
  for (const pattern of GLOBS) {
    for (const rel of globSync(pattern, { cwd: root })) files.add(rel.split('\\').join('/'))
  }
  return [...files]
    .filter(rel => !HISTORICAL_COUNT_FILES.has(rel))
    .filter(rel => existsSync(`${root}/${rel}`))
    .sort()
}

// 數字前面的界線:
//   (?<![\w.])  數字不得黏在英數字或「.」後面 —— 版號 beta.37、v14、P0、D10 這類都不是「總數」。
//               (舊註解以為 `\b` 能擋 beta.37,其實「.」與「3」之間就是 word boundary,擋不住。)
//   (?<!\d-)    數字不得接在「數字-」後面 —— 日期 2026-07-04 dim 73、範圍 52-56 的尾巴都不是總數宣稱。
// 數字本身至少兩位:hooks / skills / M-rules / audit dims 的總數都是兩位數;一位數多半是子集(「改了 3 hooks」)
// 或另一套維度系統的計數(AGENTS.md「3 層級 × 6 維度」、new-component SKILL.md「7-dim spec」、
// visual-audit SKILL.md「/product-ui-audit(6 dim)」),一律不當總數。
const LEAD = String.raw`(?<![\w.])(?<!\d-)([1-9]\d+)`
// 數字與名詞之間只認同一行的空白:`\s` 會跨行,把 knowledge-prune SKILL.md 表格裡「≤250」行尾與下一行開頭的
// 「hooks」接成「250 hooks」(加寬掃描時實際撞到的誤報)。
const SP = String.raw`[ \t]`
// 數字與名詞之間可以夾一個中文量詞:「33 條 M-rules」「25 個 skills」「52 支 hooks」「91 項 dim」。
// 反駁 B6:原本只認空白,AGENTS.md Rule Index 那句「33 條 M-rules」中間夾了「條」就對不上,M-rule 數一變
// 那句會靜默漂移(寬窄落差,M7 / M34)。四種總數用同一個寫法,不再一種名詞一套。
// 量詞只收這四個字;夾別的中文字(「40 處死 hook」的「處」、「66 必與 dim」的「必與」)就不是總數宣稱。
const QUANT = '[個條支項]'
const GAP = String.raw`(?:${SP}*${QUANT}${SP}*|${SP}+)`

export function buildCountPatterns(counts) {
  return [
    // 「91 dim rubric」「91-dim matrix」「91 audit dims」「91 audit dimensions」「91 個 dim」「91 dim 全掃」都算。
    // 不收「N 維度」「N 維」:這個字被好幾套系統共用(spec-rules.md「7 維度」、knowledge-prune SKILL.md「10 維 scan」
    // 本身就是兩位數),不存在一個「正確值」可以比,收了就是誤報(D6-3:已刪除的 hook check_dim_count_drift.sh
    // 用「數字 + 維度」比對,把合法的「6 維度」「7 維度」都報成寫死)。
    { label: 'audit dims', re: new RegExp(String.raw`${LEAD}${SP}*(?:${QUANT}${SP}*)?-?${SP}*(?:audit[ \t-]+)?dim(?:ension)?s?\b`, 'gi'), actual: counts.auditDims },
    // 「52 hooks」「52 支 hooks」「52 個 DS governance hooks」。只收複數 hooks:單數「hook」在 canonical 檔裡是
    // 歷史錨點的寫法(knowledge-prune SKILL.md「把全部 60 支 hook 標成 dead」記的是 2026-09-24 當天的數)。
    { label: 'hooks', re: new RegExp(String.raw`${LEAD}${GAP}(?:DS${SP}+governance${SP}+)?hooks\b`, 'g'), actual: counts.hooks },
    { label: 'skills', re: new RegExp(String.raw`${LEAD}${GAP}skills\b`, 'g'), actual: counts.skills },
    { label: 'M-rules', re: new RegExp(String.raw`${LEAD}${GAP}(?:active${SP}+)?M-rules?\b`, 'g'), actual: counts.mRules },
  ]
}

// 純函式:一份檔的內容 → 每一個寫錯的總數一筆(帶行號)。寫對的不報 —— 被納管的意思是「寫了就必須對」。
export function scanCountDrift(rel, content, counts) {
  const drifts = []
  const lineStarts = [0]
  for (let i = 0; i < content.length; i += 1) if (content[i] === '\n') lineStarts.push(i + 1)
  const lineOf = (index) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= index) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
  for (const { label, re, actual } of buildCountPatterns(counts)) {
    for (const m of content.matchAll(re)) {
      const declared = parseInt(m[1], 10)
      if (declared !== actual) drifts.push(`${rel}:${lineOf(m.index)}: "${m[0].trim()}" != actual ${label} ${actual}`)
    }
  }
  return drifts
}
