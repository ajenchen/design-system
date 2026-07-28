---
name: propose-to-user-in-plain-chinese
description: 任何要 user 決策的提案必用具體中文人話,禁 jargon。違 = mechanical BLOCKER
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# 提案給 user 必用中文人話 canonical

## Rule

**任何要 user 拍板的提案(A/B/C 選一字 / 投票 / 拍板)必用「具體中文人話」**,禁術語/代號:

❌ **禁用 jargon**:
- 「M14 trait-content backfill」「Dim 44 title 重分類」「D12 placeholder fix」
- 「SSOT-affecting」「@watch tag」「OpenSnapshot」「Layer A own」
- 「spec frontmatter `hasSizes` declared 卻 empty stub」
- 任何沒中譯的縮寫 / 內部代號 / hook 名

✅ **必含 3 段**:
1. **發生什麼**(中文具體,user 視角看到的現象,e.g.「Storybook 文件給 designer 看時 Sidebar 的尺寸表是空的」)
2. **影響是什麼**(中文具體,user-visible consequence,e.g.「designer 不知道 Sidebar 有哪些尺寸,只能猜」)
3. **選項各自結果**(中文具體 outcome,e.g.「選 A:我幫你列出所有尺寸 + 何時用 / 選 B:你先指定 6 個元件分別要列什麼」)

## User 原話 SSOT(2026-05-15)

> 「已經跟你說過任何要我決策的東西**請講具體人話**,為何又**跟智障一樣講人聽不懂的話**呢? 我們 infra 不是應該已經有規定了嗎? **到底要如何避免你又這樣智障**?」

## 既有 canonical 已存(2026-05-14 codified)

CLAUDE.md `# 自主執行 canonical` 已寫:
> 「以後所有工作流程,基本上**只有會影響SSOT的UI/UX的增刪改需要用中文具體人話講給我聽讓我判斷決策**」

但只是 markdown 規則,**未 mechanical 強制** → 我 N 次違反。

## Mechanical strength(2026-05-15 升級)

- Hook `check_propose_plain_chinese.sh`:scan AI reply 含「回 A / B / C」/「決策」/「拍板」pattern → check 同 reply 含 jargon keyword(「M[0-9]+」/「Dim [0-9]+」/「SSOT」/「@watch」等) → 超 threshold 警告
- Memory file 本檔 always load via MEMORY.md index

## 何時 apply

任何 reply 結尾含:
- 「回 A」/「回 B」/「回 OK」 etc 一字決策 prompt
- 「等你拍板」/「user 決策」
- 「→ 選 A / 選 B」 等

→ 必整段 reply rewrite 成人話 format(發生什麼 / 影響 / 選項 outcome)

## Anti-pattern 錨例(永久 codified)

**2026-05-15 turn N**: 我 reply 列「A. 6 M14 trait-content backfill(Alert/SegmentedControl/Sidebar/Slider/Steps/Toast)spec frontmatter `hasSizes` / `hasVariants` declared 卻 empty stub → 該補 content...」
- 違反:全 jargon,user 看不懂 hasSizes / variants stub 是什麼
- User 抓「跟智障一樣講人聽不懂的話」
- 應該的人話:「Storybook 文件給 designer 看時,Sidebar / Alert / Toast 等 6 個元件的尺寸表/變化形表是空的,designer 看不到完整選擇。要我幫你補完還是先看細節?」

## Related

- CLAUDE.md `# 自主執行 canonical`(SSOT-UI/UX → ASK + 「具體人話講給我聽」明文)
- `feedback_ship_then_revert_anti_pattern.md`(approval keyword 偵測)
- M19 trigger phrase auto-pipeline
