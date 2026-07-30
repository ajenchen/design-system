---
component: AccountMenu
family: composite
traits: []
variants: {}
sizes: {}
benchmark:
  - Atlassian atlassian-navigation Profile: unpkg.com/@atlaskit/atlassian-navigation/dist/types/index.d.ts
  - Atlassian ProfileProps: unpkg.com/@atlaskit/atlassian-navigation/dist/types/components/Profile/types.d.ts
  - shadcn dropdown-menu account switcher: ui.shadcn.com/docs/components/dropdown-menu
  - Primer ActionMenu composition: primer.style/components/action-menu
  - Material navigation drawer account placement: m3.material.io/components/navigation-drawer
---

# AccountMenu 設計原則

全域 chrome「自己的帳號入口」:24px avatar 觸發點 + 帳號選單(個人資料 / 設定 / 登出)。

**實作基礎**:組合元件——raw `<Avatar size={24}>` 觸發(`DropdownMenuTrigger asChild` 包 focusable button)+ 既有 `DropdownMenu`(Content / Group / Label / Item)。本元件不含任何新視覺 primitive,是兩個既有元件按 chrome canonical 的固定收斂(自建 wrapper 理由:app-shell.spec.md + sidebar.spec.md 兩處 canonical mandate 消費、跨 consumer 必須同構,不能任由各產品手刻 avatar+dropdown 漂移)。

**Layout Family**:非 Family 1-4 — composite(trigger 是 chrome header 內的 identity mark,浮層內 row 由 `DropdownMenu` 走 Family 1)。

**2026-07-30 升級歷程**:2026-06-17 於 `AppShell/_demo-helpers.tsx` 以 demo helper 誕生(user directive「primary-header 不該把個人設定放 sidebar footer,該放主標頭右側 avatar」);F9 稽核發現「文件教得到、import 拿不到」(spec mandate 消費但 demo helper 不出 npm)= DT-EXPORT 斷鏈同款缺口 → 升 public。

---

## 何時用

- **`primary-header` 派 globalHeader 右側**(desktop):品牌在左、自己的帳號在右(GitHub / Gmail / Slack / Atlassian global top bar 慣例)
- **`primary-header` 派 mobile Sheet `<SidebarHeader>` 右側**:Sheet 蓋住 globalHeader 時鏡像桌面帳號家搬進 Sheet 頂排
- 任何「目前登入使用者的個人設定入口」需求(開 navigation 選單,非展示他人資訊)

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| `primary-sidebar` 派桌面帳號入口 | `<SidebarFooter>` + UserFooter 慣例(`ItemAvatar` + ProfileCard hover) | 該 mode 帳號家在 sidebar 底,不在 chrome header(app-shell.spec.md 放置 SSOT) |
| 看「別人」的人員資訊 | `ProfileCard`(avatar hoverCard) | ProfileCard 預設動作(Chat / 通話)語義是聯絡某人;AccountMenu 是「自己」的入口 |
| 一般動作選單(排序 / 匯出 / row actions) | raw `DropdownMenu` | AccountMenu 綁 identity 語義(avatar trigger + user Label),非通用選單 |
| 帳號切換器(多帳號 switcher) | 自組 `children`(v1 未內建 switcher) | Default 集合是單帳號 navigation;switcher 是產品級擴充 |

## 放置 SSOT(pointer,不重述)

**Owner = `../AppShell/app-shell.spec.md`「帳號入口(Account entry)放置 SSOT」段**(mode-dependent 放置表 + 「只能出現一次」rule + Responsive mobile-Sheet 精修)。本元件 **placement-agnostic**:不收 `mode` / `layout` prop,放哪裡由 consumer 讀 `useAppShell().layout` + `useSidebar().isMobile` 決定(recipe:`_demo-helpers.tsx` `AcmeSidebar` `headerHasAccount`)。複製放置邏輯進元件 = 第二份 SSOT(Rule-of-3 違反),故意不做。

## 近親職責分界

| 元件 | 語義 | 分界 |
|------|------|------|
| `ProfileCard` | 看**別人**的人員卡(hover 展開,Chat / 通話動作) | AccountMenu 是**自己**的 navigation 入口;兩者不互換 |
| `UserFooter` 慣例(`SidebarFooter` 內) | `primary-sidebar` 派的帳號家 | 同為「自己」,但 placement 與型態(row vs chrome avatar)不同 mode 各有其家 |
| `DropdownMenu` | 通用選單 primitive | AccountMenu 是其固定收斂消費者(identity trigger + canonical 集合) |
| `Avatar` | identity mark primitive | AccountMenu 的 trigger 消費 raw `<Avatar size={24}>`(header-canonical.spec.md 4.5) |

## API

