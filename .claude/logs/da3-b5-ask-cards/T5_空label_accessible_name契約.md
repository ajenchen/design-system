# T5 決策卡 — 空 label / accessible name 契約

**主題**：Avatar / Breadcrumb / Tag / Carousel slide 在「沒有可見文字」時,裝飾 icon 是 `aria-hidden`,整個元素最後沒有任何「無障礙名稱」(螢幕報讀器唸不出來 / 變成沒名字的連結、沒名字的輪播頁)。各元件 spec 有的說「label 必傳」,有的說「不 guard,交給使用者」,型別卻一律 optional —— DS 內部政策不一致。

**verdict**：DECISION(5 個 finding 全數維持送 user 拍板;無可降 AUTO 者)

**為何一個都不降 AUTO**:此議題**目前沒有統一的既有拍板**可對齊 —— 反而是四個元件各說各話的 canonical 衝突(Avatar spec 說「alt 必傳、絕不靜默渲染無報讀標的」最嚴 / Breadcrumb spec:216 明說「空 label 渲染空節點、元件皆不 guard、交 consumer」最鬆 / Tag spec 說「必有文字 label 或 prefix icon」但 icon 是 aria-hidden 自相矛盾 / Carousel 根本沒有 slide 名稱)。要收斂成一致設計語言,就必須由 user 定一個「全 DS 統一政策」,這正是拍板題。d72i13(Tag 移除鈕 prop 更名)tradeoff 不同構,另立一張卡。

---

## 世界級對照(≥3 家)

