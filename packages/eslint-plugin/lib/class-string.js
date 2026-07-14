'use strict';

/**
 * 共用 helper:走訪所有「可能是 className 的字串」+ per-line escape 註解檢查。
 *
 * 設計取捨(與 DS write-time hooks 同源,但 eslint 版要全量掃):
 * - 掃「所有」string Literal + TemplateElement(不只 JSX className)——
 *   涵蓋 cva() / cn() / clsx() / 先存變數再用等所有寫法。
 *   誤判風險極低:各 rule 的 regex 都要求 Tailwind class 專屬簽名
 *   (utility prefix + `-[...]` bracket / 完整 alias token / `--layout-space-` 前綴)。
 * - escape 註解與 hook 同一 marker(`@layout-space-magic-ok:` / `@token-registry-ok:`),
 *   同行或緊鄰上一行皆生效(對齊 check_layout_space_magic_numbers.sh 2026-06-03 修正
 *   ——JSX className 行無法放同行 `//`,必支援前一行 `{/* ... *\/}`)。
 */

/**
 * 建 escape 檢查器:回傳 `(line) => boolean`,line 上(同行或上一行)有含 marker 的
 * 註解即豁免。marker 為 falsy 時永遠回 false(該 rule 無自訂 escape)。
 */
function buildEscapeChecker(sourceCode, marker) {
  if (!marker) return () => false;
  const escapeLines = new Set();
  for (const comment of sourceCode.getAllComments()) {
    if (comment.value.includes(marker)) {
      // 註解本行 + 註解結束的下一行都視為被豁免(涵蓋同行註解與 disable-next-line 慣例)
      for (let l = comment.loc.start.line; l <= comment.loc.end.line + 1; l++) {
        escapeLines.add(l);
      }
    }
  }
  return (line) => escapeLines.has(line);
}

/**
 * 由字串 raw text 內的 match index 推回 source 位置(template literal 可跨行)。
 */
function locOfIndex(baseLoc, rawText, index) {
  let line = baseLoc.line;
  let lastNewline = -1;
  for (let i = 0; i < index && i < rawText.length; i++) {
    if (rawText[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }
  const column =
    line === baseLoc.line ? baseLoc.column + index : index - lastNewline - 1;
  return { line, column };
}

/**
 * 產生 rule visitor:對每個 string Literal / TemplateElement 呼叫
 * `scan(rawText, report)`,report(matchIndex, data) 會自動處理 escape 行豁免 + loc。
 *
 * @param {import('eslint').Rule.RuleContext} context
 * @param {string|null} escapeMarker per-line escape 註解 marker(null = 無)
 * @param {string} messageId
 * @param {(rawText: string) => Array<{index: number, length?: number, data: object}>} findViolations
 */
function createStringVisitors(context, escapeMarker, messageId, findViolations) {
  const sourceCode = context.sourceCode || context.getSourceCode();
  const isEscapedLine = buildEscapeChecker(sourceCode, escapeMarker);

  function check(node, rawText) {
    for (const { index, data, length } of findViolations(rawText)) {
      const start = locOfIndex(node.loc.start, rawText, index);
      if (isEscapedLine(start.line)) continue;
      context.report({
        node,
        loc: {
          start,
          end: { line: start.line, column: start.column + (length || 1) },
        },
        messageId,
        data,
      });
    }
  }

  return {
    Literal(node) {
      if (typeof node.value !== 'string') return;
      check(node, sourceCode.getText(node));
    },
    TemplateElement(node) {
      check(node, node.value.raw);
    },
  };
}

module.exports = { createStringVisitors, buildEscapeChecker, locOfIndex };
