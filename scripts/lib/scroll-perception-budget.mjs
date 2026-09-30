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
