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

/** 父行程 spawnSync 的逾時:子行程最壞跑完所有重試 + 收尾餘裕。 */
export const controlTimeoutMs = (attempts = MAX_ATTEMPTS) => attempts * PER_ATTEMPT_MS + 30000
