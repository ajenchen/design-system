'use strict';

const { createRuleTester } = require('./_rule-tester');
const rule = require('../rules/no-shadcn-compat-alias');

const ruleTester = createRuleTester();

ruleTester.run('no-shadcn-compat-alias', rule, {
  valid: [
    // 1. DS semantic token utility 正解(dark mode 聯動)
    {
      code: `const Menu = () => <div className="bg-surface-raised text-foreground border-border" />;`,
    },
    // 2. muted 正解:text-fg-muted(非 text-muted-foreground)
    {
      code: `const Caption = () => <span className="text-fg-muted">已更新</span>;`,
    },
    // 3. escape 註解(同行)— 與 hook 同 marker
    {
      code: `const embedCls = "bg-popover"; // @token-registry-ok: 3rd-party shadcn embed 隔離區,不吃 DS theme`,
    },
    // 4. escape 註解(緊鄰上一行,JSX 場景)
    {
      code: [
        `const Embed = () => (`,
        `  <div>`,
        `    {/* @token-registry-ok: Stripe Elements iframe 外框需 shadcn compat */}`,
        `    <div className="border-input" />`,
        `  </div>`,
        `);`,
      ].join('\n'),
    },
    // 5. word-boundary:自訂 class 含 alias 子字串不誤殺
    {
      code: `const x = "text-muted-foreground-custom my-bg-accent bg-accented";`,
    },
  ],
  invalid: [
    // 1. bg-popover → bg-surface-raised
    {
      code: `const Pop = () => <div className="bg-popover" />;`,
      errors: [{ messageId: 'shadcnAlias' }],
    },
    // 2. text-muted-foreground → text-fg-muted
    {
      code: `const Hint = () => <p className="text-muted-foreground">拖曳檔案到此</p>;`,
      errors: [{ messageId: 'shadcnAlias' }],
    },
    // 3. 同字串多 alias(border-input + bg-background)各自報
    {
      code: `const Field = () => <input className="border-input bg-background" />;`,
      errors: [{ messageId: 'shadcnAlias' }, { messageId: 'shadcnAlias' }],
    },
    // 4. template literal + variant prefix 也抓
    {
      code: 'const cls = `flex hover:bg-accent ${active ? "text-accent-foreground" : ""}`;',
      errors: [{ messageId: 'shadcnAlias' }, { messageId: 'shadcnAlias' }],
    },
    // 5. bg-destructive → bg-error
    {
      code: `const DeleteBtn = () => <button className="bg-destructive">刪除專案</button>;`,
      errors: [{ messageId: 'shadcnAlias' }],
    },
    // 6. 存變數再用(非 JSX attribute)一樣全量掃到
    {
      code: `const popoverShell = "bg-popover text-popover-foreground";`,
      errors: [{ messageId: 'shadcnAlias' }, { messageId: 'shadcnAlias' }],
    },
  ],
});
