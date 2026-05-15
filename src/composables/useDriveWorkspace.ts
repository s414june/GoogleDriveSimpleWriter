import { computed, ref } from "vue"
import { signInWithGoogle, signOutGoogle } from "../services/googleAuth"
import { listDriveFolders } from "../services/driveService"
import { importDriveRootToVault } from "../services/vaultService"
import type { AuthSession, DriveFolder } from "../types"

const STORAGE_SESSION_KEY = "gdsw.auth.session"
const STORAGE_FOLDER_KEY = "gdsw.auth.folderId"

const session = ref<AuthSession | null>(null)
const busy = ref(false)
const status = ref("請先登入 Google")
const folderQuery = ref("")
const folders = ref<DriveFolder[]>([])
const selectedRootFolderId = ref("")

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""

const isAuthenticated = computed(() => !!session.value)
const filteredFolders = computed(() => {
	const keyword = folderQuery.value.trim().toLowerCase()
	if (!keyword) {
		return folders.value
	}

	return folders.value.filter((folder) =>
		folder.name.toLowerCase().includes(keyword),
	)
})

function persistSession(nextSession: AuthSession): void {
	sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(nextSession))
}

function readStoredSession(): AuthSession | null {
	const raw = sessionStorage.getItem(STORAGE_SESSION_KEY)
	if (!raw) {
		return null
	}

	try {
		const parsed = JSON.parse(raw) as Partial<AuthSession>
		if (!parsed.accessToken || !parsed.expiresAt) {
			return null
		}
		if (parsed.expiresAt <= Date.now()) {
			return null
		}

		return {
			accessToken: parsed.accessToken,
			expiresAt: parsed.expiresAt,
		}
	} catch {
		return null
	}
}

function clearStoredAuth(): void {
	sessionStorage.removeItem(STORAGE_SESSION_KEY)
	sessionStorage.removeItem(STORAGE_FOLDER_KEY)
}

export async function loadFolders(): Promise<void> {
	if (!session.value) {
		return
	}

	const folderList = await listDriveFolders(session.value.accessToken)
	folders.value = folderList

	if (!folderList.length) {
		selectedRootFolderId.value = ""
		folderQuery.value = ""
		status.value = "找不到可用資料夾，請先在 Drive 建立一個資料夾"
		return
	}

	const preferredId = sessionStorage.getItem(STORAGE_FOLDER_KEY)
	const selected = folderList.find((folder) => folder.id === preferredId)

	if (selected) {
		selectedRootFolderId.value = selected.id
		folderQuery.value = selected.name
		return
	}

	selectedRootFolderId.value = ""
	folderQuery.value = ""
}

export async function login(): Promise<boolean> {
	if (!clientId) {
		status.value = "缺少 VITE_GOOGLE_CLIENT_ID"
		return false
	}

	busy.value = true
	try {
		session.value = await signInWithGoogle(clientId)
		persistSession(session.value)
		await loadFolders()
		status.value = "登入成功，請選擇 Drive 資料夾"
		return true
	} catch (error) {
		status.value = error instanceof Error ? error.message : "登入失敗"
		return false
	} finally {
		busy.value = false
	}
}

export async function restoreSessionFromStorage(): Promise<boolean> {
	const stored = readStoredSession()
	if (!stored) {
		clearStoredAuth()
		return false
	}

	session.value = stored
	try {
		await loadFolders()
		if (selectedRootFolderId.value) {
			status.value = "已還原登入狀態"
		} else {
			status.value = "已還原登入，請選擇 Drive 資料夾"
		}
		return true
	} catch (error) {
		clearStoredAuth()
		session.value = null
		status.value =
			error instanceof Error
				? `登入狀態已失效，請重新登入：${error.message}`
				: "登入狀態已失效，請重新登入"
		return false
	}
}

export async function reloadFolders(): Promise<void> {
	if (!session.value) {
		status.value = "尚未登入"
		return
	}

	busy.value = true
	try {
		await loadFolders()
		status.value = `已載入 ${folders.value.length} 個資料夾`
	} catch (error) {
		status.value = error instanceof Error ? error.message : "重新載入資料夾失敗"
	} finally {
		busy.value = false
	}
}

export function onFolderQueryInput(value: string): void {
	folderQuery.value = value
}

export function chooseFolder(folder: DriveFolder): void {
	selectedRootFolderId.value = folder.id
	folderQuery.value = folder.name
	sessionStorage.setItem(STORAGE_FOLDER_KEY, folder.id)
}

export async function importSelectedFolder(): Promise<boolean> {
	if (!session.value || !selectedRootFolderId.value) {
		status.value = "請先登入並選擇資料夾"
		return false
	}

	const selected = folders.value.find(
		(folder) => folder.id === selectedRootFolderId.value,
	)
	if (!selected) {
		status.value = "請先選擇資料夾"
		return false
	}

	busy.value = true
	try {
		await importDriveRootToVault(session.value, selected)
		status.value = "已匯入資料夾結構與 Markdown 到 IndexedDB"
		return true
	} catch (error) {
		status.value = error instanceof Error ? error.message : "匯入失敗"
		return false
	} finally {
		busy.value = false
	}
}

export function logout(): void {
	signOutGoogle(session.value)
	clearStoredAuth()
	session.value = null
	folders.value = []
	folderQuery.value = ""
	selectedRootFolderId.value = ""
	status.value = "已登出"
}

export function useDriveWorkspace() {
	return {
		clientId,
		session,
		busy,
		status,
		folderQuery,
		folders,
		filteredFolders,
		selectedRootFolderId,
		isAuthenticated,
		login,
		restoreSessionFromStorage,
		reloadFolders,
		onFolderQueryInput,
		chooseFolder,
		importSelectedFolder,
		logout,
	}
}
