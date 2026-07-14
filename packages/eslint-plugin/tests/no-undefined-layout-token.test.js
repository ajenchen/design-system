'use strict';

const { createRuleTester } = require('./_rule-tester');
const rule = require('../rules/no-undefined-layout-token');

const ruleTester = createRuleTester();

ruleTester.run('no-undefined-layout-token', rule, {
  valid: [
    // 1-3. SSOT 定義的 3 個 token(loose / tight / bottom)全允許
    {
      code: `const Section = () => <div className="p-[var(--layout-space-loose)]" />;`,
    },
    {
      code: `const Stack = () => <div className="gap-[var(--layout-space-tight)] space-y-[var(--layout-space-tight)]" />;`,
    },
    {
      code: `const Page = () => <main style={{ paddingBottom: 'var(--layout-space-bottom)' }} />;`,
    },
    // 4. 其他命名空間的 var() 不歸本 rule 管
    {
      code: `const Overlay = () => <div className="bg-[var(--surface-raised)] text-[var(--fg-muted)]" />;`,
    },
    // 5. data-layout-space attribute(非 CSS 變數)不誤殺
    {
      code: `const Dense = () => <div data-layout-space="lg" />;`,
    },
  ],
  invalid: [
    // 1. WM 實證案:--layout-space-distant 幻覺 token → CSS 0 → 區塊全黏死
    {
      code: `const List = () => <div className="gap-[var(--layout-space-distant)]" />;`,
      errors: [{ messageId: 'undefinedToken', data: { name: 'distant' } }],
    },
    // 2. style 物件字串內也抓
    {
      code: `const Card = () => <div style={{ margin: 'var(--layout-space-md)' }} />;`,
      errors: [{ messageId: 'undefinedToken', data: { name: 'md' } }],
    },
    // 3. template literal 內也抓
    {
      code: 'const cls = `p-[var(--layout-space-section)] flex`;',
      errors: [{ messageId: 'undefinedToken', data: { name: 'section' } }],
    },
    // 4. 幾乎對但打錯字(loose2)一樣擋 — exact match only
    {
      code: `const Row = () => <div className="mt-[var(--layout-space-loose2)]" />;`,
      errors: [{ messageId: 'undefinedToken', data: { name: 'loose2' } }],
    },
    // 5. 自行「定義」污染 SSOT 命名空間一樣擋(新 token 必先進 layoutSpace.css + spec)
    {
      code: `const style = { '--layout-space-distant': '24px' };`,
      errors: [{ messageId: 'undefinedToken', data: { name: 'distant' } }],
    },
    // 6. 同字串多個幻覺 token 各自報
    {
      code: `const Grid = () => <div className="gap-x-[var(--layout-space-distant)] gap-y-[var(--layout-space-far)]" />;`,
      errors: [
        { messageId: 'undefinedToken', data: { name: 'distant' } },
        { messageId: 'undefinedToken', data: { name: 'far' } },
      ],
    },
  ],
});
