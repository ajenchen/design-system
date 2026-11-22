<!-- Authority/status: governance/planning/registry.json -->
# 多包 / 多步工作流程 v3 的證據(2026-11-22)

> 用途:`packages/design-system/ds-canonical/rules/work-process.md` v3「每一包」第 8 點的出處。只當出處,不是規則、也不是待辦;流程本身只住在那一檔。
> 證據類別:實測品質 —— 同一批工作(N1 發版前)11-22 實際出錯一次,是 user 指出的。不是同任務對照,也沒有花費量測。
> 出處都可以在 repo 查到(commit 與檔:行);user 原話照當天訊息逐字引。

## 1. 只給量具用的極端內容做成了給讀者看的範例

- 發生什麼:A63-COACHMARK 包(commit `55c26424`,合回 `1ab56f9e`)為了讓 `scripts/overlay-story-contract-invariant.mjs` R20 量得到「內容區捲動」,在 Coachmark 展示頁新增「內容很長」(`coachmark.stories.tsx` 的 `LongContent`):單步卡片的說明一段塞進六項更新、故意超過 1280×800 的可用高度;沒有標 `test-only`,所以出現在側欄與 Autodocs,設計原則頁還有一句指向它。
- 違反的既有規則(repo 早就有,不是新規則):
  - `packages/design-system/ds-canonical/rules/story-rules.md`「Technical probe visibility」(:50)—— 只服務自動化的 story 標 `tags: ['test-only']`,從側欄與 Autodocs 排除;
  - 同檔「範例最高準則」(:57);
  - `packages/design-system/ds-canonical/skills/story-writing/references/example-selection.md`:5 / :21(禁止極端不現實案例)、`references/self-check.md`:7。
- user 原話:「我是覺得極端狀況確實需要處理也得釐清沒錯，但是非建議的用法放在 storybook 上作為範例難道不會誤導讀者以為那是建議的使用方式嗎？」
- 既有防線為何沒擋到:`scripts/audit-content-quality.mjs` 與 `scripts/test-storybook-test-only-semantics.mjs` 只看得到「標了 `test-only` 的 story 有沒有被藏錯」,看不出「沒標的 story 其實只服務量具」;這要實作與規格核對時對照 story-rules.md 判讀。
- 修正:STORY-PROBE 包把它改成 `test-only` 的「內容超過可用高度:捲動回歸量測夾具」(story id 不變,R20 照量),設計原則頁那句改指向 `coachmark.spec.md`「高度與捲動」的文字說明;同時掃過 `8eb473c7..HEAD` 新增或改名的全部 story,只有這一則違反。

## 2. 為什麼寫進 work-process.md

- 這次漏掉的不是規則,是「改到範例時去對照 story-rules.md」這個動作;work-process.md 是每個 session 開場就載入的流程住處,第 8 點只放指向,規則內容仍住 story-rules.md。
