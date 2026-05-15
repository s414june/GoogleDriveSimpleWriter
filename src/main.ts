import { createApp } from "vue"
import "./style.css"
import App from "./App.vue"
import { registerSW } from "virtual:pwa-register"
import { router } from "./router"

if (import.meta.env.PROD) {
	registerSW({ immediate: true })
} else if ("serviceWorker" in navigator) {
	void navigator.serviceWorker.getRegistrations().then((registrations) => {
		for (const registration of registrations) {
			void registration.unregister()
		}
	})
}

const app = createApp(App)
app.use(router)
app.mount("#app")
