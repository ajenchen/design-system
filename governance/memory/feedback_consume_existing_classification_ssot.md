---
name: feedback_consume_existing_classification_ssot
description: "消費既有不憑直覺:(a)分類用既有 category-matrix.json 5-category SSOT 禁發明新框架;(b)用元件前先讀其 spec variant/size/emphasis 按原則選不吃 cva 預設"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 3fb5856b-7b97-40a4-afa1-5db311326bea
---

分類 / 治理判斷**先 grep 既有 SSOT 消費,禁憑直覺發明新框架疊上去**(違 mindset #2 / M23)。

**Why**:2026-06-06 user 問 Storybook 分類是否完美無疑義,我連發明「intent-based 判準」→「4 組 Foundations + R1-R4」兩套新框架,疊在既有 `packages/design-system/src/story-governance/category-matrix.json` 上。對抗式 workflow 打爆我的版本:命名漂(我造的「Foundations」≠ codebase 實際 `Tokens`)、漏掉第 5 類 template、R1-R4 全落在 `category-classification-invariant.mjs` 明文排除的 judgment 區。既有 5-category SSOT(token/component/pattern/internal/template + folder/internal-flag/title 三訊號)本來就更簡單、77/77 PASS、零疑義。**「朝三暮四」的根因 = 沒先消費既有就發明。** user 多輪糾正「為何一個問題就讓你變來變去」。

**How to apply**:
1. 分類/治理判斷先讀 `category-matrix.json` `_decisionTree`(5 步)+ `category-classification-invariant.mjs`,**套既有不發明**。
2. public/internal = grep spec frontmatter internal 旗標(component `- isInternal`〔trait〕/ pattern `internal: true`〔top-level〕,兩種寫法所有腳本都認)⟺ 不在 root barrel 前門;**非 intent 直覺**。
3. component/pattern/token base 類 = 看原始碼 folder(folder 就是分類訊號)。
4. anatomy pattern(item-anatomy / header-canonical)**對稱**:設計原則 DOC = 公開 `Patterns/X Anatomy` story + 可 import primitive;建 item/header 元件由 `build-ui-canonicals.md` 自我檢查機械導流(row→item-anatomy / chrome header→header-canonical)。
5. 重大/SSOT 改動前跑對抗式 workflow 驗框架——它正是抓出我重造 SSOT 的機制(信機械 > 信自評)。[[feedback_ai_ground_truth_unreliable_mechanical_primary]]
6. **用任何 DS component 前先讀其 `spec.md` 的 variant/size/emphasis 表按原則選**,禁吃 cva 預設、禁靠截圖事後補抓。2026-06-06 anchor:寫 Header Anatomy story 沒讀 `button.spec.md` 就擺按鈕 → 吃到 Button 預設(當時=primary 藍),截圖視覺稽核才抓到。chrome header icon = `variant="text"`(toolbar embedded)非 tertiary(=Material Outlined 有框);擺按鈕列必同讀 `action-bar.spec.md`(role 分區/dismiss 分隔)。Button 預設 2026-06-06 已改低 emphasis(labeled→tertiary / iconOnly→text;對齊 MUI/Ant/Polaris/Material3),**CTA 仍必 explicit `variant="primary"`**。
