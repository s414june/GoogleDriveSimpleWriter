<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { RouterView, useRoute, useRouter } from "vue-router"
import { useDriveWorkspace } from "./composables/useDriveWorkspace"

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>
	userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

const INSTALL_HINT_DISMISSED_KEY = "pwa-install-hint-dismissed"

const online = ref(navigator.onLine)
const navMenuOpen = ref(false)
const installPromptEvent = ref<BeforeInstallPromptEvent | null>(null)
const installHintVisible = ref(false)
const installPrompting = ref(false)

const route = useRoute()
const router = useRouter()
const workspace = useDriveWorkspace()

const showVaultMenu = computed(() => {
	return route.path === "/vault" && !!workspace.session.value
})

function onOnline(): void {
	online.value = true
}

function onOffline(): void {
	online.value = false
}

async function chooseAnotherRoot(): Promise<void> {
	navMenuOpen.value = false
	workspace.selectedRootFolderId.value = ""
	await router.push("/setup")
}

async function doLogout(): Promise<void> {
	navMenuOpen.value = false
	workspace.logout()
	await router.push("/setup")
}

function requestAddFolder(): void {
	navMenuOpen.value = false
	window.dispatchEvent(new CustomEvent("vault:add-folder"))
}

function markInstallHintDismissed(): void {
	localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, "1")
}

function isInstallHintDismissed(): boolean {
	return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === "1"
}

function dismissInstallHint(): void {
	installHintVisible.value = false
	markInstallHintDismissed()
}

function onBeforeInstallPrompt(event: Event): void {
	if (isInstallHintDismissed()) {
		return
	}

	event.preventDefault()
	installPromptEvent.value = event as BeforeInstallPromptEvent
	installHintVisible.value = true
}

function onAppInstalled(): void {
	installHintVisible.value = false
	installPromptEvent.value = null
	markInstallHintDismissed()
}

async function installToHomeScreen(): Promise<void> {
	if (!installPromptEvent.value || installPrompting.value) {
		return
	}

	installPrompting.value = true
	await installPromptEvent.value.prompt()
	const choice = await installPromptEvent.value.userChoice
	installPrompting.value = false

	if (choice.outcome === "accepted") {
		installHintVisible.value = false
		installPromptEvent.value = null
		markInstallHintDismissed()
	}
}

onMounted(() => {
	window.addEventListener("online", onOnline)
	window.addEventListener("offline", onOffline)
	window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
	window.addEventListener("appinstalled", onAppInstalled)
})

onBeforeUnmount(() => {
	window.removeEventListener("online", onOnline)
	window.removeEventListener("offline", onOffline)
	window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
	window.removeEventListener("appinstalled", onAppInstalled)
})

watch(
	() => route.path,
	() => {
		navMenuOpen.value = false
	},
)
</script>

<template>
	<main class="mx-auto grid max-w-6xl min-h-screen">
		<section
			class="relative bg-teal-500 px-2 py-2 h-[40px] flex items-center w-full">
			<div class="flex flex-wrap items-center justify-between gap-3 w-full">
				<div class="flex items-center justify-center gap-2">
					<p
						class="text-white text-xs font-medium uppercase tracking-[0.08em] font-display">
						Google Drive Simple Writer
					</p>
				</div>

				<div class="flex items-center gap-2">
					<div
						class="rounded-full bg-fuchsia-100 px-3 py-1 text-xs font-bold text-fuchsia-500 border border-fuchsia-300"
						:class="!online ? 'bg-rose-50 text-rose-700' : ''">
						{{ online ? "Online" : "Offline" }}
					</div>
					<button
						v-if="showVaultMenu"
						class="h-7 w-7 text-xs font-bold text-white"
						@click.stop="navMenuOpen = !navMenuOpen">
						☰
					</button>
				</div>
			</div>

			<button
				v-if="showVaultMenu && navMenuOpen"
				class="fixed inset-0 z-20 cursor-default bg-transparent"
				aria-label="關閉選單"
				@click="navMenuOpen = false" />

			<div
				v-if="showVaultMenu && navMenuOpen"
				class="absolute right-2 top-10 z-30 grid gap-2 rounded-xl border border-teal-200 bg-white p-2 shadow-lg"
				@click.stop>
				<button
					class="rounded-full border border-teal-300 px-3 py-2 text-xs font-bold text-teal-600"
					@click="requestAddFolder">
					新增資料夾
				</button>
				<button
					class="rounded-full border border-teal-300 px-3 py-2 text-xs font-bold text-teal-600"
					@click="chooseAnotherRoot">
					重新選根資料夾
				</button>
				<button
					class="rounded-full border border-teal-300 px-3 py-2 text-xs font-bold text-teal-600"
					@click="doLogout">
					登出
				</button>
			</div>
		</section>

		<RouterView />

		<section
			v-if="installHintVisible"
			class="fixed bottom-4 left-1/2 z-40 w-[min(92vw,560px)] -translate-x-1/2 rounded-2xl border border-teal-300 bg-white px-4 py-3 shadow-xl">
			<div class="grid gap-2 sm:flex sm:items-center sm:justify-between">
				<p class="text-sm font-semibold text-teal-700">
					可將此 App 加入主畫面，開啟更快。
				</p>
				<div class="flex gap-2">
					<button
						class="rounded-full border border-teal-300 px-3 py-1.5 text-xs font-bold text-teal-600"
						@click="dismissInstallHint">
						稍後
					</button>
					<button
						class="rounded-full bg-teal-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
						:disabled="installPrompting"
						@click="installToHomeScreen">
						{{ installPrompting ? "處理中..." : "加入主畫面" }}
					</button>
				</div>
			</div>
		</section>
	</main>
</template>
