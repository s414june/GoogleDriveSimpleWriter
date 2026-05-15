# Google Drive Simple Writer

輕便的筆記 PWA，資料來自 Google 雲端硬碟。

## Basic Flow

1. 使用者登入 Google
2. 第一次輸入一個 Drive 資料夾 ID 當筆記庫
3. 掃描資料夾中的 `.md`
4. 下載到 IndexedDB
5. 編輯時先存本機
6. 有網路時同步回 Drive

## Setup

1. 安裝套件

```bash
pnpm install
```

2. 設定環境變數

```bash
copy .env.example .env
```

將 `.env` 裡的 `VITE_GOOGLE_CLIENT_ID` 換成你的 OAuth Client ID。

3. 啟動開發環境

```bash
pnpm dev
```

## 權限說明

- 目前 OAuth scope 使用 `https://www.googleapis.com/auth/drive`，可讀寫你授權帳號下的 Drive 檔案，才能完整同步整個資料夾樹。
- 如果你先前已登入過舊權限，請先登出再重新登入一次，讓 Google 重新跳出授權同意畫面。

## Structure

- `src/services/googleAuth.ts`: Google OAuth 登入
- `src/services/driveService.ts`: Drive API（列檔、下載、上傳）
- `src/services/notesRepository.ts`: IndexedDB 儲存
- `src/services/syncService.ts`: 同步協調
- `src/App.vue`: UI 流程

設計補充請看 `specs/basic-architecture.md`。
