<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { RouterView, useRoute, useRouter } from "vue-router"
import { useDriveWorkspace } from "./composables/useDriveWorkspace"

const online = ref(navigator.onLine)
const navMenuOpen = ref(false)

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

onMounted(() => {
	window.addEventListener("online", onOnline)
	window.addEventListener("offline", onOffline)
})

onBeforeUnmount(() => {
	window.removeEventListener("online", onOnline)
	window.removeEventListener("offline", onOffline)
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
					<button
						v-if="showVaultMenu"
						class="h-7 w-7 rounded-full border border-teal-100 text-xs font-bold text-white"
						@click="navMenuOpen = !navMenuOpen">
						☰
					</button>
					<p
						class="text-white text-xs font-medium uppercase tracking-[0.08em] font-display">
						Google Drive Simple Writer
					</p>
					<div
						class="rounded-full bg-fuchsia-100 px-3 py-1 text-xs font-bold text-fuchsia-500 border border-fuchsia-300"
						:class="!online ? 'bg-rose-50 text-rose-700' : ''">
						{{ online ? "Online" : "Offline" }}
					</div>
				</div>
			</div>

			<div
				v-if="showVaultMenu && navMenuOpen"
				class="absolute left-2 top-10 z-30 grid gap-2 rounded-xl border border-teal-200 bg-white p-2 shadow-lg">
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
	</main>
</template>
