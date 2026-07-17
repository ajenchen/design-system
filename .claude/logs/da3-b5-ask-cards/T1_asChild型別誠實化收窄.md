# 決策卡 — T1 asChild 型別誠實化收窄

**主題**:元件從 Radix Root / Item 繼承了 `asChild` / `children` / `orientation` 等公開型別,但元件本身有固定內部結構(固定的 Track+Thumb、Viewport+ScrollBar、icon+label+badge、dark-theme 包裝層…),導致這些 prop 要嘛在執行期直接爆錯(Radix Slot 只收單一子節點),要嘛靜默失效被內部結構蓋掉。型別「承諾了做不到的事」。

**verdict**:MIXED(1 條降 AUTO + 2 張決策卡送你拍板)

---

## SSOT-check 結果(先講我方檔案已經定過什麼)

這個「固定結構元件不該對外開 asChild、把兌現不了的 prop 從公開型別移掉」的做法,**我方早就有一整排前例在跑**:

- `DatePicker/date-picker.spec.md:289` —「`asChild` 不支援(trigger 是 compound、沒有單一 Slot 目標)」,要自訂就改用 view mode + 自家組合。
- `InlineEdit/inline-edit.spec.md:163`、`PeoplePicker/people-picker.spec.md:246`、`SelectMenu/select-menu.spec.md:195` — 全部明文「composite 非 Slot-compat,不支援 asChild」。
- `Chip/chip.spec.md:80,199` — asChild 列為明確不支援。
- `Coachmark/coachmark.spec.md:103` — 把 `children` 型別收緊成 `ReactElement`,理由白紙黑字寫「型別收緊讓錯誤提前到 compile 期」= 就是本主題要做的事。
- `Slider/slider.tsx:53` — 已經 `Omit<…, 'children' | 'orientation'>`,註解寫「spec『不支援 vertical』宣稱的型別面機械封鎖」(2026-07-07 deep-audit 殘項,已上線)。
- `Select/select.tsx:57` — 原生 select 屬性改 `Pick<>` 顯式 allowlist,**你 2026-07-14 已拍板「全部收窄」**,理由就是「型別承諾 ≠ 實作出口 = footgun」。

**結論**:大方向(收窄無法兌現的公開型別)你已經拍過板、我方也有 6+ 個元件在跑同款 canonical。所以送你的不是「要不要做」,而是「要不要把這條已存在的做法,一次性推廣成 DS 全域政策、套到這 13 個目前還沒收的元件」——因為這會動到已發佈的 npm 型別介面(`.d.ts` breaking),值得你一次明確點頭。

---

## 決策卡 1 —【固定結構元件:一次性收窄無法兌現的 asChild / children】

涵蓋 finding:d9i20(ProgressBar)、d9i21(RadioGroup)、d9i22(RadioGroupItem)、d9i23(ScrollArea)、d9i24(ScrollBar)、d9i25(SegmentedControlItem)、d9i27(SheetBody)、d9i29(Slider)、d9i30(Switch)、d9i31(TabsTrigger)、d9i34(TooltipContent)、d72i2(Slider/ScrollArea/SegmentedControl/Switch 合併條)、d72i3(Switch/TimePicker/ResizeHandle children)、d72i6(Breadcrumb 宣告式 asChild)。

**【問題】** 這 13 個元件的公開型別繼承了 Radix 的 `asChild` / `children`,但它們自己固定渲染多個內部子節點。實際結果分兩種:(1) ScrollArea、Slider、SegmentedControlItem、TabsTrigger 這類多子節點的,`asChild=true` 會直接觸發 `React.Children.only` **執行期爆錯**;(2) Switch、RadioGroup、TimePicker、Breadcrumb 這類,`children` / `asChild` 被內部固定結構**靜默蓋掉或剝除**,consumer 傳了等於沒傳(Breadcrumb 更嚴重:傳了 router link 也拿不到 href/ref,導覽語意靜默消失)。全都是「型別開了一個做不到的口」。

