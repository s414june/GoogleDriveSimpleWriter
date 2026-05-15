# basic architecture

依據 `specs/basic.md` 的六個步驟，先建立可運作的基本架構。

## 流程對照

1. 使用者登入 Google

- `src/services/googleAuth.ts`
- `signInWithGoogle()` / `signOutGoogle()`

2. 第一次選一個 Drive 資料夾當筆記庫

- `src/App.vue`
- 輸入資料夾 ID，觸發掃描

3. App 掃描資料夾裡的 `.md`

- `src/services/driveService.ts`
- `listMarkdownFiles()`

4. 下載 md 到 IndexedDB

- `src/services/syncService.ts`
- `scanFolderToLocal()`
- `src/services/notesRepository.ts`

5. 編輯時先存本機

- `src/App.vue` 編輯器 input + debounce
- `src/services/syncService.ts` 的 `saveLocalEdit()`

6. 有網路時同步回 Drive

- `src/services/syncService.ts` 的 `syncDirtyToDrive()`
- 透過 `navigator.onLine` 判斷離線/上線

## PWA 基礎

- `vite.config.ts` 使用 `vite-plugin-pwa`
- `src/main.ts` 註冊 service worker
- `public/icon.svg` 作為 PWA icon

## 後續可擴充

- 改為 Google Picker 選資料夾（目前先輸入 folder ID）
- 增加衝突解決策略（本機版本 vs Drive 版本）
- 增加增量同步（只抓變更檔案）
