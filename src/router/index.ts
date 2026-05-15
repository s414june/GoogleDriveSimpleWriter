import { createRouter, createWebHistory } from "vue-router"
import SetupPage from "../pages/SetupPage.vue"
import VaultPage from "../pages/VaultPage.vue"

export const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: "/", redirect: "/setup" },
		{ path: "/setup", component: SetupPage },
		{ path: "/vault", component: VaultPage },
	],
})
