// 對照組:證明「巢狀量詞」這個樣式在同一份輸入上會災難性回溯(跑不完)。
//
// 為什麼獨立成檔(2026-09-21):原本的對照組用 `new Function` 改寫 live scanner 的原始碼,
// 再用 `node --eval` 跑。治理 harness 的來源政策明文禁止動態程式碼
// (`shell-dynamic-node-code-forbidden`),於是**整個 harness runner 從 2026-08-11 起被擋住、
// 一次都沒真的跑過**。這裡改用**字面 regex**(不是動態程式碼),由 `node <此檔>` 啟動。
//
// 配套:呼叫端另外斷言 live scanner 的原始碼**不含**這個樣式 —— 兩半合起來才是
// 「危險存在」+「我們沒有踩到」。
const VULNERABLE = /(?:\s+|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*import\s+['"]([^'"]+)['"]/u

const source = '// surface materialized from\n'
  + Array.from({ length: 9 }, () => '    // explanatory policy prose\n').join('')
  + "    || policy.disabled\nimport './leaf.mjs'\n"

VULNERABLE.exec(source)
console.log('SCANNER_COMPLETED')