**【選項 A|Omit + spec 記錄固定結構】(推薦)** 把這些兌現不了的 prop 從各元件公開型別 `Omit` 掉(比照 Slider 已上線的 `Omit<…, 'children'|'orientation'>`),並在各自 spec 補一句「固定結構、不支援 asChild/children」的 canonical。
- 好處:型別對外誠實,錯誤從「上線後執行期爆錯」提前到「寫 code 時編譯就紅」,跟我方 DatePicker/Coachmark/Select 既有 canonical 完全一致;世界級對照(Radix 官方 + shadcn)也是同一結論。
- 代價:動到已發佈的 `.d.ts` = 型別面 breaking change,要 beta bump;若真有 consumer 現在寫著 `<ScrollArea asChild>`,升版後會編譯紅——但他原本就是執行期爆錯或靜默失效,沒有「正常運作」的用法被弄壞,屬「誠實化」而非「拿掉能用的功能」。

**【選項 B|保留 asChild,改用 Radix Slottable 真正做出單一 host】** 對多子節點元件,用 Radix `Slottable` 指定哪個子節點才是 consumer 可替換的 host,把 asChild 變成「真的能用」。
- 好處:保留多型彈性,不 breaking。
- 代價:這些元件的重點就是「固定結構」(Slider 的 Track+Thumb、ScrollArea 的 Viewport+ScrollBar 三件套、Tooltip 的 dark-theme 包裝層),根本沒有一個「有意義的、可換的單一 host」——硬開 Slottable 只會讓 consumer 換錯元素、破壞元件保證。我方 DatePicker/InlineEdit/PeoplePicker/SelectMenu 當初都是評估後選擇「不支援」而非「硬做 Slot host」。工也大很多。

**【推薦】** 選 A。理由:(1) 100% 對齊我方 6 個既有 canonical + 你 2026-07-14 已拍板的 Select「全部收窄」精神;(2) 世界級(Radix 自己、shadcn 社群)都認同 asChild 需單一子節點、固定結構元件不該裸開;(3) 這些元件沒有可換的單一 host,選 B 是為了彈性而彈性,違反 mindset #1「不取巧但也不過度設計」。唯一可以單獨討論的是 **TooltipContent(d9i34)**:tooltip 內容確實比較有機會是 consumer 自訂元素,若你預期未來有「自訂 tooltip 表面」需求,這一個可以選 B(把 theme+ref 合併進 consumer 單一 child);但預設仍建議 A + 文件化 theme wrapper。

**【SSOT 理由】** 改公開 API contract——移除已發佈到 npm 的型別 surface(`.d.ts` breaking change),並在多支 spec 新增「固定結構、不支援 polymorphic escape hatch」的 canonical 語意。這是把一條既有的、元件級的做法**升級成 DS 全域政策**,影響下游 consumer 型別,需你一次點頭。

---

## 決策卡 2 —【Tabs 的 inlineAction 按鈕落在 tablist 內,axe critical】

涵蓋 finding:d10i13(Tabs `inlineAction`)。**註:這條其實不是「型別收窄」議題,是被歸錯桶的 a11y 結構 bug,獨立處理。**

**【問題】** Tabs 的 split-action(你當初依「圖一」指示加的 `inlineAction`,commit cf752a7f)那顆真的 `<button>`,目前被包在 `role="tablist"` 容器裡面(tabs.tsx:517-527 的 `<span relative inline-flex>` 在 TabsList 內)。WAI-ARIA 規定 tablist 只能擁有 `role="tab"` 的子節點,塞一顆真 button 進去違反 required children ownership,完整 axe 掃描已命中 **critical**。這條「要不要修」沒得選(critical a11y 必修),要決策的是「怎麼修」。

