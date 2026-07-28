# Story 自我檢查清單

寫完 / 審時逐條打勾:

- [ ] 所有範例文字是真實產品可能出現的句子(不是 Option A/B/C、不是「按鈕一」)
- [ ] 每個範例可追溯到世界級 SaaS 或常見業務場景(能說出「這參考 Jira / Stripe / Notion 哪個功能」)
- [ ] 沒有極端不現實案例(50 個 filter、5 層 dialog、單 button 寫滿 3 行)
- [ ] 「人」test 通過(遮標題光看元件懂情境)
- [ ] 「舉一反三」test 通過(讀者能推出自己產品該怎麼用)
- [ ] Label / note 沒有 spec 代號(Rule A、Variant X)或抽象符號表達式
- [ ] Rule note 傳達原則(「為什麼」),不只是結論(「是什麼」)
- [ ] 檔內註解語言一致(中文檔純中文、英文檔純英文,不中英夾雜)
- [ ] 若是 anatomy:TOKEN_MAP / SIZE_SPECS 和 .tsx 的 cva 完全一致

## 交付前最後一輪

- [ ] `npm run storybook` 本地跑過,每個 story 視覺正常渲染
- [ ] `npx tsc --noEmit` 無錯
- [ ] dark mode 切換正常(色塊 / 文字色自動更新)
- [ ] density 切換正常(若元件屬 field-height family)
