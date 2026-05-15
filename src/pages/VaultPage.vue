<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
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
const editorContent = ref("")
const creatingMenuOpen = ref(false)
const mode = ref<"list" | "edit">("list")

const rootId = computed(() => workspace.selectedRootFolderId.value)
const selectedFile = computed(() =>
	nodes.value.find(
		(node) => node.id === selectedFileId.value && node.kind === "file",
	),
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
	editorContent.value = ""
	mode.value = "list"
}

function selectFile(id: string): void {
	selectedFileId.value = id
	const file = nodes.value.find(
		(node) => node.id === id && node.kind === "file",
	)
	if (!file) {
		return
	}

	selectedFolderId.value = file.parentId ?? rootId.value
	editorContent.value = file.content ?? ""
	mode.value = "edit"
}

function closeEditor(): void {
	mode.value = "list"
}

function clearChecked(): void {
	checkedNodeIds.value = []
}

function toggleChecked(id: string): void {
	if (checkedNodeIds.value.includes(id)) {
		checkedNodeIds.value = checkedNodeIds.value.filter((item) => item !== id)
		return
	}

	checkedNodeIds.value = [...checkedNodeIds.value, id]
}

async function addFolder(): Promise<void> {
	if (!rootId.value || !selectedFolderId.value) {
		workspace.status.value = "請先選擇父資料夾"
		return
	}

	const name = window.prompt("新增資料夾名稱")?.trim()
	if (!name) {
		return
	}

	await createFolderNode(rootId.value, selectedFolderId.value, name)
	creatingMenuOpen.value = false
	workspace.status.value = "已新增資料夾"
	await refreshNodes()
}

async function addFile(): Promise<void> {
	if (!rootId.value || !selectedFolderId.value) {
		workspace.status.value = "請先選擇父資料夾"
		return
	}

	const name = window.prompt("新增 Markdown 檔名")?.trim()
	if (!name) {
		return
	}

	const created = await createMarkdownNode(
		rootId.value,
		selectedFolderId.value,
		name,
	)
	creatingMenuOpen.value = false
	selectedFileId.value = created.id
	editorContent.value = created.content ?? ""
	workspace.status.value = "已新增 Markdown 檔"
	await refreshNodes()
	mode.value = "edit"
}

async function doRename(): Promise<void> {
	if (checkedNodeIds.value.length !== 1) {
		workspace.status.value = "請勾選一個 Markdown 檔再重新命名"
		return
	}

	const targetId = checkedNodeIds.value[0]
	const target = nodes.value.find((node) => node.id === targetId)
	if (!target || target.kind !== "file") {
		workspace.status.value = "只能重新命名 Markdown 檔"
		return
	}

	const nextName = window.prompt("新名稱", target.name)?.trim()
	if (!nextName) {
		return
	}

	await renameNode(target.id, nextName)
	workspace.status.value = "已重新命名"
	clearChecked()
	await refreshNodes()
}

async function doDelete(): Promise<void> {
	if (!rootId.value || !checkedNodeIds.value.length) {
		workspace.status.value = "請先勾選要刪除的項目"
		return
	}

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
}

async function saveFile(): Promise<void> {
	if (!selectedFile.value) {
		workspace.status.value = "請先選擇 Markdown 檔"
		return
	}

	await updateMarkdownNode(selectedFile.value.id, editorContent.value)
	workspace.status.value = "已儲存到 IndexedDB"
	await refreshNodes()
}

onMounted(async () => {
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
</script>

<template>
	<section
		class="flex flex-col h-[calc(100vh-40px)] content-start gap-2.5 bg-white p-3">
		<template v-if="mode === 'list'">
			<div class="flex flex-wrap items-center justify-between gap-2.5">
				<h2 class="text-base font-semibold text-teal-600">筆記庫</h2>
				<div class="flex flex-wrap gap-2">
					<button
						class="cursor-pointer rounded-full border border-teal-300 bg-transparent px-4 py-2 text-xs font-bold text-teal-600 transition hover:-translate-y-px"
						:disabled="checkedNodeIds.length !== 1"
						@click="doRename">
						重新命名
					</button>
					<button
						class="cursor-pointer rounded-full border border-rose-300 bg-transparent px-4 py-2 text-xs font-bold text-rose-600 transition hover:-translate-y-px"
						:disabled="!checkedNodeIds.length"
						@click="doDelete">
						刪除
					</button>
				</div>
			</div>

			<div class="relative grow" @click="clearChecked">
				<div
					class="max-h-[520px] overflow-y-auto rounded-xl border border-teal-200 bg-white p-3">
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

				<div class="absolute bottom-4 right-4 grid justify-items-end gap-2">
					<div
						v-if="creatingMenuOpen"
						class="grid gap-2 rounded-xl border border-teal-200 bg-white p-3 shadow-lg">
						<button
							class="rounded-full border border-teal-300 px-3 py-2 text-xs font-bold text-teal-600"
							@click="addFolder">
							新增資料夾
						</button>
						<button
							class="rounded-full border border-teal-300 px-3 py-2 text-xs font-bold text-teal-600"
							@click="addFile">
							新增 MD
						</button>
					</div>

					<button
						class="h-12 w-12 rounded-full bg-teal-600 text-2xl font-bold text-white shadow-lg transition hover:scale-105"
						@click="creatingMenuOpen = !creatingMenuOpen">
						+
					</button>
				</div>
			</div>
		</template>

		<template v-else>
			<div
				class="flex items-center justify-between gap-2 border-b border-teal-100 pb-2">
				<button
					class="rounded-full border border-teal-300 px-3 py-1 text-xs font-bold text-teal-600"
					@click="closeEditor">
					← 退回
				</button>
				<h3 class="truncate text-sm font-semibold text-teal-700">
					{{ selectedFile?.name || "Markdown 編輯" }}
				</h3>
				<button
					class="rounded-full bg-teal-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
					:disabled="!selectedFile"
					@click="saveFile">
					儲存
				</button>
			</div>

			<textarea
				v-model="editorContent"
				class="w-full resize-y rounded-xl border border-teal-300 bg-white px-3 py-2.5 text-sm text-teal-700 outline-none"
				placeholder="開始編輯 Markdown 內容"
				:disabled="!selectedFile" />
		</template>

		<p v-if="errorStatus" class="text-sm text-fuchsia-500">{{ errorStatus }}</p>
	</section>
</template>