**【選項 A|aria-owns 保持關聯,把 action 移出 tablist DOM】(推薦)** 把 action button 移出 tablist 的 DOM 子樹(變成 TabsList 的兄弟節點),用絕對定位維持「貼在該 tab 右側」的視覺;tab 本身用 `aria-owns` 讓 tablist 仍然擁有它。這是 WAI-ARIA APG 明文提供的技巧(DOM 結構受限時用 aria-owns 維持 ownership)。
- 好處:視覺不變、`inlineAction` API 不變、符合 WAI-ARIA 官方做法。
- 代價:action button 離開 tablist 的 roving-focus 後,鍵盤 Tab 順序會變(不再跟著方向鍵在 tab 間 roving,而是獨立 Tab-stop);要驗證 split-click 的鍵盤體驗仍符合你圖一的意圖。把「絕對定位元素貼齊特定 tab」在它變成整個 tablist 的兄弟後,錨定會複雜一點。

**【選項 B|重新設計 split-action 的呈現】** 例如把 action 收進 tab 的 overflow menu、或改成 tab 外側獨立 toolbar。
- 好處:結構最乾淨、a11y 最穩。
- 代價:改變你圖一的視覺與互動語意,動比較大。

**【推薦】** 選 A。理由:世界級(MUI Tabs、WAI-ARIA APG)一致把 tablist 子節點維持成純 tab,tab-adjacent 的控制項放在 tablist 之外;`aria-owns` 是官方認可、視覺零改動的做法,對你圖一的視覺意圖破壞最小。唯一要你確認的是移出 roving-focus 後的鍵盤順序可接受。

**【SSOT 理由】** 改 canonical 語意 + 動 shipped 使用者指定功能的結構——會改變 `inlineAction`(你 cf752a7f 依圖一指定)的 DOM 位置與鍵盤/焦點行為,並需在 tabs.spec.md 記載「action 移出 tablist + aria-owns」的新結構 canonical。因為動到你親自指定的功能的互動行為,送你確認。

---

## 世界級對照(≥3 家)

**asChild 單一子節點限制(對應決策卡 1):**
- Radix 官方 issue #1979「Components used with asChild should only accept a single child」+ Slot 文件:Slot 把 props 合併到「單一 immediate child」,多子節點需改用 `Slottable` 指定 host,否則執行期 `React.Children.only` 爆錯。→ 印證我方 finding。
- shadcn / DEV 社群「Fixing Shadcn Slot Issues with Multiple Children」:同款 footgun,方案就是 Slottable(選項 B)或不開 asChild(選項 A)。
- 我方既有 canonical(DatePicker/InlineEdit/PeoplePicker/SelectMenu/Chip/Coachmark)全選「固定/複合結構 → 不支援 asChild」= 選項 A。
- 來源:https://github.com/radix-ui/primitives/issues/1979 、https://www.radix-ui.com/primitives/docs/utilities/slot 、https://dev.to/weamadel/fixing-shadcn-slot-issues-with-multiple-children-n2

**tablist 只能擁有 tab(對應決策卡 2):**
- WAI-ARIA APG Tabs Pattern:「Every tablist must have one or more tab children」;DOM 受限時可用 `aria-owns` 維持 ownership(= 選項 A 的官方依據)。
- MDN `tablist role` / `tab role`:tab 必須被 tablist 包含或 owned,否則螢幕報讀器算不出「第幾個 / 共幾個」。
- MUI Tabs:實作維持 tablist 子節點只有 `<Tab>`,tab 外的控制項放容器之外。
- 來源:https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ 、https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/tablist_role 、https://mui.com/material-ui/react-tabs/

---

## 降 AUTO(不送你重問)

- **d72i5(Tabs `orientation='vertical'` 收窄)→ AUTO**。理由:這跟 `Slider/slider.tsx:53` **已上線**的 orientation Omit(2026-07-07 deep-audit 殘項)是**同一個 pattern、同一個理由**——DS 版面固定水平、傳 vertical 只改 Radix 鍵盤/ARIA 方向但視覺仍水平壞版,所以把 `orientation` 從公開型別 Omit。這不是新政策,是「Tabs 沒補上 Slider 已經做過的同款收窄」的實作缺口,對齊既有已拍板決策 → 自主執行(比照 slider.tsx:53 機制),不必再問你。（若你之後想把垂直 Tabs 排進 roadmap,再依 Slider 同款把 orientation 開回來即可,收窄只是誠實反映「現在還沒實作」。)
