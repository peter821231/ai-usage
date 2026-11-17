# 介面多語系提案：English 與繁體中文（台灣）

日期：2026-11-17。狀態：已採納，第一版已實作獨立切換。工作分支：`feat/ui-localization`。

以下保留設計提案與驗收方向。實際翻譯格式及操作請見 [翻譯貢獻指南](../locales/README.md)。

## 建議方向

以英文 `en` 為基準語系，先完整支援台灣繁體中文 `zh-TW`。每個語系只維護一份 JSON，包含介面文字與 VS Code 原生設定／命令文字；透過建置工具產生 VS Code 需要的 `package.nls*.json`。翻譯貢獻者不必閱讀 JavaScript，也不必重複維護兩套翻譯。

第一版建議提供「跟隨編輯器 / English / 繁體中文（台灣）」選項。保留專案目前零執行時 npm 依賴的原則，使用共用的小型翻譯函式與內建 `Intl` 格式化工具。

## 範圍與目前程式的接點

| 範圍 | 目前位置 | 預計處理 |
| --- | --- | --- |
| 命令、檢視名稱、設定分類、說明、選項標籤 | `package.json` | 改成 `%manifest.…%` 參照，由產生的 `package.nls*.json` 提供文字 |
| 儀表板、快速設定、提示文字、無障礙標籤 | `media/main.js`、`src/settingsUi.js` | 改用訊息鍵值；設定值、驗證規則仍來自 manifest |
| 狀態列與滑鼠提示 | `src/statusBar.js` | 共用翻譯與格式化；摘要保留精簡數值與產品名稱 |
| 來源說明、錯誤、預算／額度標籤 | `src/usageState.js`、`src/extension.js`、`src/claudeUsage.js` | 以固定識別碼描述狀態，顯示時才翻譯 |
| 日期、金額、倒數、相對時間 | `src/util.js`、`src/statusBar.js`、`media/main.js` | 統一 locale 與時區，保留現有數值精度與時間判定 |
| 頁面語言 | `src/webview.js` | 初始 HTML 與後續更新都設定正確的 `lang` |

產品、模型、方案名稱和來源提供的未知標籤保留原文。診斷 JSON 的欄位與錯誤碼維持固定英文識別值，方便跨語系排查；顯示在介面上的說明則翻譯。README 與更新紀錄沿用現有文件流程。

## 語言選擇與切換邊界

新增 `nexusAiUsage.display.language`，預設 `auto`，第一版允許 `auto`、`en`、`zh-TW`。

- `auto` 讀取 `vscode.env.language`。將大小寫正規化；`en-*` 對應英文，`zh-tw`、`zh-Hant`、`zh-Hant-TW` 對應台灣繁中。其餘先回到英文，不把所有 `zh-*` 都當成台灣繁中。
- 套件自己繪製的面板、快速設定、狀態列與滑鼠提示可立即切換；重新顯示現有資料即可，不因切換語言查詢供應商。
- **VS Code 管理的命令名稱、原生設定與靜態檢視名稱跟隨編輯器語言**，不受套件的 `display.language` 覆寫。語言選項旁應明確說明這個範圍。
- 改變編輯器語言的重新啟動流程依編輯器處理。Antigravity IDE 的原生翻譯載入與 `vscode.env.language` 行為需要實際驗證。
- 語言與時區分開：選英文不會把既有 `Asia/Taipei` 改成 UTC；金額始終保留來源幣別，不做匯率換算。

