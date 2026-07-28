# Benchmark Sources — 世界級對標清單

Phase 1 research 的 go-to 資源。**每次 research 至少挑 5 家,跨 DS + SaaS + platform**(不要全抓 component library)。

---

## Tier 1:Design System 官方文件(規則 + rationale)

必掃 — 他們寫出 **why**,不只是 **what**。

| DS | 公司 | 強項 | URL |
|----|------|------|-----|
| **Polaris** | Shopify | e-commerce UX 完整 / Content guideline 深 | polaris.shopify.com |
| **Material 3** | Google | 跨平台 / a11y 最完整 / motion spec | m3.material.io |
| **Atlassian Design System** | Atlassian | enterprise SaaS(Jira/Confluence)/ tone of voice | atlassian.design |
| **Ant Design** | Ant Group | data-heavy 後台 / form 元件最豐富 | ant.design |
| **Carbon** | IBM | enterprise / data viz / 大表單 | carbondesignsystem.com |
| **Apple HIG** | Apple | native macOS/iOS patterns / 手勢 | developer.apple.com/design/human-interface-guidelines |
| **Primer** | GitHub | dev tools UX / code-adjacent patterns | primer.style |
| **Base Web** | Uber | mobility / high-density data tables | baseweb.design |
| **Fluent 2** | Microsoft | enterprise + Windows 11 native | fluent2.microsoft.design |
| **Spectrum** | Adobe | creative tools / complex forms | spectrum.adobe.com |

## Tier 2:Shadcn-style component libraries(實作參考)

Shadcn / Radix 為起點,看其他 variants 還做了什麼。

| 資源 | 強項 |
|------|------|
| **shadcn/ui** | Radix + Tailwind,我們 DS 的起點參考 |
| **Radix UI** | 無樣式 primitive,a11y / keyboard 最完整 |
| **React Aria** | Adobe 的 a11y-first hook 集 |
| **Headless UI** | Tailwind team 出品 |
| **Chakra** | 成熟 React DS |
| **Mantine** | 資料密集 components |
| **Park UI** | Ark UI based,pattern composition 示範 |

## Tier 3:World-class SaaS(實際產品 UX)

這層是精華 — DS 文件寫不出的 **在地解法**(empty state 怎麼寫 / onboarding 節奏 / 錯誤回饋)。

| 類別 | 推薦產品 | 觀察重點 |
|------|---------|---------|
| **Project mgmt** | Linear / Jira / Asana / Notion / ClickUp | task states / filter / bulk actions |
| **Payments** | Stripe / Square / Paddle | form clarity / confirmation flows / error handling |
| **Design tools** | Figma / Sketch / Adobe XD / Framer | inspector panels / layers / keyboard shortcuts |
| **Dev tools** | Vercel / Netlify / Railway / Linear | deployments / logs / CLI-to-UI parity |
| **Communication** | Slack / Discord / Teams / Zoom | DM vs channels / presence / rich composer |
| **Analytics / Data** | Amplitude / Mixpanel / Datadog / Grafana | chart types / time range / segment filter |
| **Content** | Notion / Medium / Substack / Ghost | editor UX / share / versioning |
| **Commerce** | Shopify / Amazon / IKEA / UNIQLO | product listing / checkout / review |
| **Travel** | Airbnb / Booking / KKday | search / compare / booking flow |
| **Finance** | Monzo / Revolut / Wise / PayPal | transaction list / security UX / currency |

## Tier 4:Platform conventions(OS 慣例)

| 平台 | 何時參考 |
|------|---------|
| **iOS HIG** | mobile-first / touch gesture / share sheet |
| **Android Material** | floating action / gesture nav / bottom sheet |
| **macOS** | menu bar / window chrome / keyboard-first |
| **Windows 11 Fluent** | tile / acrylic / taskbar interactions |
| **Web A11y (WCAG)** | keyboard / screen reader / color contrast |

---

## 研究步驟

每個 reference:
1. **找到該 feature 的 canonical page / screenshot**(1 張截圖就夠,不要試圖全抓)
2. **3 個問題**:
   - 他們的核心機制是什麼(layout / interaction / states)?
   - 哪些是「這家獨特」vs「業界共識」?
   - 我們若照做,會 fit 業務嗎(Phase 0 framing)?
3. **1-2 行 summary** — 避免長 essay,user 會讀 5+ 筆,精簡才 scannable

---

## 反-patterns(避免 Phase 1 失敗)

- ❌ 只抓 3 家相同 DS(`shadcn + Material + Ant`)— 沒有多樣性
- ❌ 全抓 component library 不看 SaaS 實作 — 漏掉在地解法
- ❌ 用 AI 描述而非看實物 — 描述容易失真,截圖是真實
- ❌ 跳過 Platform Tier — mobile / keyboard 盲點多
- ❌ Tier 3 只看「大公司」— 小而精(Linear / Notion / Vercel)常比大廠創新

---

## 截圖取得建議

- **WebFetch** 官方 docs / public blog posts
- **User 提供**(最快 / 最準 — 他們自己用產品)
- **公開 UX repos**(dribbble / behance — 僅供視覺參考,不等於真實 interaction)
- 避免 demo videos(長 / 不精準 / 截圖才好比對)
