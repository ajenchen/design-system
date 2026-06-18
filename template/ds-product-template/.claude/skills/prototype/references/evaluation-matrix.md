# Evaluation Matrix — 4 軸評分 + 決策規則

Phase 2 將 Phase 1 scan 結果變成可決策的評分表。

---

## 4 軸評分表

### 結構

```
| Candidate | 優缺(pros / cons) | DS 一致性(1-5) | 業務 fit(1-5) | 複雜度(1-5,低=高分) | 小計 | 備註 |
|-----------|---------------------|------------------|------------------|------------------------|------|------|
| Linear 風格 | + 簡潔直覺 / - 太新 consumer 不熟 | 5(全用既有) | 4 | 5(複用 Button/Popover) | 14/15 | Mindset #1 我們 / Linear 一樣簡潔,差別: ... |
| Notion 風格 | + 高階彈性 / - 學習曲線陡 | 3(需新 Command Palette) | 3 | 2(重度自訂) | 8/15 | Mindset #2 需新 primitive 評估 |
| Stripe 風格 | + 流程嚴謹 / - 太多 modal | 4(消費 Dialog) | 5(業務就是金流) | 3 | 12/15 | ... |
```

---

## 每軸打分規則

### 優缺(bullets,不打分)

列 3-5 個 pros + 3-5 個 cons。**避免抽象形容詞**(「好看 / 直覺」— meaningless),用:
- 具體機制(「一鍵快速篩選」)
- 業務對映(「能直接表達 VIP 客戶分類」)
- 量化預期(「估可減 30% 誤點擊」)

### DS 一致性(1-5,5 最高)

- **5**:全部消費 `node_modules/@qijenchen/design-system/src/components/` 既有元件 + 既有 layout primitives
- **4**:0-1 個新 primitive / 新 variant(低成本)
- **3**:1-2 個新元件或顯著新 pattern(中成本)
- **2**:3+ 個新元件 / 新 pattern(高成本 — 審慎)
- **1**:衝突(違反既有 mindset / layout primitive SSOT)

**扣分場景**:
- 候選需要覆蓋 `--chart-*` token 家族 → DS 一致性扣
- 需要 hack Popover / Dialog 基底 → DS 一致性扣
- 違反 token 防線 lib/_token_hygiene.sh 5 條守則 → 直接 1(這是 bug,不是 DS 選擇)

### 業務 fit(1-5,5 最高)

依 Phase 0 framing 打分:
- **5**:完美對映 primary jobs-to-be-done;使用者直接看懂情境
- **4**:對映但需要少量 onboarding
- **3**:可用但需要使用者重新學習
- **2**:不完全對映,但有救(次級情境)
- **1**:語境衝突(「這個 pattern 是 e-commerce 的,我們是 B2B SaaS」)

### 複雜度(1-5,**低複雜度 = 高分**,反向)

- **5**:一週內可完成
- **4**:1-2 週
- **3**:2-4 週
- **2**:1-2 個月
- **1**:>2 個月(通常 skill 不走這條)

## 小計 & 決策門檻

**小計 = DS一致性 + 業務 fit + 複雜度**(滿分 15)。

**決策規則**:
- ≥ 12/15 → **strong shortlist**(必進 Phase 3)
- 9-11/15 → **可 shortlist**(若有特別理由,如業務 fit=5 彌補其他)
- ≤ 8/15 → **drop**(記入 notes.md ruled-out reasons,保留學習價值)

**Tie-breaker**(兩個 12/15):
1. 業務 fit 分數高者優先
2. DS 一致性分數高者次之
3. 都平手 → 同時進 Phase 3(讓 stakeholder 決)

**不以 AI 決定 drop**:邊界 candidate(9-11)user 可能有戰略理由選中,flagging + 等 Checkpoint 2 決策。

---

## Narrative 必寫項目(對齊 Mindset)

**每個 candidate 的 1-2 段摘要必含**:

1. **對齊 Mindset #1「對標世界級」**:
   - 「我們的做法 vs 這家是一樣 / 不同,不同的理由是 ___」
   - 說不出理由 = 設計 bug

2. **對齊 Mindset #2「不憑直覺發明」**:
   - 「此 candidate 需要的新 primitive 是 ___ / 既有 primitive `X` 已可滿足」
   - grep 既有 DS 的證據

3. **對齊 Mindset #4「真實業務場景」**:
   - 「此候選在我們的 `{業務場景 A}` / `{場景 B}` 會呈現 ___」
   - 不是抽象「UX 好」

4. **OOUX / IA 深度對標**(see `ooux-template.md`):
   - 「此 candidate 的 object model 對應競品的 `{Linear/Jira}` 方式,差異在 `{relationship depth / progressive disclosure 策略}` 是 ___」
   - 不是只比視覺表皮;若 candidate 實際上是同個 object model 的 UI shape 變體,narrative 需明點出
   - 若候選會變更 object definition(拆分 / 合併 object),**扣 DS 一致性分**(代表與 product canonical object model 漂移)

4. **對齊 Mindset #5「猶豫就問」**:
   - 若 candidate 的某部分無法評(資訊不足),**flag 而非猜**

---

## 輸出範本

```markdown
## 候選 A:Linear-style Quick Filter(推薦★)

**核心機制**:Popover + 多 checkbox + saved filter。

**優**:
- Shortcut(`Cmd+Shift+F`)符合 power user 習慣
- 我們既有 Popover + Checkbox 直接能組,零新元件
- 「saved filter」延伸功能未來 scalable

**缺**:
- 初次使用需 onboarding(Mindset #4:我們客群是 enterprise 中小企業,重度用戶少,需評估滲透率)
- shortcut 行動裝置 fallback 需另設計

**評分**:
- DS 一致性 **5**(100% 既有元件)
- 業務 fit **4**(power user 場景 100%,輕度用戶 onboarding 佔 20% 扣)
- 複雜度 **5**(預計 3 天完成)
- 小計 **14/15** → **strong shortlist**

**Mindset check**:
- #1:我們 vs Linear 一樣簡潔,差別我們加 filter preview(e-commerce 業務)
- #2:無需新 primitive
- #4:對 B2B SaaS 真實場景契合(sales daily filter 使用頻率高)
```

---

## 反-patterns(評分偏誤)

- ❌ **偏好視覺酷炫**:Notion-style 華麗 = 高分 → 忽略業務/DS 扣分
- ❌ **偏好「我們獨創」**:自創 pattern 在 DS 一致性給高分 → 違反 Mindset #2
- ❌ **過度保守**:只打 3 分求穩 → Phase 2 失去篩選功能
- ❌ **抽象優缺**:「好看」「直覺」「簡潔」— 無決策力,等於沒寫
- ❌ **跳 tie-breaker 規則**:AI 挑一個 convenient 進 shortlist,違反 Checkpoint 2 精神
- ❌ **只比視覺不比 IA**:只看 Phase 1 表層 / 沒分析 object model 就打分 → 抄到形式,抄不到深度(見 ooux-template.md)
