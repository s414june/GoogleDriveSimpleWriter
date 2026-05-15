<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import Vditor from "vditor"
import "vditor/dist/index.css"
import VaultTree from "../components/VaultTree.vue"
import { useDriveWorkspace } from "../composables/useDriveWorkspace"
import {
	createFolderNode,
	createMarkdownNode,
	deleteNode,
	getVaultNodes,
	renameNode,
	updateMarkdownNode,
} from "../services/vaultService"
import { syncVaultRoot } from "../services/vaultSyncService"
import type { VaultNode } from "../types"

const router = useRouter()
const workspace = useDriveWorkspace()

const nodes = ref<VaultNode[]>([])
const selectedFolderId = ref("")
const selectedFileId = ref("")
const checkedNodeIds = ref<string[]>([])
const singleFolderActionId = ref("")
const editorContent = ref("")
const titleInput = ref("")
const titleEdited = ref(false)
const draftParentFolderId = ref("")
const folderDialogOpen = ref(false)
const folderNameInput = ref("")
const mode = ref<"list" | "edit">("list")
const editorHost = ref<HTMLDivElement | null>(null)

let vditor: Vditor | null = null
const autoSaving = ref(false)
const autoSyncing = ref(false)
const suppressAutoSave = ref(false)
const syncingEditorValue = ref(false)

const rootId = computed(() => workspace.selectedRootFolderId.value)
const singleFolderTarget = computed(() =>
	nodes.value.find(
		(node) => node.id === singleFolderActionId.value && node.kind === "folder",
	),
)
const hasCheckedMode = computed(() => checkedNodeIds.value.length > 0)
const hasSingleFolderMode = computed(
	() => !!singleFolderTarget.value && !hasCheckedMode.value,
)

const errorStatus = computed(() => {
	const current = workspace.status.value
	return /(失敗|錯誤|缺少|失效|不可|找不到|尚未)/.test(current) ? current : ""
})

function ensureMdName(name: string): string {
	return name.endsWith(".md") ? name : `${name}.md`
}

async function refreshNodes(): Promise<void> {
	if (!rootId.value) {
		nodes.value = []
		return
	}

	nodes.value = await getVaultNodes(rootId.value)
	if (!selectedFolderId.value) {
		selectedFolderId.value = rootId.value
	}

	if (selectedFileId.value) {
		const selected = nodes.value.find(
			(node) => node.id === selectedFileId.value,
		)
		if (selected?.kind === "file") {
			editorContent.value = selected.content ?? ""
		} else {
			selectedFileId.value = ""
			editorContent.value = ""
			mode.value = "list"
		}
	}
}

function selectFolder(id: string): void {
	selectedFolderId.value = id
	selectedFileId.value = ""
	singleFolderActionId.value = id
	editorContent.value = ""
	mode.value = "list"
}

function selectFile(id: string): void {
	selectedFileId.value = id
	singleFolderActionId.value = ""
	const file = nodes.value.find(
		(node) => node.id === id && node.kind === "file",
	)
	if (!file) {
		return
	}

	suppressAutoSave.value = true
	selectedFolderId.value = file.parentId ?? rootId.value
	editorContent.value = file.content ?? ""
	titleInput.value = file.name.replace(/\.md$/i, "")
	titleEdited.value = false
	draftParentFolderId.value = selectedFolderId.value
	mode.value = "edit"
	suppressAutoSave.value = false
}

async function closeEditor(): Promise<void> {
	await runAutoSave(true)
	titleEdited.value = false
	draftParentFolderId.value = ""
	mode.value = "list"
	await refreshNodes()
}

function clearChecked(): void {
	checkedNodeIds.value = []
}

function clearListSelection(): void {
	clearChecked()
	singleFolderActionId.value = ""
	if (rootId.value) {
		selectedFolderId.value = rootId.value
	}
}

function toggleChecked(id: string): void {
	singleFolderActionId.value = ""
	if (checkedNodeIds.value.includes(id)) {
		checkedNodeIds.value = checkedNodeIds.value.filter((item) => item !== id)
		return
	}

	checkedNodeIds.value = [...checkedNodeIds.value, id]
}

function openAddFolderDialog(): void {
	const parentFolderId = singleFolderTarget.value?.id || selectedFolderId.value
	if (!rootId.value || !parentFolderId) {
		workspace.status.value = "請先選擇父資料夾"
		return
	}

	folderNameInput.value = ""
	folderDialogOpen.value = true
}

function closeAddFolderDialog(): void {
	folderDialogOpen.value = false
	folderNameInput.value = ""
}

