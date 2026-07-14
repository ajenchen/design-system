'use strict';

const { createRuleTester } = require('./_rule-tester');
const rule = require('../rules/no-arbitrary-tailwind-values');

const ruleTester = createRuleTester();

ruleTester.run('no-arbitrary-tailwind-values', rule, {
  valid: [
    // 1. var(--…) token 消費(layoutSpace SSOT 正解)
    {
      code: `const Panel = () => <div className="p-[var(--layout-space-loose)] gap-[var(--layout-space-tight)]" />;`,
    },
    // 2. 響應式 min() 含 vw + var(dialog 寬度慣例)
    {
      code: `const Dialog = () => <div className="w-[min(92vw,var(--dialog-max-w))]" />;`,
    },
    // 3. 純相對單位(viewport / %)非 magic px
    {
      code: `const Hero = () => <section className="h-[100vh] max-w-[100%]" />;`,
    },
    // 4. escape 註解(同行)— 與 hook 同 marker
    {
      code: `const cls = cva("gap-[3px]"); // @layout-space-magic-ok: Skeleton bone 1px hairline stack,非 consumer layout`,
    },
    // 5. escape 註解(緊鄰上一行,JSX className 行無法放同行 //)
    {
      code: [
        `const Icon = () => (`,
        `  <span>`,
        `    {/* @layout-space-magic-ok: icon 視覺置中 1px 光學補償 */}`,
        `    <svg className="mt-[1px]" />`,
        `  </span>`,
        `);`,
      ].join('\n'),
    },
    // 6. Tailwind scale class(p-4 / gap-2)不屬本 rule 管轄(bracket arbitrary 才是)
    {
      code: `const Row = () => <div className="flex items-center p-4 gap-2" />;`,
    },
    // 7. 非數值 arbitrary(color / keyword)不屬本 rule 管轄
    {
      code: `const Tag = () => <span className="text-[var(--fg-muted)] bg-[#f5f5f5] w-[max-content]" />;`,
    },
  ],
  invalid: [
    // 1. task 指名案例:text-[Npx]
    {
      code: `const Note = () => <p className="text-[13px]" />;`,
      errors: [{ messageId: 'magicValue', data: { cls: 'text-[13px]' } }],
    },
    // 2. task 指名案例:w-[Npx] + gap-[Npx](同字串 2 報)
    {
      code: `const Card = () => <div className="w-[240px] gap-[8px]" />;`,
      errors: [
        { messageId: 'magicValue', data: { cls: 'w-[240px]' } },
        { messageId: 'magicValue', data: { cls: 'gap-[8px]' } },
      ],
    },
    // 3. 本案新洞:logical props ps-/pe-/ms-/me- 必含
    {
      code: `const Cell = () => <td className="ps-[12px] pe-[8px] ms-[4px] me-[4px]" />;`,
      errors: [
        { messageId: 'magicValue', data: { cls: 'ps-[12px]' } },
        { messageId: 'magicValue', data: { cls: 'pe-[8px]' } },
        { messageId: 'magicValue', data: { cls: 'ms-[4px]' } },
        { messageId: 'magicValue', data: { cls: 'me-[4px]' } },
      ],
    },
    // 4. cva / template literal 內也全量掃(不只 JSX className)
    {
      code: 'const styles = cva(`flex p-[10px] ${extra}`);',
      errors: [{ messageId: 'magicValue', data: { cls: 'p-[10px]' } }],
    },
    // 5. min() 全固定長度 = 仍是 magic(無 var / viewport 響應式成分)
    {
      code: `const Box = () => <div className="w-[min(300px,480px)]" />;`,
      errors: [{ messageId: 'magicValue', data: { cls: 'w-[min(300px,480px)]' } }],
    },
    // 6. rem / 無單位一樣 magic(繞 token scale)
    {
      code: `const T = () => <p className="leading-[1.3] mt-[0.5rem]" />;`,
      errors: [
        { messageId: 'magicValue', data: { cls: 'leading-[1.3]' } },
        { messageId: 'magicValue', data: { cls: 'mt-[0.5rem]' } },
      ],
    },
    // 7. 負值 margin + variant prefix 也要抓
    {
      code: `const Chip = () => <span className="hover:-mt-[2px]" />;`,
      errors: [{ messageId: 'magicValue', data: { cls: '-mt-[2px]' } }],
    },
    // 8. escape 註解放錯位置(隔 2 行)不豁免
    {
      code: [
        `// @layout-space-magic-ok: 放太遠,不生效`,
        `const noop = 1;`,
        `const Bad = () => <div className="gap-[6px]" />;`,
      ].join('\n'),
      errors: [{ messageId: 'magicValue', data: { cls: 'gap-[6px]' } }],
    },
  ],
});
