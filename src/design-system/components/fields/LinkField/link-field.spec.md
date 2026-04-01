# LinkField 設計原則

## 定位

LinkField 是 URL 輸入與顯示元件。外觀基於 TextField，但 value 以藍色連結樣式呈現，可直接點擊開啟。

---

## 兩種顯示狀態（edit mode 內）

### Link 狀態

有合法 URL 且未在編輯中時：
- value 以 `text-primary` 藍色顯示，hover 加底線，點擊開啟連結
- 右側 Pencil inline action 觸發編輯模式
- 點擊 value 是開啟連結，不是編輯——這是 LinkField 與 TextField 的核心互動差異

### Input 狀態

正在編輯、無值、或 URL 格式不合法時：
- 外觀與 TextField 一模一樣（bareInput + placeholder）
- blur 時驗證格式，合法則自動切回 link 狀態
- 格式不合法維持 input 狀態 + error 邊框，直到格式正確

---

## 驗證

遵循 Field 共用驗證標準（blur validation）：

1. **blur 時驗證**——使用者離開 field 時才檢查格式
2. **開始編輯時清除 error**——重新 focus 或開始打字時移除錯誤狀態
3. **Enter 觸發 blur**——等同離開 field
4. **Escape 取消編輯**——回復原值，不觸發驗證

URL 格式要求：必須包含 `http://` 或 `https://` protocol。

---

## 空值

沒有 URL 時直接顯示 placeholder 並允許輸入，不需要先按 Pencil——因為沒有連結可以開。

---

## readonly / disabled

與其他 Field 一致：
- readonly：顯示藍色連結（可點擊），無 Pencil action
- disabled：連結灰化，不可點擊

---

## 禁止事項

- ❌ 不在 link 狀態下讓點擊 value 進入編輯——點擊連結必須開啟連結
- ❌ 不在打字過程中即時驗證格式——等 blur
- ❌ 不省略 protocol（http/https）驗證——裸 domain 不是合法 URL
