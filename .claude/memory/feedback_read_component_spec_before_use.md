---
name: feedback_read_component_spec_before_use
description: "寫 UI/story 用任何 DS component 前,先讀該 component spec.md 的 variant/size/emphasis 表按原則選,不靠 cva 預設、不靠 visual-audit 事後補抓"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3fb5856b-7b97-40a4-afa1-5db311326bea
---

寫 UI / story 用**任何 DS component 前**,**先讀該 component `spec.md` 的 variant / size / emphasis 表 + 按原則選 prop**;**禁**直接擺上去吃 cva 預設、禁靠截圖視覺稽核事後才補抓。

**Why**:2026-06-06 我寫 `Header Anatomy` story 擺工具列按鈕時,`<Button iconOnly>` 沒指定 variant → 吃到 Button cva 預設 `primary`(藍色 CTA),chrome header 工具列應為 `text`(low emphasis / toolbar embedded)。截圖視覺稽核才抓到。user 怒:「用什麼元件就該全盤查找該元件所有相關設計原則才開始使用,不是自動遵守的硬規定嗎?為何沒確實執行?」這是 mindset #2 + `# SSOT 消費 canonical` 的硬規定,我反覆沒做。截圖是「事後補網」,不是「事前紀律」。

**How to apply**:
1. 用 `<X>` 前先 Read `components/X/X.spec.md`(或 pattern spec):variant 階層(各 when)/ size(各 when + cva default)/ emphasis / 禁止事項 / iconOnly 規則。**cva 預設常不是你要的**(Button 預設 = `primary` 非 low-emphasis;world-class 如 MUI 預設 = `text`、Ant = `default`)。
2. 同時讀**相關原則**:擺按鈕列 → 一定也讀 `action-bar.spec.md`(role 分區 / 順序 / dismiss 分隔);row → `item-anatomy`;header → `header-canonical`。
3. chrome header / toolbar icon 按鈕 = `variant="text"`(button.spec.md L20-22 + FileViewer canonical),**非 tertiary**(tertiary = Material Outlined 有框)。dismiss = `dismiss` prop + size="sm"。
4. story 是公開參照(Dim 68 教錯=consumer 抄錯)→ 每顆按鈕/每個 prop 都要對得上 spec。
5. 截圖視覺稽核(Playwright)是**最後一道**backstop,不是省略讀 spec 的藉口。[[feedback_consume_existing_classification_ssot]] [[feedback_ai_ground_truth_unreliable_mechanical_primary]]
