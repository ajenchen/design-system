// size-limit 設定(排程「Monitor bundle size drift」、npm run size、深度稽核 Dim 50 都讀這支)。
// 推導產物,不要在這裡寫數字:上限的唯一來源是 packages/design-system/bundle-budget.json 的 sizeLimit 段,
// 與 PR 閘 check:bundle-size 的原始 byte 上限同一份檔、同一支程式重設(node scripts/check-bundle-size.mjs --init)。
// 這支被改成寫死陣列、或 package.json 又長出 "size-limit" 段,check:bundle-size 會紅(待辦總帳 SM3)。
import { fileURLToPath } from 'node:url'
import { readSizeLimitConfig } from './scripts/check-bundle-size.mjs'

export default readSizeLimitConfig({ root: fileURLToPath(new URL('.', import.meta.url)) })
