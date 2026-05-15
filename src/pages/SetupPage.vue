<script setup lang="ts">
import { computed, onMounted } from "vue"
import { useRouter } from "vue-router"
import { useDriveWorkspace } from "../composables/useDriveWorkspace"

const router = useRouter()
const {
	clientId,
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
} = useDriveWorkspace()

const errorStatus = computed(() => {
	const current = status.value
	return /(失敗|錯誤|缺少|失效|不可|找不到|尚未)/.test(current) ? current : ""
})

async function goLogin(): Promise<void> {
	await login()
}

async function goImport(): Promise<void> {
	const ok = await importSelectedFolder()
	if (!ok) {
		return
	}

	await router.push("/vault")
}

onMounted(async () => {
	await restoreSessionFromStorage()
})
</script>

<template>
	<section v-if="!clientId" class="bg-rose-50 p-4 text-rose-700">
		缺少環境變數 VITE_GOOGLE_CLIENT_ID，請先設定後再登入。
	</section>

	<section
		v-if="!isAuthenticated"
		class="grid h-[calc(100vh-40px)] content-start gap-2.5 bg-white p-3">
		<h2 class="text-teal-500 text-base font-semibold">使用者登入 Google</h2>
		<button
			class="cursor-pointer rounded-full border-0 bg-teal-500 px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 hover:-translate-y-px"
			:disabled="busy || !clientId"
			@click="goLogin">
			使用 Google 登入
		</button>
	</section>

	<section
		v-else
		class="grid h-[calc(100vh-40px)] content-start gap-2.5 bg-white p-3">
		<h2 class="text-teal-500 text-base font-semibold">
			選擇根資料夾並匯入到 IndexedDB
		</h2>
		<label for="folder" class="text-sm font-medium text-teal-600"
			>搜尋資料夾</label
		>
		<input
			id="folder"
			:value="folderQuery"
			class="w-full rounded-xl border border-teal-300 bg-white px-3 py-2.5 text-sm text-teal-600 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
			:disabled="busy || !folders.length"
			placeholder="輸入資料夾名稱關鍵字"
			@input="onFolderQueryInput(($event.target as HTMLInputElement).value)" />

		<div
			v-if="folders.length"
			class="max-h-64 overflow-y-auto rounded-xl border border-teal-200 bg-white p-1">
			<button
				v-for="folder in filteredFolders"
				:key="folder.id"
				class="w-full rounded-lg px-3 py-2 text-left text-sm text-teal-600 hover:bg-teal-50"
				:class="
					folder.id === selectedRootFolderId
						? 'bg-teal-50 ring-1 ring-teal-200'
						: ''
				"
				@click="chooseFolder(folder)">
				{{ folder.name }}
			</button>
			<p v-if="!filteredFolders.length" class="px-3 py-2 text-sm text-teal-400">
				找不到符合的資料夾
			</p>
		</div>

		<div class="flex flex-wrap gap-2">
			<button
				class="cursor-pointer rounded-full border border-teal-300 bg-transparent px-4 py-2.5 text-sm font-bold text-teal-500 transition disabled:cursor-not-allowed disabled:opacity-60 hover:-translate-y-px"
				:disabled="busy"
				@click="reloadFolders">
				重新載入資料夾
			</button>
			<button
				class="cursor-pointer rounded-full border-0 bg-teal-600 px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 hover:-translate-y-px"
				:disabled="busy || !selectedRootFolderId"
				@click="goImport">
				匯入整個資料夾結構與 Markdown
			</button>
			<button
				class="cursor-pointer rounded-full border border-teal-300 bg-transparent px-4 py-2.5 text-sm font-bold text-teal-500 transition disabled:cursor-not-allowed disabled:opacity-60 hover:-translate-y-px"
				:disabled="busy"
				@click="logout">
				登出
			</button>
		</div>

		<p v-if="errorStatus" class="text-sm text-fuchsia-500">{{ errorStatus }}</p>
	</section>
</template>