async function confirmAddFolder(): Promise<void> {
	const parentFolderId = singleFolderTarget.value?.id || selectedFolderId.value
	if (!rootId.value || !parentFolderId) {
		workspace.status.value = "請先選擇父資料夾"
		closeAddFolderDialog()
		return
	}

	const name = folderNameInput.value.trim()
	if (!name) {
		workspace.status.value = "請輸入資料夾名稱"
		return
	}

	await createFolderNode(rootId.value, parentFolderId, name)
	closeAddFolderDialog()
	workspace.status.value = "已新增資料夾"
	await refreshNodes()
}

function onAppRequestAddFolder(): void {
	openAddFolderDialog()
}

async function addFile(): Promise<void> {
	if (!rootId.value || !selectedFolderId.value) {
		workspace.status.value = "請先選擇父資料夾"
		return
	}

	selectedFileId.value = ""
	draftParentFolderId.value = selectedFolderId.value
	editorContent.value = ""
	titleInput.value = ""
	titleEdited.value = false
	workspace.status.value = "開始撰寫後會自動建立 Markdown"
	mode.value = "edit"
}

function onTitleInput(value: string): void {
	titleEdited.value = true
	titleInput.value = value
}

function onTitleInputEvent(event: Event): void {
	const target = event.target as HTMLInputElement | null
	onTitleInput(target?.value ?? "")
}

function applyEditorContent(nextContent: string): void {
	if (!vditor) {
		return
	}

	const current = vditor.getValue()
	if (current === nextContent) {
		return
	}

	syncingEditorValue.value = true
	vditor.setValue(nextContent)
	queueMicrotask(() => {
		syncingEditorValue.value = false
	})
}

async function ensureEditorReady(): Promise<void> {
	if (vditor || !editorHost.value) {
		return
	}

	vditor = new Vditor(editorHost.value, {
		mode: "ir",
		height: "100%",
		cache: {
			enable: false,
		},
		toolbar: [],
		counter: {
			enable: false,
		},
		placeholder: "開始編輯 Markdown 內容",
		input(value) {
			if (syncingEditorValue.value) {
				return
			}
			editorContent.value = value
		},
		after() {
			applyEditorContent(editorContent.value)
		},
	})
}

function resolveNextTitle(): string | null {
	const typed = titleInput.value.trim()
	if (typed) {
		return typed
	}

	if (!titleEdited.value) {
		const fromContent = editorContent.value.trim().slice(0, 10)
		if (fromContent) {
			return fromContent
		}
	}

	return null
}

async function runAutoSync(): Promise<void> {
	if (autoSyncing.value || !navigator.onLine) {
		return
	}

	if (!workspace.session.value || !rootId.value) {
		return
	}

	autoSyncing.value = true
	try {
		const summary = await syncVaultRoot(workspace.session.value, rootId.value)
		if (summary.conflicts > 0) {
			workspace.status.value = `偵測到 ${summary.conflicts} 個衝突，已建立衝突副本`
		} else if (summary.skipped > 0) {
			workspace.status.value = `略過 ${summary.skipped} 個無法存取的檔案（請在 Google Drive 授權此 App）`
		}
		if (summary.pushed > 0 || summary.pulled > 0 || summary.conflicts > 0) {
			await refreshNodes()
		}
	} catch (error) {
		workspace.status.value =
			error instanceof Error ? error.message : "自動同步失敗"
	} finally {
		autoSyncing.value = false
	}
}

function shouldSyncInListMode(): boolean {
	return mode.value === "list" && !folderDialogOpen.value
}

function onResumeListSync(): void {
	if (!shouldSyncInListMode()) {
		return
	}
	void runAutoSync()
}

function onVisibilityChange(): void {
	if (document.visibilityState !== "visible") {
		return
	}
	onResumeListSync()
}

