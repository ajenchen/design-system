#!/usr/bin/env node
// agent-panel-fixed-anatomy-invariant — 防「固定 anatomy 因缺 callback 而消失」復發
//
// 不變式(2026-09-02;user 抓「有的面板沒有 +/×/chevron/加附件」根因=以 callback 有無決定渲染):
//   AgentPanel 家族的固定 anatomy(標題觸發、新對話 +、關閉 ×、附件 +、Tag ×、送出/停止、工具列 3 鈕)
//   必恆渲染。做法=兩層:(1) 沒有內建行為的 callback 為必填 prop(型別層,tsc 擋);
//   (2) tsx 內禁用 `{onX && (` / `onX ? (` 這種「以 callback 存在與否包住固定 anatomy」的渲染閘。
//   agent-panel.spec.md §2「固定 anatomy 恆渲染」/ §7「+ 恆渲染」為 owner SSOT。
//
// 零誤判判別:只掃 AgentPanel/agent-panel.tsx;只抓下列 callback 名;
//   `onX?.()`(呼叫時的可選鏈)不是渲染閘,不匹配。

import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const TARGET = 'packages/design-system/src/components/AgentPanel/agent-panel.tsx'

/** 固定 anatomy 的 callback:必填(不得 `?:`)。 */
const REQUIRED_PROPS = {
  AgentPanelHeaderProps: ['onNewConversation', 'onClose'],
  AgentPromptInputProps: ['onSubmit', 'onRemoveAttachment', 'onAddAttachment'],
  // 2026-09-18 加:浮層態的遮罩點擊關閉(2026-09-17 裁示)也是「沒有內建行為」的固定行為 ——
  // 面板自己關不了(`open` 住在 AgentPanelDock),寫成可選就等於「沒傳的那些照舊點了不關」。
  // 實際後果:URL 註冊表示意那則沒傳,user 在預覽站點遮罩「根本沒有任何反應」(2026-09-18 回報)。
  // 同一條律的第三個住所(前兩個是標題列與輸入盒),不是新規則。
  AgentPanelProps: ['onClose'],
  // 2026-11-11 加(r3 審查):決策卡的標題列 × 恆渲染(19af33cc 拿掉 footer 跳過鈕),送出鈕也恆渲染 ——
  // 兩者都沒有內建行為,寫成可選 = 沒傳的 consumer 按了沒反應、使用者除了答完沒有離開的路。同一條律的第四個住所。
  // 2026-11-15(A16):× = 取消,回呼由 onSkip(answers) 改名 onCancel();Esc 也走它。
  AgentDecisionCardProps: ['onSubmit', 'onCancel'],
}
/**
 * 取消不帶答案(2026-11-15,A16;agent-decision-card.spec.md「關閉」條):`onCancel` 的型別必須是不收任何參數的 `() => void` ——
 * 型別上收得到答案,實作遲早會把預選的建議塞回去(2026-11-15 前的 `onSkip(resolvedAnswers())` 就是這樣)。舊名 `onSkip` 不得回到 props(語意變了,不留別名)。
 */
const NO_ANSWER_CALLBACKS = { AgentDecisionCardProps: { callback: 'onCancel', retired: ['onSkip'] } }
/** 任何固定 anatomy callback 都不得當渲染閘。 */
const GATE_CALLBACKS = [
  'onNewConversation', 'onClose', 'onSubmit', 'onCancel', 'onSkip', 'onRemoveAttachment', 'onAddAttachment',
  'onStop', 'onCopy', 'onLike', 'onDislike', 'onSelectConversation', 'onRenameConversation', 'onDeleteConversation',
]

export function checkSource(src) {
  const out = []
  for (const [iface, props] of Object.entries(REQUIRED_PROPS)) {
    const m = src.match(new RegExp(`export interface ${iface}[\\s\\S]*?\\n}`))
    if (!m) { out.push(`缺 interface ${iface}`); continue }
    for (const p of props) {
      if (!new RegExp(`\\n\\s+${p}:`).test(m[0])) out.push(`${iface}.${p} 必為必填(固定 anatomy 律)`)
    }
  }
  for (const [iface, { callback, retired }] of Object.entries(NO_ANSWER_CALLBACKS)) {
    const m = src.match(new RegExp(`export interface ${iface}[\\s\\S]*?\\n}`))
    if (!m) continue
    const decl = m[0].match(new RegExp(`\\n\\s+${callback}\\??:\\s*([^\\n]+)`))
    if (decl && !/^\(\s*\)\s*=>/.test(decl[1].trim())) out.push(`${iface}.${callback} 必須是 () => void(取消不帶答案):現在是「${decl[1].trim()}」`)
    for (const old of retired) {
      if (new RegExp(`\\n\\s+${old}\\??:`).test(m[0])) out.push(`${iface}.${old} 已退役(語意變了,不留別名;改用 ${callback})`)
    }
  }
  const gate = new RegExp(`\\{\\s*(?:props\\.)?(${GATE_CALLBACKS.join('|')})\\s*(?:&&|\\?)\\s*\\(?\\s*<`, 'g')
  for (const m of src.matchAll(gate)) {
    out.push(`L${src.slice(0, m.index).split('\n').length}:以 ${m[1]} 有無決定渲染(固定 anatomy 律)`)
  }
  return out
}