| 來源 | 對這議題怎麼做 | 落點 |
|---|---|---|
| **WAI-ARIA APG — Carousel pattern**(w3.org/WAI/ARIA/apg/patterns/carousel)| slide 必須有 accessible name;有描述性名稱最好,**沒有時可用「第 N 張,共 M 張」位置名當合法替代**(因 `role=group` 不支援 aria-setsize/posinset,APG 明列此例外)| 權威規範:名稱必給,位置名是可接受 fallback |
| **React Aria / Adobe Spectrum**(react-spectrum.adobe.com/react-aria/accessibility.html)| 沒有可見 label 時**開發期 console warn**:「If you do not provide a visible label, you must specify an aria-label or aria-labelledby」——**不是型別強制,是 runtime dev-warn** | 主流:runtime 警告 + 使用者自負,非 compile-time 擋 |
| **MUI Avatar**(mui.com/material-ui/react-avatar)| `alt` **optional**;沒 alt 就走 children → alt 首字 → 泛用 icon 的視覺降級,**不強制無障礙名稱、不型別擋** | 最寬鬆:優雅降級,不 enforce |
| **Shopify Polaris Avatar**(polaris-react.shopify.com)| 預設拿 `name` 當 alt,可用 `accessibilityLabel` override;Avatar **被視為 non-presentational(一定要有意義名稱)**(issue #1925)| 偏嚴:靠「name 一定有值」保證,而非型別 required |
| Ant Design Avatar | `alt` 歷史上處理不完整(issue #42996,無 role/aria-label)| 反例,不宜對照 |

**結論**:**沒有一家主流 DS 用 TypeScript 型別把名稱設成 required**(那會破壞合法的「純裝飾」用法 + 炸掉所有現有省略的 consumer)。主流一致做法 = **runtime 開發期警告 + 合理預設名稱 / 自動位置名**(APG 的「N of M」、Polaris 的 name-as-alt、React Aria 的 dev-warn)。

## 我方既有 canonical(M23 優先)

- **我方已有「`xxxAriaLabel` + i18n 預設值」canonical**:Calendar `navAriaLabel`/`prevAriaLabel`(預設「上個月」)、Notice `dismissAriaLabel`(預設「關閉通知」)、Combobox `searchAriaLabel`、FileUpload `removeAriaLabel`、Avatar `badgeAriaLabel` —— 全是「型別 optional + DS 給預設 + consumer 可 override」。這就是我方對「無障礙名稱」的既定表達方式,**站在 Option B 這邊**。
- **我方已有 axe ENFORCE 閘**(commit 58198b43「advisory → ENFORCE baseline-diff axe gate」):story 層若出現沒名字的 landmark,axe 會擋新增 regression —— 已經是「runtime/測試層兜底」哲學,與型別強制路線不同。
- Carousel 我方已有近親 canonical:FileViewer filmstrip 的 dots 用「跳至第 N 張」+ `aria-current`(carousel.spec.md 亦已沿用),自動位置名有現成 idiom 可抄。

---

## 【決策卡 1】空 label 無障礙名稱 —— 統一政策(合成 d7i1 / d7i3 / d8i9 / d7i6)

**【問題】** 這 4 個元件在「沒有可見文字」時都會產出一個螢幕報讀器唸不出名字的東西:
- **Avatar**(d7i1,avatar.spec.md:243 vs avatar.tsx:105):spec 說「alt 必傳」「絕不靜默渲染無報讀標的」,但型別是 `alt?: string`;省略 alt → 走 icon fallback 且 icon `aria-hidden` → 外層沒 role/aria-label = 沒名字。**spec 與 code 矛盾**。
- **Breadcrumb**(d7i3,breadcrumb.spec.md:216):spec **明文接受**空 label(「渲染空節點,元件皆不 guard」),startIcon 恆 `aria-hidden`,link/current page 無預設 aria-label → 可能產生沒名字的麵包屑連結。
- **Tag**(d8i9,tag.spec.md:245/276):children optional 仍渲染空膠囊;spec 說「必有文字 label 或 prefix icon」,但 icon 是 `aria-hidden` → icon-only Tag 沒名字。**spec 自相矛盾**。
- **Carousel**(d7i6,carousel.spec.md:193):每張 slide 只有 `role=group` + `aria-roledescription=slide`,**完全沒有名稱或位置**(spec 自承 slide 不知道自己第幾張)。

**【選項 A|型別強制 required】** 把名稱設成 TypeScript 必填(Avatar `alt` required、Breadcrumb/Tag 禁空 label、Carousel 必傳 slide 名),純裝飾要顯式 `alt=""` opt-out。
- 好處:編譯期就擋,最嚴、最不會漏。
- 壞處:**破壞性** —— 所有現在省略的 consumer 直接編譯錯;殺掉合法的「純裝飾」場景;**沒有一家世界級 DS 這樣做**(違 M23 一致性直覺 + M8 benchmark)。

**【選項 B|型別維持 optional + runtime dev-warn + 合理預設 / 自動位置名】(推薦)**
- 型別不動(不破壞現有 consumer),但:(1) 解析不出任何 accessible name 時**開發期 console.warn**(對齊 React Aria);(2) Carousel **自動產生「第 N 張,共 M 張」位置名 + 允許 consumer override**(對齊 APG「N of M」+ 我方 FileViewer filmstrip idiom;需給 CarouselItem 加 index 註冊機制);(3) 純裝飾走顯式 opt-out(見選項 C)。
- 好處:非破壞;完全對齊我方既有「`xxxAriaLabel` + 預設值」canonical + axe ENFORCE 閘;對齊 APG / React Aria / MUI / Polaris 世界級主流。
- 壞處:dev-warn 是「軟」防線(production 不擋),靠 axe 閘 + code review 兜底;Carousel 的 index 註冊是行為/架構小改。

**【選項 C|新增顯式 decorative 模式】(可與 B 疊加)** 提供明確的「這是裝飾、我知道我在幹嘛」開關(Avatar 用 `alt=""`、其他用 `decorative` prop),避免 dev-warn 對合法裝飾誤報。Avatar spec:243 其實已定義 `alt=""` 為裝飾逃生口,只是 code/型別未把「非裝飾卻省略」的情形警告出來。

**【推薦】B + C(runtime dev-warn + 合理預設/自動位置名 + 顯式 decorative opt-out)。**
理由:(1) **M23 我方既有 canonical 優先** —— 我方對「無障礙名稱」的既定做法就是「optional prop + DS 預設 + consumer override + axe 閘兜底」,選 B 是延續一致設計語言,選 A 會憑空造一個全 DS 沒有的「型別強制無障礙名稱」新流派;(2) **M8 世界級** —— APG 說自動「N of M」合法、React Aria 用 dev-warn、MUI/Polaris 都不型別強制,四家一致不走 A;(3) 選 A 會炸掉現有 consumer + 殺掉合法裝飾場景,成本遠高於收益。

**【SSOT 理由】** 這會**新增一條 a11y canonical 規則**(「空 label / 缺可見文字時,DS 如何保證 accessible name」的統一政策),同時**改 4 個公開元件的行為 / spec 語意**(Breadcrumb spec 從「不 guard、consumer 自負」改成「元件 dev-warn」是 canonical 語意反轉;Carousel 新增自動位置名 = 新行為;Tag/Avatar 修掉 spec 自相矛盾)—— 屬「改 canonical 語意 + 潛在新 API 面(decorative prop / 自動 aria-label)」,三選一命中「改 canonical 語意」,故必須 user 拍板。

**批次落地備註**:若 user 選 B,Carousel 的「自動位置名 + consumer override」下游是 additive,可整批做;Breadcrumb/Tag/Avatar 的 dev-warn 亦 additive。唯有選 A(型別 required)才是破壞性、需 major/deprecation 節奏。

---

## 【決策卡 2】Tag 移除鈕 accessible-name prop 更名(d72i13)

**【問題】** Tag 的移除 callback 叫 `onRemove`(這是對的:props-naming.md:13 明定 Tag 的「從集合移除」canonical 就是 `onRemove`),但它的無障礙名稱 prop 卻叫 **`dismissLabel`**(tag.tsx:72)。`dismiss` 在我方 canonical 是給 Alert/Notice/Toast 的「通知被忽略」(props-naming.md:12,`onDismiss`),Tag 用它 = **remove/dismiss 語意混用**。而且 `dismissLabel` 實際是「目標名」(被組成 `移除 ${label}`,tag.tsx:112),不是完整 aria-label,名字本身沒表達這點。FileUpload 同樣是「移除集合項目」的鈕,用的是 `removeAriaLabel`(file-upload.tsx:103)。

**【我方既有 canonical(M23)】** DS 對「無障礙名稱 prop」的既定命名幾乎清一色 `<動作>AriaLabel`:Notice `dismissAriaLabel`、FileUpload `removeAriaLabel`、Calendar `prevAriaLabel`/`navAriaLabel`、Combobox `searchAriaLabel`、Avatar `badgeAriaLabel`、Pagination `prevAriaLabel`。**`dismissLabel` 是這個 pattern 的例外/漂移**。方向幾乎被 canonical 鎖死:應該是 `remove*`(因為 callback 是 onRemove)+ `*AriaLabel`(因為這是 DS 主流命名)。

**【選項 A|改名 `removeAriaLabel`,語意改成「完整 aria-label」】(推薦)** 對齊 FileUpload 一模一樣的先例(同是移除集合項目的鈕),型別可沿用 FileUpload 的 `(name: string) => string` 模板或純 string,DS 給預設(consumer 不傳也有 `移除 ${label}`)。
- 好處:與 FileUpload 完全一致(同場景同命名);落回 `*AriaLabel` 主流 pattern;`remove` 對上 `onRemove` callback。
- 壞處:破壞性公開 prop 更名(用 `dismissLabel` 的 consumer 會壞);語意從「目標名」變「完整 label」需一併對齊。

**【選項 B|改名 `removeLabel`,保留「目標名被組成 移除 X」語意】** 只修 dismiss→remove,不改組合行為。
- 好處:改動最小,行為不變。
- 壞處:偏離 `*AriaLabel` 主流 pattern(少了 Aria);仍是破壞性更名;與 FileUpload 不完全一致。

**【選項 C|不動(留 `dismissLabel`)】** 保留漂移,零破壞。壞處:remove/dismiss 語意混淆持續、與 FileUpload 命名分裂。

**【推薦】A(`removeAriaLabel`,對齊 FileUpload)+ 加 deprecated `dismissLabel` alias 過渡一版。**
理由:(1) FileUpload 是**同場景的精確先例**,選 A 讓「移除集合項目的鈕 aria-label」全 DS 一個名字;(2) `*AriaLabel` 是我方壓倒性 pattern;(3) `dismissLabel` **未寫進 tag.spec.md props 表**(只是公開 TS prop、無文件),遷移風險較低,加一版 deprecated alias 即可平滑過渡。

**【SSOT 理由】** 公開 prop 更名 `dismissLabel → removeAriaLabel` = **改 API contract**(破壞現有引用 `dismissLabel` 的 consumer,即使未寫進 spec 仍是公開型別面),三選一命中「新 / 改 API contract」,故需 user 拍板破壞性節奏(直接改 vs 加 deprecated alias vs 不動)。方向(該叫 `removeAriaLabel`)已被 canonical 鎖定,拍板點只在「是否現在做這個破壞性更名 + 是否留 alias」。
