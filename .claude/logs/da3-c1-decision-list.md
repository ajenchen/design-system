# DA3 C.1 — 你要拍板的清單(consolidated,batch-at-end)

**產生**:2026-07-17。**來源**:codex judgment 360 findings(對抗驗證 FALSE 0)+ codex Phase B 1273 claim-vs-code + Claude Phase A,經 ASK 收斂 10 主題 → **17 條已自動降 AUTO**(對齊既有拍板 canonical,不佔你決策力)→ 剩下的真決策收斂在此。

**怎麼用**:每題我都給了**推薦 + 為什麼 + SSOT 理由**。你可以 (a) 回「全照推薦」我一次全做;(b) 只挑某幾題改;(c) 對某題要更多對照我再展開。**全部附世界級 ≥3 家對照 + 我方既有 canonical cite,不是憑感覺。**

---

## 🔴 群 A — 必修,只問「怎麼修」(不是要不要修)

### A1. Tabs 的 split-action 按鈕落在 tablist 內(axe critical)
你依圖一加的 tab 右側 action 按鈕,目前真 button 包在 `role=tablist` 內,違反 WAI-ARIA「tablist 只能擁有 tab」,axe critical。
- **推薦 A**:action 移出 tablist DOM(變 TabsList 兄弟節點)+ 絕對定位維持貼齊 + tab 用 `aria-owns` 保持 ownership。**視覺零改動**(WAI-ARIA APG 官方 + MUI 一致做法)。唯一要確認:移出 roving-focus 後鍵盤 Tab 順序你能接受。
- 選項 B:重設計(收進 overflow menu / 外側 toolbar),結構最乾淨但動你圖一視覺較大。
- **SSOT 理由**:改 canonical 語意 + 動你親自指定功能的 DOM 位置與焦點行為。

---

## 🟠 群 B — 型別誠實化(共同 tradeoff:型別誠實 vs .d.ts 破壞性變更)

這三題本質同源——公開型別承諾了實作兌現不了的東西。差別在「破壞性收窄」還是「保守 dev-warn」。

### B1. asChild / children 全域收窄政策(14 findings 一次點頭)
13 個固定結構元件(ScrollArea / Slider / SegmentedControlItem / TabsTrigger / Switch / RadioGroup / Breadcrumb / TooltipContent…)公開型別繼承 Radix `asChild`/`children`,但自己固定渲染多個內部子節點 → 有的 `asChild=true` **執行期直接爆錯**(React.Children.only),有的 children **被靜默蓋掉**(Breadcrumb 更慘:router link 拿不到 href/ref)。
- **推薦 A**:把兌現不了的 prop 從公開型別 `Omit`(比照你 2026-07-07 已上線的 `Slider Omit<…,'children'|'orientation'>`)+ spec 記「固定結構不支援」。100% 對齊你 2026-07-14 拍板的 Select「全部收窄」精神 + 我方 6 元件既有 canonical + Radix/shadcn 世界級共識。唯 **TooltipContent** 可單獨選 B(tooltip 內容較可能是 consumer 元素)。
- 代價:動已發佈 `.d.ts`(beta bump),但**弄壞的只有原本就爆錯/靜默失效的用法**——誠實化,不是拿掉能用功能。
- **SSOT 理由**:把元件級做法升級成 DS 全域政策 + 改公開 API contract。

### B2. Root barrel 宣告層 @internal 收緊
public 目錄內標了 `@internal` 的宣告(尺寸 token、layout helper、部分 Context)仍從 root barrel 洩漏出去。原則你 2026-06-05 Q2 已拍板(internal 不進 front-door),但 generator 只在**目錄粒度**強制。**多數已自動降 AUTO**(三方權威已明確 internal 的:RowSizeProvider / use-overflow-items / ButtonGroupContext 等),剩 1 懸點要你一句話:
- **推薦 A**:擴充 generator 解析宣告層 `@internal`(對齊 TS stripInternal / MUI / api-extractor 標準做法)+ 順手定案 `handleSheetOpenAutoFocus`(spec 自相矛盾)方向:保留 internal 還是扶正 public?
- **SSOT 理由**:`handleSheetOpenAutoFocus` 的 public/internal 分類是 API 契約決定。

### B3. 有界數值 prop 型別策略(3 findings:LineClamp / precision / Rating max)
`maxLines`(1-6)/ `precision`(≤6)/ Rating `max`(≤7)canonical 有界,但型別 accept 任意 number;超界會靜默降級/壞掉。
- **推薦 B**(這題我反而推薦保守):保持 `number` + 執行期 clamp + 開發期 warn。理由:世界級 4 家一致保持 `number` 無一收窄;我方對「非法 prop」既有 canonical 就是「寬型別 + dev-warn」(7 元件先例);你的收窄先例(select.tsx:57)明文只適用「型別承諾了但實作沒出口」,有界數值是「有出口只是超界降級」不同類。B 同時把真 bug 修掉。
- **SSOT 理由**:選 A 會改公開型別 contract + 立新 DS-wide canonical,故送你拍板;但我建議選 B 維持現狀+補防護。

