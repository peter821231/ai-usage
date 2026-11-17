# 開發筆記與常見陷阱（Development Notes）

本文件彙整自前期架構設計、上游盤點與規格驗證紀錄，供後續維護與擴充功能時快速掌握技術邊界與應避免的陷阱。

---

## 1. 上游基準與授權邊界

- **程式碼基準**：衍生自 `praveen2git/quota-nexus` commit `4e229eb0330ca939086f14d288e04b04e5d40d54`（repo `package.json` 標記為 `1.2.8`）。
  - 注意：Open VSX 上發布的 `1.2.10` VSIX 與上述 repo commit 的部分檔案並不相同（例如 `src/parse.js`、`src/viewState.js`、`src/extension.js` 等），不能把兩者混為同一來源。
- **Claude CLI 查詢機制**：`src/claudeUsageCli.js` 與 `src/claudeUsage.js` 參考 `xuwaters/vscode-extensions` 中 `claude-usage-ultra`（commit `1d3676c335a18d29aaf2169e3d5dcf52cc9de45d`）的 stream-JSON control protocol 與回應結構。
- **授權與第三方工具**：
  - 根目錄 `LICENSE` 保留 `Copyright (c) 2026 Quota Nexus`（MIT），`THIRD-PARTY-NOTICES.md` 保留 `Copyright (c) 2026 Wei Xu`（MIT）。打包 Allowlist（`.vscodeignore`）必須同時包含這兩個檔案。
  - 官方 `anthropic.claude-code` 附帶 CLI 僅作為執行時依賴，不可重新打包進 `.vsix` 或變更其授權。

---

## 2. Antigravity：額度池識別與狀態列設計

- **不可合併看似相同的額度池**：即使不同模型群組在特定時刻恰好有相同的剩餘百分比或重置時間，仍必須保留各自的群組身分與時間窗。
- **避免縮名覆蓋模型群組**：上游 `friendlyGroup()` 若依關鍵字將名稱縮短為泛稱，容易把獨立的 **Gemini 4 Argon** 與一般 **Gemini Models** 混在一起。任何名稱清理或縮寫都必須維持 Argon 的獨立識別。
- **狀態列與完整面板職責分離**：
  - `nexusAiUsage.antigravity.statusBar.*` 只決定狀態列摘要顯示哪些時間窗，不得因為取消勾選就停止抓取資料，或把完整 hover / dashboard 中的額度隱藏。
  - 未選中的時間窗即使發生缺失或錯誤，也不應觸發狀態列整體的黃色警告背景。

---

## 3. Claude Code：CLI 協定、方案分支與月度重置

- **認證與資料來源邊界**：
  - 不直接開啟 `~/.claude/.credentials.json`、不保存原始 CLI stdout/stderr、不儲存帳號識別資訊，也不重傳或刷新 token。
  - 透過官方 Claude Code CLI 執行 `initialize` 與 `get_usage`（搭配空白 `--strict-mcp-config` 與 `--no-session-persistence`，於 extension storage 目錄中執行，降低載入專案設定的風險）。
  - **注意**：此 control protocol 屬於官方 CLI 的內部協定而非公開穩定 API，CLI 改版時可能變動格式或欄位，解析時必須做好超時、錯誤退避與格式不相容保護。
- **Enterprise 與 Pro/Max 方案必須嚴格區分**：
  - **金額與上限不可寫死**：`rate_limits.spend` 與舊格式 `extra_usage` 必須明確具備幣別與尺度（minor units）才進行美元換算，絕不可硬編上限（例如假定一定是 USD 200）或自行猜測缺少單位的數值。
  - **Pro / Max 優先順序**：一般個人訂閱即使同時開啟 extra usage，狀態列與主視圖仍以個人 5 小時／每週與模型時段額度為主，額外花費分開列於預算區塊；已辨識為 Pro/Max 但缺少核心 5h/Weekly 欄位時顯示 **Unknown**，不以 0% 代替。
- **Enterprise 月度 UTC 重置規則邊界**：
  - 依據 Claude 官方 Enterprise Consumption Guide，月度成員支出上限於每月 1 日 **00:00 UTC**（Asia/Taipei 為 **08:00**）重置；**不可使用本機午夜或發票帳期日期代替**。
  - CLI 本身目前不保證回傳 reset timestamp，且官方 Admin API schema 亦列有其他 `period`（daily/weekly/monthly）。因此 `monthlyUtc` 僅作為「明確為 Enterprise 支出讀值且來源未提供 reset 與非月度 period」時的規則換算 fallback，並在 UI 明確標註為規則推算（來源若有回傳 reset 則永遠優先）。
  - 推算出的重置時間必須綁定在「**該筆讀值的所屬月份**」。跨月後若尚未成功取得新讀值，舊讀值應維持舊花費金額並標為過期／待新讀值確認，不可自動將支出歸零或把重置日默默推往下一月。
- **Host 與快取限制**：
  - 擴充套件必須安裝在「實際看得到官方 `anthropic.claude-code`、Antigravity 本機服務與 `~/.codex/sessions`」的 extension host（例如 Remote WSL 環境下需裝在 WSL 端，而非僅裝在本機 UI 端）。
  - 同一 extension host 內的多個視窗透過租約鎖共享快取，且快取**不依登入帳號隔離**；切換官方 CLI 登入帳號後，須待下一次成功查詢並確認 `Fetched` 時間。

---

## 4. Codex：本地紀錄檔與過期狀態

- **重讀 log 不等於資料變新**：`src/codex.js` 讀取 `~/.codex/sessions` 時，必須保留該筆 `rate_limits` 事件本身的原始時間戳記，不能把「檔案讀取時間」當成資料新鮮度。
- **尾端擴讀條件**：從檔案尾端往前讀取時，必須等到實際找到 `limitsEvent` 才能停止擴大讀取範圍，避免只讀到尾端 context/model 訊息而漏掉較前面的有效額度事件。
- **過期與讀取失敗分離**：
  - 既有事件年齡較久或 reset 時間已過時，維持中性的 **Last recorded** 呈現並保留原始數值與 pending 狀態，絕不自動重寫為 0% 或 100%。
  - 只有實際發生讀取錯誤時，才保留最後有效值並觸發狀態列警告背景。

---

## 5. 建置、測試與封裝規範

- **零執行時 npm 依賴**：所有 `package.json` 依賴皆為 `devDependencies`（語法檢查、Node 內建測試、Playwright、vsce）。
- **嚴格打包 Allowlist**：`.vscodeignore` 採預設全排除（`**`）再逐項允許 runtime JS、webview media、icon 與授權檔，確保本地 `.agents/`、測試檔、報告、`artifacts/` 與憑證檔不會被封裝進 `.vsix`。
- **安全自動化檢查**：`npm run test:ui` 僅使用合成測試資料與本機臨時 loopback server 啟動 headless Chromium 檢查版面與 CSP，不會存取真實帳號或登入中的瀏覽器設定檔。
