import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig({
	server: {
		port: 5173,
		strictPort: true,
	},
	preview: {
		port: 5173,
		strictPort: true,
	},
	plugins: [
		vue(),
		tailwindcss(),
		VitePWA({
			registerType: "prompt",
			includeAssets: ["icon.svg"],
			manifest: {
				name: "Google Drive Simple Writer",
				short_name: "DriveWriter",
				description: "輕便的 Google Drive Markdown 筆記 PWA",
				start_url: "/",
				display: "standalone",
				background_color: "#f6f4ef",
				theme_color: "#c5441f",
				icons: [
					{
						src: "icon.svg",
						sizes: "any",
						type: "image/svg+xml",
						purpose: "any",
					},
				],
			},
		}),
	],
})
