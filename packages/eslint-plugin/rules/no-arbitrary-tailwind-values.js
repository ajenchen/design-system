'use strict';

/**
 * no-arbitrary-tailwind-values
 *
 * 同源 hook:.claude/hooks/check_layout_space_magic_numbers.sh(write-time P0 BLOCKER)。
 * hook 只擋 AI 寫入當下的 diff;本 rule 全量掃 + 可 CI。
 *
 * 家族觀念承襲 hook L46 的 spacing 家族(p/px/py/pt/pb/pl/pr/gap/space-x/space-y/m/mx/...)
 * + 本案新洞:CSS logical properties(ps-/pe-/ms-/me-)hook regex 漏接,必含
 * + task 指名的 sizing / typography 家族(text-[Npx] / w-[Npx])。
 *
 * 允許(非 magic):
 * - `var(--…)` token 消費:p-[var(--layout-space-loose)] / text-[var(--fg-muted)]
 * - 響應式函數含 var()/viewport 單位:w-[min(92vw,var(--dialog-max-w))]
 * - 純相對單位:w-[50vw] / h-[100%](非固定 px magic)
 * - 行內 escape 註解 `@layout-space-magic-ok: <rationale>`(同行或緊鄰上一行,與 hook 同 marker)
 */

const { createStringVisitors } = require('../lib/class-string');

// Tailwind utility prefix 家族(長字在前,避免 alternation 歧義)
const PREFIXES = [
  // spacing 家族(hook 同源)+ logical props(本案新洞:ps/pe/ms/me 必含)
  'space-x', 'space-y', 'gap-x', 'gap-y', 'gap',
  'px', 'py', 'pt', 'pb', 'pl', 'pr', 'ps', 'pe', 'p',
  'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'ms', 'me', 'm',
  // sizing 家族(task 指名 w-[Npx])
  'min-w', 'min-h', 'max-w', 'max-h', 'basis', 'size', 'w', 'h',
  // typography 家族(task 指名 text-[Npx])
  'text', 'leading', 'tracking',
  // inset 家族(定位偏移同屬 layout-space 範疇)
  'inset-x', 'inset-y', 'inset', 'top', 'right', 'bottom', 'left', 'start', 'end',
];

// class 出現的合法前導邊界:字串開頭 / 空白 / 引號 / backtick / variant 冒號 / ! important / ( , {
const CLASS_PATTERN = new RegExp(
  `(?:^|[\\s'"\`{(,:!])(-?(?:${PREFIXES.join('|')})-\\[([^\\]]+)\\])`,
  'g'
);

const RESPONSIVE_UNIT = /(var\(--|\d(vw|vh|dvw|dvh|svw|svh|lvw|lvh|cqw|cqh|%))/;

/** bracket 內的值是否為 magic 數值(= 違規)。 */
function isMagicValue(rawValue) {
  const v = rawValue.trim().replace(/_/g, ' '); // Tailwind arbitrary value 以 _ 代空白
  // 允許:var(--…) token 消費
  if (v.includes('var(--')) return false;
  // min()/max()/clamp()/calc() 響應式函數:含 var()/viewport/% 單位才算響應式;全固定長度仍是 magic
  if (/^(min|max|clamp|calc)\(/i.test(v)) return !RESPONSIVE_UNIT.test(v);
  // 允許:純相對單位(viewport / container / %)
  if (/^-?\d*\.?\d+(vw|vh|dvw|dvh|svw|svh|lvw|lvh|cqw|cqh|%)$/.test(v)) return false;
  // 允許:CSS keyword(auto / fit-content 等)
  if (/^(auto|max-content|min-content|fit-content|inherit|initial|unset)/.test(v)) return false;
  // 違規:固定長度 magic 數值(px / rem / em / pt / ch / ex / 無單位)
  return /^-?\d*\.?\d+(px|rem|em|pt|ch|ex|cm|mm|in)?$/.test(v);
  // 其餘(color hex / keyword / grid template 等)不屬本 rule 管轄 → 上行回 false
}

function findViolations(rawText) {
  const violations = [];
  let match;
  CLASS_PATTERN.lastIndex = 0;
  while ((match = CLASS_PATTERN.exec(rawText)) !== null) {
    const cls = match[1];
    const value = match[2];
    if (isMagicValue(value)) {
      violations.push({
        index: match.index + match[0].indexOf(cls),
        length: cls.length,
        data: { cls },
      });
    }
  }
  return violations;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        '禁止 className 中 Tailwind arbitrary magic 數值(text-[13px] / w-[240px] / gap-[8px] / ps-[12px] 等)— 必消費 DS token(var(--layout-space-*) 等)。同源 write-time hook:check_layout_space_magic_numbers.sh;SSOT:packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md',
      url: 'https://github.com/qijenchen/my-project/tree/main/packages/eslint-plugin#no-arbitrary-tailwind-values',
    },
    schema: [],
    messages: {
      magicValue:
        'Tailwind arbitrary magic 數值 "{{cls}}" 繞過 DS token SSOT。' +
        '改消費 token:spacing → p-[var(--layout-space-loose)](16px)/ gap-[var(--layout-space-tight)](12px),' +
        '詳 packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md 6 條規則 + 親疏 3 級;' +
        'typography → text-h1..h6 / text-body / text-caption(tokens/typography)。' +
        '確有理由 → 該行(或上一行)加註解 `@layout-space-magic-ok: <rationale>` 豁免。',
    },
  },
  create(context) {
    return createStringVisitors(
      context,
      '@layout-space-magic-ok:',
      'magicValue',
      findViolations
    );
  },
};
