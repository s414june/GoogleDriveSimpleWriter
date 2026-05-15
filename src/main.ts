import { createApp } from "vue"
import "./style.css"
import App from "./App.vue"
import { registerSW } from "virtual:pwa-register"
import { router } from "./router"

registerSW({ immediate: true })

const app = createApp(App)
app.use(router)
app.mount("#app")
