'use strict';

/**
 * 共用 RuleTester 設定:接上 node:test(eslint 9 官方 pattern),
 * 並開 JSX(espree ecmaFeatures)讓 test case 可寫真實 className 場景。
 */

const { RuleTester } = require('eslint');
const nodeTest = require('node:test');

RuleTester.describe = nodeTest.describe;
RuleTester.it = nodeTest.it;
RuleTester.itOnly = (text, method) => nodeTest.it(text, { only: true }, method);

function createRuleTester() {
  return new RuleTester({
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  });
}

module.exports = { createRuleTester };
