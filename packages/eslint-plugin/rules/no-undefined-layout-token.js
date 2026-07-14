'use strict';

/**
 * no-undefined-layout-token
 *
 * `--layout-space-*` 命名空間只允許 SSOT 定義的 3 個 token:loose | tight | bottom
 * (packages/design-system/src/tokens/layoutSpace/layoutSpace.css L4-6)。
 *
 * Why:未定義的 CSS 變數 **silent 失效** — var() resolve 成空值 → spacing 變 0 →
 * 區塊全黏死,tsc / build / runtime 都不報錯。實證:work-management fork 寫
 * `gap-[var(--layout-space-distant)]`(幻覺 token)→ CSS 0 → 區塊全黏死(PDF 案)。
 *
 * 涵蓋所有出現形式:className arbitrary value(gap-[var(--layout-space-X)])、
 * style 物件字串('var(--layout-space-X)')、template literal、
 * 甚至自行定義('--layout-space-X': '24px' — 污染 SSOT 命名空間,一樣擋)。
 *
 * 無 escape marker:幻覺 token 沒有合法使用場景(新 token 必先進 layoutSpace.css SSOT
 * + spec.md,再 allow 進本 rule)。
 */

const { createStringVisitors } = require('../lib/class-string');

// SSOT:packages/design-system/src/tokens/layoutSpace/layoutSpace.css(loose / tight / bottom)
const ALLOWED_TOKENS = new Set(['loose', 'tight', 'bottom']);

const TOKEN_PATTERN = /--layout-space-([a-zA-Z][\w-]*)/g;

function findViolations(rawText) {
  const violations = [];
  let match;
  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(rawText)) !== null) {
    const name = match[1];
    if (!ALLOWED_TOKENS.has(name)) {
      violations.push({ index: match.index, length: match[0].length, data: { name } });
    }
  }
  return violations;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'var(--layout-space-X) 只允許 X ∈ {loose, tight, bottom} — 幻覺 token silent 失效(CSS 空值 → spacing 0 → 區塊黏死;WM --layout-space-distant 實證)。SSOT:packages/design-system/src/tokens/layoutSpace/layoutSpace.css',
      url: 'https://github.com/qijenchen/my-project/tree/main/packages/eslint-plugin#no-undefined-layout-token',
    },
    schema: [],
    messages: {
      undefinedToken:
        '"--layout-space-{{name}}" 不存在 — layoutSpace token SSOT 只定義 ' +
        '--layout-space-loose(16px)/ --layout-space-tight(12px)/ --layout-space-bottom(48px)' +
        '(packages/design-system/src/tokens/layoutSpace/layoutSpace.css;' +
        '選哪個 → layoutSpace.spec.md 6 條規則 + 親疏 3 級)。' +
        '未定義的 CSS 變數 silent resolve 成空值 → spacing 變 0、區塊黏死,' +
        'build / runtime 都不報錯(work-management --layout-space-distant 實證)。',
    },
  },
  create(context) {
    return createStringVisitors(context, null, 'undefinedToken', findViolations);
  },
};
