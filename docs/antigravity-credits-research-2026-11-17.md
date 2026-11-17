# Antigravity Prompt／Flow 點數來源與意義調查

查核日期：2026-11-17。範圍：解釋目前介面的 `Prompt credits left` 與 `Flow credits left`；不變更點數解析或顯示功能。

## 結論

**數值來源已確認，帳務意義尚未確認。** 目前這兩列是 Antigravity 本機 `GetUserStatus` 回傳欄位的直接呈現。正式介面直接使用服務回應；僅憑欄位名稱仍無法認定它們是 Google One 可花費的 AI 點數、Pro 方案每月贈送點數或剩餘模型請求次數。

Google 官方目前區分 Pro 方案附帶的基本模型額度，以及超過基本額度後使用的額外購買／一次性促銷 AI 點數。沒有特別購買 AI 點數，仍然可以使用方案內含的基本額度；這件事不能證明這四個內部欄位就是方案內含額度。[Antigravity Plans](https://antigravity.google/docs/plans)、[Google AI Pro benefits](https://support.google.com/googleone/answer/14534406?hl=en)

## 本機讀值與程式路徑

主工作階段在本次查核中，以既有唯讀程式取得目前執行中的 `~/.gemini/bin/agy` 回應，只擷取以下欄位，並確認與套件解析結果一致；未保存帳號、權杖或完整回應。

| 來源欄位 | 本次數值 | 套件處理 |
| --- | ---: | --- |
| `userStatus.planStatus.availablePromptCredits` | 500 | Prompt 列左側 |
| `userStatus.planStatus.planInfo.monthlyPromptCredits` | 50,000 | Prompt 列右側 |
| `userStatus.planStatus.availableFlowCredits` | 100 | Flow 列左側 |
| `userStatus.planStatus.planInfo.monthlyFlowCredits` | 150,000 | Flow 列右側 |

讀取路徑是 [`src/agyClient.js`](../src/agyClient.js) 的本機 `GetUserStatus` RPC → [`src/parse.js`](../src/parse.js) 的 `parseUserStatus()` → [`src/extension.js`](../src/extension.js) 的 Antigravity 顯示資料 → [`media/main.js`](../media/main.js) 的點數列。現有程式不做尺度換算、不推算重設時間，也不把點數換成模型時間窗百分比。

這證實「本機 Antigravity 服務確實提供這些數值」，尚未證實本機服務取得它們的上游、更新時間、計量單位或帳務用途。**服務有回傳欄位，與欄位足以代表現行產品帳務，是兩項不同證據。**

示範畫面也使用相同數字，但資料來自 [`scripts/check-webview.cjs`](../scripts/check-webview.cjs) 的合成測試資料。正式執行路徑不會引用該測試檔；不能因數字相同，就把實際讀值當成示範資料。

## 官方文件能確認的範圍

- **Antigravity 基本模型額度**：Pro 有較高的基本額度與每週限制，基本額度依官方規則每五小時更新，仍受每週限制約束。官方以這套規則描述方案權益，沒有把它定義為本機的 Prompt／Flow 比例。[Antigravity Plans — Baseline quota](https://antigravity.google/docs/plans#baseline-quota)
- **Antigravity 超額 AI 點數**：官方描述額外購買或一次性促銷的 AI 點數，可在基本額度耗盡後使用，並由額外用量設定控制。這與「訂閱方案本來就能使用 Antigravity」分開。[Antigravity Plans — Overages](https://antigravity.google/docs/plans#overages)
- **Google Flow**：Pro 官方說明將 Flow 的專用 AI 用量與用完後可購買的 AI 點數分開說明。`availableFlowCredits` 名稱含有 Flow，並不足以證實它對應 Google Flow 的現行餘額。[Google AI Pro benefits — Use Google Flow](https://support.google.com/googleone/answer/14534406?hl=en)
- **Google One 可查的點數餘額**：官方指定 AI 點數活動頁檢視總餘額與使用紀錄，紀錄包含日期、產品類別及增加／扣除金額。若要證明本機欄位就是可花費餘額，需要和這個帳務來源比對，而非只比對兩個第三方監控套件。[Manage your AI credits](https://support.google.com/googleone/answer/16287445?hl=en)、[AI 點數活動頁](https://one.google.com/ai/credits)

本次沒有存取使用者的 Google One 活動頁，也沒有執行會消耗點數的請求。

## 尚無法定論的部分

公開官方文件沒有列出這四個 RPC 欄位的定義、尺度及更新規則，因此目前無法可靠回答：

1. `500 / 50,000` 是否真是同單位的「剩餘／每月總額」。不能直接宣稱已使用 99%。
2. `100 / 150,000` 是否對應 Google Flow、Antigravity 的另一種計量，或相容性欄位。
3. `monthly*` 欄位是否在目前方案仍代表每月發放，以及何時重設。
4. 欄位是否為沿用舊有基礎設施的相容欄位或預設值。這是可能的解釋，尚非官方確認的事實。

同樣的 `500 / 50,000` 也出現在 Google AI Developers Forum 的第一手回報。發文者另外讀到基本模型額度仍為 100%，並追問這 50,000 是每月額度、一次性促銷或內部方案值；截至本次查核，頁面沒有直接解答這項欄位問題。這是另一個觀察案例，不是 Google 對欄位語意的正式保證。[2026-11-09／10 討論串](https://discuss.ai.google.dev/t/billing-quota-google-one-pro-ai-pro-credits-stuck-at-99-jio-managed-account-extension-connection-drops/199118)

## 對目前套件的處理建議

依使用者意願保留讀取與呈現功能，並在文件說明目前的證據限制。不要用這兩列計算已用百分比、觸發模型額度警告、推算帳單或承諾每月重設。若未來調整介面，較準確的標示是「服務回報的 Prompt／Flow 點數」，並附上「單位與方案對應待確認」的說明；本調查未套用這項介面變更。