| Prop | 型別 | 預設 | 說明 |
|------|------|------|------|
| `user` | `AccountMenuUser`(`name` + `avatar?: Omit<AvatarData,'hoverCard'\|'alt'> & { alt?: string }`) | —(必填) | 當前登入使用者;`avatar.hoverCard` 刻意排除(自己的入口不掛 ProfileCard);`alt` fallback `name` |
| `onViewProfile` | `() => void` | — | 「個人資料」handler(命名對齊 `PersonData.onViewProfile` 既有 canonical) |
| `onOpenSettings` | `() => void` | — | 「設定」handler |
| `onSignOut` | `() => void` | — | 「登出」handler |
| `children` | `ReactNode` | — | 取代 default 選單內容(自組 Group / Item;i18n / 產品自訂項走這);identity Label 恆由元件渲染 |
| `align` | `'start' \| 'center' \| 'end'` | `'end'` | 右上入口靠右展開(demo baseline) |
| `triggerAriaLabel` | `string` | `'帳號與設定'` | i18n override(對齊 Avatar `badgeAriaLabel` pattern) |
| `defaultOpen` | `boolean` | — | uncontrolled 預設展開(Radix passthrough;Storybook OpenSnapshot 用) |

**Default 選單集合**(owner = app-shell.spec.md「入口開什麼」段):Group 1 = Label(user.name)+ 個人資料 + 設定;Group 2 = 登出(破壞性動作獨立分區)。三個 default callback 未接任何一個且無 `children` → dev-mode warn(對齊 `ProfileCardDefaultActions` 先例)。

## 常見誤解

- **「AccountMenu 該收 `mode` prop 自動決定放置」** — 錯;放置 SSOT 在 app-shell.spec.md,consumer 決定(元件收 mode = 第二份 SSOT + 元件被迫依賴 AppShell context 才能 render,Storybook / 非 AppShell 產品用不了)。
- **「demo 的 `AccountMenu` 是另一個元件」** — 不是;`_demo-helpers.tsx` 的 `AccountMenu` 是綁示範資料(Alan Chen)的薄 wrapper,消費本元件。
- **「要顯示 email 第二行」** — v1 Label 只渲染 `name`(demo baseline 忠實);第二行是視覺擴充,待 user 拍板(見 tsx 檔頭升級歷程)。

## A11y 預設

- **Trigger**:`<button type="button" aria-label>`(icon-only 觸發必有 aria-label;預設「帳號與設定」,i18n 走 `triggerAriaLabel`);focus ring = `focus-visible:ring-2 ring-ring`(互動感由 ring 提供,無 hover bg — chrome 輕量 entry,不放大 avatar 到 field height)
- **Keyboard**:繼承 Radix DropdownMenu(Enter / Space / ArrowDown 開啟、Arrow 巡覽、Esc 關閉並 focus 還 trigger、typeahead)— owner = `dropdown-menu.spec.md` A11y 段,不重述
- **選單語義**:Label 為 presentation(不可 focus),item 為 menuitem(Radix 自管 role / aria)

## 禁止事項

- ❌ **用 `ItemAvatar` 當 trigger**(chrome header 不是 row context,誤啟動 row anatomy lookup — header-canonical.spec.md 4.5)
- ❌ **放大 trigger avatar 到 field height / 加 hover bg**(chrome 輕量 entry canonical)
- ❌ **`primary-sidebar` 派桌面用 AccountMenu**(該 mode 帳號家 = SidebarFooter;app-shell.spec.md 放置 SSOT)
- ❌ **同畫面同時出現兩個帳號入口**(app-shell.spec.md「只能出現一次」rule)
- ❌ **用 ProfileCard 當帳號選單內容**(看別人 vs 自己語義錯置)
- ❌ **繞過本元件手刻 avatar + DropdownMenu 重造帳號入口**(跨 consumer 漂移;本元件即 canonical 收斂)

## Benchmark(M8 / M22 cite)

| 家 | Idiom | Source |
|----|-------|--------|
| Atlassian | **專門 `Profile` 元件**作 top bar 帳號 trigger(`ProfileProps = IconButtonProps`),選單內容 composition | <https://unpkg.com/@atlaskit/atlassian-navigation/dist/types/index.d.ts> + <https://unpkg.com/@atlaskit/atlassian-navigation/dist/types/components/Profile/types.d.ts> |
| shadcn | 無專門元件;「An account switcher dropdown triggered by an avatar」= DropdownMenu composition(Label(user)+ Groups + Separator) | <https://ui.shadcn.com/docs/components/dropdown-menu> |
| Primer(GitHub) | 無專門元件;ActionMenu + Overlay + ActionList composition | <https://primer.style/components/action-menu> |
| Material 3 | 無專門元件;navigation drawer 帳號 switcher 放 drawer header 區(placement guidance) | <https://m3.material.io/components/navigation-drawer>(placement cite 已在 app-shell.spec.md) |

**收斂**:trigger 出貨為專門元件(Atlassian 路線,因 DS 內兩處 spec mandate 同構消費)+ 內容維持 DropdownMenu composition 開放(shadcn / Primer 路線,`children` 取代)。M21 3-test:(1) `DropdownMenu` 無單一 prop 可達成 identity trigger + canonical 集合;(2) Atlassian 出貨分離元件(cite 上表);(3) contract 不同 — 收 user identity 資料 + navigation callbacks,非 menu primitive surface。
