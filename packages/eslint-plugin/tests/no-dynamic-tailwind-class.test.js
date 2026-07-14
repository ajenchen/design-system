'use strict';

const { createRuleTester } = require('./_rule-tester');
const rule = require('../rules/no-dynamic-tailwind-class');

const ruleTester = createRuleTester();

ruleTester.run('no-dynamic-tailwind-class', rule, {
  valid: [
    // 1. 正解:完整 literal class 對照表(靜態掃得到)
    {
      code: "const cls = { sm: 'h-table-row-sm', md: 'h-table-row-md', lg: 'h-table-row-lg' }[size];",
    },
    // 2. 整段插值是「一整個 class」(非 class 名中段)→ 安全
    {
      code: "const Row = () => <div className={`flex ${cond ? 'h-4' : 'h-8'}`} />;",
    },
    // 3. arbitrary value 內插值(是「值」不是 class 名)→ 排除
    {
      code: 'const cls = `h-[calc(100%_-_${offset}px)]`;',
    },
    // 4. var() 內插值 → 排除
    {
      code: 'const cls = `w-[var(--col-${i})]`;',
    },
    // 5. 色彩 / 非尺寸 utility 不在範圍(hook 同範圍)
    {
      code: 'const cls = `text-${color} bg-${bg}`;',
    },
    // 6. escape 註解豁免(確非 class)
    {
      code: 'const cls = `size-${px}`; // @dynamic-tailwind-allow: 非 class,傳給 canvas',
    },
    // 7. 純靜態 template literal(無插值)不誤殺
    {
      code: 'const cls = `h-table-row-md flex items-center`;',
    },
  ],
  invalid: [
    // 1. 病根實證:h-table-row-${size} → utility 消失 → row 塌
    {
      code: 'const cls = `h-table-row-${size}`;',
      errors: [{ messageId: 'dynamicClass' }],
    },
    // 2. 最短形:h-${x}
    {
      code: 'const Row = () => <div className={`h-${rowH}`} />;',
      errors: [{ messageId: 'dynamicClass' }],
    },
    // 3. 間距 utility:gap-${g}
    {
      code: 'const cls = `flex gap-${g}`;',
      errors: [{ messageId: 'dynamicClass' }],
    },
    // 4. padding 方向:py-${p}
    {
      code: 'const cls = `py-${p} px-4`;',
      errors: [{ messageId: 'dynamicClass' }],
    },
    // 5. min-h-${y}(前綴含 min-)
    {
      code: 'const cls = `min-h-${y}`;',
      errors: [{ messageId: 'dynamicClass' }],
    },
    // 6. 同一 literal 多個動態 class 各報一次
    {
      code: 'const cls = `w-${w} h-${h}`;',
      errors: [{ messageId: 'dynamicClass' }, { messageId: 'dynamicClass' }],
    },
  ],
});
