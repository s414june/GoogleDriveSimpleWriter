<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
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

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
const autoSaving = ref(false)
const suppressAutoSave = ref(false)

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

function closeEditor(): void {
	if (autoSaveTimer) {
		clearTimeout(autoSaveTimer)
		autoSaveTimer = null
	}
	titleEdited.value = false
	draftParentFolderId.value = ""
	mode.value = "list"
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

function scheduleAutoSave(): void {
	if (mode.value !== "edit" || suppressAutoSave.value) {
		return
	}

	if (autoSaveTimer) {
		clearTimeout(autoSaveTimer)
	}

	autoSaveTimer = setTimeout(() => {
		autoSaveTimer = null
		void runAutoSave()
	}, 450)
}

async function runAutoSave(): Promise<void> {
	if (mode.value !== "edit" || autoSaving.value) {
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
			if (!titleInput.value.trim()) {
				titleInput.value = initialTitle
			}
		}

		const nextTitle = resolveNextTitle()
		if (nextTitle) {
			await renameNode(fileId, nextTitle)
			if (!titleInput.value.trim()) {
				titleInput.value = nextTitle
			}
		}

		await updateMarkdownNode(fileId, editorContent.value)
		titleEdited.value = false
		await refreshNodes()
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
})

onBeforeUnmount(() => {
	window.removeEventListener("vault:add-folder", onAppRequestAddFolder)

	if (autoSaveTimer) {
		clearTimeout(autoSaveTimer)
		autoSaveTimer = null
	}
})

watch(editorContent, () => {
	scheduleAutoSave()
})

watch(titleInput, () => {
	scheduleAutoSave()
})
</script>

<template>
	<section
		class="flex flex-col h-[calc(100vh-40px)] content-start gap-2.5 bg-white p-3 relative">
		<template v-if="mode === 'list'">
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
			<div class="relative grow" @click="clearListSelection">
				<div class="max-h-[520px] overflow-y-auto bg-white">
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
		</template>

		<template v-else>
			<div
				class="flex items-center justify-between gap-2 border-b-2 border-teal-500 pb-2">
				<button
					class="px-3 py-1 text-xs font-bold text-teal-500"
					@click="closeEditor">
					←
				</button>
				<input
					:value="titleInput"
					class="min-w-0 flex-1 rounded-lg border border-transparent bg-white px-3 py-1 text-sm font-semibold text-teal-700 outline-none focus:border-teal-300"
					placeholder="輸入標題（留空會自動使用內容前10字）"
					@input="onTitleInputEvent" />
			</div>

			<textarea
				v-model="editorContent"
				class="w-full flex-1 min-h-0 resize-none rounded-none border-0 bg-white px-3 py-2.5 text-sm text-teal-700 outline-none"
				placeholder="開始編輯 Markdown 內容" />
		</template>

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