這項原生介面限制來自 VS Code 依使用者 locale 載入 `package.nls.{locale}.json` 的機制；其繁中 locale 為 `zh-tw`。因此 JSON 來源檔採 `zh-TW`，產生的原生語言檔採 `package.nls.zh-tw.json`。[官方在地化工具說明](https://github.com/microsoft/vscode-l10n#packagenlsjson)、[編輯器顯示語言文件](https://code.visualstudio.com/docs/configure/locales)

## 翻譯檔與範本

第一版採用以下結構；實際操作指令見翻譯貢獻指南：

```text
locales/
  en.json                 # 完整基準文字，也是範本的鍵值來源
  zh-TW.json              # 台灣繁體中文
  index.json              # 工具產生的語系清單
  message-context.json    # 各訊息用途、變數意義、長度限制；供翻譯者閱讀
  README.md               # 英文貢獻指南，附台灣繁中說明
src/i18n.js               # locale 選擇、英文備援、具名變數替換
media/i18n.js             # 與 extension host 共用同一份純函式實作
scripts/locales.cjs       # 產生範本、驗證、產生原生語言檔
package.nls.json          # 自動產生的英文 manifest 文字
package.nls.zh-tw.json    # 自動產生的繁中 manifest 文字
```

共用函式可實際放在 `media/i18n.js`，由 `src/i18n.js` 引用，避免兩份替換／格式化邏輯各自演進。host 負責載入受信任的套件語言檔，將生效語言與訊息透過 `postMessage` 傳給 webview；webview 不自行讀取任意檔案或遠端翻譯服務。

`en.json` 節錄範例，完整訊息見實際語言檔：

```json
{
  "locale": "en",
  "nativeName": "English",
  "vscodeLocale": "en",
  "messages": {
    "manifest.command.refresh": "Refresh Usage",
    "common.unknown": "Unknown",
    "quota.used": "Used",
    "quota.remaining": "Remaining",
    "window.fiveHour": "5-hour",
    "window.weekly": "Weekly",
    "reset.label": "Reset: {reset}",
    "source.lastRecorded": "Last recorded",
    "source.stale": "Stale"
  }
}
```

`zh-TW.json` 使用相同訊息鍵值：

```json
{
  "locale": "zh-TW",
  "nativeName": "繁體中文（台灣）",
  "vscodeLocale": "zh-tw",
  "messages": {
    "manifest.command.refresh": "重新整理用量",
    "common.unknown": "未知",
    "quota.used": "已使用",
    "quota.remaining": "剩餘",
    "window.fiveHour": "5 小時",
    "window.weekly": "每週",
    "reset.label": "重設：{reset}",
    "source.lastRecorded": "最後記錄",
    "source.stale": "資料過期"
  }
}
```

使用穩定、有用途的訊息鍵值，避免英文文案改動導致所有語系的鍵值一起改名。同一個英文詞若語意不同可拆鍵，例如額度剩餘與對話脈絡剩餘。

整句翻譯並使用 `{time}`、`{amount}` 等具名變數，讓不同語言調整語序；避免拼接「in + 數字 + hours」。相對時間優先使用 `Intl.RelativeTimeFormat`；複合倒數則沿用現有計算與取整，再以完整訊息範本呈現。新增有單複數需求的句子時，明確採用 `Intl.PluralRules` 與對應變體，避免把英文規則寫死在翻譯函式。

譯文一律當純文字。DOM 使用 `textContent`，滑鼠提示的 Markdown 對譯文與變數進行適當跳脫；命令連結由程式提供。切換語言時保留卡片收合、詳細資訊展開與焦點；按鈕焦點識別值應使用固定 action ID，不使用翻譯後文字。

## 新語系貢獻流程

1. 由工具從 `en.json` 產生新語系範本，填入 locale、語言自稱與 VS Code locale；訊息保留完整鍵值，待翻譯欄位設為空字串。英文原文與用途可在基準檔及 context 檔對照。
2. 翻譯 `messages` 的值，保留具名變數，不必修改 JavaScript。工具回報尚未完成的訊息。
3. 完成後執行驗證與語言檔產生工具；語言選單由通過驗證的語系資料產生，設定 enum／標籤也由工具同步。維護者檢視原生語言識別值與必要的別名對應。
4. 提交語系檔與產生結果的 PR，附面板、快速設定與滑鼠提示預覽。一般新增語系只需處理翻譯資料。

驗證至少涵蓋 JSON 重複鍵值、必要 metadata、未知／缺少鍵值、非字串／空白譯文，以及每個訊息的變數集合。第一版發布的英文與台灣繁中須完整。執行時仍提供逐訊息英文備援；開發／CI 應揭露缺漏，不在使用者介面露出訊息鍵值。

`manifest.*` 訊息由同一份來源輸出到原生語言檔，其餘提供執行時顯示。產生檔建議提交版本控制，讓直接執行擴充套件也有原生翻譯；CI 檢查是否與來源一致。

## 實作順序與驗收

1. **先解除顯示文字與判斷的耦合。** 目前 `statusBar.js` 會用群組名稱、`5-hour`／`Weekly` 比對選項，`usageState.js` 與 parser 也使用英文名稱補齊時間窗。保留來源 ID，另加固定群組／時間窗類型，只在顯示時查譯文；未知來源標籤維持原文。快取儲存來源資料及固定識別碼，不儲存翻譯文字，既有快取保持可讀。
2. **建立語言基礎設施。** 完成範本產生、驗證、英文備援與共用格式化；轉換 manifest 後，`settingsUi.js` 需解析 `%…%` 的顯示字串，避免目前直接讀取 `package.json` 的流程把預留文字顯示出來。設定值的驗證仍使用原始 enum。
3. **完成兩種語言。** 涵蓋面板、快速設定、狀態列、滑鼠提示、錯誤與無障礙標籤。台灣用語先統一為「用量、額度、狀態列、設定、重新整理、對話脈絡」。
4. **驗證與封裝。** 將語言檔與共用 JS 加入 `.vscodeignore` 允許清單，讓 `check`、`test`、`test:ui`、封裝及 CI 納入必要的語言檔驗證／產生步驟。

驗收重點：

- 兩種語言與 `auto` 對應正確；未知語系及缺少訊息有英文備援；切換不發出新的供應商查詢。
- 窄側邊欄、長譯文、折疊摘要、快速設定、提示與無障礙名稱均可閱讀，焦點及展開狀態不因語言切換遺失。
- Unknown、0%、過期、Codex 最後記錄、重設待確認與 Enterprise 規則推算保留原有區別。
- 切換語言不改動數值、資料來源、時間戳記、時區或狀態列時間窗選取；不同語言的視窗可共用同一份來源快取。
- VSIX 實際包含語言資源；在目標 Antigravity IDE 驗證原生命令／設定翻譯與面板語言切換。

已決定第一版提供套件內獨立語言選項，預設跟隨編輯器，並允許英文編輯器搭配台灣繁中用量介面。
