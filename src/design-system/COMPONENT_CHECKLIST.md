# 元件完成清單

每個元件在進入 design-system 前必須對照此清單。

---

## 一、Spec（`{name}.spec.md`）

### 定義
- [ ] 元件定位一句話說清楚（是什麼、不是什麼）
- [ ] 所有 props / variants 都有明確的「何時用 / 何時不用」
- [ ] 互斥規則寫清楚（哪些 props 不能並用、哪些組合無效）
- [ ] 每個規則都有「為什麼」，不只寫「怎麼做」

### 文字品質
- [ ] 沒有描述視覺形狀或實作細節（如「窄長形」「會變寬」「zero layout shift」）
- [ ] 術語一致，沒有同一概念用兩種名稱
- [ ] 禁止事項（❌）列出所有常見誤用

### 邊界案例
- [ ] 有 disabled / loading / empty 狀態的說明（如適用）
- [ ] 有 dark mode / density 行為的說明（如適用）
- [ ] 有 icon-only 的使用規則（如適用）

---

## 二、Code（`{name}.tsx`）

### shadcn 結構規則（優先）
- [ ] 以 shadcn 原始碼為基底，不從零重寫
- [ ] `React.forwardRef` + `ref` 傳到底層 DOM 元素，確保 ref 可用
- [ ] `...props` spread 到底層元素，保留所有原生 HTML 屬性（`onClick`、`aria-*`、`data-*` 等）
- [ ] `displayName` 設定
- [ ] variants 用 `cva()` 管理，不用條件字串拼接
- [ ] 同時 export 元件本體與 `cva` 物件（供外部組合使用）
- [ ] 支援 `asChild`（透過 Radix `Slot`）讓元件可多型使用（如 `<Button asChild><Link /></Button>`）
- [ ] 不移除 Radix UI 的 `data-state`、`data-disabled`、`data-orientation` 等屬性——樣式和無障礙行為依賴這些
- [ ] 樣式優先用 `data-*` attribute selector，而非自訂 class 模擬狀態

### Design Token 規則
- [ ] 不硬寫顏色、字體、padding、border-radius、高度
- [ ] 所有尺寸使用 design token（CSS 變數或對應 Tailwind utility）
- [ ] 使用 `cn()` 合併 class

### Accessibility
- [ ] 所有互動元素有正確的 ARIA 屬性
- [ ] icon-only 元素必須有 `aria-label`

---

## 三、Stories（`{name}.stories.tsx` + `{name}.principles.stories.tsx`）

### 範例正確性
- [ ] 每個範例的 variant / props 語意正確（不為了填版面而用錯 variant）
- [ ] 同類型場景的 icon 維持一致順序
- [ ] 範例中的文字 / icon 能清楚傳達使用情境，不用「按鈕一」「按鈕二」佔位

### 完整性
- [ ] 每個重要規則都有 ✅ 正確範例
- [ ] 常見誤用都有 ❌ 錯誤範例（對比呈現）
- [ ] Rule note 只寫規則與原因，不描述視覺細節

### Accessibility
- [ ] 所有 icon-only 按鈕有 `aria-label`
- [ ] 互動範例可以用鍵盤操作

---

## 四、上線前

- [ ] 本地 `npm run storybook` 確認所有 stories 正常渲染
- [ ] 沒有 TypeScript 錯誤
- [ ] import 路徑正確（`@/design-system/...`）
- [ ] 元件加入 `CLAUDE.md` 的目錄結構（如有異動）