async function runAutoSave(force = false): Promise<void> {
	if ((!force && mode.value !== "edit") || autoSaving.value) {
		return
	}

	const hasAnyText =
		editorContent.value.trim().length > 0 || titleInput.value.trim().length > 0
	if (!selectedFileId.value && !hasAnyText) {
		return
	}

	if (!rootId.value) {
		return
	}

	autoSaving.value = true
	try {
		let fileId = selectedFileId.value
		let createdNewFile = false
		let renamedFile = false
		if (!fileId) {
			const parentId = draftParentFolderId.value || selectedFolderId.value
			if (!parentId) {
				return
			}

			const initialTitle = resolveNextTitle() ?? "未命名"
			const created = await createMarkdownNode(
				rootId.value,
				parentId,
				initialTitle,
			)
			fileId = created.id
			selectedFileId.value = fileId
			selectedFolderId.value = parentId
			createdNewFile = true
			if (!titleInput.value.trim()) {
				titleInput.value = initialTitle
			}
		}

		const nextTitle = resolveNextTitle()
		if (nextTitle) {
			const currentNode = nodes.value.find((node) => node.id === fileId)
			const targetName = ensureMdName(nextTitle)
			if (currentNode?.name !== targetName) {
				await renameNode(fileId, nextTitle)
				renamedFile = true
			}
			if (!titleInput.value.trim()) {
				titleInput.value = nextTitle
			}
		}

		await updateMarkdownNode(fileId, editorContent.value)
		titleEdited.value = false
		if (createdNewFile || renamedFile) {
			await refreshNodes()
		}
	} catch (error) {
		workspace.status.value =
			error instanceof Error ? error.message : "自動儲存失敗"
	} finally {
		autoSaving.value = false
	}
}

async function doRename(): Promise<void> {
	if (!singleFolderTarget.value) {
		workspace.status.value = "請先點選資料夾再重新命名"
		return
	}

	const nextName = window
		.prompt("新名稱", singleFolderTarget.value.name)
		?.trim()
	if (!nextName) {
		return
	}

	await renameNode(singleFolderTarget.value.id, nextName)
	workspace.status.value = "已重新命名"
	await refreshNodes()
}

async function doDelete(): Promise<void> {
	if (!rootId.value) {
		workspace.status.value = "缺少根資料夾資訊"
		return
	}

	if (hasCheckedMode.value) {
		if (checkedNodeIds.value.includes(rootId.value)) {
			workspace.status.value = "根資料夾不可刪除"
			return
		}

		const ok = window.confirm(
			`確定刪除已勾選的 ${checkedNodeIds.value.length} 個項目？`,
		)
		if (!ok) {
			return
		}

		for (const id of checkedNodeIds.value) {
			await deleteNode(rootId.value, id)
		}
		selectedFileId.value = ""
		if (checkedNodeIds.value.includes(selectedFolderId.value)) {
			selectedFolderId.value = rootId.value
		}
		editorContent.value = ""
		mode.value = "list"
		clearChecked()
		workspace.status.value = "已刪除"
		await refreshNodes()
		return
	}

	if (!singleFolderTarget.value) {
		workspace.status.value = "請先點選資料夾或使用勾選框"
		return
	}

	if (singleFolderTarget.value.id === rootId.value) {
		workspace.status.value = "根資料夾不可刪除"
		return
	}

	const ok = window.confirm(`確定刪除資料夾 ${singleFolderTarget.value.name}？`)
	if (!ok) {
		return
	}

	await deleteNode(rootId.value, singleFolderTarget.value.id)
	selectedFileId.value = ""
	selectedFolderId.value = rootId.value
	singleFolderActionId.value = ""
	editorContent.value = ""
	mode.value = "list"
	workspace.status.value = "已刪除"
	await refreshNodes()
}

onMounted(async () => {
	window.addEventListener("vault:add-folder", onAppRequestAddFolder)
	window.addEventListener("focus", onResumeListSync)
	window.addEventListener("online", onResumeListSync)
	document.addEventListener("visibilitychange", onVisibilityChange)

	await workspace.restoreSessionFromStorage()
	if (!workspace.session.value) {
		await router.push("/setup")
		return
	}

	if (!rootId.value) {
		await router.push("/setup")
		return
	}

	selectedFolderId.value = rootId.value
	await refreshNodes()
	await runAutoSync()
})

onBeforeUnmount(() => {
	window.removeEventListener("vault:add-folder", onAppRequestAddFolder)
	window.removeEventListener("focus", onResumeListSync)
	window.removeEventListener("online", onResumeListSync)
	document.removeEventListener("visibilitychange", onVisibilityChange)

	if (vditor) {
		vditor.destroy()
		vditor = null
	}
})

watch(editorContent, () => {
	applyEditorContent(editorContent.value)
})

watch(
	mode,
	async (value) => {
		if (value === "edit") {
			await nextTick()
			await ensureEditorReady()
			applyEditorContent(editorContent.value)
			return
		}

		if (value === "list") {
			await runAutoSync()
		}
	},
	{ immediate: true },
)
</script>