---

## 🟡 群 C — a11y / 行為契約(新增 canonical)

### C1. 空 label / accessible-name 統一政策(4 findings:Avatar / Breadcrumb / Tag / Carousel slide)
spec 說 label 必傳但型別 optional;空 label → icon `aria-hidden` → 螢幕閱讀器讀不到名稱。
- **推薦 B+C**:型別不動(不破壞 consumer)+ 解析不出名稱時 dev-warn(對齊 React Aria)+ Carousel 自動「第 N 張,共 M 張」位置名 + 純裝飾走顯式 opt-out(`alt=""` / `decorative`)。
- **SSOT 理由**:新增一條 a11y canonical + 改 4 元件行為/spec 語意。

### C2. 非同步批次操作 loading orchestration 契約(d7i4,BulkActionBar)
批次操作進行中,誰負責 disable 觸發項/其他 actions/清除鈕?目前未定義。
- 卡內選項 A(只定「誰負責」不定死視覺)vs B(定完整視覺)。**推薦見卡 T10 決策卡 1**。
- **SSOT 理由**:新增 loading ownership canonical。

### C3. controlled / uncontrolled 完整性(d26i5 Steps 展開 + d26i6 AppShell 側欄)
Steps 多步展開只有 uncontrolled;AppShell aside uncontrolled 初值固定 false。
- **推薦**:補齊成完整雙向控制(對齊 React controlled 慣例)。分元件推薦見卡 T8。
- **SSOT 理由**:新增公開 controlled API。

---

## 🟢 群 D — API 契約細節(逐題,多有便宜預設)

| # | 題目 | 推薦 | SSOT 理由 |
|---|------|------|-----------|
| D1 | Command/CommandDialog:public 還是 internal+subpath(spec 說 App 直接用但標 internal) | **B 留 internal + spec 改口走 subpath** | 新 public API 面 |
| D2 | Combobox creatable:spec 指路但無此 API(建立新選項) | 見卡 T3(Ant tags 模式為 public 先例) | 新 public API |
| D3 | prop 命名衝突:`onClear`(BulkActionBar 清 selection vs canonical 清欄位)/ `direction`(DescriptionList vs 全 DS orientation) | **A 硬改名**(前置 `rg apps/`=0;有 consumer 退 B 加 alias) | 公開 prop rename |
| D4 | Carousel 箭頭是否開放完整 Button props | 卡 T7:A 維持鎖定+文件化 / B 開放+拆 wrapperClassName | 新 API contract |
| D5 | Combobox cross-mode ref(ref 只保證 edit trigger) | A:spec 記 cross-mode ref 例外 | 改 canonical 語意 |
| D6 | DataTableColumnVisibilityPanel 回 Fragment 無 root | A:加 root 對齊 sibling(須驗 M25 scroll-chain) | 新 API contract |
| D7 | Tag 移除鈕 accessible-name prop(`dismissLabel` vs canonical `onRemove` 家族) | 見卡 T5 決策卡 2 | prop 命名 canonical |

---

## 🔵 群 E — canonical 措辭 / 視覺(低風險,強預設)

| # | 題目 | 推薦 | SSOT 理由 |
|---|------|------|-----------|
| E1 | Button `tertiary + danger` 合不合法(spec-vs-spec 衝突) | 見卡 T9 決策 1(補 compoundVariant 紅字無填色 vs 收窄 spec) | 改 canonical 語意 |
| E2 | Alert `placement` / ItemAvatar `mode` 語意重疊 | 見卡 T9(語意釐清) | 改 canonical 語意 |
| E3 | 範例用「Mode A/B」字母代號無產品語意 | 見卡 T9/卡 T1 note(改語意名須 spec+story 同步) | canonical 措辭 |
| E4 | 10px footnote 無 a11y 最低可讀性護欄 | 見卡 T10 決策卡 2 | 新 normative canonical |
| E5 | AppShellAside body 無 padding 貼邊(有邊界卻無 breathing) | A:加預設 padding(違 layoutSpace Pattern A) | 新 design language + spec |

---

## 📋 附:已自動降 AUTO 的 17 條(不需你決策,實作對齊既有拍板;完成後列在 verify 表)

d72i5(Tabs orientation 收窄=slider 先例)/ d44i3-5 + d72i0 內部符號(barrel internal=已拍板分類)/ d72i7(Breadcrumb=MUI mirror)/ d14i7(SelectMenu 內部重構)/ d24i10/12/15(story 去重=category-templates canonical)/ d8i19(z-index owner 已定)/ d72i12(tagVariant 收窄=全部收窄原則)/ d72i9(op union=同上)/ d9i9/d9i10/d9i2/d9i28(DOM passthrough additive=switch.tsx:253 先例)

全文卡片 → `.claude/logs/da3-b5-ask-cards/T*.md`