function selftest() {
  const iface = 'export interface AgentPanelHeaderProps {\n  onNewConversation: () => void\n  onClose: () => void\n}\nexport interface AgentPromptInputProps {\n  onSubmit: () => void\n  onRemoveAttachment: (id: string) => void\n  onAddAttachment: () => void\n}\nexport interface AgentPanelProps {\n  onClose: () => void\n}\nexport interface AgentDecisionCardProps\n  extends Omit<X, \'onSubmit\'> {\n  onSubmit: (a: A) => void\n  onCancel: () => void\n}\n'
  const c = [
    // 2026-11-11 迴歸:決策卡 × 恆渲染,× 的回呼可選 = × 按了沒反應,必須抓;送出同理(2026-11-15 起回呼叫 onCancel)
    { n: '可選 onCancel(決策卡 ×)= 該抓', src: iface.replace('  onCancel: ()', '  onCancel?: ()'), e: 1 },
    { n: '可選 onSubmit(決策卡送出)= 該抓', src: iface.replace('  onSubmit: (a: A)', '  onSubmit?: (a: A)'), e: 1 },
    { n: '{onCancel && (<Button/>)} 閘 = 該抓', src: iface + '{onCancel && (<Button dismiss />)}', e: 1 },
    // 2026-11-15 根因(A16):取消把答案帶出去 = 型別上收得到答案;舊名 onSkip 回到 props 也算(語意變了,不留別名)
    { n: 'onCancel 收答案參數(取消又帶答案)= 該抓', src: iface.replace('  onCancel: () => void', '  onCancel: (answers: Record<string, string>) => void'), e: 1 },
    { n: '舊名 onSkip(answers) 取代 onCancel = 該抓(缺 onCancel + 舊名回來)', src: iface.replace('  onCancel: () => void', '  onSkip: (a: A) => void'), e: 2 },
    { n: 'onCancel 之外另留 onSkip 別名 = 該抓', src: iface.replace('  onCancel: () => void', '  onCancel: () => void\n  onSkip?: (a: A) => void'), e: 1 },
    { n: '必填 + 無閘 = 合格', src: iface + 'onStop?.()', e: 0 },
    { n: '可選 onClose(標題列)= 該抓', src: iface.replace('onClose:', 'onClose?:'), e: 1 },
    // 2026-09-18 迴歸:面板本身的 onClose 寫成可選 = 遮罩點了不關,必須抓
    { n: '可選 onClose(面板 / 遮罩)= 該抓', src: iface.replace('export interface AgentPanelProps {\n  onClose:', 'export interface AgentPanelProps {\n  onClose?:'), e: 1 },
    { n: '{onClose && (<Button/>)} 閘 = 該抓', src: iface + '{onClose && (<Button dismiss />)}', e: 1 },
    { n: '{onStop ? <A/> : <B/>} 閘 = 該抓', src: iface + '{onStop ? <Stop/> : <Send/>}', e: 1 },
    { n: 'busy ? 停止 : 送出(狀態閘)= 不抓', src: iface + '{busy ? <Stop/> : <Send/>}', e: 0 },
  ]
  let bad = 0
  for (const t of c) {
    const got = checkSource(t.src).length
    if (got !== t.e) { bad++; console.error(`❌ selftest「${t.n}」期望 ${t.e} 得 ${got}`) }
  }
  // 對照組總數由 `c` 推導,不寫死 —— 加了案例卻忘了改數字,綠燈會繼續說舊的數(M17)
  SELFTEST_TOTAL = c.length
  return bad === 0
}
/** selftest 案例數(由 selftest() 填);印在通過訊息裡,避免手寫數字漂移。 */
let SELFTEST_TOTAL = 0

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (!selftest()) process.exit(2)
  const src = readFileSync(path.join(ROOT, TARGET), 'utf8')
  const issues = checkSource(src)
  if (issues.length) {
    console.error(`❌ agent-panel-fixed-anatomy-invariant:${TARGET}`)
    for (const i of issues) console.error(`   - ${i}`)
    process.exit(1)
  }
  console.log(`✅ agent-panel-fixed-anatomy-invariant PASS(selftest ${SELFTEST_TOTAL}/${SELFTEST_TOTAL} + 固定 anatomy 必填/無渲染閘)`)
}