<template>
	<section
		class="flex flex-col h-[calc(100vh-40px)] min-h-0 content-start gap-2.5 bg-white p-3 relative">
		<div v-show="mode === 'list'" class="relative flex flex-1 min-h-0 flex-col">
			<div
				v-show="hasCheckedMode || hasSingleFolderMode"
				class="absolute right-4 top-0 z-10 flex flex-wrap gap-2 py-2 right-0"
				@click.stop>
				<button
					v-if="hasSingleFolderMode"
					class="cursor-pointer rounded-full border bg-teal-100 border-teal-300 px-4 py-2 text-xs font-bold text-teal-600 transition hover:-translate-y-px"
					:disabled="!singleFolderTarget"
					@click.stop="doRename">
					重新命名
				</button>
				<button
					class="cursor-pointer rounded-full border bg-rose-100 border-rose-300 px-4 py-2 text-xs font-bold text-rose-600 transition hover:-translate-y-px"
					:disabled="!hasCheckedMode && !hasSingleFolderMode"
					@click.stop="doDelete">
					刪除
				</button>
				<button
					v-if="hasSingleFolderMode"
					class="cursor-pointer rounded-full border bg-cyan-100 border-cyan-300 px-4 py-2 text-xs font-bold text-cyan-700 transition hover:-translate-y-px"
					@click.stop="openAddFolderDialog">
					新增資料夾
				</button>
			</div>
			<div class="relative flex-1 min-h-0" @click="clearListSelection">
				<div class="h-full overflow-y-auto bg-white">
					<VaultTree
						v-if="rootId"
						:nodes="nodes"
						:parent-id="rootId"
						:selected-folder-id="selectedFolderId"
						:selected-file-id="selectedFileId"
						:checked-ids="checkedNodeIds"
						@open-folder="selectFolder"
						@open-file="selectFile"
						@toggle-check="toggleChecked"
						@clear-check="clearChecked" />
				</div>

				<div
					v-if="!hasCheckedMode"
					class="absolute bottom-4 right-4 grid justify-items-end gap-2">
					<button
						class="h-12 w-12 rounded-full bg-teal-600 text-2xl font-bold text-white shadow-lg transition hover:scale-105"
						@click.stop="addFile">
						+
					</button>
				</div>
			</div>
		</div>

		<div v-show="mode === 'edit'" class="flex flex-1 min-h-0 flex-col gap-2.5">
			<div
				class="flex items-center justify-between gap-2 border-b-2 border-teal-500 pb-2">
				<button
					class="px-3 py-1 text-xs font-bold text-teal-500"
					@click="closeEditor">
					←
				</button>
				<input
					:value="titleInput"
					class="flex-1 rounded-lg border border-transparent bg-white px-3 py-1 text-sm font-semibold text-teal-700 outline-none focus:border-teal-300"
					placeholder="輸入標題（留空會自動使用內容前10字）"
					@input="onTitleInputEvent" />
				<p class="text-xs font-medium text-teal-500">
					{{ autoSyncing ? "同步中..." : "" }}
				</p>
			</div>

			<div ref="editorHost" class="vditor-host w-full flex-1 min-h-0" />
		</div>

		<div
			v-if="folderDialogOpen"
			class="absolute inset-0 z-50 flex items-center justify-center bg-teal-950/35 p-4"
			@click="closeAddFolderDialog">
			<div
				class="w-full max-w-sm rounded-2xl border border-teal-200 bg-white p-4 shadow-xl"
				@click.stop>
				<p class="text-sm font-bold text-teal-700">新增資料夾</p>
				<input
					v-model="folderNameInput"
					class="mt-3 w-full rounded-lg border border-teal-300 px-3 py-2 text-sm text-teal-700 outline-none"
					placeholder="請輸入資料夾名稱"
					@keyup.enter="confirmAddFolder" />
				<div class="mt-3 flex justify-end gap-2">
					<button
						class="rounded-full border border-teal-300 px-3 py-1 text-xs font-bold text-teal-600"
						@click="closeAddFolderDialog">
						取消
					</button>
					<button
						class="rounded-full bg-teal-600 px-3 py-1 text-xs font-bold text-white"
						@click="confirmAddFolder">
						建立
					</button>
				</div>
			</div>
		</div>

		<p v-if="errorStatus" class="text-sm text-fuchsia-500">{{ errorStatus }}</p>
	</section>
</template>

<style scoped>
.vditor-host {
	min-height: 0;
}

.vditor-host :deep(.vditor) {
	border: 0;
	border-radius: 0;
	height: 100%;
}

.vditor-host :deep(.vditor-reset) {
	padding: 12px;
}

.vditor-host :deep(.vditor-toolbar),
.vditor-host :deep(.vditor-counter),
.vditor-host :deep(.vditor-tip) {
	display: none;
}
</style>
