'use strict';

/**
 * no-shadcn-compat-alias
 *
 * 同源 hook:.claude/hooks/check_opacity_token_usage.sh 第 8 類(shadcn compat alias)。
 * Alias 清單 SSOT:packages/design-system/src/tokens/utility-registry.json
 * `shadcn_alias.block.color_alias`(本 rule 為 no-dependency 平移,清單改動時兩處同步)。
 *
 * Why block:shadcn compat alias 不聯動 DS dark mode(CLAUDE.md `# 失敗記憶索引`
 * 「shadcn compat alias 回流 → dark mode 不聯動」)。必改用 DS semantic token utility。
 *
 * Escape:行內 `@token-registry-ok: <rationale>` 註解(同行或緊鄰上一行,與 hook 同 marker)。
 */

const { createStringVisitors } = require('../lib/class-string');

// alias → DS canonical 建議(semantic token utility;token 名皆實存於 tokens/color/semantic.css)
const ALIAS_TO_CANONICAL = {
  'bg-popover': 'bg-surface-raised(--surface-raised,遮蓋型浮層底色)',
  'text-popover-foreground': 'text-foreground(--foreground)',
  'text-muted-foreground': 'text-fg-muted(--fg-muted)',
  'bg-accent': 'bg-neutral-hover(--neutral-hover,hover/active 態底色)',
  'text-accent-foreground': 'text-foreground(--foreground)',
  'bg-destructive': 'bg-error(--error)',
  'bg-background': 'bg-canvas(--canvas)或 bg-surface(--surface)',
  'text-background': 'text-on-emphasis(--on-emphasis,emphasis 底上的文字)',
  'border-input': 'border-border(--border)',
};

const ALIAS_PATTERN = new RegExp(
  `(?<![\\w-])(${Object.keys(ALIAS_TO_CANONICAL).join('|')})(?![\\w-])`,
  'g'
);

function findViolations(rawText) {
  const violations = [];
  let match;
  ALIAS_PATTERN.lastIndex = 0;
  while ((match = ALIAS_PATTERN.exec(rawText)) !== null) {
    const alias = match[1];
    violations.push({
      index: match.index,
      length: alias.length,
      data: { alias, canonical: ALIAS_TO_CANONICAL[alias] },
    });
  }
  return violations;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        '禁止 shadcn compat alias(bg-popover / text-muted-foreground / bg-accent / bg-destructive / border-input 等)— 不聯動 DS dark mode。清單 SSOT:packages/design-system/src/tokens/utility-registry.json shadcn_alias.block;同源 write-time hook:check_opacity_token_usage.sh 第 8 類',
      url: 'https://github.com/qijenchen/my-project/tree/main/packages/eslint-plugin#no-shadcn-compat-alias',
    },
    schema: [],
    messages: {
      shadcnAlias:
        'shadcn compat alias "{{alias}}" 不聯動 DS dark mode' +
        '(CLAUDE.md 失敗記憶索引「shadcn compat alias 回流」)。' +
        '改用 DS semantic token:{{canonical}}。' +
        'SSOT:packages/design-system/src/tokens/utility-registry.json + tokens/color/color.spec.md。' +
        '確有理由(如 3rd-party embed)→ 該行(或上一行)加註解 `@token-registry-ok: <rationale>` 豁免。',
    },
  },
  create(context) {
    return createStringVisitors(
      context,
      '@token-registry-ok:',
      'shadcnAlias',
      findViolations
    );
  },
};
