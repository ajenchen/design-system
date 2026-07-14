// 守衛分類器單元測(2026-07-10;user「codex 額度不足要通知我」)
import { classify } from './codex-run-guarded.mjs'
let p = 0, f = 0
const t = (name, args, want) => {
  const got = classify(...args).outcome
  if (got === want) { p++; console.log(`  PASS ${name} → ${got}`) }
  else { f++; console.log(`  FAIL ${name} → got ${got} want ${want}`) }
}
t('SUCCESS', [0, null, 'done', 'verdict A1...'], 'SUCCESS')
t('QUOTA 429', [1, null, 'ERROR:{"status":429}', ''], 'QUOTA')
t('QUOTA usage limit', [1, null, 'hit your usage limit', ''], 'QUOTA')
t('QUOTA out of usage', [1, null, "you're out of usage credits", ''], 'QUOTA')
t('AUTH 401', [1, null, 'ERROR:{"status":401} unauthorized', ''], 'AUTH')
t('AUTH login', [1, null, 'please login first', ''], 'AUTH')
t('EMPTY exit0 空', [0, null, 'plan done', ''], 'EMPTY')
t('ERROR bad model', [1, null, 'model not supported', 'x'], 'ERROR')
t('ERROR signal', [null, 'SIGKILL', 'killed', ''], 'ERROR')
// 2026-07-11 regression:codex echo 檔案內容(行號 429/403 + 散文 quota/credit/author)+ exit 0 空 msg
//   → 必 EMPTY 不可誤判 QUOTA/AUTH(原 bug:bare '429'/'quota'/'credit'/'auth' 撞 echo → 假 QUOTA)
t('EMPTY not QUOTA (429 檔案行號 + quota/credit 散文)', [0, null, '429\t<tbody>\n  額度 quota credit 442\n480 | git', ''], 'EMPTY')
t('EMPTY not AUTH (403 行號 + author/oauth 散文)', [0, null, '403\t</div>\n author info oauth handler', ''], 'EMPTY')
// 真 quota/auth 一定帶 ERROR:{...} + exit≠0 → 仍要抓到
t('QUOTA 真 error (429 in ERROR json)', [1, null, 'stream\nERROR: {"type":"error","status":429,"message":"rate limit"}', ''], 'QUOTA')
console.log(`\n=== ${p} pass / ${f} fail ===`)
process.exit(f ? 1 : 0)
