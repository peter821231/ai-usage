# 介面預覽與來源

## 0.1.19 精簡模式與額度預覽

維護者於 2026-11-18 在 IDE 的繁體中文介面實測，確認精簡模式的額度儀表和放大的分段進度條。下圖由 0.1.19 的滑鼠預覽程式與示範資料產出，展示 Antigravity、Claude Enterprise 和 Codex 的燈號、進度條、百分比及重設時間。

![0.1.19 精簡狀態列及額度預覽，標示 DEMO DATA](images/v0.1.19-compact-hover-demo.png)

示範圖存放於 `docs/images/`。中英文 README 與 VSIX 封裝均使用同一張圖。

## 0.1.6 實機截圖

以下四張由維護者於 2026-11-17 提供，來自 Antigravity IDE 的 0.1.6 實際畫面。檔案原樣複製，沒有裁切、重繪或改動額度數字，也沒有記錄來源電腦路徑。已檢查沒有 PNG 文字或 EXIF metadata。畫面上的用量與金額只代表截圖當時的帳號，不是其他使用者的預設額度，也不是持續更新的即時資料。

| 圖片 | 展示重點 |
| --- | --- |
| [狀態列](images/v0.1.6-status-bar.png) | Gemini 5h／wk、獨立 Argon wk、Enterprise 已花／上限、Codex 5h／wk。 |
| [Antigravity 詳細面板](images/v0.1.6-antigravity.png) | Gemini、Claude/GPT、Argon 完整群組；摘要省略的時間窗仍在面板。 |
| [Claude Enterprise 與 Codex 面板](images/v0.1.6-claude-codex.png) | 帳號支出、剩餘與官方月度規則標示；Codex 中性的 Last recorded。 |
| [完整 hover](images/v0.1.6-hover.png) | 全部額度進度條、來源時間、重置時間及明細，不受狀態列選項刪減。 |

![0.1.6 狀態列實機截圖](images/v0.1.6-status-bar.png)

## 這個版本應注意的介面差異

- **狀態列改為所選摘要**：預設 Gemini Models 5 小時／每週，加 Gemini 4 Argon 每週；可逐項選回 Claude/GPT。不再替每個群組僅挑一個最高使用率時間窗。
- **Argon 保留獨立名稱**：不和 Gemini Models 合併；一般 Gemini 與 Argon 即使比例相同，也仍是不同額度。
- **Enterprise 金額獨立呈現**：讀取來源提供的支出與上限，顯示剩餘；範例中的 USD 200 不是寫死的套件設定。畫面也清楚標示月度重置是依官方規則計算。
- **Codex 舊事件採中性提示**：Last recorded 是最後一筆本機紀錄；單純閒置不讓整條狀態列變黃。真正讀取失敗仍有錯誤與警告。
- **完整資料保留**：摘要的取捨不會刪掉 hover 或詳細面板的資訊；Context 是另外可開啟的區段，不拿來代表支出或額度比例。

這些說明展示本次客製的行為，不宣稱原版 Nexus 沒有 Argon 詳細額度，也不以此證明其他候選套件已經實測。

## 設定頁模擬預覽

下面是目前實際 webview HTML／CSS／JavaScript 在隔離瀏覽器中，以人工資料與預設設定呈現的畫面。圖片內含 **DEMO DATA** 標籤；它不是維護者的實機截圖，也不是 Pro／Max 帳號驗收。

![以人工資料呈現的五個 Antigravity 狀態列選項](images/v0.1.6-settings-demo.png)

開發環境已具備 Node、開發依賴、Playwright Chromium 及其系統程式庫時，可執行：

```sh
npm run test:ui -- --docs
```

這會跑既有人工 dashboard 驗證，並額外在 `artifacts/documentation-status-settings.png` 產生設定區塊預覽。圖片直接由 DOM 擷取，DEMO 標籤只加入測試畫面，不改動安裝後的產品 UI。人工圖片確認後，才手動更新對應的有版本檔名；不要拿模擬圖替換以上實機圖片。

## 文件與封裝

README 使用相對路徑，GitHub 與本機 Markdown 閱讀器均可開啟這組圖片。`.vscodeignore` 只額外允許這五個明確檔名，讓後續建置的 VSIX README 也能引用它們；其他文件、原始驗證資料與本機檔案仍不在封裝清單。

這次是文件與開發預覽工具更新，未修改監控執行期或套件版本，也不重建／替換已交付的 0.1.6 安裝檔。設定預覽、圖片連結、PNG metadata 與暫存封裝均另作驗證；既有的真實 Pro／Max 及原生平台驗收限制保持不變。

## 本次驗證與審查

- 四張實機圖與提供的 PNG 原檔逐位元相同；五張文件圖片皆通過 PNG 結構／CRC 檢查，沒有文字或 EXIF metadata，合計 206,741 bytes。
- README 與本頁的圖片連結已核對；圖片以五個明確檔名進入暫存 VSIX，其內容與 repo 一致。暫存封裝共 32 檔；沒有放入其他開發文件、測試輸出或憑證資料，也沒有覆蓋 `artifacts` 的原有安裝包。
- `npm run test:ui -- --docs` 的人工瀏覽器檢查與語法檢查通過。監控程式、依賴版本與 release workflow 沒有改動，因此沒有重跑無關的實機帳號驗收或整套依賴掃描。

### Standards

獨立審查指出新指南的相對連結在暫存 VSIX 中缺少對應文件，已將 README 的指南連結改為 GitHub 完整網址。重查目前來源與暫存封裝後，**0 項剩餘發現**。

### Spec

另一位審查者確認四張實機圖與一張 DEMO 設定圖的來源標示、UI 行為說明、圖片選擇及 artifacts 清理規則均符合需求；相同的指南連結問題修正後，**0 項剩餘發現**。

本次安全檢查集中在圖片隱私／metadata、測試 DOM 只使用 `textContent`、五個固定圖片檔名的封裝 allowlist，以及執行期來源未變更；沒有放寬產品 webview 權限或新增登入處理。這不是另一輪完整安全稽核。
