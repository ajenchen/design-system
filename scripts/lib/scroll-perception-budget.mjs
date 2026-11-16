/**
 * 感知量測的重試預算 —— 父子行程**共用同一份**。
 *
 * 2026-09-21:父行程(test-data-table-scroll-perception.mjs)與子行程
 * (data-table-scroll-perception.mjs)各自寫 `?? 5`,於是「父的逾時由子的重試次數推導」
 * 這句話只存在於註解裡。改掉任一邊,另一邊不會跟著動,而 #143 修掉的那個缺陷
 * (父 120s < 子 5×38s)可以無聲復發。
 *
 * 現在只有這一份;兩邊都 import。
 */
export const MAX_ATTEMPTS = Number(process.env.DT_PERCEPTION_MAX_ATTEMPTS ?? 5)

/** CI 實測每次約 38 秒,取 60 秒(1.5×)當每次預算。 */
export const PER_ATTEMPT_MS = 60000

/**
 * 作廢重跑前的退避(2026-09-29,3a9d1efc:4500 dpr1 連續 5 次整窗跳轉、0 次擷取有效 → 紅;本機同一份建置一次就過)。
 * 連續停頓多半是 runner 那幾秒在忙別的事,立刻重跑等於在同一段忙碌裡再量一次;第 n 次作廢後等 1.5s × n。
 * 只是重跑節奏,不改任何判準;父行程逾時把它算進去,免得 #143 那種「父的逾時 < 子的最壞時間」復發。
 */
export const RETRY_BACKOFF_STEP_MS = 1500
export const retryBackoffMs = (attempt) => RETRY_BACKOFF_STEP_MS * attempt
const totalBackoffMs = (attempts) => Array.from({ length: Math.max(0, attempts - 1) }, (_, i) => retryBackoffMs(i + 1)).reduce((a, b) => a + b, 0)

/** 父行程 spawnSync 的逾時:子行程最壞跑完所有重試(含各次退避)+ 收尾餘裕。 */
export const controlTimeoutMs = (attempts = MAX_ATTEMPTS) => attempts * PER_ATTEMPT_MS + totalBackoffMs(attempts) + 30000

/**
 * 冷卻後再一輪(2026-11-17,A26)【AI 推導 2026-11-17】:一輪 MAX_ATTEMPTS 次**全部**整窗跳轉、且沒有一次擷取有效
 * (= 走到 INSTRUMENT-FAIL)時,同一步裡冷卻後把整段再跑一輪;判準一格不動,只是多一輪量的機會。
 * 錨:41622d91 dpr1(398 / 398 / 420 / 431 / 403px)、ca46a310 dpr2(510 / 554 / 553 / 441 / 454px)兩支都是 5 次全作廢,
 * 每一次的殼 / 滿列留白都是 0 —— 紅的是「量不到」,不是表格。
 *
 * **只在知道 job 還剩多少時間時才開**:截止時刻由呼叫端(ci.yml 該步)以 `DT_PERCEPTION_DEADLINE_EPOCH`(epoch 秒)給;
 * 沒給 / 解不開 → 不開(「不知道會不會超時 = 不開」,與 lib/fast-scroll-gate-policy.mjs nextExtraRound 同一條)。
 * 一輪的估計 = 冷卻 + 次數 × **本次執行最慢那一次**的牆鐘(CI 上同一步的嘗試是 9–11 秒或 38–41 秒雙峰,取最慢才不低估)
 * + 各次退避。輪中每次重跑前再問一次 `attemptFits`,所以就算後面幾次比估計慢,超出截止也頂多一次的散布。
 */
export const EXTENSION_COOLDOWN_MS = 30000
export const deadlineMsFromEnv = (raw = process.env.DT_PERCEPTION_DEADLINE_EPOCH) => {
  const s = raw == null || raw === '' ? NaN : Number(raw)
  return Number.isFinite(s) && s > 0 ? s * 1000 : NaN
}
/** 冷卻後再一輪要不要開。回 { go, why, estMs }。 */
export function extensionRoundPlan({ nowMs, deadlineMs, slowestAttemptMs, attempts = MAX_ATTEMPTS, cooldownMs = EXTENSION_COOLDOWN_MS }) {
  if (!Number.isFinite(deadlineMs)) return { go: false, why: 'no-deadline', estMs: NaN }
  if (!(Number.isFinite(slowestAttemptMs) && slowestAttemptMs > 0)) return { go: false, why: 'no-estimate', estMs: NaN }
  const estMs = cooldownMs + attempts * slowestAttemptMs + totalBackoffMs(attempts)
  if (!Number.isFinite(nowMs) || nowMs + estMs > deadlineMs) return { go: false, why: 'budget', estMs }
  return { go: true, why: 'go', estMs }
}
/** 延長輪裡,下一次(含它之前的退避)還放得進截止嗎。截止不明 → false。 */
export const attemptFits = ({ nowMs, deadlineMs, slowestAttemptMs, backoffMs = 0 }) =>
  Number.isFinite(deadlineMs) && Number.isFinite(nowMs) && Number.isFinite(slowestAttemptMs) && nowMs + backoffMs + slowestAttemptMs <= deadlineMs
