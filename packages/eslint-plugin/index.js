'use strict';

/**
 * @qijenchen/eslint-plugin-design-system
 *
 * DS write-time hooks 同源的 ESLint flat-config plugin(eslint >= 9)。
 * hooks 只擋 AI 寫入當下的 diff;本 plugin 全量掃(editor 紅線 + CI gate)。
 * 三處防線:editor(eslint)+ CI(eslint)+ AI write-time(.claude/hooks)。
 */

const noArbitraryTailwindValues = require('./rules/no-arbitrary-tailwind-values');
const noShadcnCompatAlias = require('./rules/no-shadcn-compat-alias');
const noUndefinedLayoutToken = require('./rules/no-undefined-layout-token');
const noDynamicTailwindClass = require('./rules/no-dynamic-tailwind-class');

const pkg = require('./package.json');

const plugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules: {
    'no-arbitrary-tailwind-values': noArbitraryTailwindValues,
    'no-shadcn-compat-alias': noShadcnCompatAlias,
    'no-undefined-layout-token': noUndefinedLayoutToken,
    'no-dynamic-tailwind-class': noDynamicTailwindClass,
  },
  configs: {},
};

// flat config(eslint 9):config 物件自帶 plugin 參照(官方 self-reference pattern)
Object.assign(plugin.configs, {
  recommended: {
    name: 'design-system/recommended',
    plugins: {
      'design-system': plugin,
    },
    rules: {
      'design-system/no-arbitrary-tailwind-values': 'error',
      'design-system/no-shadcn-compat-alias': 'error',
      'design-system/no-undefined-layout-token': 'error',
      'design-system/no-dynamic-tailwind-class': 'error',
    },
  },
});

module.exports = plugin;
