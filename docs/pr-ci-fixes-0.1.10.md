# PR CI 修正：0.1.10

日期：2026-11-17。PR：#1。

- CodeQL `js/remote-property-injection` 指出 `media/i18n.js` 將訊息鍵值寫入一般物件。
  改用 `Map` 保存與查詢訊息，僅在傳送狀態時以 `Object.fromEntries` 產生可序列化資料。
  回歸測試涵蓋 `__proto__`、`constructor`、`toString` 等名稱及不存在的原型屬性。
- Windows CI 在 `locales:check` 判定 `package.json` 過期，原因為 Git checkout 的 CRLF
  與產生器的 LF 位元組不同。比較時僅正規化 CRLF，其他內容仍須一致；加入 CRLF 回歸案例。
- 80 項隔離測試、語法、翻譯一致性及雙語瀏覽器檢查通過。GitHub CodeQL 與 Windows
  結果須以修正推送後的新一輪檢查為準；不略過或關閉告警。
